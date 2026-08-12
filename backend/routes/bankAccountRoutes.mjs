import { Router } from "express";
import { addBankAccount, listBankAccounts } from "../controllers/bankAccountController.mjs";
import { rejectUnexpectedFieldsBankAccount, validateBankAccount } from "../middleware/validateBankAccount.mjs";
import { verifyAccessToken } from "../middleware/verifyAccessToken.mjs";
import { wrapAsync } from "../middleware/wrapAsync.mjs";

const router = Router();

router.post(
    "/",
    verifyAccessToken,
    rejectUnexpectedFieldsBankAccount,
    validateBankAccount,
    wrapAsync(addBankAccount)
);

router.get(
    "/",
    verifyAccessToken,
    wrapAsync(listBankAccounts)
);

export default router;