import { Router } from "express";
import { placeOrder, getUserOrders, cancelOrder } from "../controllers/orderController.mjs";
import { rejectUnexpectedFieldsOrder, validateOrder } from "../middleware/validateOrder.mjs";
import { verifyAccessToken } from "../middleware/verifyAccessToken.mjs";
import { wrapAsync } from "../middleware/wrapAsync.mjs";

const router = Router();

router.post(
    "/",
    verifyAccessToken,
    rejectUnexpectedFieldsOrder,
    validateOrder,
    wrapAsync(placeOrder)
);

router.get(
    "/",
    verifyAccessToken,
    wrapAsync(getUserOrders)
);

router.delete(
    "/:orderId",
    verifyAccessToken,
    wrapAsync(cancelOrder)
);

export default router;