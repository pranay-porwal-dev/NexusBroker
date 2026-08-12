# NexusBroker 📈
**High-Concurrency Event-Driven Trading Engine & Brokerage Platform**

NexusBroker is a production-grade, full-stack stock brokerage prototype built from first principles. Designed to handle the strict data integrity, concurrency, and real-time streaming requirements of financial markets, avoiding heavy ORM abstractions in favor of bare-metal SQL and optimized memory management.

## 🚀 Architectural Highlights

* **ACID-Compliant Financial Ledger:** Built on MySQL with strict `ON DELETE RESTRICT` constraints. Transactions are guarded using **Pessimistic Locking (`SELECT ... FOR UPDATE`)** and Optimistic Concurrency Control (OCC versioning) to strictly prevent race conditions and wallet overdrafts during concurrent order placement.
* **Zero Floating-Point Corruption:** All monetary values (wallet balances, asset pricing) are computed and stored strictly as integers (Paise/Cents). Division to decimals (Rupees) occurs exclusively at the response boundary to prevent IEEE 754 floating-point precision leaks.
* **In-Memory Order Matching Engine:** Custom matching engine enforcing strict price-time priority and Maker-Taker logic. Implements deterministic self-cross (wash trade) prevention.
* **Pub/Sub WebSocket Streaming:** Zero-dependency, native WebSocket server attached to the HTTP listener. Uses an in-memory `Map<Symbol, Set<Connections>>` registry to broadcast live trade executions (tick data) in $O(1)$ time. Integrates native TCP Ping/Pong frames to actively sweep dead connections and prevent memory leaks.
* **Bulletproof Auth:** Stateless JWT architecture with cryptographically secure opaque refresh tokens, bcrypt hashing, and sliding-window lockout defense.

## 🛠️ Tech Stack

**Backend:** Node.js, Express.js, Native WebSockets (ws)
**Database:** MySQL 8.0 (mysql2 wrapper)
**Frontend:** React.js, Tailwind CSS *(In Progress)*
**Testing:** Native Node.js test runner handling 148 concurrent E2E assertions

## 🧪 E2E Test Suite

The backend integrity is verified by `master_test.mjs`, an automated 15-suite testing pipeline that bypasses HTTP standard testing to verify raw database state. It tests:
1. Multi-tenant session isolation.
2. Concurrent wallet reservations and deadlock prevention.
3. Order book partial fills and price-improvement cash leak prevention.
4. WebSocket sub/unsub routing isolation.
5. End-of-day ledger reconciliation (wallet balances vs. append-only ledger snapshots).

To run the gauntlet:
```bash
cd backend
node test/master_test.mjs