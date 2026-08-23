import 'dotenv/config';
import pool from './config/db.mjs';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DEMO_USERS = [
  {
    name: 'Arjun Mehta', email: 'arjun@demo.com', password: 'Demo@1234',
    dob: '1995-06-15', phone_no: '9876543210',
    tax_id: 'ABCPM1234D', country_code: 'IN',
    deposit: 500000,  
  },
  {
    name: 'Priya Shah', email: 'priya@demo.com', password: 'Demo@1234',
    dob: '1992-03-22', phone_no: '9876543211',
    tax_id: 'XYZPS5678K', country_code: 'IN',
    deposit: 1000000,  
  },
];

// Trades to seed: Priya sells, Arjun buys
// Format: { symbol, price (₹), quantity }
const TRADES_TO_SEED = [
  { symbol: 'RELIANCE',   price: 2456.75, qty: 10 },
  { symbol: 'TCS',        price: 3821.40, qty: 5  },
  { symbol: 'INFY',       price: 1834.60, qty: 15 },
  { symbol: 'HDFCBANK',   price: 1678.25, qty: 8  },
  { symbol: 'ICICIBANK',  price: 1245.30, qty: 12 },
  { symbol: 'SBIN',       price: 812.45,  qty: 20 },
  { symbol: 'ITC',        price: 456.80,  qty: 50 },
  { symbol: 'WIPRO',      price: 567.30,  qty: 18 },
];

