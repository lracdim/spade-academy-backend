import { db } from '../db/index.js';
import { quizAttempts, quizzes, modules, courses, users } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

export const getMyQuizAttempts = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const attempts = await db.select({
            id: quizAttempts.id,
            quizId: quizAttempts.quizId,
            score: quizAttempts.score,
            passed: quizAttempts.passed,
            attemptedAt: quizAttempts.attemptedAt,
            moduleTitle: modules.title,
            courseTitle: courses.title,
        })
            .from(quizAttempts)
            .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
            .innerJoin(modules, eq(quizzes.moduleId, modules.id))
            .innerJoin(courses, eq(modules.courseId, courses.id))
            .where(eq(quizAttempts.userId, userId))
            .orderBy(desc(quizAttempts.attemptedAt));

        res.json(attempts);
    } catch (error) {
        console.error('Failed to fetch quiz attempts:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
