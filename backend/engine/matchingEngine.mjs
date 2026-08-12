import crypto from 'crypto';
import pool from '../config/db.mjs';
import { OrderBook } from './orderbook.mjs';
import { priceServer } from '../websockets/priceServer.mjs';

class MatchingEngine {
  constructor() {
    this.books = new Map();

    this.initialized = false;
  }

  async initialize() {
    console.log('[Engine] Initializing — hydrating order book from DB...');

    const [instruments] = await pool.execute(
      `SELECT id, symbol FROM instruments WHERE is_active = TRUE`
    );

    for (const inst of instruments) {
      this.books.set(inst.id, new OrderBook(inst.id, inst.symbol));
    }

    const [openOrders] = await pool.execute(
      `SELECT id, user_id, instrument_id, side, order_type,
                    quantity, filled_quantity, price, product_type, created_at
             FROM orders
             WHERE status IN ('PENDING', 'PARTIAL')
             ORDER BY created_at ASC`
    );

    for (const order of openOrders) {
      const book = this.books.get(order.instrument_id);
      if (!book) continue;

      book.addOrder({
        id: order.id,
        userId: order.user_id,
        side: order.side,
        orderType: order.order_type,
        quantity: order.quantity,
        remainingQty: order.quantity - order.filled_quantity,
        price: parseInt(order.price, 10),
        productType: order.product_type,
        createdAt: order.created_at,
      });
    }

    this.initialized = true;
    console.log(
      `[Engine] Initialized. ${openOrders.length} open orders loaded across ${instruments.length} instruments.`
    );
  }

  async processOrder(order) {
    if (!this.initialized) {
      throw new Error('Matching engine not initialized');
    }

    let book = this.books.get(order.instrumentId);
    if (!book) {
      book = new OrderBook(order.instrumentId, order.symbol);
      this.books.set(order.instrumentId, book);
    }

    book.addOrder({
      id: order.id,
      userId: order.userId,
      side: order.side,
      orderType: order.orderType,
      quantity: order.quantity,
      remainingQty: order.quantity,
      price: order.price,
      productType: order.productType,
      createdAt: order.createdAt,
    });

    await this._runMatchingLoop(book);
  }

  async _runMatchingLoop(book) {
        while (book.hasMatch()) {
            const bid = book.getBestBid();
            const ask = book.getBestAsk();
        
            if (bid.userId === ask.userId) {
                console.warn(`[Engine] Wash trade prevented for user ${bid.userId}.`);
            
                const aggressorIsAsk = ask.createdAt >= bid.createdAt;
                const aggressorOrder = aggressorIsAsk ? ask : bid;
                const aggressorSide = aggressorIsAsk ? 'SELL' : 'BUY';
            
                book.removeOrder(aggressorOrder.id, aggressorOrder.side);
            
                try {
                    await this._cancelOrderInDB(aggressorOrder, aggressorSide);
                } catch (cancelErr) {
                    console.error(`[Engine] Failed to cancel wash trade order ${aggressorOrder.id} in DB:`, cancelErr);
                }

                continue;
            }
        
            const tradeQty = Math.min(bid.remainingQty, ask.remainingQty);
            const tradePrice = ask.price;
            const tradeValue = tradeQty * tradePrice;
        
            await this._settleTrade({ book, bid, ask, tradeQty, tradePrice, tradeValue });
        }
  }

