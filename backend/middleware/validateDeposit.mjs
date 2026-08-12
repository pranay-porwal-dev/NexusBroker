const ALLOWED_FIELDS = ["amount", "reference_id", "payment_channel"];

const VALID_CHANNELS = ["UPI", "NEFT", "IMPS", "RTGS"];

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1_000_000;

export const rejectUnexpectedFieldsDeposit = (req, res, next) => {
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

export const validateDeposit = (req, res, next) => {
  const { amount, reference_id,  payment_channel} = req.body;

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

  const amountPaise = Math.round(parsedAmount*100);

  if (!reference_id) {
    return res.status(400).json({ error: "reference_id is required" });
  }

  if (typeof reference_id !== "string") {
    return res.status(400).json({ error: "reference_id must be a string" });
  }

  const trimmedRefId = reference_id.trim();

  if (trimmedRefId.length === 0) {
    return res.status(400).json({ error: "reference_id cannot be empty" });
  }

  if (trimmedRefId.length > 128) {
    return res.status(400).json({ error: "reference_id cannot exceed 128 characters" });
  }

  if (!/^[a-zA-Z0-9_\-]+$/.test(trimmedRefId)) {
    return res.status(400).json({
      error: "reference_id must contain only alphanumeric characters, hyphens, or underscores",
    });
  }

if (!payment_channel) {
    return res.status(400).json({ error: "payment_channel is required" });
}

if (!VALID_CHANNELS.includes(payment_channel)) {
    return res.status(400).json({
        error: `payment_channel must be one of: ${VALID_CHANNELS.join(", ")}`,
    });
}

  req.body.amount = amountPaise;
  req.body.reference_id = trimmedRefId;

  next();
};