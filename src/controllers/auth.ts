import type { Request, Response } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { comparePassword, generateAccessToken, generateRefreshToken, hashPassword } from '../utils/auth.js';

export const login = async (req: Request, res: Response) => {
    // The field is still called employeeId so older clients keep working, but it
    // may hold either a badge number or an email address.
    const { employeeId, password } = req.body ?? {};
    const identifier = typeof employeeId === 'string' ? employeeId.trim() : '';

    if (!identifier || typeof password !== 'string' || !password) {
        return res.status(401).json({ message: 'Invalid employee ID or password' });
    }

    try {
        let user;
        if (identifier.includes('@')) {
            // Emails are stored lowercase and are unique, so compare case-insensitively.
            [user] = await db.select().from(users)
                .where(sql`lower(${users.email}) = ${identifier.toLowerCase()}`)
                .limit(1);
        } else {
            [user] = await db.select().from(users).where(eq(users.employeeId, identifier)).limit(1);
            if (!user) {
                // Guards type badge numbers by hand: allow spd_431 for SPD_431.
                [user] = await db.select().from(users)
                    .where(sql`upper(${users.employeeId}) = ${identifier.toUpperCase()}`)
                    .limit(1);
            }
        }

        if (!user) {
            return res.status(401).json({ message: 'Invalid employee ID or password' });
        }

        const isMatch = await comparePassword(password, user.password);

        // Fallback for dev environment accounts created with plaintext passwords
        if (!isMatch && password !== user.password) {
            return res.status(401).json({ message: 'Invalid employee ID or password' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is deactivated' });
        }

        const payload = { id: user.id, role: user.role };
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);

        res.json({
            user: {
                id: user.id,
                employeeId: user.employeeId,
                fullName: user.fullName,
                role: user.role,
            },
            accessToken,
            refreshToken,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getMe = async (req: any, res: Response) => {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            id: user.id,
            employeeId: user.employeeId,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

const MIN_PASSWORD_LENGTH = 8;

/**
 * Lets a signed-in user replace their own password. The current password is
 * required, so a stolen token or an unlocked phone alone cannot take an account over.
 */
export const changePassword = async (req: any, res: Response) => {
    const { currentPassword, newPassword } = req.body ?? {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (newPassword === currentPassword) {
        return res.status(400).json({ message: 'New password must be different from the current one' });
    }

    try {
        const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Same acceptance rule as login, so accounts created with a plaintext
        // password can still move to a hashed one.
        const matches = (await comparePassword(currentPassword, user.password)) || currentPassword === user.password;
        if (!matches) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        await db.update(users)
            .set({ password: await hashPassword(newPassword) })
            .where(eq(users.id, user.id));

        res.json({ message: 'Password updated' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
