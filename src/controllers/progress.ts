import { db } from '../db/index.js';
import {
    userModuleProgress,
    modules,
    courses,
    quizzes,
    quizAttempts,
    certificates
} from '../db/schema.js';
import { eq, and, count, inArray, isNotNull, ne } from 'drizzle-orm';
import { generateCertificateLogic } from './certificate.js';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

// ─────────────────────────────────────────────
// POST /api/progress/video-watched
// ─────────────────────────────────────────────
export const updateVideoProgress = async (req: AuthRequest, res: Response) => {
    const { moduleId, lastPosition, duration, isCompleted } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!moduleId) return res.status(400).json({ message: 'Module ID is required' });

    try {
        const [existing] = await db.select()
            .from(userModuleProgress)
            .where(and(
                eq(userModuleProgress.userId, userId),
                eq(userModuleProgress.moduleId, moduleId)
            ));

        if (existing) {
            if (isCompleted === true) {
                // ✅ Always allow upgrading to completed
                await db.update(userModuleProgress)
                    .set({
                        videoWatched: true,
                        lastPosition: Math.floor(lastPosition || 0),
                        updatedAt: new Date()
                    })
                    .where(eq(userModuleProgress.id, existing.id));
            } else {
                // ✅ Heartbeat — only update position if not already fully watched
                if (!existing.videoWatched) {
                    await db.update(userModuleProgress)
                        .set({
                            lastPosition: Math.floor(lastPosition || 0),
                            updatedAt: new Date()
                        })
                        .where(eq(userModuleProgress.id, existing.id));
                }
            }
        } else {
            // ✅ First time — create fresh record
            await db.insert(userModuleProgress).values({
                userId,
                moduleId,
                videoWatched: isCompleted === true,
                lastPosition: Math.floor(lastPosition || 0),
            });
        }

        // ✅ Only trigger certificate check on explicit completion
        if (isCompleted === true) {
            const [module] = await db.select({ courseId: modules.courseId })
                .from(modules)
                .where(eq(modules.id, moduleId))
                .limit(1);

            if (module) {
                await checkAndGenerateCertificate(userId, module.courseId)
                    .catch(err => console.log('[CertCheck] Not ready yet:', err.message));
            }
        }

        return res.json({ message: 'Progress updated' });
    } catch (error) {
        console.error('Update video progress error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/progress/my-progress
// ─────────────────────────────────────────────
export const getUserProgress = async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const allProgress = await db.select({
            moduleId: userModuleProgress.moduleId,
            videoWatched: userModuleProgress.videoWatched,
            lastPosition: userModuleProgress.lastPosition,
            courseId: modules.courseId,
            courseTitle: courses.title,
            duration: modules.duration,
        })
        .from(userModuleProgress)
        .innerJoin(modules, eq(userModuleProgress.moduleId, modules.id))
        .innerJoin(courses, eq(modules.courseId, courses.id))
        .where(eq(userModuleProgress.userId, userId));

        const enrolledCourses = await db.select({
            courseId: courses.id,
            courseTitle: courses.title,
            totalModules: count(modules.id),
        })
        .from(courses)
        .innerJoin(modules, eq(modules.courseId, courses.id))
        .groupBy(courses.id, courses.title);

        const courseMap: Record<string, {
            courseId: string;
            courseTitle: string;
            totalModules: number;
            watchedModules: number;
            completionPercent: number;
        }> = {};

        for (const course of enrolledCourses) {
            courseMap[course.courseId] = {
                courseId: course.courseId,
                courseTitle: course.courseTitle,
                totalModules: Number(course.totalModules),
                watchedModules: 0,
                completionPercent: 0,
            };
        }

        for (const row of allProgress) {
            if (courseMap[row.courseId] && row.videoWatched) {
                courseMap[row.courseId].watchedModules++;
            }
        }

        const result = Object.values(courseMap).map(c => ({
            ...c,
            completionPercent: c.totalModules > 0
                ? Math.round((c.watchedModules / c.totalModules) * 100)
                : 0
        }));

        const totalModules = result.reduce((sum, c) => sum + c.totalModules, 0);
        const watchedModules = result.reduce((sum, c) => sum + c.watchedModules, 0);
        const overallPercent = totalModules > 0
            ? Math.round((watchedModules / totalModules) * 100)
            : 0;

        return res.json({
            progress: result,
            overall: {
                totalModules,
                watchedModules,
                overallPercent,
                activeCourses: result.length,
            }
        });
    } catch (error) {
        console.error('Get user progress error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/progress/generate-certificate
// ─────────────────────────────────────────────
export const manualGenerateCertificate = async (req: AuthRequest, res: Response) => {
    const { courseId } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!courseId) return res.status(400).json({ message: 'Course ID is required' });

    try {
        console.log(`[Certificate] Manual generation requested by user ${userId} for course ${courseId}`);
        await checkAndGenerateCertificate(userId, courseId);

        const [cert] = await db.select()
            .from(certificates)
            .where(and(
                eq(certificates.userId, userId),
                eq(certificates.courseId, courseId)
            ))
            .limit(1);

        if (!cert) {
            return res.status(404).json({
                message: 'Certificate was not found after generation. Please refresh.'
            });
        }

        return res.json({ message: 'Certificate ready!', certificate: cert });
    } catch (error: any) {
        console.error('Manual certificate generation error:', error);
        if (error.message?.startsWith('Requirements not met:')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: error?.message || 'Internal server error' });
    }
};

// ─────────────────────────────────────────────
// HELPER: Check and auto-generate certificate
// ─────────────────────────────────────────────
export const checkAndGenerateCertificate = async (userId: string, courseId: string) => {
    try {
        const courseModules = await db.select({ id: modules.id })
            .from(modules)
            .where(and(
                eq(modules.courseId, courseId),
                isNotNull(modules.video),
                ne(modules.video, '')
            ));

        const moduleCount = courseModules.length;
        if (moduleCount === 0) return;

        const moduleIds = courseModules.map(m => m.id);

        const [watchedCountResult] = await db.select({ count: count() })
            .from(userModuleProgress)
            .where(and(
                eq(userModuleProgress.userId, userId),
                eq(userModuleProgress.videoWatched, true),
                inArray(userModuleProgress.moduleId, moduleIds)
            ));

        const watchedInThisCourse = Number(watchedCountResult?.count || 0);

        const courseQuizzes = await db.select({ id: quizzes.id })
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

        if (watchedInThisCourse < moduleCount) {
            throw new Error(`Requirements not met: Only ${watchedInThisCourse}/${moduleCount} videos watched.`);
        }
        if (passedInThisCourse < quizCount) {
            throw new Error(`Requirements not met: Only ${passedInThisCourse}/${quizCount} quizzes passed.`);
        }

        const [existingCert] = await db.select()
            .from(certificates)
            .where(and(
                eq(certificates.userId, userId),
                eq(certificates.courseId, courseId)
            ));

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