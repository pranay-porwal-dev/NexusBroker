// master_test.mjs
// NexusBroker — Complete Automated Test Suite
// Run: node test/master_test.mjs
// Requires: node server.mjs running on :3000, mysql2 + ws installed
// ─────────────────────────────────────────────────────────────────────────────

import mysql from 'mysql2/promise';
import { WebSocket } from 'ws';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const BASE      = 'http://localhost:3000';
const DB_CONFIG = {
    host:     'localhost',
    user:     'root',
    password: 'XXXX',           // ← your password here
    database: 'nexusbroker',
};

const RELIANCE = 'aaaa0001-0000-0000-0000-000000000001';
const INFY     = 'aaaa0002-0000-0000-0000-000000000002';

// ── TEST STATE ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

// ── UTILITIES ─────────────────────────────────────────────────────────────────
const section = (title) => {
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`  ${title}`);
    console.log(`${'─'.repeat(65)}`);
};

const check = (label, condition, got) => {
    if (condition) {
        console.log(`  ✓  ${label}`);
        passed++;
    } else {
        console.log(`  ✗  ${label}`);
        console.log(`     Got: ${JSON.stringify(got)}`);
        failed++;
        failures.push(label);
    }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── SESSION ───────────────────────────────────────────────────────────────────
// Each instance has its own isolated cookie string.
// Simulates separate browser tabs — no shared state between users.
class Session {
    constructor(name) {
        this.name   = name;
        this.cookie = '';
    }

    async request(method, path, body) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (this.cookie) options.headers['Cookie'] = this.cookie;
        if (body)        options.body = JSON.stringify(body);

        const res = await fetch(`${BASE}${path}`, options);

        // getSetCookie() is Node 18.14+ — returns array of all Set-Cookie headers
        const setCookies = typeof res.headers.getSetCookie === 'function'
            ? res.headers.getSetCookie()
            : [];

        if (setCookies.length > 0) {
            // Strip directives (Path=/, HttpOnly) — keep only name=value
            this.cookie = setCookies.map(c => c.split(';')[0]).join('; ');
        }

        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    }

    post(path, body) { return this.request('POST',   path, body); }
    get(path)        { return this.request('GET',    path, null); }
    del(path)        { return this.request('DELETE', path, null); }
}

// ── DB HELPERS ────────────────────────────────────────────────────────────────
let db;
const query = (sql, params = []) => db.execute(sql, params);

const getWallet = async (email) => {
    const [[row]] = await query(
        `SELECT balance, reserved, version FROM wallets
         WHERE user_id = (SELECT id FROM user_profiles WHERE email = ?)`,
        [email]
    );
    if (!row) return null;
    return {
        balance:  parseInt(row.balance),
        reserved: parseInt(row.reserved),
        version:  parseInt(row.version),
    };
};

const getPosition = async (email, instrumentId) => {
    const [[row]] = await query(
        `SELECT quantity, locked_quantity, average_buy_price, total_invested
         FROM positions
         WHERE user_id = (SELECT id FROM user_profiles WHERE email = ?)
           AND instrument_id = ?
           AND product_type = 'CNC'`,
        [email, instrumentId]
    );
    if (!row) return null;
    return {
        quantity:      parseInt(row.quantity),
        locked:        parseInt(row.locked_quantity),
        avgPrice:      parseInt(row.average_buy_price),
        totalInvested: parseInt(row.total_invested),
    };
};

