import type { Request as ExpressRequest, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

export interface AuthRequest extends ExpressRequest {
    user?: {
        id: string;
        role: string;
    };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1] as string;
    try {
        const decoded = jwt.verify(token, JWT_SECRET as string) as unknown as { id: string, role: string };
        req.user = decoded;
        next();
    } catch (error) {
        console.error('JWT verify error:', error);
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export const roleMiddleware = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
};