async function seed() {
  console.log('\n🚀 Seeding demo data for NexusBroker...\n');

  const userIds = {};
  const walletIds = {};

  for (const u of DEMO_USERS) {
    const userId   = crypto.randomUUID();
    const walletId = crypto.randomUUID();
    const hash     = await bcrypt.hash(u.password, 12);

    await pool.query(`
      INSERT IGNORE INTO user_profiles
        (id, name, email, dob, phone_no, tax_id, tax_id_type, country_code)
      VALUES (?, ?, ?, ?, ?, ?, 'PAN', ?)`,
      [userId, u.name, u.email, u.dob, u.phone_no, u.tax_id, u.country_code]
    );

    // Get actual id (in case user already existed from previous seed)
    const [[existing]] = await pool.query(
      'SELECT id FROM user_profiles WHERE email = ?', [u.email]
    );
    userIds[u.email] = existing.id;

    await pool.query(`
      INSERT IGNORE INTO user_credentials (user_id, password_hash)
      VALUES (?, ?)`, [userIds[u.email], hash]
    );

    await pool.query(`
      INSERT IGNORE INTO wallets (id, user_id, balance, reserved, version)
      VALUES (?, ?, 0, 0, 0)`, [walletId, userIds[u.email]]
    );

    const [[wallet]] = await pool.query(
      'SELECT id FROM wallets WHERE user_id = ?', [userIds[u.email]]
    );
    walletIds[u.email] = wallet.id;

    console.log(`✓ User: ${u.name} (${u.email})`);
  }

  // ── Step 2: Deposit funds ─────────────────────────────────────────────────
  for (const u of DEMO_USERS) {
    const amountPaise = u.deposit * 100;
    const wId = walletIds[u.email];

    await pool.query(`
      UPDATE wallets SET balance = balance + ?, version = version + 1
      WHERE id = ?`, [amountPaise, wId]
    );

    await pool.query(`
      INSERT INTO ledger
        (id, wallet_id, amount, type, transaction_category,
         payment_channel, reference_id, balance_after)
      VALUES (UUID(), ?, ?, 'CREDIT', 'DEPOSIT', 'UPI', ?, ?)`,
      [wId, amountPaise, `DEMO-DEP-${u.email}`, amountPaise]
    );

    console.log(`✓ Deposited ₹${u.deposit.toLocaleString()} → ${u.name}`);
  }

  // ── Step 3: Seed positions for Priya (she needs shares to sell) ───────────
  for (const t of TRADES_TO_SEED) {
    const [[instr]] = await pool.query(
      'SELECT id FROM instruments WHERE symbol = ?', [t.symbol]
    );
    if (!instr) { console.log(`⚠ Instrument ${t.symbol} not found — run seedInstruments first`); continue; }

    const pricePaise    = Math.round(t.price * 100);
    const totalInvested = pricePaise * t.qty;

    await pool.query(`
      INSERT INTO positions
        (id, user_id, instrument_id, quantity, locked_quantity,
         average_buy_price, total_invested, product_type)
      VALUES (UUID(), ?, ?, ?, 0, ?, ?, 'CNC')
      ON DUPLICATE KEY UPDATE
        quantity = quantity + VALUES(quantity),
        total_invested = total_invested + VALUES(total_invested)`,
      [userIds['priya@demo.com'], instr.id, t.qty, pricePaise, totalInvested]
    );
  }
  console.log(`✓ Seeded ${TRADES_TO_SEED.length} positions for Priya`);

  // ── Step 4: Create matching orders → trades → Arjun gets holdings ─────────
  for (const t of TRADES_TO_SEED) {
    const [[instr]] = await pool.query(
      'SELECT id FROM instruments WHERE symbol = ?', [t.symbol]
    );
    if (!instr) continue;

    const pricePaise    = Math.round(t.price * 100);
    const tradeValue    = pricePaise * t.qty;
    const sellOrderId   = crypto.randomUUID();
    const buyOrderId    = crypto.randomUUID();
    const sellTradeId   = crypto.randomUUID();
    const buyTradeId    = crypto.randomUUID();

    // Sell order (Priya)
    await pool.query(`
      INSERT INTO orders
        (id, user_id, instrument_id, side, order_type, quantity,
         filled_quantity, price, status, product_type, reserved)
      VALUES (?, ?, ?, 'SELL', 'LIMIT', ?, ?, ?, 'FILLED', 'CNC', 0)`,
      [sellOrderId, userIds['priya@demo.com'], instr.id, t.qty, t.qty, pricePaise]
    );

    // Buy order (Arjun)
    await pool.query(`
      INSERT INTO orders
        (id, user_id, instrument_id, side, order_type, quantity,
         filled_quantity, price, status, product_type, reserved)
      VALUES (?, ?, ?, 'BUY', 'LIMIT', ?, ?, ?, 'FILLED', 'CNC', 0)`,
      [buyOrderId, userIds['arjun@demo.com'], instr.id, t.qty, t.qty, pricePaise]
    );

    // Trade records
    await pool.query(`
      INSERT INTO trades
        (id, our_order_id, our_side, instrument_id, quantity, trade_price, trade_value)
      VALUES (?, ?, 'SELL', ?, ?, ?, ?)`,
      [sellTradeId, sellOrderId, instr.id, t.qty, pricePaise, tradeValue]
    );
    await pool.query(`
      INSERT INTO trades
        (id, our_order_id, our_side, instrument_id, quantity, trade_price, trade_value)
      VALUES (?, ?, 'BUY', ?, ?, ?, ?)`,
      [buyTradeId, buyOrderId, instr.id, t.qty, pricePaise, tradeValue]
    );

    // Arjun gets the position
    await pool.query(`
      INSERT INTO positions
        (id, user_id, instrument_id, quantity, locked_quantity,
         average_buy_price, total_invested, product_type)
      VALUES (UUID(), ?, ?, ?, 0, ?, ?, 'CNC')
      ON DUPLICATE KEY UPDATE
        quantity = quantity + VALUES(quantity),
        total_invested = total_invested + VALUES(total_invested),
        average_buy_price = total_invested / quantity`,
      [userIds['arjun@demo.com'], instr.id, t.qty, pricePaise, tradeValue]
    );

    // Debit Arjun's wallet
    const [[arjunWallet]] = await pool.query(
      'SELECT balance, version FROM wallets WHERE id = ?',
      [walletIds['arjun@demo.com']]
    );
    const newBalance = parseInt(arjunWallet.balance) - tradeValue;
    await pool.query(`
      UPDATE wallets SET balance = ?, version = version + 1 WHERE id = ?`,
      [newBalance, walletIds['arjun@demo.com']]
    );
    await pool.query(`
      INSERT INTO ledger
        (id, wallet_id, amount, type, transaction_category,
         payment_channel, reference_id, balance_after)
      VALUES (UUID(), ?, ?, 'DEBIT', 'TRADE_BUY', 'INTERNAL', ?, ?)`,
      [walletIds['arjun@demo.com'], tradeValue, `TRADE-BUY-${buyOrderId}`, newBalance]
    );

    // Credit Priya's wallet
    const [[priyaWallet]] = await pool.query(
      'SELECT balance, version FROM wallets WHERE id = ?',
      [walletIds['priya@demo.com']]
    );
    const priyaNewBalance = parseInt(priyaWallet.balance) + tradeValue;
    await pool.query(`
      UPDATE wallets SET balance = ?, version = version + 1 WHERE id = ?`,
      [priyaNewBalance, walletIds['priya@demo.com']]
    );
    await pool.query(`
      INSERT INTO ledger
        (id, wallet_id, amount, type, transaction_category,
         payment_channel, reference_id, balance_after)
      VALUES (UUID(), ?, ?, 'CREDIT', 'TRADE_SELL', 'INTERNAL', ?, ?)`,
      [walletIds['priya@demo.com'], tradeValue, `TRADE-SELL-${sellOrderId}`, priyaNewBalance]
    );

    console.log(`✓ Trade: ${t.qty} × ${t.symbol} @ ₹${t.price}`);
  }

  console.log('\n✅ Demo seed complete!\n');
  console.log('Login credentials:');
  console.log('  arjun@demo.com  / Demo@1234  ← has holdings + portfolio');
  console.log('  priya@demo.com  / Demo@1234  ← has cash from selling\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});