// ── DB RESET ──────────────────────────────────────────────────────────────────
async function resetDB() {
    console.log('\n  Resetting database and engine RAM...');

    await query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [
        'trades', 'positions', 'orders', 'ledger',
        'bank_accounts', 'user_session', 'wallets',
        'user_credentials', 'user_profiles', 'instruments',
    ]) {
        await query(`TRUNCATE TABLE ${t}`);
    }
    await query('SET FOREIGN_KEY_CHECKS = 1');

    // Flush in-memory engine order books and price cache
    try {
        await fetch(`${BASE}/api/debug/reset-engine`, { method: 'POST' });
    } catch {
        console.log('  ⚠️  Engine reset endpoint not reachable — continuing.');
    }

    // Fixed UUIDs make instrument references deterministic across every test run
    await query(`
        INSERT INTO instruments
            (id, symbol, company_name, exchange, instrument_type, lot_size, is_active)
        VALUES
            (?, 'RELIANCE', 'Reliance Industries', 'NSE', 'EQUITY', 1, TRUE),
            (?, 'INFY',     'Infosys Ltd',          'NSE', 'EQUITY', 1, TRUE)
    `, [RELIANCE, INFY]);

    console.log('  DB reset. Instruments seeded with fixed UUIDs.');
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 1 — AUTH
// ─────────────────────────────────────────────────────────────────────────────
async function suiteAuth(A, B) {
    section('SUITE 1: Authentication');

    // Registration
    let r = await A.post('/api/auth/register', {
        name: 'Arjun Mehta', email: 'arjun@test.com', password: 'SecurePass@123',
        dob: '1995-06-15',   phone_no: '9876543210',
        tax_id: 'ABCPM1234D', tax_id_type: 'PAN', country_code: 'IN',
    });
    check('User A registers (201)', r.status === 201, r.data);

    r = await B.post('/api/auth/register', {
        name: 'Priya Shah', email: 'priya@test.com', password: 'SecurePass@123',
        dob: '1992-03-22',  phone_no: '9876543211',
        tax_id: 'XYZPS5678K', tax_id_type: 'PAN', country_code: 'IN',
    });
    check('User B registers (201)', r.status === 201, r.data);

    // Duplicate email
    r = await A.post('/api/auth/register', {
        name: 'Arjun Mehta', email: 'arjun@test.com', password: 'SecurePass@123',
        dob: '1995-06-15',   phone_no: '9999999999',
        tax_id: 'ABCPM1234D', tax_id_type: 'PAN', country_code: 'IN',
    });
    check('Duplicate email → 409', r.status === 409, r.data);

    // Login — sets cookies on each Session instance
    r = await A.post('/api/auth/login', {
        email: 'arjun@test.com', password: 'SecurePass@123',
    });
    check('User A login (200)',    r.status === 200, r.data);
    check('User A cookie set',    A.cookie.length > 0, A.cookie);

    r = await B.post('/api/auth/login', {
        email: 'priya@test.com', password: 'SecurePass@123',
    });
    check('User B login (200)',    r.status === 200, r.data);

    // Cookies must differ — proves session isolation
    check('Session cookies are isolated', A.cookie !== B.cookie, {
        a: A.cookie.slice(0, 20),
        b: B.cookie.slice(0, 20),
    });

    // Wrong password — must pass format validation but fail bcrypt
    const ghost = new Session('ghost');
    r = await ghost.post('/api/auth/login', {
        email: 'arjun@test.com', password: 'WrongPass@999',
    });
    check('Wrong password → 401', r.status === 401, r.data);

    // Unauthenticated protected route
    r = await ghost.get('/api/orders');
    check('No cookie → 401', r.status === 401, r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 2 — DEPOSIT
// ─────────────────────────────────────────────────────────────────────────────
async function suiteDeposit(A, B) {
    section('SUITE 2: Wallet — Deposit');

    // Validation
    let r = await A.post('/api/wallet/deposit', {
        amount: 5000, reference_id: 'X', payment_channel: 'UPI', is_vip: true,
    });
    check('Unexpected field → 400',
        r.status === 400 && r.data.error?.includes('is_vip'), r.data);

    r = await A.post('/api/wallet/deposit', {
        amount: -1, reference_id: 'X', payment_channel: 'UPI',
    });
    check('Negative amount → 400', r.status === 400, r.data);

    r = await A.post('/api/wallet/deposit', {
        amount: 100.999, reference_id: 'X', payment_channel: 'UPI',
    });
    check('Sub-paise precision → 400', r.status === 400, r.data);

    r = await A.post('/api/wallet/deposit', {
        amount: 5000, reference_id: 'X', payment_channel: 'CRYPTO',
    });
    check('Invalid channel → 400', r.status === 400, r.data);

    // Happy path — User A: ₹50,000
    r = await A.post('/api/wallet/deposit', {
        amount: 50000, reference_id: 'DEP-A-001', payment_channel: 'UPI',
    });
    check('User A deposits ₹50,000 (200)', r.status === 200, r.data);
    check('Response new_balance = 50000',  r.data.data?.new_balance === 50000, r.data.data);

    // User B: ₹10,000
    r = await B.post('/api/wallet/deposit', {
        amount: 10000, reference_id: 'DEP-B-001', payment_channel: 'NEFT',
    });
    check('User B deposits ₹10,000 (200)', r.status === 200, r.data);

    // Idempotency — same reference_id
    r = await A.post('/api/wallet/deposit', {
        amount: 50000, reference_id: 'DEP-A-001', payment_channel: 'UPI',
    });
    check('Duplicate reference_id → 409', r.status === 409, r.data);

    // DB verification
    const wA = await getWallet('arjun@test.com');
    check('DB: User A balance = 5000000', wA?.balance  === 5000000, wA);
    check('DB: User A reserved = 0',      wA?.reserved === 0,       wA);
    check('DB: User A version = 1',       wA?.version  === 1,       wA);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 3 — BANK ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────
async function suiteBankAccounts(A, B) {
    section('SUITE 3: Bank Accounts');

    let r = await B.post('/api/bank-accounts', {
        account_number: '123456789012', ifsc_code: 'HDFC0001234',
        account_holder: 'Priya Shah',   bank_name:  'HDFC Bank',
        account_type:   'SAVINGS',
    });
    check('User B adds bank account (201)', r.status === 201, r.data);
    const bankAccountId = r.data.data?.bank_account_id;
    check('bank_account_id returned', !!bankAccountId, r.data);

    // Invalid IFSC format
    r = await B.post('/api/bank-accounts', {
        account_number: '999999999999', ifsc_code: 'BADINPUT',
        account_holder: 'Priya Shah',   bank_name:  'Some Bank',
    });
    check('Invalid IFSC → 400', r.status === 400, r.data);

    // Duplicate account
    r = await B.post('/api/bank-accounts', {
        account_number: '123456789012', ifsc_code: 'HDFC0001234',
        account_holder: 'Priya Shah',   bank_name:  'HDFC Bank',
    });
    check('Duplicate account → 409', r.status === 409, r.data);

    // List
    r = await B.get('/api/bank-accounts');
    check('List accounts (200)',       r.status === 200, r.data);
    check('Returns array',             Array.isArray(r.data.data), r.data);
    check('Account number masked',
        r.data.data?.[0]?.account_number?.startsWith('XXXX'),
        r.data.data?.[0]);

    return bankAccountId;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 4 — WITHDRAWAL
// ─────────────────────────────────────────────────────────────────────────────
async function suiteWithdrawal(A, B, bankAccountId) {
    section('SUITE 4: Withdrawal');

    // Overdraft — User B has ₹10,000
    let r = await B.post('/api/wallet/withdraw', {
        amount: 99999, bank_account_id: bankAccountId,
    });
    check('Overdraft → 400',
        r.status === 400 && r.data.error?.includes('Insufficient'), r.data);

    // Invalid UUID
    r = await B.post('/api/wallet/withdraw', {
        amount: 1000, bank_account_id: 'not-a-uuid',
    });
    check('Invalid UUID → 400', r.status === 400, r.data);

    // Cross-user: User A tries User B's bank account
    r = await A.post('/api/wallet/withdraw', {
        amount: 1000, bank_account_id: bankAccountId,
    });
    check('Cross-user bank account → 400', r.status === 400, r.data);

    // Happy path — User B withdraws ₹5,000
    r = await B.post('/api/wallet/withdraw', {
        amount: 5000, bank_account_id: bankAccountId,
    });
    check('User B withdraws ₹5,000 (200)',    r.status === 200, r.data);
    check('status = PENDING',                  r.data.data?.status === 'PENDING', r.data.data);
    check('Account number masked in response',
        r.data.data?.destination?.account_number?.startsWith('XXXX'),
        r.data.data?.destination);

    // DB checks
    const wB = await getWallet('priya@test.com');
    // Started ₹10,000 (1000000), withdrew ₹5,000 (500000) → 500000
    check('DB: User B balance = 500000', wB?.balance === 500000, wB);

    const [[ledger]] = await query(
        `SELECT type, withdrawal_status FROM ledger
         WHERE transaction_category = 'WITHDRAWAL' LIMIT 1`
    );
    check('DB: WITHDRAWAL type = DEBIT',       ledger?.type === 'DEBIT', ledger);
    check('DB: withdrawal_status = PENDING',   ledger?.withdrawal_status === 'PENDING', ledger);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 5 — ORDER VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
async function suiteOrderValidation(A) {
    section('SUITE 5: Order Validation');

    // Unexpected field
    let r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY', order_type: 'LIMIT',
        quantity: 5, price: 2500, product_type: 'CNC', is_vip: true,
    });
    check('Unexpected field → 400',
        r.status === 400 && r.data.error?.includes('is_vip'), r.data);

    // Invalid UUID
    r = await A.post('/api/orders', {
        instrument_id: 'not-a-uuid', side: 'BUY',
        order_type: 'LIMIT', quantity: 5, price: 2500, product_type: 'CNC',
    });
    check('Invalid instrument UUID → 400', r.status === 400, r.data);

    // LIMIT without price
    r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY',
        order_type: 'LIMIT', quantity: 5, product_type: 'CNC',
    });
    check('LIMIT without price → 400', r.status === 400, r.data);

    // SELL without position
    r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'SELL',
        order_type: 'LIMIT', quantity: 5, price: 2500, product_type: 'CNC',
    });
    check('SELL without position → 400',
        r.status === 400 && r.data.error?.includes('do not hold'), r.data);

    // Insufficient funds
    r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY',
        order_type: 'LIMIT', quantity: 10000, price: 2500, product_type: 'CNC',
    });
    check('BUY exceeding balance → 400',
        r.status === 400 && r.data.error?.includes('Insufficient'), r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 6 — PORTFOLIO (runs before any trades — wallet state is clean)
// ─────────────────────────────────────────────────────────────────────────────
async function suitePortfolio(A, B) {
    section('SUITE 6: Portfolio Endpoint');

    // Test 1: Unauthenticated
    const ghost = new Session('ghost');
    let r = await ghost.get('/api/portfolio');
    check('No cookie → 401', r.status === 401, r.data);

    // Test 2: Empty portfolio (deposited but no trades yet)
    r = await A.get('/api/portfolio');
    check('GET /api/portfolio → 200', r.status === 200, r.data);

    const wallet = r.data.data?.wallet;
    const wA = await getWallet('arjun@test.com');
    check('Wallet present',             !!wallet, r.data.data);
    check('total_balance matches DB',
        wallet?.total_balance === wA.balance / 100,
        { api: wallet?.total_balance, db: wA.balance / 100 });
    check('available_balance matches DB',
        wallet?.available_balance === (wA.balance - wA.reserved) / 100,
        { api: wallet?.available_balance });
    check('reserved_balance = 0',       wallet?.reserved_balance === 0, wallet);

    const summary = r.data.data?.summary;
    check('Summary present',                    !!summary, r.data.data);
    check('number_of_holdings = 0 (no trades)', summary?.number_of_holdings === 0, summary);

    const holdings = r.data.data?.holdings;
    check('Holdings is empty array',
        Array.isArray(holdings) && holdings.length === 0, holdings);

    // Test 3: Seed a trade and verify portfolio reflects it
    // Give User B shares to sell (INSERT IGNORE handles re-runs safely)
    await query(
        `INSERT INTO positions
           (id, user_id, instrument_id, quantity, locked_quantity,
            average_buy_price, total_invested, product_type)
         VALUES (UUID(),
           (SELECT id FROM user_profiles WHERE email = 'priya@test.com'),
           ?, 50, 0, 240000, 12000000, 'CNC')
         ON DUPLICATE KEY UPDATE
           quantity = quantity + 50,
           total_invested = total_invested + 12000000`,
        [RELIANCE]
    );

    // User B sells 5 shares, User A buys — creates a real trade
    await B.post('/api/orders', {
        instrument_id: RELIANCE, side: 'SELL',
        order_type: 'LIMIT', quantity: 5, price: 2500, product_type: 'CNC',
    });
    await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY',
        order_type: 'LIMIT', quantity: 5, price: 2500, product_type: 'CNC',
    });

    await sleep(700); // wait for engine settlement

    r = await A.get('/api/portfolio');
    check('Portfolio after trade → 200', r.status === 200, r.data);

    const holdingsAfter = r.data.data?.holdings;
    check('Holdings has 1 entry',        holdingsAfter?.length === 1, holdingsAfter?.length);

    const rel = holdingsAfter?.[0];
    check('symbol = RELIANCE',           rel?.symbol === 'RELIANCE', rel);
    check('quantity = 5',                rel?.quantity === 5, rel);
    check('average_buy_price = 2500',    rel?.average_buy_price === 2500, rel);
    check('current_price is a number',   typeof rel?.current_price === 'number', rel);
    check('current_value is a number',   typeof rel?.current_value === 'number', rel);
    check('unrealised_pnl is a number',  typeof rel?.unrealised_pnl === 'number', rel);
    check('pnl_percent is a number',     typeof rel?.pnl_percent === 'number', rel);
    check('available_quantity = 5',      rel?.available_quantity === 5, rel);
    check('locked_quantity = 0',         rel?.locked_quantity === 0, rel);

    // P&L = 0 because last trade price (₹2500) = avg buy price (₹2500)
    check('unrealised_pnl = 0',          rel?.unrealised_pnl === 0, rel);

    // Wallet after trade: spent 5 * ₹2500 = ₹12,500
    const walletAfter = r.data.data?.wallet;
    const wAAfter = await getWallet('arjun@test.com');
    check('Wallet balance reduced by trade value',
        walletAfter?.total_balance === wAAfter.balance / 100,
        { api: walletAfter?.total_balance, db: wAAfter.balance / 100 });
    check('Wallet reserved = 0 after fill',
        walletAfter?.reserved_balance === 0, walletAfter);

    // Summary aggregates
    const summaryAfter = r.data.data?.summary;
    check('number_of_holdings = 1',     summaryAfter?.number_of_holdings === 1, summaryAfter);
    check('total_invested > 0',         (summaryAfter?.total_invested ?? 0) > 0, summaryAfter);
    check('current_value > 0',          (summaryAfter?.current_value  ?? 0) > 0, summaryAfter);
    check('unrealised_pnl = 0',         summaryAfter?.unrealised_pnl === 0, summaryAfter);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 7 — FULL FILL MATCH
