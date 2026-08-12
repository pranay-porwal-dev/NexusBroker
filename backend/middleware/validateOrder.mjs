const ALLOWED_FIELDS = ["instrument_id", "side", "order_type", "quantity", "price", "product_type"];

const VALID_SIDES = ["BUY", "SELL"];
const VALID_ORDER_TYPES = ["MARKET", "LIMIT"];
const VALID_PRODUCT_TYPES = ["CNC"];

export const rejectUnexpectedFieldsOrder = (req, res, next) => {
    const unexpected = Object.keys(req.body).filter(f => !ALLOWED_FIELDS.includes(f));
    if (unexpected.length > 0) {
        return res.status(400).json({ error: `Unexpected fields: ${unexpected.join(", ")}` });
    }
    next();
};

export const validateOrder = (req, res, next) => {
    const { instrument_id, side, order_type, quantity, price, product_type } = req.body;

    if (!instrument_id || typeof instrument_id !== "string") {
        return res.status(400).json({ error: "instrument_id is required" });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(instrument_id.trim())) {
        return res.status(400).json({ error: "instrument_id must be a valid UUID" });
    }

    if (!side || !VALID_SIDES.includes(side)) {
        return res.status(400).json({ error: `side must be one of: ${VALID_SIDES.join(", ")}` });
    }

    if (!order_type || !VALID_ORDER_TYPES.includes(order_type)) {
        return res.status(400).json({ error: `order_type must be one of: ${VALID_ORDER_TYPES.join(", ")}` });
    }

    if (quantity === undefined || quantity === null) {
        return res.status(400).json({ error: "quantity is required" });
    }

    const parsedQty = parseInt(quantity, 10);

    if (isNaN(parsedQty) || parsedQty <= 0) {
        return res.status(400).json({ error: "quantity must be a positive integer" });
    }

    if (parsedQty > 100_000) {
        return res.status(400).json({ error: "quantity cannot exceed 1,00,000 shares per order" });
    }

    if (order_type === "LIMIT") {
        if (price === undefined || price === null) {
            return res.status(400).json({ error: "price is required for LIMIT orders" });
        }

        const parsedPrice = parseFloat(price);

        if (isNaN(parsedPrice) || !isFinite(parsedPrice) || parsedPrice <= 0) {
            return res.status(400).json({ error: "price must be a positive number" });
        }

        if (parseFloat(parsedPrice.toFixed(2)) !== parsedPrice) {
            return res.status(400).json({ error: "price cannot have more than 2 decimal places" });
        }

        req.body.price = Math.round(parsedPrice * 100);
    } else {
        req.body.price = null;
    }

    const resolvedProductType = product_type
        ? product_type.trim().toUpperCase()
        : "CNC"; 

    if (!VALID_PRODUCT_TYPES.includes(resolvedProductType)) {
        return res.status(400).json({
            error: `product_type must be one of: ${VALID_PRODUCT_TYPES.join(", ")}`,
        });
    }

    req.body.instrument_id = instrument_id.trim();
    req.body.quantity = parsedQty;
    req.body.product_type = resolvedProductType;

    next();
};