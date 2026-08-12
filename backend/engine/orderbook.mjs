export class OrderBook {
    constructor(instrumentId, symbol) {
        this.instrumentId = instrumentId;
        this.symbol = symbol;

        this.bids = [];

        this.asks = [];
    }

    addOrder(order) {
        if (order.side === 'BUY') {
            this._insertSorted(this.bids, order, 'BID');
        } else {
            this._insertSorted(this.asks, order, 'ASK');
        }
    }

    removeOrder(orderId, side) {
        if (side === 'BUY') {
            this.bids = this.bids.filter(o => o.id !== orderId);
        } else {
            this.asks = this.asks.filter(o => o.id !== orderId);
        }
    }

    getBestBid() { return this.bids[0] || null; }
    getBestAsk() { return this.asks[0] || null; }

    hasMatch() {
        const bid = this.getBestBid();
        const ask = this.getBestAsk();
        if (!bid || !ask) return false;
        return bid.price >= ask.price;
    }

    _insertSorted(arr, order, side) {

        let insertAt = arr.length;

        for (let i = 0; i < arr.length; i++) {
            const existing = arr[i];

            if (side === 'BID') {
                if (order.price > existing.price) {
                    insertAt = i;
                    break;
                }
                if (order.price === existing.price &&
                    order.createdAt < existing.createdAt) {
                    insertAt = i;
                    break;
                }
            } else {
                if (order.price < existing.price) {
                    insertAt = i;
                    break;
                }
                if (order.price === existing.price &&
                    order.createdAt < existing.createdAt) {
                    insertAt = i;
                    break;
                }
            }
        }

        arr.splice(insertAt, 0, order);
    }

    getSnapshot() {
        return {
            symbol: this.symbol,
            bids: this.bids.map(o => ({
                orderId: o.id,
                price: o.price / 100,
                qty: o.remainingQty
            })),
            asks: this.asks.map(o => ({
                orderId: o.id,
                price: o.price / 100,
                qty: o.remainingQty
            })),
        };
    }
}