import { Router } from 'express';
import { getMyCertificates, verifyCertificate, getAllCertificates } from '../controllers/certificate.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/my', authMiddleware, roleMiddleware(['GUARD']), getMyCertificates);
router.get('/all', authMiddleware, roleMiddleware(['ADMIN']), getAllCertificates);
router.get('/verify/:code', verifyCertificate); // Public endpoint

export default router;