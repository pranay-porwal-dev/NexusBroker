import pool from './config/db.mjs';

const tables = [
  'trades',
  'positions',
  'orders',
  'ledger',
  'wallets',
  'bank_accounts',
  'user_session',
  'user_credentials',
  'user_profiles',
  'instruments'
];

async function cleanDatabase() {
  let connection;
  try {
    console.log('--- Wiping Database Tables ---');
    connection = await pool.getConnection();

    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    for (const table of tables) {
      await connection.query(`TRUNCATE TABLE ${table};`);
      console.log(`✓ Cleared table: ${table}`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('✓ All tables wiped cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('✗ Cleanup failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
  }
}

cleanDatabase();