// ─────────────────────────────────────────────────────────────────────────────
async function suiteFullMatch(A, B) {
    section('SUITE 7: Matching Engine — Full Fill');

    // User B needs more RELIANCE shares to sell
    await query(
        `INSERT INTO positions
           (id, user_id, instrument_id, quantity, locked_quantity,
            average_buy_price, total_invested, product_type)
         VALUES (UUID(),
           (SELECT id FROM user_profiles WHERE email = 'priya@test.com'),
           ?, 100, 0, 240000, 24000000, 'CNC')
         ON DUPLICATE KEY UPDATE
           quantity = quantity + 100,
           total_invested = total_invested + 24000000`,
        [RELIANCE]
    );

    const wABefore = await getWallet('arjun@test.com');
    const wBBefore = await getWallet('priya@test.com');

    // User B: SELL 10 shares @ ₹2500
    let r = await B.post('/api/orders', {
        instrument_id: RELIANCE, side: 'SELL',
        order_type: 'LIMIT', quantity: 10, price: 2500, product_type: 'CNC',
    });
    check('User B SELL placed (201)', r.status === 201, r.data);
    const sellId = r.data.data?.order_id;

    // Verify share lock
    const posBLocked = await getPosition('priya@test.com', RELIANCE);
    check('locked_quantity = 10 after SELL', posBLocked?.locked === 10, posBLocked);

    // User A: BUY 10 shares @ ₹2500 — triggers match
    r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY',
        order_type: 'LIMIT', quantity: 10, price: 2500, product_type: 'CNC',
    });
    check('User A BUY placed (201)', r.status === 201, r.data);
    const buyId = r.data.data?.order_id;

    await sleep(700);

    // Orders
    const [[buyOrder]]  = await query(
        'SELECT status, filled_quantity FROM orders WHERE id = ?', [buyId]);
    const [[sellOrder]] = await query(
        'SELECT status, filled_quantity FROM orders WHERE id = ?', [sellId]);
    check('BUY → FILLED',         buyOrder?.status === 'FILLED', buyOrder);
    check('SELL → FILLED',        sellOrder?.status === 'FILLED', sellOrder);
    check('BUY filled_qty = 10',  parseInt(buyOrder?.filled_quantity) === 10, buyOrder);

    // Trades
    const [trades] = await query(
        `SELECT our_side, quantity, trade_price, trade_value
         FROM trades WHERE our_order_id IN (?, ?)`, [buyId, sellId]
    );
    const tradeValue = 10 * 250000;
    check('Two trade records',      trades?.length === 2, trades?.length);
    check('Trade qty = 10',         trades?.every(t => parseInt(t.quantity) === 10), trades);
    check('Trade price = 250000',   trades?.every(t => parseInt(t.trade_price) === 250000), trades);
    check('Trade value = 2500000',  trades?.every(t => parseInt(t.trade_value) === tradeValue), trades);

    // Wallets — use deltas to stay independent of prior suite state
    const wAAfter = await getWallet('arjun@test.com');
    const wBAfter = await getWallet('priya@test.com');
    check('Buyer balance reduced by 2500000',
        wABefore?.balance - wAAfter?.balance === tradeValue,
        { before: wABefore?.balance, after: wAAfter?.balance });
    check('Buyer reserved = 0', wAAfter?.reserved === 0, wAAfter);
    check('Seller balance increased by 2500000',
        wBAfter?.balance - wBBefore?.balance === tradeValue,
        { before: wBBefore?.balance, after: wBAfter?.balance });

    // Positions
    const posA = await getPosition('arjun@test.com', RELIANCE);
    check('Buyer has RELIANCE shares',   (posA?.quantity ?? 0) >= 10, posA);
    check('Buyer locked = 0',            posA?.locked === 0, posA);

    const posB = await getPosition('priya@test.com', RELIANCE);
    check('Seller locked = 0 after fill', posB?.locked === 0, posB);

    // Ledger
    const [rows] = await query('SELECT transaction_category FROM ledger');
    const cats   = rows.map(r => r.transaction_category);
    check('Ledger has ORDER_RESERVE', cats.includes('ORDER_RESERVE'), cats);
    check('Ledger has TRADE_BUY',     cats.includes('TRADE_BUY'), cats);
    check('Ledger has TRADE_SELL',    cats.includes('TRADE_SELL'), cats);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 8 — PARTIAL FILL
