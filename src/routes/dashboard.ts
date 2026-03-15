import { Router } from 'express';
import { getDashboardStats, getGuardDashboardStats } from '../controllers/dashboard.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/stats', authMiddleware, roleMiddleware(['ADMIN']), getDashboardStats);
router.get('/guard/stats', authMiddleware, roleMiddleware(['GUARD']), getGuardDashboardStats);

export default router;
