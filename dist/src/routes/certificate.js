import { Router } from 'express';
import { getMyCertificates, verifyCertificate } from '../controllers/certificate.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
const router = Router();
router.get('/my', authMiddleware, roleMiddleware(['GUARD']), getMyCertificates);
router.get('/verify/:code', verifyCertificate); // Public endpoint
export default router;
//# sourceMappingURL=certificate.js.map