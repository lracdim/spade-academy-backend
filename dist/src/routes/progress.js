import { Router } from 'express';
import { updateVideoProgress, manualGenerateCertificate } from '../controllers/progress.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
const router = Router();
router.post('/video-watched', authMiddleware, roleMiddleware(['GUARD']), updateVideoProgress);
router.post('/generate-certificate', authMiddleware, roleMiddleware(['GUARD']), manualGenerateCertificate);
export default router;
//# sourceMappingURL=progress.js.map