  async _settleTrade({ book, bid, ask, tradeQty, tradePrice, tradeValue }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const tradeId = crypto.randomUUID();
      const now = new Date();

      const sortedUserIds = [bid.userId, ask.userId].sort();

      const [walletRows] = await connection.execute(
        `SELECT id, user_id, balance, reserved
                         FROM wallets
                         WHERE user_id IN (?, ?)
                         ORDER BY user_id ASC
                         FOR UPDATE`,
        [sortedUserIds[0], sortedUserIds[1]]
      );

      if (walletRows.length < 2) {
        throw new Error(
          'One or both wallets not found during trade settlement'
        );
      }

      const buyerWalletRow = walletRows.find((w) => w.user_id === bid.userId);
      const sellerWalletRow = walletRows.find((w) => w.user_id === ask.userId);

      const buyer = {
        walletId: buyerWalletRow.id,
        balance: parseInt(buyerWalletRow.balance, 10),
        reserved: parseInt(buyerWalletRow.reserved, 10),
      };

      const seller = {
        walletId: sellerWalletRow.id,
        balance: parseInt(sellerWalletRow.balance, 10),
        reserved: parseInt(sellerWalletRow.reserved, 10),
      };

      const reservedRelease = tradeQty * bid.price;

      const buyerNewBalance = buyer.balance - tradeValue;
      const buyerNewReserved = buyer.reserved - reservedRelease;
      const sellerNewBalance = seller.balance + tradeValue;

      await connection.execute(
        `INSERT INTO ledger
                   (id, wallet_id, type, amount, transaction_category,
                    payment_channel, reference_id, balance_after)
                 VALUES (?, ?, 'DEBIT', ?, 'TRADE_BUY', 'INTERNAL', ?, ?)`,
        [
          crypto.randomUUID(),
          buyer.walletId,
          tradeValue,
          `TRD-BUY-${tradeId}`,
          buyerNewBalance,
        ]
      );

      await connection.execute(
        `INSERT INTO ledger
                   (id, wallet_id, type, amount, transaction_category,
                    payment_channel, reference_id, balance_after)
                 VALUES (?, ?, 'CREDIT', ?, 'TRADE_SELL', 'INTERNAL', ?, ?)`,
        [
          crypto.randomUUID(),
          seller.walletId,
          tradeValue,
          `TRD-SELL-${tradeId}`,
          sellerNewBalance,
        ]
      );

      await connection.execute(
        `UPDATE wallets
                 SET balance = ?, reserved = ?, version = version + 1
                 WHERE id = ?`,
        [buyerNewBalance, buyerNewReserved, buyer.walletId]
      );

      await connection.execute(
        `UPDATE wallets
                 SET balance = ?, version = version + 1
                 WHERE id = ?`,
        [sellerNewBalance, seller.walletId]
      );

      const [buyerPos] = await connection.execute(
        `SELECT quantity, average_buy_price, total_invested
                 FROM positions
                 WHERE user_id = ? AND instrument_id = ? AND product_type = ?
                 FOR UPDATE`,
        [bid.userId, book.instrumentId, bid.productType]
      );

      if (buyerPos.length === 0) {
        await connection.execute(
          `INSERT INTO positions
                       (id, user_id, instrument_id, quantity, locked_quantity,
                        average_buy_price, total_invested, product_type)
                     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            bid.userId,
            book.instrumentId,
            tradeQty,
            tradePrice,
            tradeValue, 
            bid.productType,
          ]
        );
      } else {
        const pos = buyerPos[0];
        const currentQty = parseInt(pos.quantity, 10);
        const currentAvg = parseInt(pos.average_buy_price, 10);
        const currentInvested = parseInt(pos.total_invested, 10);

        const newQty = currentQty + tradeQty;
        const newAvg = Math.round(
          (currentQty * currentAvg + tradeQty * tradePrice) / newQty
        );
        const newInvested = currentInvested + tradeValue;

        await connection.execute(
          `UPDATE positions
                     SET quantity = ?, average_buy_price = ?,
                         total_invested = ?, updated_at = NOW()
                     WHERE user_id = ? AND instrument_id = ? AND product_type = ?`,
          [
            newQty,
            newAvg,
            newInvested,
            bid.userId,
            book.instrumentId,
            bid.productType,
          ]
        );
      }

      await connection.execute(
        `UPDATE positions
                 SET quantity = quantity - ?,
                     locked_quantity = locked_quantity - ?,
                     total_invested = total_invested - (average_buy_price * ?),
                     updated_at = NOW()
                 WHERE user_id = ? AND instrument_id = ? AND product_type = ?`,
        [
          tradeQty,
          tradeQty,
          tradeQty,
          ask.userId,
          book.instrumentId,
          ask.productType,
        ]
      );


      const bidNewFilledQty = bid.quantity - bid.remainingQty + tradeQty;
      const bidNewStatus =
        bidNewFilledQty >= bid.quantity ? 'FILLED' : 'PARTIAL';

      await connection.execute(
        `UPDATE orders
                 SET filled_quantity = ?, status = ?, updated_at = NOW()
                 WHERE id = ?`,
        [bidNewFilledQty, bidNewStatus, bid.id]
      );

      const askNewFilledQty = ask.quantity - ask.remainingQty + tradeQty;
      const askNewStatus =
        askNewFilledQty >= ask.quantity ? 'FILLED' : 'PARTIAL';

      await connection.execute(
        `UPDATE orders
                 SET filled_quantity = ?, status = ?, updated_at = NOW()
                 WHERE id = ?`,
        [askNewFilledQty, askNewStatus, ask.id]
      );

      await connection.execute(
        `INSERT INTO trades
                   (id, our_order_id, our_side, instrument_id,
                    quantity, trade_price, trade_value, exchange_trade_id, executed_at)
                 VALUES (?, ?, 'BUY', ?, ?, ?, ?, NULL, ?)`,
        [
          tradeId,
          bid.id,
          book.instrumentId,
          tradeQty,
          tradePrice,
          tradeValue,
          now,
        ]
      );

      await connection.execute(
        `INSERT INTO trades
                   (id, our_order_id, our_side, instrument_id,
                    quantity, trade_price, trade_value, exchange_trade_id, executed_at)
                 VALUES (?, ?, 'SELL', ?, ?, ?, ?, NULL, ?)`,
        [
          crypto.randomUUID(),
          ask.id,
          book.instrumentId,
          tradeQty,
          tradePrice,
          tradeValue,
          now,
        ]
      );

      await connection.commit();

      bid.remainingQty -= tradeQty;
      ask.remainingQty -= tradeQty;

      if (bid.remainingQty <= 0) {
        book.removeOrder(bid.id, 'BUY');
      }
      if (ask.remainingQty <= 0) {
        book.removeOrder(ask.id, 'SELL');
      }

      console.log(
        `[Engine] Trade settled: ${tradeId} | ${tradeQty} shares @ ₹${tradePrice / 100}`
      );

      priceServer.broadcastTrade(book.symbol, {
          price:      tradePrice,
          quantity:   tradeQty,
          tradeValue: tradeValue,
          timestamp:  now.toISOString(),
      });
      
    } catch (err) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('[Engine] CRITICAL: Rollback failed:', rollbackErr);
      }
      throw err;
    } finally {
      connection.release();
    }
  }

  async cancelOrder(orderId, userId) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [orderRows] = await connection.execute(
        `SELECT id, user_id, instrument_id, side, order_type,
                        quantity, filled_quantity, price, reserved, status, product_type
                 FROM orders
                 WHERE id = ? AND user_id = ?
                 FOR UPDATE`,
        [orderId, userId]
      );

      if (orderRows.length === 0) {
        await connection.rollback();
        return {
          success: false,
          error: 'Order not found or does not belong to your account.',
        };
      }

      const order = orderRows[0];

      if (!['PENDING', 'PARTIAL'].includes(order.status)) {
        await connection.rollback();
        return {
          success: false,
          error: `Order cannot be cancelled. Current status: ${order.status}`,
        };
      }

      const remainingQty = order.quantity - order.filled_quantity;

      await connection.execute(
        `UPDATE orders
                 SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
                 WHERE id = ?`,
        [orderId]
      );

      if (order.side === 'BUY') {

        const filledValue = order.filled_quantity * parseInt(order.price, 10);
        const releaseAmount = parseInt(order.reserved, 10) - filledValue;

        if (releaseAmount > 0) {
          const [walletRows] = await connection.execute(
            `SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE`,
            [userId]
          );

          const walletId = walletRows[0].id;
          const currentBalance = parseInt(walletRows[0].balance, 10);

          await connection.execute(
            `INSERT INTO ledger
                           (id, wallet_id, type, amount, transaction_category,
                            payment_channel, reference_id, balance_after)
                         VALUES (?, ?, 'CREDIT', ?, 'ORDER_RELEASE', 'INTERNAL', ?, ?)`,
            [
              crypto.randomUUID(),
              walletId,
              releaseAmount,
              `ORD-REL-${orderId}`,
              currentBalance, 
            ]
          );

          await connection.execute(
            `UPDATE wallets
                         SET reserved = reserved - ?, version = version + 1
                         WHERE user_id = ?`,
            [releaseAmount, userId]
          );
        }
      } else if (order.side === 'SELL') {
        await connection.execute(
          `UPDATE positions
                     SET locked_quantity = locked_quantity - ?
                     WHERE user_id = ? AND instrument_id = ? AND product_type = ?`,
          [remainingQty, userId, order.instrument_id, order.product_type]
        );
      }

      await connection.commit();

      const book = this.books.get(order.instrument_id);
      if (book) {
        book.removeOrder(orderId, order.side);
      }

      return { success: true, cancelledOrderId: orderId };
    } catch (err) {
      try {
        await connection.rollback();
      } catch (e) {
        console.error(e);
      }
      throw err;
    } finally {
      connection.release();
    }
  }

  getBookSnapshot(instrumentId) {
    const book = this.books.get(instrumentId);
    if (!book) return null;
    return book.getSnapshot();
  }

async _cancelOrderInDB(order, side) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.execute(
            `UPDATE orders
             SET status = 'CANCELLED',
                 rejection_reason = 'Wash trade prevention: self-cross detected',
                 cancelled_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [order.id]
        );

        if (side === 'BUY') {

            const releaseAmount = order.remainingQty * order.price;

            const [walletRows] = await connection.execute(
                `SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE`,
                [order.userId]
            );

            if (walletRows.length > 0) {
                await connection.execute(
                    `INSERT INTO ledger
                       (id, wallet_id, type, amount, transaction_category,
                        payment_channel, reference_id, balance_after)
                     VALUES (?, ?, 'CREDIT', ?, 'ORDER_RELEASE', 'INTERNAL', ?, ?)`,
                    [
                        crypto.randomUUID(),
                        walletRows[0].id,
                        releaseAmount,
                        `WASH-REL-${order.id}`,
                        parseInt(walletRows[0].balance, 10), 
                    ]
                );

                await connection.execute(
                    `UPDATE wallets
                     SET reserved = reserved - ?, version = version + 1
                     WHERE user_id = ?`,
                    [releaseAmount, order.userId]
                );
            }

        } else if (side === 'SELL') {
            await connection.execute(
                `UPDATE positions
                 SET locked_quantity = locked_quantity - ?
                 WHERE user_id = ? AND instrument_id = ? AND product_type = ?`,
                [order.remainingQty, order.userId, order.instrumentId, order.productType]
            );
        }

        await connection.commit();

    } catch (err) {
        try { await connection.rollback(); } catch (e) { console.error(e); }
        throw err;
    } finally {
        connection.release();
    }
}

}


export const engine = new MatchingEngine();
