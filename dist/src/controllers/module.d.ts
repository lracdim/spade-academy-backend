import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare const getModulesByCourse: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createModule: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateModule: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteModule: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getModuleQuiz: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const submitModuleQuiz: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateModuleQuiz: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=module.d.ts.map