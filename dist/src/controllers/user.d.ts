import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare const getUsers: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createUser: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateUser: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteUser: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=user.d.ts.map