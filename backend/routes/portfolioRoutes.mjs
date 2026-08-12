import { Router } from 'express';
import { getPortfolio } from '../controllers/portfolioController.mjs';
import { verifyAccessToken } from '../middleware/verifyAccessToken.mjs';
import { wrapAsync } from '../middleware/wrapAsync.mjs';

const router = Router();

router.get('/', verifyAccessToken, wrapAsync(getPortfolio));

export default router;