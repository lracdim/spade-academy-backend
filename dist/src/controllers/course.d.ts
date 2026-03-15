import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare const getCourses: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createCourse: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateCourse: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteCourse: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=course.d.ts.map