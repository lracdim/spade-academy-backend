import { Router } from 'express';
import { login, getMe, changePassword } from '../controllers/auth.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.post('/change-password', authMiddleware, changePassword);

export default router;
