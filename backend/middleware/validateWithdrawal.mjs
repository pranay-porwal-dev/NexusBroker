const ALLOWED_FIELDS = ["amount", "bank_account_id"];

const MIN_AMOUNT = 1;       
const MAX_AMOUNT = 500_000; 

export const rejectUnexpectedFieldsWithdrawal = (req, res, next) => {
    const unexpectedFields = Object.keys(req.body).filter(
        (field) => !ALLOWED_FIELDS.includes(field)
    );

    if (unexpectedFields.length > 0) {
        return res.status(400).json({
            error: `Unexpected fields: ${unexpectedFields.join(", ")}`,
        });
    }

    next();
};

export const validateWithdrawal = (req, res, next) => {
    const { amount, bank_account_id } = req.body;

    if (amount === undefined || amount === null) {
        return res.status(400).json({ error: "amount is required" });
    }

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount)) {
        return res.status(400).json({ error: "amount must be a valid number" });
    }

    if (!isFinite(parsedAmount)) {
        return res.status(400).json({ error: "amount must be a finite number" });
    }

    if (parsedAmount < MIN_AMOUNT) {
        return res.status(400).json({ error: `amount must be at least ₹${MIN_AMOUNT}` });
    }

    if (parsedAmount > MAX_AMOUNT) {
        return res.status(400).json({ error: `amount cannot exceed ₹${MAX_AMOUNT}` });
    }

    if (parseFloat(parsedAmount.toFixed(2)) !== parsedAmount) {
        return res.status(400).json({
            error: "amount cannot have more than 2 decimal places",
        });
    }

    const amountPaise = Math.round(parsedAmount * 100);

    if (!bank_account_id) {
        return res.status(400).json({ error: "bank_account_id is required" });
    }

    if (typeof bank_account_id !== "string") {
        return res.status(400).json({ error: "bank_account_id must be a string" });
    }

    const trimmedAccountId = bank_account_id.trim();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedAccountId)) {
        return res.status(400).json({ error: "bank_account_id must be a valid UUID" });
    }

    req.body.amount = amountPaise;          
    req.body.bank_account_id = trimmedAccountId;

    next();
};