import pool from "../config/db.mjs";
import crypto from "crypto";
import { engine } from '../engine/matchingEngine.mjs';

const MAX_RETRIES = 3;
const RETRYABLE_ERRORS = new Set(["ER_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

export const placeOrder = async (req, res, next) => {
    const { instrument_id, side, order_type, quantity, price, product_type } = req.body;
    const userId = req.userId;
    const orderId = crypto.randomUUID();

    let attempt = 0;
    let lastError = null;

    while (attempt < MAX_RETRIES) {
        attempt++;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [instrumentRows] = await connection.execute(
                `SELECT id, symbol, company_name, lot_size
                 FROM instruments
                 WHERE id = ? AND is_active = TRUE`,
                [instrument_id]
            );

            if (instrumentRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    error: "Instrument not found or currently not available for trading.",
                });
            }

            const instrument = instrumentRows[0];

            if (quantity % instrument.lot_size !== 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: `quantity must be a multiple of lot size (${instrument.lot_size}) for ${instrument.symbol}`,
                });
            }

            if (side === "BUY") {

                const [walletRows] = await connection.execute(
                    `SELECT id, balance, reserved, version
                     FROM wallets
                     WHERE user_id = ?
                     FOR UPDATE`,
                    [userId]
                );

                if (walletRows.length === 0) {
                    await connection.rollback();
                    return res.status(404).json({ error: "Wallet not found." });
                }

                const walletId = walletRows[0].id;
                const totalBalance = parseInt(walletRows[0].balance, 10);
                const currentReserved = parseInt(walletRows[0].reserved, 10);
                const currentVersion = parseInt(walletRows[0].version, 10);

                const availableBalance = totalBalance - currentReserved;

                if (price === null) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: "MARKET orders require a price estimate for fund reservation in this version. Full MARKET order support coming with the order matching engine.",
                    });
                }

                const reservationAmount = quantity * price;

                if (availableBalance < reservationAmount) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `Insufficient available funds. Available: ₹${(availableBalance / 100).toFixed(2)}, Required: ₹${(reservationAmount / 100).toFixed(2)}`,
                    });
                }

                const ledgerId = crypto.randomUUID();
                await connection.execute(
                    `INSERT INTO ledger
                       (id, wallet_id, type, amount, transaction_category,
                        payment_channel, reference_id, balance_after)
                     VALUES (?, ?, 'DEBIT', ?, 'ORDER_RESERVE', 'INTERNAL', ?, ?)`,
                    [
                        ledgerId,
                        walletId,
                        reservationAmount,
                        `ORD-RES-${orderId}`,  
                        totalBalance,         
                    ]
                );

                await connection.execute(
                    `UPDATE wallets
                     SET reserved = reserved + ?, version = version + 1
                     WHERE user_id = ?`,
                    [reservationAmount, userId]
                );

                await connection.execute(
                    `INSERT INTO orders
                       (id, user_id, instrument_id, side, order_type, quantity,
                        filled_quantity, price, status, product_type, reserved)
                     VALUES (?, ?, ?, 'BUY', ?, ?, 0, ?, 'PENDING', ?, ?)`,
                    [
                        orderId, userId, instrument_id,
                        order_type, quantity, price,
                        product_type, reservationAmount
                    ]
                );

                await connection.commit();

                setImmediate(() => {
                    engine.processOrder({
                        id: orderId,
                        userId,
                        instrumentId: instrument_id,
                        symbol: instrument.symbol,
                        side: 'BUY',
                        orderType: order_type,
                        quantity,
                        price: price,
                        productType: product_type,
                        createdAt: new Date(),
                    }).catch(err => console.error('[Engine] BUY processing error:', err));
                });

                return res.status(201).json({
                    message: "BUY order placed successfully.",
                    data: {
                        order_id: orderId,
                        instrument: instrument.symbol,
                        side: "BUY",
                        order_type,
                        quantity,
                        price: price / 100,
                        product_type,
                        status: "PENDING",
                        reserved_amount: reservationAmount / 100,
                        available_balance: (availableBalance - reservationAmount) / 100,
                    },
                });
            }


            if (side === "SELL") {

                const [positionRows] = await connection.execute(
                    `SELECT id, quantity, locked_quantity
                     FROM positions
                     WHERE user_id = ? AND instrument_id = ? AND product_type = ?
                     FOR UPDATE`,
                    [userId, instrument_id, product_type]
                );

                if (positionRows.length === 0) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `You do not hold any ${instrument.symbol} shares in your ${product_type} portfolio.`,
                    });
                }

                const currentQty = parseInt(positionRows[0].quantity, 10);
                const lockedQty = parseInt(positionRows[0].locked_quantity, 10);
                const availableQty = currentQty-lockedQty;

                if (availableQty < quantity) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `Insufficient available shares. You hold ${currentQty} shares of ${instrument.symbol} but ${lockedQty} are locked in open SELL orders. Available: ${availableQty} attempting to sell ${quantity}.`,
                    });
                }

                await connection.execute(
                    `UPDATE positions
                     SET locked_quantity = locked_quantity + ?
                     WHERE user_id = ? AND instrument_id = ? AND product_type = ?`,
                    [quantity, userId, instrument_id, product_type]
                );

                await connection.execute(
                    `INSERT INTO orders
                       (id, user_id, instrument_id, side, order_type, quantity,
                        filled_quantity, price, status, product_type, reserved)
                     VALUES (?, ?, ?, 'SELL', ?, ?, 0, ?, 'PENDING', ?, 0)`,
                    [
                        orderId, userId, instrument_id,
                        order_type, quantity, price,
                        product_type
                    ]
                );

                await connection.commit();

                setImmediate(() => {
                engine.processOrder({
                    id: orderId,
                    userId,
                    instrumentId: instrument_id,
                    symbol: instrument.symbol,
                    side: 'SELL',
                    orderType: order_type,
                    quantity,
                    price: price,
                    productType: product_type,
                    createdAt: new Date(),
                }).catch(err => console.error('[Engine] SELL processing error:', err));
            });

                return res.status(201).json({
                    message: "SELL order placed successfully.",
                    data: {
                        order_id: orderId,
                        instrument: instrument.symbol,
                        side: "SELL",
                        order_type,
                        quantity,
                        price: price !== null ? price / 100 : null,
                        product_type,
                        status: "PENDING",
                    },
                });
            }

        } catch (err) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error("CRITICAL: Rollback failed:", rollbackErr);
            }

            if (RETRYABLE_ERRORS.has(err.code)) {
                lastError = err;
                const backoffMs = Math.random() * (100 * Math.pow(2, attempt - 1));
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }

            return next(err);

        } finally {
            connection.release();
        }
    }

    console.error(`Order placement failed after ${MAX_RETRIES} attempts:`, lastError);
    return res.status(503).json({ error: "Service temporarily unavailable. Please retry." });
};


