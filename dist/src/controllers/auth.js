import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { comparePassword, generateAccessToken, generateRefreshToken } from '../utils/auth.js';
export const login = async (req, res) => {
    const { employeeId, password } = req.body;
    try {
        const [user] = await db.select().from(users).where(eq(users.employeeId, employeeId)).limit(1);
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const getMe = async (req, res) => {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        res.json({
            id: user.id,
            employeeId: user.employeeId,
            fullName: user.fullName,
            role: user.role,
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
//# sourceMappingURL=auth.js.map