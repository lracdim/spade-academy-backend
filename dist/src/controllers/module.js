import { db } from '../db/index.js';
import { modules, lessons, quizzes, questions, quizAttempts, users, notifications } from '../db/schema.js';
import { deleteFileFromUrl } from '../utils/file.js';
import { eq, count, sql } from 'drizzle-orm';
import { checkAndGenerateCertificate } from './progress.js';
export const getModulesByCourse = async (req, res) => {
    const courseId = req.params.courseId;
    if (!courseId) {
        return res.status(400).json({ message: 'Course ID is required' });
    }
    try {
        const courseModules = await db.select({
            id: modules.id,
            courseId: modules.courseId,
            title: modules.title,
            description: modules.description,
            video: modules.video,
            order: modules.order,
            lessonCount: sql `(SELECT COUNT(*) FROM ${lessons} WHERE ${lessons.moduleId} = ${modules.id})`.mapWith(Number),
        })
            .from(modules)
            .where(eq(modules.courseId, courseId))
            .orderBy(modules.order);
        res.json(courseModules);
    }
    catch (error) {
        console.error('Fetch modules error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const createModule = async (req, res) => {
    const courseId = req.params.courseId;
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
            const [maxOrderResult] = await tx.select({ maxOrder: sql `MAX(${modules.order})` })
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
                    const questionsToInsert = quizQuestions.map((q) => ({
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
    }
    catch (error) {
        console.error('Create module error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const updateModule = async (req, res) => {
    const { id } = req.params;
    const { title, description, video } = req.body;
    try {
        const updateData = {};
        if (title !== undefined)
            updateData.title = title;
        if (description !== undefined)
            updateData.description = description;
        if (video !== undefined)
            updateData.video = video;
        const moduleId = id;
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
    }
    catch (error) {
        console.error('Update module error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const deleteModule = async (req, res) => {
    const { id } = req.params;
    try {
        const moduleId = id;
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
    }
    catch (error) {
        console.error('Delete module error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const getModuleQuiz = async (req, res) => {
    const moduleId = req.params.id;
    try {
        const [quiz] = await db.select().from(quizzes).where(eq(quizzes.moduleId, moduleId));
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found for this module.' });
        }
        const quizQuestions = await db.select().from(questions).where(eq(questions.quizId, quiz.id));
        res.json({ ...quiz, questions: quizQuestions });
    }
    catch (error) {
        console.error('Fetch quiz error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const submitModuleQuiz = async (req, res) => {
    const moduleId = req.params.id;
    const userId = req.user?.id;
    const { score, passed, answers } = req.body;
    if (!userId)
        return res.status(401).json({ message: 'Unauthorized' });
    try {
        const [quiz] = await db.select().from(quizzes).where(eq(quizzes.moduleId, moduleId));
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found for this module.' });
        }
        const [attempt] = await db.insert(quizAttempts).values({
            quizId: quiz.id,
            userId,
            score,
            passed,
            answers: answers || {},
        }).returning();
        if (passed) {
            // Check if user is a GUARD
            const [user] = await db.select({ fullName: users.fullName, role: users.role }).from(users).where(eq(users.id, userId));
            if (user && user.role === 'GUARD') {
                const [module] = await db.select({ title: modules.title }).from(modules).where(eq(modules.id, moduleId));
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
            }
            // TRIGGER CERTIFICATE CHECK
            const [mod] = await db.select({ courseId: modules.courseId }).from(modules).where(eq(modules.id, moduleId)).limit(1);
            if (mod) {
                await checkAndGenerateCertificate(userId, mod.courseId);
            }
        }
        res.json(attempt);
    }
    catch (error) {
        console.error('Submit quiz error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const updateModuleQuiz = async (req, res) => {
    const moduleId = req.params.id;
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
            await tx.delete(questions).where(eq(questions.quizId, quiz.id));
            // Insert new questions if provided
            if (quizQuestions && Array.isArray(quizQuestions) && quizQuestions.length > 0) {
                const questionsToInsert = quizQuestions.map((q) => ({
                    quizId: quiz.id,
                    text: q.text,
                    type: q.type || 'MULTIPLE_CHOICE',
                    options: q.options,
                    answerText: q.answerText || null,
                }));
                await tx.insert(questions).values(questionsToInsert);
            }
        });
        res.json({ message: 'Quiz updated successfully' });
    }
    catch (error) {
        console.error('Update quiz error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
//# sourceMappingURL=module.js.map