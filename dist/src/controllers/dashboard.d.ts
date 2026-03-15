import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare const getDashboardStats: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getGuardDashboardStats: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=dashboard.d.ts.map