import pool from "../config/db.mjs";
import crypto from "crypto";

const MAX_RETRIES = 3;
const RETRYABLE_ERRORS = new Set(["ER_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

const determinePaymentChannel = (amountPaise) => {
    const RTGS_THRESHOLD_PAISE = 20_000_000; 
    return amountPaise >= RTGS_THRESHOLD_PAISE ? "RTGS" : "NEFT";
};

export const withdrawFunds = async (req, res, next) => {
    const { amount, bank_account_id } = req.body;
    const userId = req.userId;

    const ledgerId = crypto.randomUUID();
    const referenceId = `WD-${crypto.randomUUID()}`;

    const paymentChannel = determinePaymentChannel(amount);

    let attempt = 0;
    let lastError = null;

    while (attempt < MAX_RETRIES) {
        attempt++;

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [bankRows] = await connection.execute(
                `SELECT id, account_number, bank_name, ifsc_code
                 FROM bank_accounts
                 WHERE id = ?
                   AND user_id = ?
                   AND is_verified = TRUE
                   AND is_active = TRUE`,
                [bank_account_id, userId]
            );

            if (bankRows.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: "Bank account not found, not verified, or does not belong to your account.",
                });
            }

            const bankAccount = bankRows[0];

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

            if (currentBalance < amount) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Insufficient funds. Available balance: ₹${(currentBalance / 100).toFixed(2)}`,
                });
            }

            const newBalance = currentBalance - amount; 

            await connection.execute(
                `INSERT INTO ledger
                   (id, wallet_id, type, amount, transaction_category,
                    payment_channel, reference_id, balance_after, withdrawal_status)
                 VALUES
                   (?, ?, 'DEBIT', ?, 'WITHDRAWAL', ?, ?, ?, 'PENDING')`,
                [ledgerId, walletId, amount, paymentChannel, referenceId, newBalance]
            );

            await connection.execute(
                `UPDATE wallets
                 SET balance = ?, version = version + 1
                 WHERE user_id = ?`,
                [newBalance, userId]
            );

            await connection.commit();

            const etaMessage = paymentChannel === "RTGS"
                ? "Expected within 30 minutes during RBI RTGS hours (8AM–4:30PM on business days)"
                : "Expected within 2 hours during NEFT settlement windows on business days";

            return res.status(200).json({
                message: "Withdrawal request accepted. Bank transfer initiated.",
                data: {
                    ledger_id: ledgerId,
                    reference_id: referenceId,
                    amount: amount / 100,              // paise → rupees for display
                    new_balance: newBalance / 100,
                    new_version: currentVersion + 1,
                    payment_channel: paymentChannel,
                    destination: {
                        bank_name: bankAccount.bank_name,
                        account_number: `XXXX${bankAccount.account_number.slice(-4)}`, // mask
                        ifsc_code: bankAccount.ifsc_code,
                    },
                    status: "PENDING",
                    eta: etaMessage,
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
                    error: "Duplicate withdrawal reference. Please contact support.",
                });
            }

            if (RETRYABLE_ERRORS.has(err.code)) {
                lastError = err;
                console.warn(`[WARN] Contention on withdrawal (${err.code}). Attempt ${attempt}/${MAX_RETRIES}`);
                const backoffMs = Math.random() * (100 * Math.pow(2, attempt - 1));
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }

            return next(err);

        } finally {
            connection.release();
        }
    }

    console.error(`Withdrawal failed after ${MAX_RETRIES} attempts:`, lastError);
    return res.status(503).json({
        error: "Service temporarily unavailable due to high contention. Please retry.",
    });
};