import { Router } from 'express';
import { getMyCertificates, verifyCertificate, getAllCertificates, regenerateCertificate } from '../controllers/certificate.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/my', authMiddleware, roleMiddleware(['GUARD']), getMyCertificates);
router.get('/all', authMiddleware, roleMiddleware(['ADMIN']), getAllCertificates);
router.get('/verify/:code', verifyCertificate);
// ✅ New: regenerate (delete old + generate fresh)
router.post('/regenerate', authMiddleware, roleMiddleware(['GUARD']), regenerateCertificate);

export default router;