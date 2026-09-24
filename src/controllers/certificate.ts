import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { db } from '../db/index.js';
import { certificates, users, courses } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { fileURLToPath } from 'url';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { layoutForTemplate } from '../utils/certificateLayout.js';
import { deleteObject, isStorageConfigured, putObject } from '../utils/storage.js';
import { randomInt } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.join(process.cwd(), 'public/fonts/Roboto-Bold.ttf');
let fontName = 'sans-serif';
if (fs.existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, 'Roboto');
    fontName = 'Roboto';
}

interface CertParams {
    recipientName: string;
    courseTitle: string;
    date: string;
    verificationUrl: string;
    certificateNumber: string;
    userId: string;
    courseId: string;
    certificateTemplate?: string | null;
}

export async function generateCertificate({
    recipientName,
    courseTitle,
    date,
    verificationUrl,
    certificateNumber,
    userId,
    courseId,
    certificateTemplate
}: CertParams) {
    try {
        const publicDir = path.join(process.cwd(), 'public');
        const templateRelativePath = certificateTemplate?.replace(/^https?:\/\/[^/]+/i, '');
        const templatePath = templateRelativePath
            ? path.join(publicDir, templateRelativePath)
            : path.join(publicDir, 'templates/certificate.png');
        if (!templatePath.startsWith(publicDir) || !fs.existsSync(templatePath)) {
            throw new Error('Certificate template was not found. Upload a PNG certificate template for this course.');
        }
        const uploadDir = path.join(process.cwd(), 'public/uploads/certificates');
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const W = 4000;
        const layout = layoutForTemplate(templatePath);

        const qrBuffer = await QRCode.toBuffer(verificationUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: layout.qr.size,
            color: { dark: '#000000', light: '#ffffff' }
        });

        // Text wider than the certificate's inner panel is shrunk to fit rather than clipped by the gold border.
        const MAX_CENTERED_WIDTH = 3000;

        const drawCentered = (text: string, fontSize: number, color: string) => {
            const height = Math.ceil(fontSize * 2);
            const canvas = createCanvas(W, height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.font = `bold ${fontSize}px ${fontName}`;
            const textWidth = ctx.measureText(text).width;
            if (textWidth > MAX_CENTERED_WIDTH) {
                ctx.font = `bold ${Math.floor(fontSize * MAX_CENTERED_WIDTH / textWidth)}px ${fontName}`;
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, W / 2, height / 2);
            return canvas.toBuffer('image/png');
        };

        const drawLeftAligned = (text: string, fontSize: number, color: string) => {
            const height = Math.ceil(fontSize * 2);
            const measure = createCanvas(10, 10).getContext('2d');
            measure.font = `bold ${fontSize}px ${fontName}`;
            const width = Math.ceil(measure.measureText(text).width) + fontSize;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.font = `bold ${fontSize}px ${fontName}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 0, height / 2);
            return canvas.toBuffer('image/png');
        };

        const safeName = (recipientName || 'Unknown Recipient').trim().toUpperCase();

        const overlays: sharp.OverlayOptions[] = [
            {
                input: drawCentered(safeName, layout.recipientName.fontSize, layout.recipientName.color),
                top: layout.recipientName.top,
                left: 0,
            },
            { input: qrBuffer, top: layout.qr.top, left: layout.qr.left },
        ];

        if (layout.courseTitle) {
            overlays.push({
                input: drawCentered(courseTitle.toUpperCase(), layout.courseTitle.fontSize, layout.courseTitle.color),
                top: layout.courseTitle.top,
                left: 0,
            });
        }

        if (layout.certNumber) {
            overlays.push({
                input: drawLeftAligned(certificateNumber, layout.certNumber.fontSize, layout.certNumber.color),
                top: layout.certNumber.top,
                left: layout.certNumber.left,
            });
        }

        console.log(`[Certificate] Finalizing image for: ${safeName}`);

        const fileName   = `${certificateNumber}.png`;
        const imagePath  = `/uploads/certificates/${fileName}`;

        const rendered = await sharp(templatePath)
            .composite(overlays)
            .png({ quality: 100 })
            .toBuffer();

        // The container's disk is wiped on every deploy, so certificates belong in
        // object storage whenever it is configured; disk is the local fallback.
        if (isStorageConfigured) {
            await putObject(imagePath, rendered, 'image/png');
        } else {
            fs.writeFileSync(path.join(uploadDir, fileName), rendered);
        }




        const imageUrl = imagePath;
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

const CERT_CODE_PREFIX = 'SPD';
const CERT_CODE_DIGITS = 9;

/** Builds a `SPD` + random-digit code, retrying until it does not collide with an issued one. */
async function generateCertCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
        let digits = '';
        for (let i = 0; i < CERT_CODE_DIGITS; i++) digits += randomInt(0, 10).toString();
        const code = `${CERT_CODE_PREFIX}${digits}`;

        const [taken] = await db
            .select({ id: certificates.id })
            .from(certificates)
            .where(eq(certificates.certCode, code))
            .limit(1);

        if (!taken) return code;
    }
    throw new Error('Could not allocate a unique certificate number');
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

    const oldImageUrl = existing?.imageUrl;
    const certCode = existing?.certCode ?? await generateCertCode();

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const verificationUrl = `${frontendUrl}/verify-certificate/${certCode}`;

    try {
        const result = await generateCertificate({
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
            certificateTemplate: course.certificateTemplate,
        });

        if (oldImageUrl && oldImageUrl !== result.imageUrl) {
            if (isStorageConfigured) {
                await deleteObject(oldImageUrl);
            }
            const oldFilePath = path.join(process.cwd(), 'public', oldImageUrl.replace(/^\/uploads\//, 'uploads/'));
            try {
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            } catch (cleanupError) {
                console.warn('[Certificate] Failed to cleanup old file:', cleanupError);
            }
        }

        return result;
    } catch (error: any) {
        console.error('[Certificate] Generation failed:', error);
        if (existing) {
            console.warn('[Certificate] Keeping existing certificate due to generation failure');
        }
        throw new Error(`Certificate generation failed: ${error.message}`);
    }
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
                imageUrl: certificates.imageUrl,
                userName: users.fullName,
                courseName: courses.title,
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
