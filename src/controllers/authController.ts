import { Request, Response } from "express";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateToken } from "../middleware/auth.js";

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Handle both hashed and plain text passwords (legacy support)
        let isValid = false;
        if (user.password?.startsWith("$2")) {
            isValid = await bcrypt.compare(password, user.password);
        } else {
            isValid = user.password === password;
        }

        if (!isValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = generateToken(user.id);
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            user: userWithoutPassword,
            token,
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getMe = async (req: any, res: Response) => {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user.id),
        });

        if (!user) return res.status(404).json({ error: "User not found" });

        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};
