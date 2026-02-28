import { Request, Response } from "express";
import { db } from "../db/index.js";
import { quizzes, quizOptions } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const getLessonQuizzes = async (req: Request, res: Response) => {
    try {
        const lessonsQuizzes = await db.query.quizzes.findMany({
            where: eq(quizzes.lessonId, req.params.lessonId as string),
            orderBy: (quizzes, { asc }) => [asc(quizzes.orderIndex)]
        });

        // Fetch options for each quiz
        const quizzesWithOptions = await Promise.all(lessonsQuizzes.map(async (q) => {
            const options = await db.query.quizOptions.findMany({
                where: eq(quizOptions.quizId, q.id),
                orderBy: (quizOptions, { asc }) => [asc(quizOptions.orderIndex)]
            });
            return {
                ...q,
                options
            };
        }));

        res.json(quizzesWithOptions);
    } catch (error) {
        res.status(500).json({ error: "Error fetching quizzes" });
    }
};
