const ALLOWED_FIELDS = [
    "account_number",
    "ifsc_code",
    "account_holder",
    "bank_name",
    "account_type"
];

const VALID_ACCOUNT_TYPES = ["SAVINGS", "CURRENT"];

export const rejectUnexpectedFieldsBankAccount = (req, res, next) => {
    const unexpected = Object.keys(req.body).filter(f => !ALLOWED_FIELDS.includes(f));
    if (unexpected.length > 0) {
        return res.status(400).json({ error: `Unexpected fields: ${unexpected.join(", ")}` });
    }
    next();
};

export const validateBankAccount = (req, res, next) => {
    const { account_number, ifsc_code, account_holder, bank_name, account_type } = req.body;

    if (!account_number) {
        return res.status(400).json({ error: "account_number is required" });
    }

    if (typeof account_number !== "string") {
        return res.status(400).json({ error: "account_number must be a string" });
    }

    const trimmedAccNo = account_number.trim();

    if (!/^\d{9,18}$/.test(trimmedAccNo)) {
        return res.status(400).json({
            error: "account_number must be 9–18 digits with no spaces or special characters",
        });
    }

    if (!ifsc_code) {
        return res.status(400).json({ error: "ifsc_code is required" });
    }
    if (typeof ifsc_code !== "string") {
        return res.status(400).json({ error: "ifsc_code must be a string" });
    }

    const trimmedIfsc = ifsc_code.trim().toUpperCase();

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmedIfsc)) {
        return res.status(400).json({
            error: "ifsc_code must be in RBI format: 4 letters + 0 + 6 alphanumeric (e.g. HDFC0001234)",
        });
    }

    if (!account_holder || typeof account_holder !== "string") {
        return res.status(400).json({ error: "account_holder is required" });
    }

    const trimmedHolder = account_holder.trim();

    if (trimmedHolder.length < 2 || trimmedHolder.length > 255) {
        return res.status(400).json({ error: "account_holder must be between 2 and 255 characters" });
    }

    if (!/^[a-zA-Z\s.-]+$/.test(trimmedHolder)) {
        return res.status(400).json({ 
            error: "account_holder contains invalid characters. Only letters, spaces, dots, and hyphens allowed." 
        });
    }
    
    if (!bank_name || typeof bank_name !== "string") {
        return res.status(400).json({ error: "bank_name is required" });
    }

    const trimmedBankName = bank_name.trim();

    if (trimmedBankName.length < 2 || trimmedBankName.length > 255) {
        return res.status(400).json({ error: "bank_name must be between 2 and 255 characters" });
    }

    const resolvedAccountType = account_type
        ? account_type.trim().toUpperCase()
        : "SAVINGS";

    if (!VALID_ACCOUNT_TYPES.includes(resolvedAccountType)) {
        return res.status(400).json({
            error: `account_type must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`,
        });
    }

    req.body.account_number = trimmedAccNo;
    req.body.ifsc_code = trimmedIfsc;
    req.body.account_holder = trimmedHolder;
    req.body.bank_name = trimmedBankName;
    req.body.account_type = resolvedAccountType;

    next();
};