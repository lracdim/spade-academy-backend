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

        // ✅ STEP 1: Read actual template dimensions FIRST
        const templateMeta = await sharp(templatePath).metadata();
        const W = templateMeta.width!;
        const H = templateMeta.height!;
        console.log(`[Certificate] Template dimensions: ${W}x${H}`);

        // ✅ STEP 2: QR Code — sized relative to template
        const qrSize = Math.round(W * 0.07); // ~7% of width
        const qrBuffer = await QRCode.toBuffer(verificationUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: qrSize,
            color: { dark: '#000000', light: '#ffffff' }
        });

        const safeName = (recipientName || 'Unknown Recipient').trim().toUpperCase();

        // ✅ STEP 3: Name SVG — MUST match template width exactly
        // Font size ~6% of template width gives a large readable name
        const nameFontSize = Math.round(W * 0.06);
        const nameBoxH = Math.round(H * 0.10);
        const nameY = Math.round(nameBoxH * 0.75); // baseline ~75% down the box

        const nameSvgBuffer = Buffer.from(
            `<svg width="${W}" height="${nameBoxH}" viewBox="0 0 ${W} ${nameBoxH}" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="${W / 2}"
                    y="${nameY}"
                    text-anchor="middle"
                    font-family="DejaVu Serif, Georgia, Times New Roman, serif"
                    font-size="${nameFontSize}"
                    font-weight="bold"
                    fill="#1a1a1a"
                    letter-spacing="6"
                >${safeName}</text>
            </svg>`
        );

        // ✅ STEP 4: Course title SVG — MUST match template width exactly
        const courseFontSize = Math.round(W * 0.022);
        const courseBoxH = Math.round(H * 0.06);
        const courseY = Math.round(courseBoxH * 0.72);

        const courseSvgBuffer = Buffer.from(
            `<svg width="${W}" height="${courseBoxH}" viewBox="0 0 ${W} ${courseBoxH}" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="${W / 2}"
                    y="${courseY}"
                    text-anchor="middle"
                    font-family="DejaVu Serif, Georgia, Times New Roman, serif"
                    font-size="${courseFontSize}"
                    font-weight="bold"
                    fill="#555555"
                    letter-spacing="3"
                >${courseTitle}</text>
            </svg>`
        );

        // ✅ STEP 5: Calculate composite positions as % of template size
        // These match where the name/course/QR areas are on your certificate template
        const nameTop   = Math.round(H * 0.455);  // ~45.5% down — where the name line is
        const courseTop = Math.round(H * 0.555);  // ~55.5% down — below name
        const qrTop     = Math.round(H * 0.800);  // ~80% down — bottom left
        const qrLeft    = Math.round(W * 0.038);  // ~3.8% from left

        console.log(`[Certificate] Positions — name:${nameTop}, course:${courseTop}, qr:(${qrLeft},${qrTop})`);
        console.log(`[Certificate] Font sizes — name:${nameFontSize}px, course:${courseFontSize}px`);

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

    // ✅ Robust name fallback — handles null fullName
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
        console.log(`[Certificate] Regenerating for user ${userId}`);
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

    // ✅ QR points to FRONTEND verify page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationUrl = `${frontendUrl}/verify-certificate/${certCode}`;
    console.log(`[Certificate] QR URL: ${verificationUrl}`);

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
