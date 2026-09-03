import 'dotenv/config';
import mysql from 'mysql2/promise';

const isProduction = process.env.NODE_ENV === 'production';

let poolConfig;

if (process.env.DATABASE_URL) {
  poolConfig = {
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Railway MySQL 8 requires public key retrieval for SHA2 auth
    ssl: isProduction ? { rejectUnauthorized: false } : undefined
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'nexusbroker',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

const pool = mysql.createPool(poolConfig);

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✓ DB connection pool established successfully');
    connection.release();
  } catch (err) {
    console.error('✗ DB connection failed:');
    console.error(`  Code:    ${err.code || 'N/A'}`);
    console.error(`  Errno:   ${err.errno || 'N/A'}`);
    console.error(`  Message: ${err.message || 'No message provided by driver'}`);
    console.error(`  Target:  ${process.env.DATABASE_URL ? 'Remote Railway URL' : 'Local fallback (127.0.0.1:3306)'}`);
  }
}

testConnection();

export default pool;