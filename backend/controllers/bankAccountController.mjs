import pool from "../config/db.mjs";
import crypto from "crypto";

export const addBankAccount = async (req, res, next) => {
    const { account_number, ifsc_code, account_holder, bank_name, account_type } = req.body;
    const userId = req.userId;

    try {
        const accountId = crypto.randomUUID();

        const isDev = process.env.NODE_ENV !== "production";

        await pool.execute(
            `INSERT INTO bank_accounts
               (id, user_id, account_number, ifsc_code, account_holder,
                bank_name, account_type, is_verified, verified_at, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
                accountId,
                userId,
                account_number,
                ifsc_code,
                account_holder,
                bank_name,
                account_type,
                isDev,                    
                isDev ? new Date() : null
            ]
        );

        return res.status(201).json({
            message: isDev
                ? "Bank account added and auto-verified (development mode)."
                : "Bank account added. Penny drop verification initiated — usually takes 1–2 hours.",
            data: {
                bank_account_id: accountId,
                account_number: `XXXX${account_number.slice(-4)}`, // masked
                ifsc_code,
                bank_name,
                account_type,
                is_verified: isDev,
            },
        });

    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "This bank account is already registered to your profile.",
            });
        }
        return next(err);
    }
};

export const listBankAccounts = async (req, res, next) => {
    const userId = req.userId;

    try {
        const [accounts] = await pool.execute(
            `SELECT id, account_number, ifsc_code, account_holder,
                    bank_name, account_type, is_verified, verified_at, created_at
             FROM bank_accounts
             WHERE user_id = ? AND is_active = TRUE
             ORDER BY created_at DESC`,
            [userId]
        );

        const masked = accounts.map(acc => ({
            ...acc,
            account_number: `XXXX${acc.account_number.slice(-4)}`,
        }));

        return res.status(200).json({ data: masked });

    } catch (err) {
        return next(err);
    }
};