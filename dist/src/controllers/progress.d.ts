import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare const updateVideoProgress: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const checkAndGenerateCertificate: (userId: string, courseId: string) => Promise<void>;
export declare const manualGenerateCertificate: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=progress.d.ts.map