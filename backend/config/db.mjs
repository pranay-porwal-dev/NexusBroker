import 'dotenv/config';
import mysql from 'mysql2/promise';

const dbConfig = process.env.DATABASE_URL
  ? {
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '1234',
      database: process.env.DB_NAME || 'nexusbroker',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

const pool = mysql.createPool(dbConfig);

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✓ DB connection pool established successfully');
    connection.release();
  } catch (err) {
    console.error('✗ DB connection failed:', err.message);
  }
}

testConnection();

export default pool;