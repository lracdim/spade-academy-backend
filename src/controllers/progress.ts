import { db } from '../db/index.js';
import { userModuleProgress, modules, courses, quizzes, quizAttempts, certificates } from '../db/schema.js';
import { eq, and, count, inArray, isNotNull, ne } from 'drizzle-orm';
import { generateCertificateLogic } from './certificate.js';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

export const updateVideoProgress = async (req: AuthRequest, res: Response) => {
    const { moduleId } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!moduleId) return res.status(400).json({ message: 'Module ID is required' });

    try {
        const [existing] = await db.select()
            .from(userModuleProgress)
            .where(and(eq(userModuleProgress.userId, userId), eq(userModuleProgress.moduleId, moduleId)));

        if (existing) {
            await db.update(userModuleProgress)
                .set({ videoWatched: true, updatedAt: new Date() })
                .where(eq(userModuleProgress.id, existing.id));
        } else {
            await db.insert(userModuleProgress).values({
                userId,
                moduleId,
                videoWatched: true,
            });
        }

        // After updating progress, check if the course is now complete
        const [module] = await db.select({ courseId: modules.courseId }).from(modules).where(eq(modules.id, moduleId)).limit(1);
        if (module) {
            await checkAndGenerateCertificate(userId, module.courseId);
        }

        res.json({ message: 'Progress updated' });
    } catch (error) {
        console.error('Update video progress error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const checkAndGenerateCertificate = async (userId: string, courseId: string) => {
    try {
        // 1. Get ALL modules for the course
        const courseModules = await db.select({ id: modules.id })
            .from(modules)
            .where(and(eq(modules.courseId, courseId), isNotNull(modules.video), ne(modules.video, '')));

        const moduleCount = courseModules.length;
        if (moduleCount === 0) return;

        // 2. Check how many modules have videos watched
        const moduleIds = courseModules.map(m => m.id);
        const [watchedCountResult] = await db.select({ count: count() })
            .from(userModuleProgress)
            .where(and(
                eq(userModuleProgress.userId, userId),
                eq(userModuleProgress.videoWatched, true),
                inArray(userModuleProgress.moduleId, moduleIds)
            ));

        const watchedInThisCourse = Number(watchedCountResult?.count || 0);

        const courseQuizzes = await db.select({ id: quizzes.id, moduleId: quizzes.moduleId })
            .from(quizzes)
            .where(inArray(quizzes.moduleId, moduleIds));

        const quizIds = courseQuizzes.map(q => q.id);
        const quizCount = quizIds.length;

        let passedInThisCourse = 0;
        if (quizCount > 0) {
            const passedQuizzesResult = await db.select({ quizId: quizAttempts.quizId })
                .from(quizAttempts)
                .where(and(
                    eq(quizAttempts.userId, userId),
                    eq(quizAttempts.passed, true),
                    inArray(quizAttempts.quizId, quizIds)
                ));
            passedInThisCourse = new Set(passedQuizzesResult.map(q => q.quizId)).size;
        }

        console.log(`[CertDebug] User: ${userId}, Course: ${courseId}`);
        console.log(`[CertDebug] Modules: ${moduleCount}, Watched: ${watchedInThisCourse}`);
        console.log(`[CertDebug] Quizzes: ${quizCount}, Passed: ${passedInThisCourse}`);

        // 4. Compare
        if (watchedInThisCourse < moduleCount) {
            throw new Error(`Requirements not met: Only ${watchedInThisCourse}/${moduleCount} videos watched.`);
        }

        if (passedInThisCourse < quizCount) {
            throw new Error(`Requirements not met: Only ${passedInThisCourse}/${quizCount} quizzes passed.`);
        }

        // Requirements MET. Check if certificate already exists
        const [existingCert] = await db.select()
            .from(certificates)
            .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)));

        if (!existingCert) {
            console.log(`[CertDebug] Generating new certificate...`);
            await generateCertificateLogic(userId, courseId);
        } else {
            console.log(`[CertDebug] Certificate already exists.`);
        }
    } catch (error: any) {
        console.error('Error in checkAndGenerateCertificate:', error);
        throw error;
    }
};

export const manualGenerateCertificate = async (req: AuthRequest, res: Response) => {
    const { courseId } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!courseId) return res.status(400).json({ message: 'Course ID is required' });

    try {
        console.log(`[Certificate] Manual generation requested by user ${userId} for course ${courseId}`);
        await checkAndGenerateCertificate(userId, courseId);

        const [cert] = await db.select().from(certificates)
            .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)))
            .limit(1);

        if (!cert) {
            return res.status(404).json({ message: 'Certificate was not found after generation. Please refresh.' });
        }

        return res.json({ message: 'Certificate ready!', certificate: cert });
    } catch (error: any) {
        console.error('Manual certificate generation error:', error);
        if (error.message.startsWith('Requirements not met:')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error?.message || 'Internal server error' });
    }
};
