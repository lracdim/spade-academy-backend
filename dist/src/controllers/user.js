import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { hashPassword } from '../utils/auth.js';
export const getUsers = async (req, res) => {
    try {
        const role = req.query.role;
        let query = db.select({
            id: users.id,
            employeeId: users.employeeId,
            fullName: users.fullName,
            email: users.email,
            password: users.password,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
        }).from(users);
        if (role) {
            // @ts-ignore - drizzle enum type check
            query = query.where(eq(users.role, role));
        }
        const allUsers = await query;
        res.json(allUsers);
    }
    catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const createUser = async (req, res) => {
    // Basic implementation for now, can be expanded
    const { fullName, email, password, role, employeeId } = req.body;
    if (!fullName || !role || !employeeId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    try {
        // Check if user with same employeeId exists
        const [existing] = await db.select().from(users).where(eq(users.employeeId, employeeId));
        if (existing) {
            return res.status(400).json({ message: 'User with this Employee ID already exists' });
        }
        const hashedPassword = await hashPassword(password || 'defaultPassword123');
        const [newUser] = await db.insert(users).values({
            fullName,
            email: email || null,
            password: hashedPassword,
            role,
            employeeId,
        }).returning();
        res.status(201).json(newUser);
    }
    catch (error) {
        console.error('Create user error:', error);
        if (error.code === '23505') { // Postgres unique violation code
            return res.status(400).json({ message: 'User with these details (Email or ID) already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { fullName, email, password, role, employeeId } = req.body;
    try {
        const updateData = {};
        if (fullName)
            updateData.fullName = fullName;
        if (email)
            updateData.email = email;
        if (role)
            updateData.role = role;
        if (employeeId)
            updateData.employeeId = employeeId;
        if (password && password.trim() !== '') {
            updateData.password = await hashPassword(password);
        }
        const [updatedUser] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, id))
            .returning();
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(updatedUser);
    }
    catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        const [deletedUser] = await db.delete(users)
            .where(eq(users.id, id))
            .returning();
        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
//# sourceMappingURL=user.js.map