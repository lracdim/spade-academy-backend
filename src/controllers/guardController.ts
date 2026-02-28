import { Request, Response } from "express";
import { db } from "../db/index.js";
import { securityGuards, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';

export const getGuards = async (req: Request, res: Response) => {
    try {
        const guards = await db.query.users.findMany({
            where: eq(users.role, 'guard')
        });
        res.json(guards);
    } catch (error) {
        res.status(500).json({ error: "Error fetching guards" });
    }
};

export const getGuardProfile = async (req: Request, res: Response) => {
    try {
        const guard = await db.query.securityGuards.findFirst({
            where: eq(securityGuards.userId, req.params.userId as string),
            with: {
                // Assuming relations are set up in schema
            }
        });
        if (!guard) return res.status(404).json({ error: "Profile not found" });
        res.json(guard);
    } catch (error) {
        res.status(500).json({ error: "Error fetching profile" });
    }
};

export const updateGuardProfile = async (req: any, res: Response) => {
    const userId = req.params.userId;
    try {
        const existing = await db.query.securityGuards.findFirst({
            where: eq(securityGuards.userId, userId)
        });

        if (existing) {
            await db.update(securityGuards).set(req.body).where(eq(securityGuards.id, existing.id));
        } else {
            await db.insert(securityGuards).values({
                id: uuidv4(),
                userId,
                ...req.body
            });
        }
        res.json({ message: "Profile updated" });
    } catch (error) {
        res.status(500).json({ error: "Error updating profile" });
    }
};
