import 'dotenv/config';
import { Connection } from 'mysql2';
import mysql from "mysql2/promise";

const urlDB= `mysql://root:UGzYMZWTVJPsXYnyIFtmPPkmqMKSDhCZ@mysql.railway.internal:3306/railway`;
const pool=mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'nexusbroker',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testConnection(){
    try{
        const connection= await pool.getConnection();
        console.log('DB connection pool established');
        connection.release();
    }catch(err){
        console.log('DB connection failed',err.message);
    }
}

testConnection();
export default pool;