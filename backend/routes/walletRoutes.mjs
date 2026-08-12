import { Router } from "express";

import { depositFunds } from "../controllers/depositController.mjs";
import { rejectUnexpectedFieldsDeposit, validateDeposit } from "../middleware/validateDeposit.mjs";

import { withdrawFunds } from "../controllers/withdrawalController.mjs";
import { rejectUnexpectedFieldsWithdrawal, validateWithdrawal } from "../middleware/validateWithdrawal.mjs";

import { verifyAccessToken } from "../middleware/verifyAccessToken.mjs";
import { wrapAsync } from "../middleware/wrapAsync.mjs";

const router = Router();

router.post(
    "/deposit",
    verifyAccessToken,
    rejectUnexpectedFieldsDeposit,
    validateDeposit,
    wrapAsync(depositFunds)
);

router.post(
    "/withdraw",
    verifyAccessToken,
    rejectUnexpectedFieldsWithdrawal,
    validateWithdrawal,
    wrapAsync(withdrawFunds)
);

export default router;