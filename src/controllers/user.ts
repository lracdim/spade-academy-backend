import { db } from '../db/index.js';
import { users, userModuleProgress, quizAttempts, modules, quizzes, certificates, notifications, courses } from '../db/schema.js';
import { eq, and, count, sql, countDistinct, isNotNull, ne, desc } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { hashPassword } from '../utils/auth.js';

export const getUsers = async (req: AuthRequest, res: Response) => {
    try {
        const role = req.query.role as 'ADMIN' | 'GUARD';

        let query = db.select({
            id: users.id,
            employeeId: users.employeeId,
            fullName: users.fullName,
            email: users.email,
            password: users.password,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
        }).from(users);

        if (role) {
            // @ts-ignore - drizzle enum type check
            query = query.where(eq(users.role, role));
        }

        const allUsers = await query;
        
        if (role === 'GUARD') {
            const guardsWithStats = await Promise.all(allUsers.map(async (user: any) => {
                // 1. Calculate Granular Progress (Duration based)
                const allModules = await db.select({ id: modules.id, duration: modules.duration })
                    .from(modules)
                    .where(and(isNotNull(modules.video), ne(modules.video, '')));
                
                const userModProgress = await db.select({ 
                    moduleId: userModuleProgress.moduleId, 
                    lastPosition: userModuleProgress.lastPosition, 
                    videoWatched: userModuleProgress.videoWatched 
                }).from(userModuleProgress).where(eq(userModuleProgress.userId, user.id));

                let totalWatchedSeconds = 0;
                let totalCourseSeconds = 0;
                allModules.forEach(mod => {
                    const dur = mod.duration > 0 ? mod.duration : 300;
                    totalCourseSeconds += dur;
                    const prog = userModProgress.find(p => p.moduleId === mod.id);
                    if (prog) {
                        if (prog.videoWatched) totalWatchedSeconds += dur;
                        else totalWatchedSeconds += Math.min(prog.lastPosition, dur);
                    }
                });

                const [quizzesCountResult] = await db.select({ value: count(quizzes.id) }).from(quizzes);
                const totalQuizzesCount = Number(quizzesCountResult?.value || 0);

                const [passedCountResult] = await db.select({ value: countDistinct(quizAttempts.quizId) })
                    .from(quizAttempts)
                    .where(and(eq(quizAttempts.userId, user.id), eq(quizAttempts.passed, true)));
                const passedCount = Number(passedCountResult?.value || 0);
                
                let progress = 0;
                if (totalCourseSeconds > 0) {
                    const videoPart = (totalWatchedSeconds / totalCourseSeconds) * 70;
                    const quizPart = totalQuizzesCount > 0 ? (passedCount / totalQuizzesCount) * 30 : 30;
                    progress = Math.round(videoPart + quizPart);
                } else {
                    progress = totalQuizzesCount > 0 ? Math.round((passedCount / totalQuizzesCount) * 100) : 0;
                }
                progress = Math.max(0, Math.min(100, progress));

                // 2. Calculate Average Score
                const [avgScoreResult] = await db.select({ value: sql`AVG(${quizAttempts.score})` })
                    .from(quizAttempts)
                    .where(eq(quizAttempts.userId, user.id));
                const avgScore = avgScoreResult?.value ? Math.round(Number(avgScoreResult.value)) : 0;

                const [attemptsCountResult] = await db.select({ value: count() })
                    .from(quizAttempts)
                    .where(eq(quizAttempts.userId, user.id));
                const totalAttempts = Number(attemptsCountResult?.value || 0);

                const { password, ...userWithoutPassword } = user;
                return {
                    ...userWithoutPassword,
                    progress: `${progress}%`,
                    score: `${avgScore}/100`,
                    attempts: totalAttempts
                };
            }));
            return res.json(guardsWithStats);
        }

        const usersWithoutPassword = allUsers.map(({ password, ...u }) => u);
        res.json(usersWithoutPassword);
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createUser = async (req: AuthRequest, res: Response) => {
    // Basic implementation for now, can be expanded
    const { fullName, email, password, role, employeeId } = req.body;

    if (!fullName || !role || !employeeId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        // Check if user with same employeeId exists
        const [existing] = await db.select().from(users).where(eq(users.employeeId, employeeId));
        if (existing) {
            return res.status(400).json({ message: 'User with this Employee ID already exists' });
        }

        const hashedPassword = await hashPassword(password || 'defaultPassword123');

        const [newUser] = await db.insert(users).values({
            fullName,
            email: email || null,
            password: hashedPassword,
            role,
            employeeId,
        }).returning();

        res.status(201).json(newUser);
    } catch (error: any) {
        console.error('Create user error:', error);
        if (error.code === '23505') { // Postgres unique violation code
            return res.status(400).json({ message: 'User with these details (Email or ID) already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { fullName, email, password, role, employeeId } = req.body;

    try {
        const updateData: any = {};
        if (fullName) updateData.fullName = fullName;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (employeeId) updateData.employeeId = employeeId;
        if (password && password.trim() !== '') {
            updateData.password = await hashPassword(password);
        }

        const [updatedUser] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, id as string))
            .returning();

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(updatedUser);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
        // Cascading delete - Remove related records first to avoid foreign key errors
        await db.delete(notifications).where(eq(notifications.userId, id as string));
        await db.delete(certificates).where(eq(certificates.userId, id as string));
        await db.delete(quizAttempts).where(eq(quizAttempts.userId, id as string));
        await db.delete(userModuleProgress).where(eq(userModuleProgress.userId, id as string));

        const [deletedUser] = await db.delete(users)
            .where(eq(users.id, id as string))
            .returning();

        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getGuardProfile = async (req: AuthRequest, res: Response) => {
    const guardId = req.params.id as string;

    try {
        const [guard] = await db.select({
            id: users.id,
            employeeId: users.employeeId,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
        }).from(users).where(eq(users.id, guardId)).limit(1);

        if (!guard) return res.status(404).json({ message: 'Guard not found' });

        // Watch time comes from the player's progress pings, which record how far
        // into each module video the guard has reached.
        const progressRows = await db.select({
            moduleId: userModuleProgress.moduleId,
            videoWatched: userModuleProgress.videoWatched,
            lastPosition: userModuleProgress.lastPosition,
            updatedAt: userModuleProgress.updatedAt,
            moduleTitle: modules.title,
            courseId: modules.courseId,
            courseTitle: courses.title,
        })
            .from(userModuleProgress)
            .innerJoin(modules, eq(userModuleProgress.moduleId, modules.id))
            .innerJoin(courses, eq(modules.courseId, courses.id))
            .where(eq(userModuleProgress.userId, guardId));

        const attempts = await db.select({
            id: quizAttempts.id,
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
            .where(eq(quizAttempts.userId, guardId))
            .orderBy(desc(quizAttempts.attemptedAt));

        const earnedCertificates = await db.select({
            id: certificates.id,
            certCode: certificates.certCode,
            issuedAt: certificates.issuedAt,
            imageUrl: certificates.imageUrl,
            courseTitle: courses.title,
        })
            .from(certificates)
            .innerJoin(courses, eq(certificates.courseId, courses.id))
            .where(eq(certificates.userId, guardId));

        const allCourses = await db.select({
            courseId: courses.id,
            courseTitle: courses.title,
            moduleId: modules.id,
        }).from(courses).innerJoin(modules, eq(modules.courseId, courses.id));

        const passedModuleIds = new Set(
            attempts.filter(attempt => attempt.passed).map(attempt => attempt.moduleTitle)
        );
        const watchedModuleIds = new Set(
            progressRows.filter(row => row.videoWatched).map(row => row.moduleId)
        );

        const courseMap = new Map<string, { courseId: string; courseTitle: string; totalModules: number; watchedModules: number; passedQuizzes: number }>();
        for (const row of allCourses) {
            const entry = courseMap.get(row.courseId)
                ?? { courseId: row.courseId, courseTitle: row.courseTitle, totalModules: 0, watchedModules: 0, passedQuizzes: 0 };
            entry.totalModules += 1;
            if (watchedModuleIds.has(row.moduleId)) entry.watchedModules += 1;
            courseMap.set(row.courseId, entry);
        }

        const courseProgress = [...courseMap.values()].map(course => ({
            ...course,
            completionPercent: course.totalModules > 0
                ? Math.round((course.watchedModules / course.totalModules) * 100)
                : 0,
        }));

        const watchSeconds = progressRows.reduce((total, row) => total + (row.lastPosition || 0), 0);
        const scores = attempts.map(attempt => attempt.score);
        const lastActivity = [...progressRows.map(r => r.updatedAt), ...attempts.map(a => a.attemptedAt)]
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

        res.json({
            guard,
            summary: {
                watchSeconds,
                totalAttempts: attempts.length,
                passedAttempts: attempts.filter(a => a.passed).length,
                averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
                certificatesEarned: earnedCertificates.length,
                modulesCompleted: watchedModuleIds.size,
                lastActivity,
            },
            courseProgress,
            attempts,
            certificates: earnedCertificates,
            unusedPassedModules: passedModuleIds.size,
        });
    } catch (error) {
        console.error('Get guard profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
