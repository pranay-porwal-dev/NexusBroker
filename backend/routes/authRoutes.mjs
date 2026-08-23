import { Router } from "express";
import { validateRegistration, rejectUnexpectedFieldsRegister, validateLogin} from "../middleware/validateAuth.mjs";
import { logoutUser, refreshSession, loginUser, registerUser } from "../controllers/authController.mjs";
import { verifyAccessToken } from "../middleware/verifyAccessToken.mjs";

const router = Router();

router.post('/register', rejectUnexpectedFieldsRegister, validateRegistration, registerUser);
router.post('/login', validateLogin, loginUser);
router.post('/refresh', refreshSession);
router.post('/logout', logoutUser);

router.get('/profile',verifyAccessToken, (req,res)=>{
    res.status(200).json({
        message: "Access granted to Protected Vault.",
        user_id: req.userId,
    });
});

router.get('/me', verifyAccessToken, (req, res) => {
  res.json({ data: { userId: req.userId } });
});

export default router;