// ─────────────────────────────────────────────────────────────────────────────
async function suitePartialFill(A, B) {
    section('SUITE 8: Matching Engine — Partial Fill');

        // Top up User A — previous suites consumed most of their balance
    await A.post('/api/wallet/deposit', {
        amount: 50000, reference_id: 'DEP-A-PARTIAL', payment_channel: 'UPI',
    });

    const wABefore = await getWallet('arjun@test.com');

    // User B sells 5, User A buys 10 — only 5 match immediately
    let r = await B.post('/api/orders', {
        instrument_id: RELIANCE, side: 'SELL',
        order_type: 'LIMIT', quantity: 5, price: 2500, product_type: 'CNC',
    });
    check('User B SELL 5 placed', r.status === 201, r.data);
    const partialSellId = r.data.data?.order_id;

if (!partialSellId) {
    check('SELL placed successfully', false, r.data);
    return null; // Can't continue without a valid sell order
}

    r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY',
        order_type: 'LIMIT', quantity: 10, price: 2500, product_type: 'CNC',
    });
    check('User A BUY 10 placed', r.status === 201, r.data);
    const partialBuyId = r.data.data?.order_id;

    // Guard: if either order ID is missing, fail gracefully rather than crash
if (!partialBuyId || !partialSellId) {
    check('SELL → FILLED (5/5)',   false, 'order ID missing — prior step failed');
    check('SELL filled_qty = 5',   false, 'order ID missing');
    check('BUY → PARTIAL (5/10)',  false, 'order ID missing');
    check('BUY filled_qty = 5',    false, 'order ID missing');
    check('Two trade records (one match event)', false, 'order ID missing');
    check('Each trade qty = 5',    false, 'order ID missing');
    check('Buyer balance reduced by filled portion only', false, 'order ID missing');
    check('Buyer reserved = unfilled portion (1250000)', false, 'order ID missing');
    return null;
}
    await sleep(700);

    // SELL fully filled (5/5), BUY partially filled (5/10)
    const [[sellOrder]] = await query(
        'SELECT status, filled_quantity FROM orders WHERE id = ?', [partialSellId]);
    check('SELL → FILLED (5/5)',    sellOrder?.status === 'FILLED', sellOrder);
    check('SELL filled_qty = 5',    parseInt(sellOrder?.filled_quantity) === 5, sellOrder);

    const [[buyOrder]] = await query(
        'SELECT status, filled_quantity FROM orders WHERE id = ?', [partialBuyId]);
    check('BUY → PARTIAL (5/10)',   buyOrder?.status === 'PARTIAL', buyOrder);
    check('BUY filled_qty = 5',     parseInt(buyOrder?.filled_quantity) === 5, buyOrder);

    // Two trade records for one match event (one per side)
    const [trades] = await query(
        `SELECT our_side, quantity FROM trades WHERE our_order_id IN (?, ?)`,
        [partialBuyId, partialSellId]
    );
    check('Two trade records (one match event)', trades.length === 2, trades.length);
    check('Each trade qty = 5', trades.every(t => parseInt(t.quantity) === 5), trades);

    // Wallet: only filled portion debited, unfilled portion stays reserved
    const wAAfter = await getWallet('arjun@test.com');
    const filledValue        = 5 * 250000;  // 1250000 — actual spend
    const remainingReserved  = 5 * 250000;  // 1250000 — unfilled still reserved
    check('Buyer balance reduced by filled portion only',
        wABefore.balance - wAAfter.balance === filledValue,
        { before: wABefore.balance, after: wAAfter.balance, expected: filledValue });
    check('Buyer reserved = unfilled portion (1250000)',
        wAAfter.reserved === remainingReserved, wAAfter);

    return partialBuyId; // passed to suitePriceImprovement for pre-cancellation
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 9 — PRICE IMPROVEMENT
// ─────────────────────────────────────────────────────────────────────────────
async function suitePriceImprovement(A, B, partialBuyId) {
    section('SUITE 9: Price Improvement — Cash Leak Verification');

    // Cancel the outstanding PARTIAL BUY from Suite 8 before this test.
    // If not cancelled, the engine matches this suite's SELL against the
    // resting PARTIAL order (price-time priority) rather than our fresh BUY.
    if (partialBuyId) {
        await A.del(`/api/orders/${partialBuyId}`);
        await sleep(300);
    }

    // Top up User A — previous suites consumed most of the ₹50,000
    await A.post('/api/wallet/deposit', {
        amount: 50000, reference_id: 'DEP-A-002', payment_channel: 'UPI',
    });

    const wABefore = await getWallet('arjun@test.com');

    // User B sells at ₹2400 (lower ask)
    await B.post('/api/orders', {
        instrument_id: RELIANCE, side: 'SELL',
        order_type: 'LIMIT', quantity: 5, price: 2400, product_type: 'CNC',
    });

    // User A buys at ₹2600 (willing to pay more) → executes at ₹2400 (ask price)
    // Reservation = 5 × 260000 = 1300000 paise
    // Actual spend = 5 × 240000 = 1200000 paise
    // Price improvement = 100000 paise (₹1000) returned to available balance
    const r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY',
        order_type: 'LIMIT', quantity: 5, price: 2600, product_type: 'CNC',
    });
    check('Price improvement BUY placed (201)', r.status === 201, r.data);

    await sleep(700);

    const wAAfter  = await getWallet('arjun@test.com');
    const spent    = wABefore.balance - wAAfter.balance;
    const expected = 5 * 240000; // 1200000 — at ask price, not limit price

    check('Spent at ask price ₹2400, not limit ₹2600',
        spent === expected, { spent, expected });
    check('No orphaned reservation (reserved = 0)',
        wAAfter.reserved === 0, wAAfter);

    const [[trade]] = await query(
        'SELECT trade_price FROM trades ORDER BY created_at DESC LIMIT 1'
    );
    check('Trade price = 240000 (₹2400)',
        parseInt(trade?.trade_price) === 240000, trade);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 10 — ORDER CANCELLATION
