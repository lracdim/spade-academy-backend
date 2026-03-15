import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare const getNotifications: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const markAsRead: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=notification.d.ts.map