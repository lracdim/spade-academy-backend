import { Router } from 'express';
import { getMyQuizAttempts } from '../controllers/quiz.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/attempts', authMiddleware, getMyQuizAttempts);

export default router;