// ─────────────────────────────────────────────────────────────────────────────
async function suiteCancellation(A) {
    section('SUITE 10: Order Cancellation');

    const wBefore = await getWallet('arjun@test.com');

    // Place unmatchable BUY (price ₹0.50 — no seller will accept this)
    let r = await A.post('/api/orders', {
        instrument_id: RELIANCE, side: 'BUY',
        order_type: 'LIMIT', quantity: 3, price: 50, product_type: 'CNC',
    });
    check('Unmatchable BUY placed (201)', r.status === 201, r.data);
    const orderId = r.data.data?.order_id;

    // Verify reservation created
    const wReserved = await getWallet('arjun@test.com');
    check('Reserved increased after order',
        wReserved.reserved > wBefore.reserved, wReserved);

    // Cancel
    r = await A.del(`/api/orders/${orderId}`);
    check('Cancel returns 200', r.status === 200, r.data);

    await sleep(300);

    // Verify reservation released
    const wAfter = await getWallet('arjun@test.com');
    check('Reserved restored after cancel',   wAfter.reserved === wBefore.reserved, wAfter);
    check('Balance unchanged by cancellation', wAfter.balance === wBefore.balance, wAfter);

    // DB state
    const [[order]] = await query(
        'SELECT status, cancelled_at FROM orders WHERE id = ?', [orderId]
    );
    check('DB: status = CANCELLED',     order?.status === 'CANCELLED', order);
    check('DB: cancelled_at populated', !!order?.cancelled_at, order);

    // ORDER_RELEASE ledger entry
    const [[release]] = await query(
        'SELECT transaction_category FROM ledger WHERE reference_id = ?',
        [`ORD-REL-${orderId}`]
    );
    check('DB: ORDER_RELEASE ledger entry',
        release?.transaction_category === 'ORDER_RELEASE', release);

    // Double cancel
    r = await A.del(`/api/orders/${orderId}`);
    check('Double cancel → 400', r.status === 400, r.data);

    // Nonexistent order
    r = await A.del('/api/orders/00000000-0000-0000-0000-000000000000');
    check('Nonexistent order cancel → 400', r.status === 400, r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 11 — WASH TRADE PREVENTION
// ─────────────────────────────────────────────────────────────────────────────
async function suiteWashTrade(A) {
    section('SUITE 11: Wash Trade Prevention');

    // Top up User A
    await A.post('/api/wallet/deposit', {
        amount: 50000, reference_id: 'DEP-A-003', payment_channel: 'UPI',
    });

    // Seed User A with INFY shares (separate instrument avoids RELIANCE interference)
    await query(
        `INSERT INTO positions
           (id, user_id, instrument_id, quantity, locked_quantity,
            average_buy_price, total_invested, product_type)
         VALUES (UUID(),
           (SELECT id FROM user_profiles WHERE email = 'arjun@test.com'),
           ?, 50, 0, 150000, 7500000, 'CNC')
         ON DUPLICATE KEY UPDATE
           quantity = quantity + 50,
           total_invested = total_invested + 7500000`,
        [INFY]
    );

    // Resting SELL — placed first, should be preserved
    let r = await A.post('/api/orders', {
        instrument_id: INFY, side: 'SELL',
        order_type: 'LIMIT', quantity: 5, price: 1500, product_type: 'CNC',
    });
    check('Resting SELL placed (201)', r.status === 201, r.data);
    const restingId = r.data.data?.order_id;

    // Small delay ensures createdAt differs — aggressor detection is deterministic
    await sleep(100);

    // Aggressor BUY from same user — crosses the spread → wash trade
    r = await A.post('/api/orders', {
        instrument_id: INFY, side: 'BUY',
        order_type: 'LIMIT', quantity: 5, price: 1500, product_type: 'CNC',
    });
    check('Aggressor BUY placed (201)', r.status === 201, r.data);
    const aggressorId = r.data.data?.order_id;

    if (!aggressorId) {
        check('Aggressor order ID returned', false, r.data);
        return;
    }

    await sleep(700);

    // Aggressor cancelled, resting preserved
    const [[aggressor]] = await query(
        'SELECT status, rejection_reason FROM orders WHERE id = ?', [aggressorId]);
    const [[resting]]   = await query(
        'SELECT status FROM orders WHERE id = ?', [restingId]);

    check('Aggressor → CANCELLED',
        aggressor?.status === 'CANCELLED', aggressor);
    check('rejection_reason mentions wash trade',
        aggressor?.rejection_reason?.includes('Wash trade'), aggressor);
    check('Resting order still PENDING',
        resting?.status === 'PENDING', resting);

    // No trades created
    const [washTrades] = await query(
        `SELECT id FROM trades WHERE our_order_id IN (?, ?)`,
        [aggressorId, restingId]
    );
    check('No trades from wash trade attempt',
        washTrades.length === 0, washTrades.length);

    // Aggressor BUY reservation released
    const wA = await getWallet('arjun@test.com');
    check('Aggressor BUY reservation released (reserved = 0)',
        wA.reserved === 0, wA);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 12 — CONCURRENT RESERVATION
// ─────────────────────────────────────────────────────────────────────────────
async function suiteConcurrency(A) {
    section('SUITE 12: Concurrent Reservation — FOR UPDATE Proof');

    // Wait for all previous async engine operations to fully settle
    await sleep(400);
    const wBefore = await getWallet('arjun@test.com');

    // Fire 5 concurrent BUY orders simultaneously
    // Each reserves 2 × 100 paise = 200 paise
    const results = await Promise.all([
        A.post('/api/orders', {
            instrument_id: RELIANCE, side: 'BUY',
            order_type: 'LIMIT', quantity: 2, price: 100, product_type: 'CNC',
        }),
        A.post('/api/orders', {
            instrument_id: RELIANCE, side: 'BUY',
            order_type: 'LIMIT', quantity: 2, price: 100, product_type: 'CNC',
        }),
        A.post('/api/orders', {
            instrument_id: RELIANCE, side: 'BUY',
            order_type: 'LIMIT', quantity: 2, price: 100, product_type: 'CNC',
        }),
        A.post('/api/orders', {
            instrument_id: RELIANCE, side: 'BUY',
            order_type: 'LIMIT', quantity: 2, price: 100, product_type: 'CNC',
        }),
        A.post('/api/orders', {
            instrument_id: RELIANCE, side: 'BUY',
            order_type: 'LIMIT', quantity: 2, price: 100, product_type: 'CNC',
        }),
    ]);

    await sleep(400);

    const successes = results.filter(r => r.status === 201).length;
    const rejected  = results.filter(r => r.status !== 201).length;
    console.log(`     ${successes} succeeded, ${rejected} rejected (all valid outcomes)`);

    const wAfter = await getWallet('arjun@test.com');

    // Core invariant: reserved must never exceed balance — ever
    check('reserved ≤ balance at all times',
        wAfter.reserved <= wAfter.balance, wAfter);

    // Reserved must equal exactly successes × 200 — no phantom reservations
    const expectedReserved = wBefore.reserved + (successes * 20000);
    check('reserved = successes × 20000 exactly (no over-reservation)',
        wAfter.reserved === expectedReserved,
        { before: wBefore.reserved, after: wAfter.reserved, successes, expectedReserved });

    check('At least one concurrent order succeeded', successes >= 1, successes);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 13 — WEBSOCKET
// ─────────────────────────────────────────────────────────────────────────────
async function suiteWebSocket() {
    section('SUITE 13: WebSocket Price Feed');

    // Test 1: Stats endpoint
    const statsRes = await fetch(`${BASE}/api/debug/ws-stats`);
    const stats    = await statsRes.json();
    check('WS stats endpoint reachable (200)', statsRes.status === 200, stats);

    // Test 2: Connection + subscribe + acknowledgement
const wsResult = await new Promise((resolve) => {
    const ws     = new WebSocket(`ws://localhost:3000`);
    const events = [];
    let settled  = false;

    // Assign timer to variable so we can clear it on success
    const timer = setTimeout(() => done({ success: false, error: 'timeout' }), 4000);

    const done = (result) => {
        if (!settled) {
            settled = true;
            clearTimeout(timer);          // ← prevents event loop hang
            try { ws.close(); } catch {}
            resolve(result);
        }
    };

    ws.on('open',    ()    => ws.send(JSON.stringify({ type: 'subscribe', symbol: 'RELIANCE' })));
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        events.push(msg);
        if (msg.type === 'subscribed') done({ success: true, events });
    });
    ws.on('error',   (err) => done({ success: false, error: err.message }));
});

    check('WS: subscribed acknowledged',         wsResult.success, wsResult);
    check('WS: connected message received',
        wsResult.events?.some(e => e.type === 'connected'), wsResult.events);
    check('WS: subscribed message received',
        wsResult.events?.some(e => e.type === 'subscribed'), wsResult.events);
    check('WS: symbol = RELIANCE in response',
        wsResult.events?.find(e => e.type === 'subscribed')?.symbol === 'RELIANCE',
        wsResult.events?.find(e => e.type === 'subscribed'));
    check('WS: lastPrice field present',
        'lastPrice' in (wsResult.events?.find(e => e.type === 'subscribed') ?? {}),
        wsResult.events?.find(e => e.type === 'subscribed'));

    // Test 3: Invalid symbol → error message
const badSymResult = await new Promise((resolve) => {
    const ws    = new WebSocket(`ws://localhost:3000`);
    let settled = false;

    const timer = setTimeout(() => done({ error: 'timeout' }), 4000);

    const done  = (r) => {
        if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}
            resolve(r);
        }
    };

    ws.on('open',    ()    => ws.send(JSON.stringify({ type: 'subscribe', symbol: 'FAKESYMBOL' })));
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'error') done(msg);
    });
    ws.on('error',   (err) => done({ error: err.message }));
});

    // Test 4: Oversized payload → rejected
