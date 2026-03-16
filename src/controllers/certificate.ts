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
        const templatePath = path.join(process.cwd(), 'public/templates/certificate.png');
        const uploadDir = path.join(process.cwd(), 'public/uploads/certificates');
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const W = 4000;

        const qrBuffer = await QRCode.toBuffer(verificationUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 320,
            color: { dark: '#000000', light: '#ffffff' }
        });

        const safeName = (recipientName || 'Unknown Recipient').trim().toUpperCase();

        // ✅ Step 1: Create a name buffer that is the FULL WIDTH of the cert (4000px)
        // This makes centering "automatic" when we set left: 0
        const nameBuffer = await sharp({
            text: {
                text: `<span foreground="#1a1a1a"><b>${safeName}</b></span>`,
                font: 'Arial, DejaVu Sans, Liberation Sans, Helvetica, sans-serif',
                rgba: true,
                width: 4000,
                align: 'center',
                spacing: 10
            }
        }).png().toBuffer();

        // ✅ Step 2: Create a course buffer similarly
        const courseBuffer = await sharp({
            text: {
                text: `<span foreground="#333333"><b>${courseTitle.toUpperCase()}</b></span>`,
                font: 'Arial, DejaVu Sans, Liberation Sans, Helvetica, sans-serif',
                rgba: true,
                width: 4000,
                align: 'center'
            }
        }).png().toBuffer();

        // ✅ Step 3: Simple, fixed vertical positions
        const nameTop    = 1330; 
        const courseTop  = 1640; 
        const qrTop      = 2750; 
        const qrLeft     = 120;

        console.log(`[Certificate] Rendering text for: ${safeName}`);

        const fileName   = `${certificateNumber}.png`;
        const outputPath = path.join(uploadDir, fileName);

        // ✅ Step 4: Composite with left: 0 for perfect centering
        await sharp(templatePath)
            .composite([
                { input: nameBuffer,   top: nameTop,   left: 0 },
                { input: courseBuffer, top: courseTop, left: 0 },
                { input: qrBuffer,     top: qrTop,     left: qrLeft },
            ])
            .png({ quality: 100 })
            .toFile(outputPath);



        const imageUrl = `/uploads/certificates/${fileName}`;
        await db.insert(certificates).values({
            userId,
            courseId,
            certCode: certificateNumber,
            imageUrl,
        }).onConflictDoUpdate({
            target: [certificates.userId, certificates.courseId],
            set: { 
                imageUrl, 
                certCode: certificateNumber, 
                issuedAt: new Date() 
            }
        });


        console.log(`[Certificate] ✅ Success: ${imageUrl}`);
        return { imageUrl, certificateNumber };

    } catch (error: any) {
        console.error('[Sharp] Generation Error:', error);
        throw new Error(`Failed to generate: ${error.message}`);
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

    const [existing] = await db
        .select()
        .from(certificates)
        .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
        .limit(1);

    const certCode = existing?.certCode
        ?? `CERT-${userId.slice(0, 4)}-${courseId.slice(0, 4)}-${Date.now().toString().slice(-6)}`.toUpperCase();

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
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