export const getUserOrders = async (req, res, next) => {
    const userId = req.userId;
    const { status } = req.query;

    const validStatuses = ["PENDING", "PARTIAL", "FILLED", "CANCELLED", "REJECTED"];

    try {
        let query = `
            SELECT o.id, o.side, o.order_type, o.quantity, o.filled_quantity,
                   o.price, o.status, o.product_type, o.reserved,
                   o.created_at, o.updated_at,
                   i.symbol, i.company_name, i.exchange
            FROM orders o
            JOIN instruments i ON o.instrument_id = i.id
            WHERE o.user_id = ?
        `;
        const params = [userId];

        if (status) {
            if (!validStatuses.includes(status.toUpperCase())) {
                return res.status(400).json({
                    error: `status must be one of: ${validStatuses.join(", ")}`,
                });
            }
            query += ` AND o.status = ?`;
            params.push(status.toUpperCase());
        }

        query += ` ORDER BY o.created_at DESC LIMIT 100`;

        const [orders] = await pool.execute(query, params);

        const formatted = orders.map(o => ({
            order_id: o.id,
            instrument: { symbol: o.symbol, company: o.company_name, exchange: o.exchange },
            side: o.side,
            order_type: o.order_type,
            quantity: o.quantity,
            filled_quantity: o.filled_quantity,
            remaining_quantity: o.quantity - o.filled_quantity,
            price: o.price!== null ? o.price / 100 : null,
            product_type: o.product_type,
            status: o.status,
            reserved_amount: o.reserved / 100,
            placed_at: o.created_at,
            updated_at: o.updated_at,
        }));

        return res.status(200).json({ data: formatted });

    } catch (err) {
        return next(err);
    }
};

export const cancelOrder = async (req, res, next) => {
    const { orderId } = req.params;
    const userId = req.userId;

    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'orderId is required' });
    }

    try {
        const result = await engine.cancelOrder(orderId, userId);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        return res.status(200).json({
            message: 'Order cancelled successfully.',
            data: { order_id: result.cancelledOrderId },
        });

    } catch (err) {
        return next(err);
    }
};