import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { db } from '../db/index.js';
import { certificates, users, courses } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Core Certificate Generation Function
 * Implements strict layout requirements for 4000x3091 template
 */
export async function generateCertificate({ recipientName, courseTitle, date, verificationUrl, certificateNumber, userId, courseId }) {
    try {
        // 1. Generate QR Code Buffer
        const qrBuffer = await QRCode.toBuffer(verificationUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 280,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        // 2. Prepare SVG layers with full-canvas width for centering
        // Added viewBox to ensure pixel-perfect rendering in Sharp
        const nameSvgBuffer = Buffer.from(`
            <svg width="4000" height="280" viewBox="0 0 4000 280" xmlns="http://www.w3.org/2000/svg">
                <style>
                    .name { fill: #1a1a1a; font-family: 'Georgia', serif; font-size: 160px; font-weight: bold; }
                </style>
                <text x="2000" y="200" text-anchor="middle" class="name">${recipientName}</text>
            </svg>
        `);
        const courseSvgBuffer = Buffer.from(`
            <svg width="4000" height="160" viewBox="0 0 4000 160" xmlns="http://www.w3.org/2000/svg">
                <style>
                    .course { fill: #333333; font-family: 'Arial', sans-serif; font-size: 72px; }
                </style>
                <text x="2000" y="110" text-anchor="middle" class="course">${courseTitle}</text>
            </svg>
        `);
        // 3. Define paths (relative to __dirname for consistency)
        const templatePath = path.join(__dirname, '../../public/templates/certificate.png');
        const uploadDir = path.join(__dirname, '../../public/uploads/certificates');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const fileName = `${certificateNumber}.png`;
        const outputPath = path.join(uploadDir, fileName);
        // 4. Sharp Composition Pipeline (Simpler layout)
        // Order is critical: Name -> Course -> QR
        await sharp(templatePath)
            .composite([
            { input: nameSvgBuffer, top: 1280, left: 0, blend: 'over' },
            { input: courseSvgBuffer, top: 1480, left: 0, blend: 'over' },
            { input: qrBuffer, top: 2680, left: 120 },
        ])
            .png({ quality: 100 })
            .toFile(outputPath);
        // 5. Database persist (Only after file is successfully written)
        const imageUrl = `/uploads/certificates/${fileName}`;
        await db.insert(certificates).values({
            userId,
            courseId,
            certCode: certificateNumber,
            imageUrl,
        });
        return { imageUrl, certificateNumber };
    }
    catch (error) {
        console.error('[Sharp] Generation Error:', error);
        throw new Error(`Failed to generate image: ${error.message}`);
    }
}
/**
 * Wrapper for the progress tracking system
 */
export const generateCertificateLogic = async (userId, courseId) => {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!user || !course)
        throw new Error('User or course not found');
    // Prevent duplicates
    const [existing] = await db.select().from(certificates).where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId))).limit(1);
    if (existing) {
        console.log(`[Certificate] Regenerating for user ${userId}, deleting old cert: ${existing.certCode}`);
        // Delete old file if it exists
        if (existing.imageUrl) {
            const oldFilePath = path.join(process.cwd(), 'public', existing.imageUrl);
            if (fs.existsSync(oldFilePath)) {
                try {
                    fs.unlinkSync(oldFilePath);
                }
                catch (err) {
                    console.error('[Certificate] Failed to delete old file:', err);
                }
            }
        }
        // Delete old entry to allow re-insertion with new code (or we could update, but user wants "delete old")
        await db.delete(certificates).where(eq(certificates.id, existing.id));
    }
    const certCode = existing?.certCode || `CERT-${userId.slice(0, 4)}-${courseId.slice(0, 4)}-${Date.now().toString().slice(-6)}`.toUpperCase();
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    await generateCertificate({
        recipientName: user.fullName,
        courseTitle: course.title,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        verificationUrl: `${appUrl}/verify-certificate/${certCode}`,
        certificateNumber: certCode,
        userId,
        courseId
    });
};
export const getMyCertificates = async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'Unauthorized' });
    try {
        const userCerts = await db.select({
            id: certificates.id,
            certCode: certificates.certCode,
            issuedAt: certificates.issuedAt,
            imageUrl: certificates.imageUrl,
            courseTitle: courses.title,
        })
            .from(certificates)
            .innerJoin(courses, eq(certificates.courseId, courses.id))
            .where(eq(certificates.userId, userId));
        res.json(userCerts);
    }
    catch (error) {
        console.error('Get certificates error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const verifyCertificate = async (req, res) => {
    const { code } = req.params;
    try {
        const [cert] = await db.select({
            certCode: certificates.certCode,
            issuedAt: certificates.issuedAt,
            userName: users.fullName,
            courseTitle: courses.title,
        })
            .from(certificates)
            .innerJoin(users, eq(certificates.userId, users.id))
            .innerJoin(courses, eq(certificates.courseId, courses.id))
            .where(eq(certificates.certCode, code))
            .limit(1);
        if (!cert)
            return res.status(404).json({ message: 'Certificate not found' });
        res.json(cert);
    }
    catch (error) {
        console.error('Verify certificate error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
//# sourceMappingURL=certificate.js.map