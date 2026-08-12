import pool from "../config/db.mjs";
import crypto from "crypto";

const MAX_RETRIES = 3;
const RETRYABLE_ERRORS = new Set(["ER_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

export const depositFunds = async (req, res, next) => {
  const { amount, reference_id, payment_channel } = req.body;
  const userId = req.userId;

  const ledgerId = crypto.randomUUID();

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [walletRows] = await connection.execute(
        `SELECT id, balance, version
         FROM wallets
         WHERE user_id = ?
         FOR UPDATE`,
        [userId]
      );

      if (walletRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Wallet not found" });
      }
      const walletId = walletRows[0].id;
      const currentBalance = parseInt(walletRows[0].balance, 10);
      const currentVersion = parseInt(walletRows[0].version, 10);
      const newBalance = currentBalance + amount;

      await connection.execute(
        `INSERT INTO ledger
           (id, wallet_id, type, amount, transaction_category, payment_channel, reference_id, balance_after)
         VALUES
           (?, ? , 'CREDIT', ?, 'DEPOSIT', ?, ?, ?)`,
        [ledgerId, walletId, amount, payment_channel, reference_id, newBalance]
      );

      await connection.execute(
        `UPDATE wallets
         SET balance = ?, version = version + 1
         WHERE user_id = ? `,
        [newBalance, userId]
      );

      await connection.commit();

      return res.status(200).json({
        message: "Deposit successful",
        data: {
          ledger_id: ledgerId,
          reference_id,
          amount: amount/100,
          new_balance: newBalance/100,
          new_version: currentVersion + 1,
          payment_channel,
        },
      });

    } catch (err) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("CRITICAL: Rollback failed:", rollbackErr);
      }

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          error: "This transaction has already been processed. Duplicate reference_id.",
        });
      }

      if(RETRYABLE_ERRORS.has(err.code)){
        lastError=err;
        console.warn(`[WARN] Contention detected (${err.code}). Retrying attempt ${attempt}...`);
        const backoffMs = Math.random()*(100*Math.pow(2,attempt-1));
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      return next(err);

    } finally {
      connection.release();
    }
  }
  console.error(`Deposit failed after ${MAX_RETRIES} attempts:`, lastError);
    return res.status(503).json({
        error: "Service temporarily unavailable due to high contention. Please retry.",
    });

};