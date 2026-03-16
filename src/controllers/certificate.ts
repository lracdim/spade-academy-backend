import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { db } from '../db/index.js';
import { certificates, users, courses } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { fileURLToPath } from 'url';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CertParams {
    recipientName: string;
    courseTitle: string;
    date: string;
    verificationUrl: string;
    certificateNumber: string;
    userId: string;
    courseId: string;
}

export async function generateCertificate({
    recipientName,
    courseTitle,
    date,
    verificationUrl,
    certificateNumber,
    userId,
    courseId
}: CertParams) {
    try {
        const templatePath = path.join(__dirname, '../../public/templates/certificate.png');
        const uploadDir = path.join(__dirname, '../../public/uploads/certificates');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Template is 4000x3091
        const W = 4000;
        const H = 3091;

        const qrSize = 280;
        const qrBuffer = await QRCode.toBuffer(verificationUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: qrSize,
            color: { dark: '#000000', light: '#ffffff' }
        });

        const safeName = (recipientName || 'Unknown Recipient').trim().toUpperCase();

        // ✅ Name SVG — 4000px wide, name at 42% down = 1298px
        const nameSvgBuffer = Buffer.from(
            `<svg width="4000" height="300" viewBox="0 0 4000 300" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="2000"
                    y="230"
                    text-anchor="middle"
                    font-family="DejaVu Serif, Liberation Serif, Georgia, serif"
                    font-size="200"
                    font-weight="bold"
                    fill="#1a1a1a"
                    letter-spacing="6"
                >${safeName}</text>
            </svg>`
        );

        // ✅ Course SVG — 4000px wide
        const courseSvgBuffer = Buffer.from(
            `<svg width="4000" height="160" viewBox="0 0 4000 160" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="2000"
                    y="110"
                    text-anchor="middle"
                    font-family="DejaVu Serif, Liberation Serif, Georgia, serif"
                    font-size="80"
                    font-weight="bold"
                    fill="#555555"
                    letter-spacing="3"
                >${courseTitle}</text>
            </svg>`
        );

        // ✅ Exact pixel positions for 4000x3091 template
        // Name: 42% down = 1298px, minus SVG height offset
        const nameTop   = 1068;   // text baseline lands at ~1298px (42% of 3091)
        const courseTop = 1360;   // course title just below name
        const qrTop     = 2500;   // bottom left area
        const qrLeft    = 120;

        console.log(`[Certificate] Compositing: name@${nameTop}, course@${courseTop}, qr@(${qrLeft},${qrTop})`);

        const fileName = `${certificateNumber}.png`;
        const outputPath = path.join(uploadDir, fileName);

        await sharp(templatePath)
            .composite([
                { input: nameSvgBuffer,   top: nameTop,   left: 0 },
                { input: courseSvgBuffer, top: courseTop, left: 0 },
                { input: qrBuffer,        top: qrTop,     left: qrLeft },
            ])
            .png({ quality: 100 })
            .toFile(outputPath);

        const imageUrl = `/uploads/certificates/${fileName}`;
        await db.insert(certificates).values({
            userId,
            courseId,
            certCode: certificateNumber,
            imageUrl,
        });

        console.log(`[Certificate] ✅ Done — "${safeName}" → ${imageUrl}`);
        return { imageUrl, certificateNumber };

    } catch (error: any) {
        console.error('[Sharp] Generation Error:', error);
        throw new Error(`Failed to generate image: ${error.message}`);
    }
}

export const generateCertificateLogic = async (userId: string, courseId: string) => {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!user || !course) throw new Error('User or course not found');

    const recipientName =
        user.fullName?.trim() ||
        user.email?.split('@')[0]?.replace(/[._-]/g, ' ') ||
        'Security Professional';

    console.log(`[Certificate] Name resolved: "${recipientName}" (raw: "${user.fullName}")`);

    const [existing] = await db
        .select()
        .from(certificates)
        .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
        .limit(1);

    const certCode = existing?.certCode
        ?? `CERT-${userId.slice(0, 4)}-${courseId.slice(0, 4)}-${Date.now().toString().slice(-6)}`.toUpperCase();

    if (existing) {
        if (existing.imageUrl) {
            const oldFilePath = path.join(process.cwd(), 'public', existing.imageUrl);
            if (fs.existsSync(oldFilePath)) {
                try { fs.unlinkSync(oldFilePath); } catch (err) {
                    console.error('[Certificate] Failed to delete old file:', err);
                }
            }
        }
        await db.delete(certificates).where(eq(certificates.id, existing.id));
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationUrl = `${frontendUrl}/verify-certificate/${certCode}`;

    await generateCertificate({
        recipientName,
        courseTitle: course.title,
        date: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }),
        verificationUrl,
        certificateNumber: certCode,
        userId,
        courseId,
    });
};

export const getMyCertificates = async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const userCerts = await db
            .select({
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
    } catch (error) {
        console.error('Get certificates error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const verifyCertificate = async (req: AuthRequest, res: Response) => {
    const { code } = req.params;
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ message: 'Invalid certificate code' });
    }
    try {
        const [cert] = await db
            .select({
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
        if (!cert) return res.status(404).json({ message: 'Certificate not found' });
        res.json(cert);
    } catch (error) {
        console.error('Verify certificate error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllCertificates = async (req: AuthRequest, res: Response) => {
    try {
        const certs = await db
            .select({
                id: certificates.id,
                certCode: certificates.certCode,
                issuedAt: certificates.issuedAt,
                userName: users.fullName,
                courseTitle: courses.title,
            })
            .from(certificates)
            .innerJoin(users, eq(certificates.userId, users.id))
            .innerJoin(courses, eq(certificates.courseId, courses.id));
        res.json(certs);
    } catch (error) {
        console.error('Get all certificates error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const regenerateCertificate = async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { courseId } = req.body;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!courseId) return res.status(400).json({ message: 'Course ID required' });
    try {
        const [existing] = await db.select()
            .from(certificates)
            .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
            .limit(1);
        if (existing?.imageUrl) {
            const oldPath = path.join(process.cwd(), 'public', existing.imageUrl);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) {
                    console.warn('[Certificate] Could not delete old file:', e);
                }
            }
            await db.delete(certificates).where(eq(certificates.id, existing.id));
        }
        await generateCertificateLogic(userId, courseId);
        const [newCert] = await db.select({
            id: certificates.id,
            certCode: certificates.certCode,
            issuedAt: certificates.issuedAt,
            imageUrl: certificates.imageUrl,
            courseTitle: courses.title,
        })
        .from(certificates)
        .innerJoin(courses, eq(certificates.courseId, courses.id))
        .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
        .limit(1);
        return res.json({ message: 'Certificate regenerated!', certificate: newCert });
    } catch (error: any) {
        console.error('[Certificate] Regenerate error:', error);
        return res.status(500).json({ message: error?.message || 'Regeneration failed' });
    }
};