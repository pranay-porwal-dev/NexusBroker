import express from 'express';
import pool from '../config/db.mjs';
import { verifyAccessToken } from '../middleware/verifyAccessToken.mjs';

const router = express.Router();

router.get('/', verifyAccessToken, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, symbol, company_name, exchange, sector, domain 
     FROM instruments WHERE is_active = TRUE ORDER BY symbol`
  );
  res.json({ data: rows });
});

export default router;