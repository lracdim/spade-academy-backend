import { Router } from 'express';
import { getMyQuizAttempts, getQuizAttemptDetails } from '../controllers/quiz.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/attempts', authMiddleware, getMyQuizAttempts);
router.get('/attempts/:attemptId', authMiddleware, getQuizAttemptDetails);

export default router;
