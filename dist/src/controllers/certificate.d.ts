import type { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
/**
 * Core Certificate Generation Function
 * Implements strict layout requirements for 4000x3091 template
 */
export declare function generateCertificate({ recipientName, courseTitle, date, verificationUrl, certificateNumber, userId, courseId }: {
    recipientName: string;
    courseTitle: string;
    date: string;
    verificationUrl: string;
    certificateNumber: string;
    userId: string;
    courseId: string;
}): Promise<{
    imageUrl: string;
    certificateNumber: string;
}>;
/**
 * Wrapper for the progress tracking system
 */
export declare const generateCertificateLogic: (userId: string, courseId: string) => Promise<void>;
export declare const getMyCertificates: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const verifyCertificate: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=certificate.d.ts.map