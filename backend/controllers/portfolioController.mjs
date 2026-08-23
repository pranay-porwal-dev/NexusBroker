import pool from '../config/db.mjs';
import {priceServer} from '../websockets/priceServer.mjs';

export const getPortfolio = async (req, res, next) => {
    const userId = req.userId;

    try {
        const [walletRows] = await pool.execute(
            `SELECT balance, reserved FROM wallets WHERE user_id = ?`,
            [userId]
        );

        if (walletRows.length === 0) {
            return res.status(404).json({ error: 'Wallet not found.' });
        }

        const balance   = parseInt(walletRows[0].balance,  10);
        const reserved  = parseInt(walletRows[0].reserved, 10);
        const available = balance - reserved;

        const [positions] = await pool.execute(
            `SELECT
                p.id,
                p.quantity,
                p.locked_quantity,
                p.average_buy_price,
                p.total_invested,
                p.product_type,
                p.updated_at,
                i.id           AS instrument_id,
                i.symbol,
                i.company_name,
                i.exchange,
                i.instrument_type,
                i.sector,
                i.domain
             FROM positions p
             JOIN instruments i ON p.instrument_id = i.id
             WHERE p.user_id = ?
               AND p.quantity > 0
             ORDER BY p.total_invested DESC`,
            [userId]
        );

        let totalInvestedPaise      = 0;
        let totalCurrentValuePaise  = 0;
        let totalUnrealisedPnlPaise = 0;

        const holdings = await Promise.all(
            positions.map(async (pos) => {
                const qty      = parseInt(pos.quantity,           10);
                const locked   = parseInt(pos.locked_quantity,    10);
                const avgPrice = parseInt(pos.average_buy_price,  10);
                const invested = parseInt(pos.total_invested,     10);

                const currentPrice  = await _resolveCurrentPrice(pos.symbol, avgPrice);
                const currentValue  = currentPrice * qty;       
                const unrealisedPnl = currentValue - invested;  

                const pnlPercent = invested > 0
                    ? ((unrealisedPnl / invested) * 100)
                    : 0;

                totalInvestedPaise      += invested;
                totalCurrentValuePaise  += currentValue;
                totalUnrealisedPnlPaise += unrealisedPnl;

                return {
                    instrument_id:     pos.instrument_id,
                    symbol:            pos.symbol,
                    company_name:      pos.company_name,
                    exchange:          pos.exchange,
                    instrument_type:   pos.instrument_type,
                    sector:            pos.sector,
                    domain:            pos.domain,
                    product_type:      pos.product_type,
                    quantity:          qty,
                    locked_quantity:   locked,
                    available_quantity: qty - locked,
                    average_buy_price: avgPrice / 100,
                    current_price:     currentPrice / 100,
                    total_invested:    invested / 100,
                    current_value:     currentValue / 100,
                    unrealised_pnl:    unrealisedPnl / 100,
                    pnl_percent:       parseFloat(pnlPercent.toFixed(2)),
                    last_updated:      pos.updated_at,
                };
            })
        );

        const totalPnlPercent = totalInvestedPaise > 0
            ? parseFloat(((totalUnrealisedPnlPaise / totalInvestedPaise) * 100).toFixed(2))
            : 0;

        return res.status(200).json({
            data: {
                wallet: {
                    total_balance:     balance / 100,
                    available_balance: available / 100,
                    reserved_balance:  reserved / 100,
                },
                summary: {
                    total_invested:     totalInvestedPaise / 100,
                    current_value:      totalCurrentValuePaise / 100,
                    unrealised_pnl:     totalUnrealisedPnlPaise / 100,
                    pnl_percent:        totalPnlPercent,
                    number_of_holdings: holdings.length,
                },
                holdings,
            },
        });

    } catch (err) {
        return next(err);
    }
};

async function _resolveCurrentPrice(symbol, fallbackPrice) {
    const activePrice = await priceServer._getLastTradedPrice(symbol);

    if (activePrice !== null && activePrice !== undefined) {
        return activePrice;
    }

    return fallbackPrice; 
}