import { db } from '../db/index.js';
import { modules, lessons, quizzes, questions, quizAttempts, users, notifications, userModuleProgress } from '../db/schema.js';
import { deleteFileFromUrl } from '../utils/file.js';
import { eq, count, sql, and, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { checkAndGenerateCertificate } from './progress.js';

export const getModulesByCourse = async (req: AuthRequest, res: Response) => {
    const courseId = req.params.courseId as string;

    if (!courseId) {
        return res.status(400).json({ message: 'Course ID is required' });
    }

    try {
        const userId = req.user?.id;
        console.log(`[Modules] Fetching for course: ${courseId}, User: ${userId}`);

        // Simple and robust query
        const courseModules = await db.select({
            id: modules.id,
            courseId: modules.courseId,
            title: modules.title,
            description: modules.description,
            video: modules.video,
            order: modules.order,
            // Check videoWatched via left join result
            videoWatched: sql<boolean>`COALESCE(${userModuleProgress.videoWatched}, false)`.mapWith(Boolean),
            // Check quizPassed via subquery (cleaner correlation)
            quizPassed: sql<boolean>`EXISTS (
                SELECT 1 FROM quiz_attempts qa
                JOIN quizzes q ON qa.quiz_id = q.id 
                WHERE q.module_id = ${modules.id} 
                AND qa.user_id = ${userId || sql`NULL`} 
                AND qa.passed = true
            )`.mapWith(Boolean),
            lessonCount: sql<number>`(SELECT COUNT(*) FROM lessons WHERE module_id = ${modules.id})`.mapWith(Number),
        })
            .from(modules)
            .leftJoin(userModuleProgress, and(
                eq(userModuleProgress.moduleId, modules.id),
                userId ? eq(userModuleProgress.userId, userId) : sql`false`
            ))
            .where(eq(modules.courseId, courseId))
            .orderBy(modules.order);

        console.log(`[Modules] Found ${courseModules.length} modules`);
        res.json(courseModules);
    } catch (error) {
        console.error('Fetch modules error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createModule = async (req: AuthRequest, res: Response) => {
    const courseId = req.params.courseId as string;
    const { title, description, video, questions: quizQuestions } = req.body;

    if (!courseId) {
        return res.status(400).json({ message: 'Course ID is required' });
    }

    if (!title) {
        return res.status(400).json({ message: 'Title is required' });
    }

    try {
        const newModule = await db.transaction(async (tx) => {
            // Get the current max order for this course's modules
            const [maxOrderResult] = await tx.select({ maxOrder: sql<number>`MAX(${modules.order})` })
                .from(modules)
                .where(eq(modules.courseId, courseId));
            const nextOrder = (maxOrderResult?.maxOrder || 0) + 1;

            const [createdModule] = await tx.insert(modules).values({
                courseId,
                title,
                description: description || null,
                video: video || null,
                order: nextOrder,
            }).returning();

            if (createdModule && quizQuestions && Array.isArray(quizQuestions) && quizQuestions.length > 0) {
                // Create a quiz for this module
                const [createdQuiz] = await tx.insert(quizzes).values({
                    moduleId: createdModule.id,
                    passMark: 70, // Default pass mark
                }).returning();

                // Insert questions
                if (createdQuiz) {
                    const questionsToInsert = quizQuestions.map((q: any) => ({
                        quizId: createdQuiz.id,
                        text: q.text,
                        type: q.type || 'MULTIPLE_CHOICE',
                        options: q.options, // Stored as JSONB
                        answerText: q.answerText || null,
                    }));

                    await tx.insert(questions).values(questionsToInsert);
                }
            }

            return createdModule;
        });

        // NOTIFY ALL GUARDS
        if (newModule) {
            const allGuards = await db.select({ id: users.id }).from(users).where(eq(users.role, 'GUARD'));
            if (allGuards.length > 0) {
                const notificationsToInsert = allGuards.map(guard => ({
                    userId: guard.id,
                    title: 'New Module Available',
                    message: `A new module "${newModule.title}" has been added.`,
                }));
                await db.insert(notifications).values(notificationsToInsert);
            }
        }

        res.status(201).json(newModule);
    } catch (error) {
        console.error('Create module error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateModule = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, video } = req.body;

    try {
        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (video !== undefined) updateData.video = video;

        const moduleId = id as string;

        // Fetch old module data to check for file replacement
        const [oldModule] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);

        const [updatedModule] = await db.update(modules)
            .set(updateData)
            .where(eq(modules.id, moduleId))
            .returning();

        if (!updatedModule) {
            return res.status(404).json({ message: 'Module not found' });
        }

        // Cleanup old video if replaced
        if (video && oldModule?.video && oldModule.video !== video) {
            deleteFileFromUrl(oldModule.video);
        }

        res.json(updatedModule);
    } catch (error) {
        console.error('Update module error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteModule = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
        const moduleId = id as string;

        // Fetch module first to get video
        const [moduleToDelete] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);

        if (!moduleToDelete) {
            return res.status(404).json({ message: 'Module not found' });
        }

        // Delete dependencies first: questions, quizzes, lessons
        const [moduleQuiz] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.moduleId, moduleId));

        if (moduleQuiz) {
            await db.delete(questions).where(eq(questions.quizId, moduleQuiz.id));
            await db.delete(quizzes).where(eq(quizzes.id, moduleQuiz.id));
        }

        await db.delete(lessons).where(eq(lessons.moduleId, moduleId));

        // Delete module
        await db.delete(modules).where(eq(modules.id, moduleId));

        // Delete the module video
        if (moduleToDelete.video) {
            deleteFileFromUrl(moduleToDelete.video);
        }

        res.json({ message: 'Module deleted successfully' });
    } catch (error) {
        console.error('Delete module error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getModuleQuiz = async (req: AuthRequest, res: Response) => {
    const moduleId = req.params.id as string;

    try {
        const [quiz] = await db.select().from(quizzes).where(eq(quizzes.moduleId, moduleId));
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found for this module.' });
        }

        const quizQuestions = await db.select().from(questions).where(eq(questions.quizId, quiz.id));

        res.json({ ...quiz, questions: quizQuestions });
    } catch (error) {
        console.error('Fetch quiz error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const submitModuleQuiz = async (req: AuthRequest, res: Response) => {
    const moduleId = req.params.id as string;
    const userId = req.user?.id;
    const { score, answers } = req.body; // Removed 'passed' from body to enforce server-side check

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const [quiz] = await db.select().from(quizzes).where(eq(quizzes.moduleId, moduleId));
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found for this module.' });
        }

        const passMark = 60; // HARDCODED REQUIREMENT
        const hasPassed = score >= passMark;

        // 1. Log this attempt
        const [attempt] = await db.insert(quizAttempts).values({
            quizId: quiz.id,
            userId,
            score,
            passed: hasPassed,
            answers: answers || {},
        }).returning();

        // 2. Logic for Failure & Re-take limit (5 Strikes)
        let wasReset = false;
        if (!hasPassed) {
            // Count total attempts for THIS quiz for THIS user
            const [totalAttemptsResult] = await db.select({ value: count() })
                .from(quizAttempts)
                .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quiz.id)));
            
            const attemptsCount = Number(totalAttemptsResult?.value || 0);
            console.log(`[Quiz] Guard ${userId} failed attempt #${attemptsCount} for quiz ${quiz.id}`);

            if (attemptsCount >= 5) {
                console.log(`[Quiz] 5 STRIKES REACHED. Wiping course progress for user ${userId}`);
                wasReset = true;
                
                // Find the course ID for this module
                const [mod] = await db.select({ courseId: modules.courseId }).from(modules).where(eq(modules.id, moduleId)).limit(1);
                
                if (mod) {
                    const courseId = mod.courseId;
                    // Get all modules for this course
                    const courseModules = await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId));
                    const modIds = courseModules.map(m => m.id);

                    if (modIds.length > 0) {
                        // A. Delete Progress
                        await db.delete(userModuleProgress).where(and(
                            eq(userModuleProgress.userId, userId),
                            inArray(userModuleProgress.moduleId, modIds)
                        ));

                        // B. Delete Quiz Attempts for the whole course
                        const courseQuizzes = await db.select({ id: quizzes.id }).from(quizzes).where(inArray(quizzes.moduleId, modIds));
                        const qIds = courseQuizzes.map(q => q.id);
                        if (qIds.length > 0) {
                            await db.delete(quizAttempts).where(and(
                                eq(quizAttempts.userId, userId),
                                inArray(quizAttempts.quizId, qIds)
                            ));
                        }
                    }

                    // Create a notification for the reset
                    await db.insert(notifications).values({
                        userId,
                        title: 'Training Reset',
                        message: 'You have exceeded the maximum of 5 attempts. Your progress for this course has been reset. Please start again from Module 1.',
                    });
                }
            }
        }

        if (hasPassed) {
            // 2.a MARK VIDEO AS WATCHED (Failsafe for Certificate/Progress)
            // If they passed the quiz, they are done with the module.
            await db.insert(userModuleProgress).values({
                userId,
                moduleId: moduleId,
                videoWatched: true,
                lastPosition: 0,
            }).onConflictDoUpdate({
                target: [userModuleProgress.userId, userModuleProgress.moduleId],
                set: { videoWatched: true }
            });

            // Check if user is a GUARD
            const [user] = await db.select({ fullName: users.fullName, role: users.role }).from(users).where(eq(users.id, userId));
            if (user && user.role === 'GUARD') {
                const [module] = await db.select({ title: modules.title, courseId: modules.courseId }).from(modules).where(eq(modules.id, moduleId));
                const moduleTitle = module?.title || 'a module';

                const allAdmins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'ADMIN'));
                if (allAdmins.length > 0) {
                    const notificationsToInsert = allAdmins.map(admin => ({
                        userId: admin.id,
                        title: 'Module Completed',
                        message: `Guard ${user.fullName} completely finished learning module "${moduleTitle}".`,
                    }));
                    await db.insert(notifications).values(notificationsToInsert);
                }

                // TRIGGER CERTIFICATE CHECK
                if (module?.courseId) {
                    console.log(`[Quiz] Triggering Cert Check for User ${userId}, Course ${module.courseId}`);
                    try {
                        await checkAndGenerateCertificate(userId, module.courseId);
                    } catch (e) {
                        console.error('[Quiz] Cert generation check deferred/failed:', e);
                    }
                }
            }
        }

        res.json({ ...attempt, wasReset });
    } catch (error) {
        console.error('Submit quiz error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateModuleQuiz = async (req: AuthRequest, res: Response) => {
    const moduleId = req.params.id as string;
    const { questions: quizQuestions } = req.body;

    try {
        await db.transaction(async (tx) => {
            // Check if quiz exists
            let [quiz] = await tx.select().from(quizzes).where(eq(quizzes.moduleId, moduleId));

            if (!quiz) {
                // Create a quiz if it doesn't exist
                const [createdQuiz] = await tx.insert(quizzes).values({
                    moduleId,
                    passMark: 70, // Default
                }).returning();
                quiz = createdQuiz;
            }

            // Delete existing questions for this quiz
            await tx.delete(questions).where(eq(questions.quizId, quiz!.id));

            // Insert new questions if provided
            if (quizQuestions && Array.isArray(quizQuestions) && quizQuestions.length > 0) {
                const questionsToInsert = quizQuestions.map((q: any) => ({
                    quizId: quiz!.id,
                    text: q.text,
                    type: q.type || 'MULTIPLE_CHOICE',
                    options: q.options,
                    answerText: q.answerText || null,
                }));

                await tx.insert(questions).values(questionsToInsert);
            }
        });

        res.json({ message: 'Quiz updated successfully' });
    } catch (error) {
        console.error('Update quiz error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