const bigResult = await new Promise((resolve) => {
    const ws    = new WebSocket(`ws://localhost:3000`);
    let settled = false;

    const timer = setTimeout(() => done({ error: 'timeout' }), 4000);

    const done  = (r) => {
        if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}
            resolve(r);
        }
    };

    ws.on('open',    ()    => ws.send('x'.repeat(2000)));
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'error') done(msg);
    });
    ws.on('error',   ()    => done({ rejected: true }));
});
    check('WS: oversized payload rejected',
        bigResult?.message?.includes('large') || bigResult?.rejected === true,
        bigResult);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 14 — RECONCILIATION
// ─────────────────────────────────────────────────────────────────────────────
async function suiteReconciliation() {
    section('SUITE 14: Data Integrity & Reconciliation');

    // wallet.version must equal COUNT(ledger entries for that wallet)
    const [versionCheck] = await query(
        `SELECT w.id, w.version, COUNT(l.id) AS ledger_count
         FROM wallets w
         LEFT JOIN ledger l ON l.wallet_id = w.id
         GROUP BY w.id, w.version`
    );
    check('wallet.version = ledger entry count per wallet',
        versionCheck.every(w => parseInt(w.version) === parseInt(w.ledger_count)),
        versionCheck.map(w => ({ v: w.version, l: w.ledger_count })));

    // wallet.balance must match most recent ledger.balance_after
    const [balCheck] = await query(
        `SELECT w.balance AS wb, l.balance_after AS la
         FROM wallets w
         JOIN ledger l ON l.wallet_id = w.id
         WHERE l.id = (
             SELECT id FROM ledger l2
             WHERE l2.wallet_id = w.id
             ORDER BY l2.created_at DESC LIMIT 1
         )`
    );
    check('wallet.balance matches latest ledger.balance_after',
        balCheck.every(r => parseInt(r.wb) === parseInt(r.la)),
        balCheck);

    // No negative balances
    const [negWallets] = await query(
        'SELECT id FROM wallets WHERE balance < 0 OR reserved < 0'
    );
    check('No negative wallet balances', negWallets.length === 0, negWallets.length);

    // No over-locked positions
    const [overLocked] = await query(
        'SELECT id FROM positions WHERE locked_quantity > quantity'
    );
    check('No locked_quantity > quantity', overLocked.length === 0, overLocked.length);

    // No orders with more filled than ordered
    const [overFilled] = await query(
        'SELECT id FROM orders WHERE filled_quantity > quantity'
    );
    check('No filled_quantity > quantity', overFilled.length === 0, overFilled.length);

    // No orphaned ledger entries
    const [orphaned] = await query(
        `SELECT l.id FROM ledger l
         LEFT JOIN wallets w ON l.wallet_id = w.id
         WHERE w.id IS NULL`
    );
    check('No orphaned ledger entries', orphaned.length === 0, orphaned.length);

    // reserved never exceeds balance
    const [invWallets] = await query(
        'SELECT id FROM wallets WHERE reserved > balance'
    );
    check('reserved ≤ balance on all wallets', invWallets.length === 0, invWallets.length);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE 15 — GET ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
async function suiteGetEndpoints(A) {
    section('SUITE 15: GET Endpoints');

    let r = await A.get('/api/orders');
    check('GET /api/orders → 200',           r.status === 200, r.data);
    check('Returns array',                   Array.isArray(r.data.data), r.data);
    check('Array non-empty',                 (r.data.data?.length ?? 0) > 0, r.data.data?.length);

    r = await A.get('/api/orders?status=FILLED');
    check('?status=FILLED → 200',            r.status === 200, r.data);
    check('All returned orders are FILLED',
        r.data.data?.every(o => o.status === 'FILLED'),
        r.data.data?.map(o => o.status));

    r = await A.get('/api/orders?status=CANCELLED');
    check('?status=CANCELLED → 200',         r.status === 200, r.data);

    r = await A.get('/api/orders?status=INVALID');
    check('?status=INVALID → 400',           r.status === 400, r.data);

    r = await A.get('/api/bank-accounts');
    check('GET /api/bank-accounts → 200',    r.status === 200, r.data);
    check('Returns array',                   Array.isArray(r.data.data), r.data);

    r = await A.get('/api/portfolio');
    check('GET /api/portfolio → 200',        r.status === 200, r.data);
    check('Portfolio has wallet field',      !!r.data.data?.wallet, r.data.data);
    check('Portfolio has summary field',     !!r.data.data?.summary, r.data.data);
    check('Portfolio has holdings field',    Array.isArray(r.data.data?.holdings), r.data.data);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n' + '═'.repeat(65));
    console.log('  NEXUSBROKER — MASTER TEST SUITE');
    console.log('  ' + new Date().toISOString());
    console.log('═'.repeat(65));

    // Connect to DB
    db = await mysql.createConnection(DB_CONFIG);
    console.log('\n  DB connected.');

    // Verify server is up before truncating anything
    try {
        await fetch(`${BASE}/api/auth/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({}),
        });
    } catch {
        console.error('\n  ✗  Server not reachable at localhost:3000');
        console.error('  Start it with: node server.mjs\n');
        await db.end();
        process.exit(1);
    }

    await resetDB();

    const A = new Session('UserA');
    const B = new Session('UserB');

    try {
        await suiteAuth(A, B);
        await suiteDeposit(A, B);
        const bankAccountId = await suiteBankAccounts(A, B);
        await suiteWithdrawal(A, B, bankAccountId);
        await suiteOrderValidation(A);
        await suitePortfolio(A, B);          // before trading suites — clean wallet state
        await suiteFullMatch(A, B);
        const partialBuyId = await suitePartialFill(A, B);
        await suitePriceImprovement(A, B, partialBuyId);
        await suiteCancellation(A);
        await suiteWashTrade(A);
        await suiteConcurrency(A);
        await suiteWebSocket();
        await suiteReconciliation();
        await suiteGetEndpoints(A);
    } catch (err) {
        console.error('\n  FATAL:', err.message);
        console.error(err.stack);
    }

    // Final summary
    console.log(`\n${'═'.repeat(65)}`);
    console.log(`  FINAL RESULTS: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\n  Failed tests:');
        failures.forEach(f => console.log(`    ✗  ${f}`));
    }
    console.log('═'.repeat(65) + '\n');

    await db.end();
    process.exit(failed > 0 ? 1 : 0);
}

main();