import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMyCertificates, verifyCertificate, getAllCertificates, regenerateCertificate } from '../controllers/certificate.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.get('/my', authMiddleware, roleMiddleware(['GUARD']), getMyCertificates);
router.get('/all', authMiddleware, roleMiddleware(['ADMIN']), getAllCertificates);
router.get('/verify/:code', verifyCertificate);
router.post('/regenerate', authMiddleware, roleMiddleware(['GUARD']), regenerateCertificate);

router.get('/debug-template', async (req, res) => {
    const sharp = (await import('sharp')).default;
    const templatePath = path.join(__dirname, '../../public/templates/certificate.png');
    const meta = await sharp(templatePath).metadata();
    res.json({ width: meta.width, height: meta.height });
});

export default router;