import { Request, Response } from "express";
import { db } from "../db/index.js";
import { todos, callieSignals } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';

export const getTodos = async (req: any, res: Response) => {
    try {
        const userTodos = await db.query.todos.findMany({
            where: eq(todos.userId, req.user.id),
            orderBy: (todos, { desc }) => [desc(todos.createdAt)]
        });
        res.json(userTodos);
    } catch (error) {
        res.status(500).json({ error: "Error fetching todos" });
    }
};

export const createTodo = async (req: any, res: Response) => {
    try {
        const newTodo = await db.insert(todos).values({
            id: uuidv4(),
            userId: req.user.id,
            task: req.body.task,
            completed: false
        }).returning();
        res.json(newTodo[0]);
    } catch (error) {
        res.status(500).json({ error: "Error creating todo" });
    }
};

export const getSignals = async (req: any, res: Response) => {
    try {
        const signals = await db.query.callieSignals.findMany({
            where: eq(callieSignals.userId, req.user.id),
            orderBy: (callieSignals, { desc }) => [desc(callieSignals.createdAt)]
        });
        res.json(signals);
    } catch (error) {
        res.status(500).json({ error: "Error fetching signals" });
    }
};
