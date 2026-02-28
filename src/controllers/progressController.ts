import { Request, Response } from "express";
import { db } from "../db/index.js";
import { userProgress, quizzes, quizResults, quizScores } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';

export const getProgress = async (req: any, res: Response) => {
    try {
        const progress = await db.query.userProgress.findMany({
            where: eq(userProgress.userId, req.user.id)
        });
        res.json(progress);
    } catch (error) {
        res.status(500).json({ error: "Error fetching progress" });
    }
};

export const updateProgress = async (req: any, res: Response) => {
    const { lessonId, completed, watchTime } = req.body;
    const userId = req.user.id;

    try {
        const existing = await db.query.userProgress.findFirst({
            where: and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId))
        });

        if (existing) {
            await db.update(userProgress)
                .set({
                    completed: completed ?? existing.completed,
                    watchTime: watchTime ?? existing.watchTime,
                    completedAt: completed ? new Date() : existing.completedAt
                })
                .where(eq(userProgress.id, existing.id));
            res.json({ message: "Progress updated" });
        } else {
            await db.insert(userProgress).values({
                id: uuidv4(),
                userId,
                lessonId,
                completed: completed || false,
                watchTime: watchTime || "0",
                completedAt: completed ? new Date() : null
            });
            res.json({ message: "Progress created" });
        }
    } catch (error) {
        res.status(500).json({ error: "Error updating progress" });
    }
};

export const submitQuiz = async (req: any, res: Response) => {
    const { lessonId, answers } = req.body;
    const userId = req.user.id;

    try {
        const lessonQuizzes = await db.query.quizzes.findMany({
            where: eq(quizzes.lessonId, lessonId)
        });

        let correctCount = 0;
        const results = [];

        for (const ans of answers) {
            const q = lessonQuizzes.find(xq => xq.id === ans.quizId);
            const isCorrect = q && q.correctAnswer?.trim().toLowerCase() === ans.answer?.trim().toLowerCase();
            if (isCorrect) correctCount++;

            results.push({
                id: uuidv4(),
                userId,
                quizId: ans.quizId,
                userAnswer: ans.answer,
                isCorrect: !!isCorrect
            });
        }

        if (results.length > 0) {
            await db.insert(quizResults).values(results);
        }

        const score = Math.round((correctCount / (answers.length || 1)) * 100);
        const passed = score >= 80;

        await db.insert(quizScores).values({
            id: uuidv4(),
            userId,
            lessonId,
            score,
            totalQuestions: answers.length,
            correctAnswers: correctCount,
            passed
        });

        res.json({ passed, score, correctCount, total: answers.length });
    } catch (error) {
        console.error("Quiz submission error:", error);
        res.status(500).json({ error: "Error submitting quiz" });
    }
};
