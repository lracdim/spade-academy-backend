import { db } from '../db/index.js';
import { quizAttempts, quizzes, modules, courses, users, questions } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
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

export const getQuizAttemptDetails = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { attemptId } = req.params;
        if (!attemptId || typeof attemptId !== 'string') {
            return res.status(400).json({ message: 'Attempt ID is required' });
        }

        const [attemptDetails] = await db
            .select({
                attempt: {
                    id: quizAttempts.id,
                    quizId: quizAttempts.quizId,
                    score: quizAttempts.score,
                    passed: quizAttempts.passed,
                    answers: quizAttempts.answers,
                    attemptedAt: quizAttempts.attemptedAt,
                },
                quiz: {
                    id: quizzes.id,
                    moduleId: quizzes.moduleId,
                    passMark: quizzes.passMark,
                },
                module: {
                    title: modules.title,
                    description: modules.description,
                },
                course: {
                    title: courses.title,
                }
            })
            .from(quizAttempts)
            .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
            .innerJoin(modules, eq(quizzes.moduleId, modules.id))
            .innerJoin(courses, eq(modules.courseId, courses.id))
            .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, userId)))
            .limit(1);

        if (!attemptDetails) {
            return res.status(404).json({ message: 'Quiz attempt not found or unauthorized' });
        }

        const quizQuestions = await db
            .select({
                id: questions.id,
                text: questions.text,
                type: questions.type,
                options: questions.options,
                answerText: questions.answerText,
            })
            .from(questions)
            .where(eq(questions.quizId, attemptDetails.quiz.id));

        res.json({
            ...attemptDetails,
            questions: quizQuestions,
        });

    } catch (error) {
        console.error('Failed to fetch quiz attempt details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
