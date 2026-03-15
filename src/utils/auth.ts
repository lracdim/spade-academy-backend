import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../config.js';

export const generateAccessToken = (user: { id: string, role: string }) => {
    return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
};

export const generateRefreshToken = (user: { id: string, role: string }) => {
    return jwt.sign(user, JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

export const hashPassword = async (password: string) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string) => {
    return await bcrypt.compare(password, hash);
};
