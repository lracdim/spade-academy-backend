import { Router } from 'express';
import { getNotifications, markAsRead } from '../controllers/notification.js';
import { authMiddleware } from '../middleware/auth.js';
const router = Router();
router.get('/', authMiddleware, getNotifications);
router.post('/mark-read', authMiddleware, markAsRead);
export default router;
//# sourceMappingURL=notification.js.map