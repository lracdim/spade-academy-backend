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

export async function generateCertificate({ recipientName, courseTitle, date, verificationUrl, certificateNumber, userId, courseId }: CertParams) {
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

        // 2. Name SVG — uses DejaVu Serif (available on Linux/Railway)
        const upperName = recipientName.toUpperCase();
        const nameSvgBuffer = Buffer.from(`
            <svg width="4000" height="280" viewBox="0 0 4000 280" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="2000"
                    y="220"
                    text-anchor="middle"
                    font-family="DejaVu Serif, Georgia, Times New Roman, serif"
                    font-size="180"
                    font-weight="bold"
                    fill="#1a1a1a"
                    letter-spacing="8"
                >${upperName}</text>
            </svg>
        `);

        // 3. Course SVG
        const courseSvgBuffer = Buffer.from(`
            <svg width="4000" height="140" viewBox="0 0 4000 140" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="2000"
                    y="100"
                    text-anchor="middle"
                    font-family="DejaVu Serif, Georgia, Times New Roman, serif"
                    font-size="68"
                    font-weight="bold"
                    fill="#444444"
                    letter-spacing="4"
                >${courseTitle}</text>
            </svg>
        `);

        // 4. Define paths
        const templatePath = path.join(__dirname, '../../public/templates/certificate.png');
        const uploadDir = path.join(__dirname, '../../public/uploads/certificates');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileName = `${certificateNumber}.png`;
        const outputPath = path.join(uploadDir, fileName);

        // 5. Sharp Composition
        await sharp(templatePath)
            .composite([
                { input: nameSvgBuffer,   top: 1250, left: 0,   blend: 'over' },
                { input: courseSvgBuffer, top: 1490, left: 0,   blend: 'over' },
                { input: qrBuffer,        top: 2680, left: 120 },
            ])
            .png({ quality: 100 })
            .toFile(outputPath);

        // 6. Save to database
        const imageUrl = `/uploads/certificates/${fileName}`;
        await db.insert(certificates).values({
            userId,
            courseId,
            certCode: certificateNumber,
            imageUrl,
        });

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

    // ✅ Fixed URL — points to correct API route
    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const verificationUrl = `${appUrl}/api/certificates/verify/${certCode}`;

    await generateCertificate({
        recipientName: user.fullName,
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