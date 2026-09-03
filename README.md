# NexusBroker

A production-grade stock trading platform built from scratch — inspired by Zerodha and Groww.

## Live Demo
- **Frontend:** https://nexus-broker.vercel.app
- **Backend API:** https://nexusbroker-production.up.railway.app/health
- **Demo login:** arjun@demo.com / Demo@1234

## Features
- Custom order matching engine with price-time priority and partial fills
- Real-time price feed via WebSocket (50 NSE instruments + synthetic indices)
- Geometric Brownian Motion price simulator (same model as Black-Scholes)
- ACID transactions for all money movement — no float bugs (integer paise)
- Wash trade prevention, deadlock-safe wallet locking
- JWT authentication with httpOnly cookies + refresh token rotation
- Live P&L dashboard, order management, wallet management

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js, MySQL 8.0 |
| Frontend | React, Vite, React Router v6 |
| Real-time | WebSocket (native ws library) |
| Auth | JWT + opaque refresh tokens + bcrypt |
| Database | MySQL with mysql2 connection pool |

## Local Setup

### Backend
```bash
cd backend
cp .env.example .env      # fill in your values
npm install
node migrateDB.mjs        # create tables
node resetAndSeed.mjs     # seed demo data
node server.mjs           # start server
```

### Frontend
```bash
cd frontend
cp .env.example .env      # fill in your values
npm install
npm run dev
```

### Demo Credentials
| User | Email | Password | Role |
|------|-------|----------|------|
| Arjun Mehta | arjun@demo.com | Demo@1234 | Buyer (₹5L balance) |
| Priya Shah | priya@demo.com | Demo@1234 | Seller (holds shares) |

## Architecture Highlights

**Order Matching Engine:** Price-time priority, O(1) best bid/ask, partial fills, wash trade prevention via self-cross detection.

**Race Condition Prevention:** MySQL `SELECT ... FOR UPDATE` with consistent UUID sort order prevents deadlocks and double-spending.

**Event Sourcing:** The `trades` table is append-only. Portfolio state is always derived from trade history — never modified in-place.

**WebSocket Architecture:** One connection per user, pub-sub broker pattern inside React Context, auto-reconnect with exponential backoff.

## API Reference
See `/api/health` for service status. All endpoints require JWT via httpOnly cookie except `/api/auth/register` and `/api/auth/login`.

## Running Tests
```bash
cd backend
node test/master_test.mjs
```
148+ automated checks covering auth, wallet, order matching, concurrency, WebSockets, and financial reconciliation.