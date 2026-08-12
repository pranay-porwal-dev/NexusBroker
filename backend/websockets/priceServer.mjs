import { WebSocketServer, WebSocket } from 'ws';
import pool from '../config/db.mjs';

class PriceServer {
    constructor() {
        this.subscriptions = new Map();
        this.lastPrices = new Map();
        this.pendingQueries = new Map();
        this.wss = null;
    }

    attach(httpServer) {
        this.wss = new WebSocketServer({
            server: httpServer,
            maxPayload: 4096, 
        });

        this.wss.on('connection', (ws, req) => {
            this._handleConnection(ws, req);
        });

        const heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    console.log('[WS] Terminating zombie connection.');
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => {
            clearInterval(heartbeatInterval);
        });

        console.log('[WS] Price server attached. Zombie hunter active (30s interval).');
    }

    _handleConnection(ws, req) {
        const clientIp = req.socket.remoteAddress;
        console.log(`[WS] Client connected: ${clientIp}`);

        ws.subscribedSymbols = new Set();

        ws.isAlive = true;

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', async (raw) => {
            try {
                if (raw.length > 1024) {
                    return this._send(ws, { type: 'error', message: 'Payload too large' });
                }

                const msg = JSON.parse(raw.toString());
                await this._handleMessage(ws, msg);

            } catch (err) {
                console.error(`[WS] Message error from ${clientIp}:`, err.message);
                this._send(ws, { type: 'error', message: 'Invalid payload or internal error' });
            }
        });

        ws.on('close', () => {
            console.log(`[WS] Client disconnected: ${clientIp}`);

            for (const symbol of ws.subscribedSymbols) {
                const subs = this.subscriptions.get(symbol);
                if (subs) {
                    subs.delete(ws);
                    if (subs.size === 0) {
                        this.subscriptions.delete(symbol);
                    }
                }
            }
        });

        ws.on('error', (err) => {
            console.error(`[WS] Socket error from ${clientIp}:`, err.message);
        });

        this._send(ws, {
            type: 'connected',
            message: 'NexusBroker price feed connected.',
        });
    }

    async _handleMessage(ws, msg) {
        switch (msg.type) {

            case 'subscribe': {
                const symbol = msg.symbol?.toUpperCase();

                if (!symbol) {
                    return this._send(ws, { type: 'error', message: 'symbol is required' });
                }

                const [rows] = await pool.execute(
                    'SELECT id FROM instruments WHERE symbol = ? AND is_active = TRUE',
                    [symbol]
                );

                if (rows.length === 0) {
                    return this._send(ws, {
                        type: 'error',
                        message: `Unknown instrument: ${symbol}`,
                    });
                }

                if (!this.subscriptions.has(symbol)) {
                    this.subscriptions.set(symbol, new Set());
                }
                this.subscriptions.get(symbol).add(ws);
                ws.subscribedSymbols.add(symbol);

                const lastPrice = await this._getLastTradedPrice(symbol);

                this._send(ws, {
                    type: 'subscribed',
                    symbol,
                    lastPrice: lastPrice ? lastPrice / 100 : null,
                    message: lastPrice
                        ? `Subscribed to ${symbol}. Last price: ₹${(lastPrice / 100).toFixed(2)}`
                        : `Subscribed to ${symbol}. No trades yet.`,
                });

                console.log(`[WS] Subscribed to ${symbol}. Subscribers: ${this.subscriptions.get(symbol).size}`);
                break;
            }

            case 'unsubscribe': {
                const symbol = msg.symbol?.toUpperCase();
                if (!symbol) return;

                const subs = this.subscriptions.get(symbol);
                if (subs) {
                    subs.delete(ws);
                    if (subs.size === 0) this.subscriptions.delete(symbol);
                }
                ws.subscribedSymbols.delete(symbol);

                this._send(ws, { type: 'unsubscribed', symbol });
                break;
            }

            default: {
                this._send(ws, {
                    type: 'error',
                    message: `Unknown message type: ${msg.type}`,
                });
            }
        }
    }

    broadcastTrade(symbol, tradeData) {
        const subs = this.subscriptions.get(symbol);
        if (!subs || subs.size === 0) return;

        this.lastPrices.set(symbol, tradeData.price);

        const raw = JSON.stringify({
            type:       'price',
            symbol,
            price:      tradeData.price / 100,
            quantity:   tradeData.quantity,
            tradeValue: tradeData.tradeValue / 100,
            timestamp:  tradeData.timestamp,
        });

        let delivered = 0;
        let removed = 0;

        for (const ws of subs) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(raw);
                delivered++;
            } else {
                subs.delete(ws);
                removed++;
            }
        }

        console.log(`[WS] ${symbol} @ ₹${tradeData.price / 100} → ${delivered} clients (${removed} dead removed)`);
    }

async _getLastTradedPrice(symbol) {
    if (this.lastPrices.has(symbol)) {
        return this.lastPrices.get(symbol);
    }

    if (this.pendingQueries.has(symbol)) {
        return this.pendingQueries.get(symbol);
    }

    const queryPromise = pool.execute(
        `SELECT t.trade_price
         FROM trades t
         JOIN orders o ON t.our_order_id = o.id
         JOIN instruments i ON o.instrument_id = i.id
         WHERE i.symbol = ?
         ORDER BY t.executed_at DESC
         LIMIT 1`,
        [symbol]
    )
    .then(([rows]) => {
        if (rows.length > 0) {
            const price = parseInt(rows[0].trade_price);
            this.lastPrices.set(symbol, price); 
            return price;
        }
        return null; 
    })
    .finally(() => {
        this.pendingQueries.delete(symbol);
    });

    this.pendingQueries.set(symbol, queryPromise);

    return queryPromise;
}

    _send(ws, obj) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }

    getStats() {
        const subscriptions = {};
        for (const [symbol, subs] of this.subscriptions) {
            subscriptions[symbol] = subs.size;
        }
        return {
            totalConnections: this.wss?.clients?.size ?? 0,
            subscriptions,
        };
    }
}

export const priceServer = new PriceServer();