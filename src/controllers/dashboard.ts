import { db } from '../db/index.js';
import { users, courses, certificates, quizAttempts, quizzes, modules, userModuleProgress } from '../db/schema.js';
import { eq, and, count, desc, inArray, sql, isNotNull, ne } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        // 1. Core Counts
        const [totalCertificates] = await db.select({ value: count() }).from(certificates);
        const [totalGuardsResult] = await db.select({ value: count() }).from(users).where(eq(users.role, 'GUARD'));
        const [totalCourses] = await db.select({ value: count() }).from(courses);
        
        const guardCount = Number(totalGuardsResult?.value || 0);

        // 2. Global Progress Calculation (All Guards, All Courses)
        // Video Formula: Actual Seconds Watched / (Total System Duration * Number of Guards)
        const [systemModuleStats] = await db.select({ 
            totalDuration: sql<number>`SUM(duration)` 
        }).from(modules).where(and(isNotNull(modules.video), ne(modules.video, '')));
        
        const systemDuration = Number(systemModuleStats?.totalDuration || 0);
        const videoDenominator = systemDuration * guardCount;

        // Sum of all progress records (Global)
        const actualProgress = await db.execute(sql`
            SELECT SUM(CASE WHEN up.video_watched = true THEN m.duration ELSE LEAST(up.last_position, m.duration) END) as total_watched
            FROM user_module_progress up
            JOIN modules m ON up.module_id = m.id
        `);

        const totalWatched = Number(actualProgress.rows[0]?.total_watched || 0);
        const videoPercentage = videoDenominator > 0 ? (totalWatched / videoDenominator) * 100 : 0;

        // 3. Quiz Formula: Unique Passed Quizzes / (Total Quizzes * Number of Guards)
        const [systemQuizStats] = await db.select({ value: count() }).from(quizzes);
        const systemQuizCount = Number(systemQuizStats?.value || 0);
        const quizDenominator = systemQuizCount * guardCount;

        // Count unique passed user-quiz pairs for guards
        const uniquePassedPairs = await db.execute(sql`
            SELECT COUNT(DISTINCT (user_id, quiz_id)) as count 
            FROM quiz_attempts qa
            JOIN users u ON qa.user_id = u.id
            WHERE u.role = 'GUARD' AND qa.passed = true
        `);
        
        const passedCount = Number(uniquePassedPairs.rows[0]?.count || 0);
        const quizPercentage = quizDenominator > 0 ? (passedCount / quizDenominator) * 100 : 0;

        // 4. Final Balanced Calculation (70% Video, 30% Quiz)
        const completionRateValue = Math.round((videoPercentage * 0.7) + (quizPercentage * 0.3));

        const recentActivity = await db.select({
            id: quizAttempts.id,
            userName: users.fullName,
            courseTitle: courses.title,
            score: quizAttempts.score,
            passed: quizAttempts.passed,
            attemptedAt: quizAttempts.attemptedAt,
        })
            .from(quizAttempts)
            .innerJoin(users, eq(quizAttempts.userId, users.id))
            .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
            .innerJoin(modules, eq(quizzes.moduleId, modules.id))
            .innerJoin(courses, eq(modules.courseId, courses.id))
            .orderBy(desc(quizAttempts.attemptedAt))
            .limit(5);

        // Certificate Trend (Last 7 days)
        const certificateTrend = await db.execute(sql`
            WITH RECURSIVE days AS (
                SELECT CURRENT_DATE - INTERVAL '6 days' as day
                UNION ALL
                SELECT day + INTERVAL '1 day'
                FROM days
                WHERE day < CURRENT_DATE
            )
            SELECT 
                TO_CHAR(days.day, 'Mon DD') as date,
                COUNT(c.id)::int as count
            FROM days
            LEFT JOIN certificates c ON DATE(c.issued_at) = days.day
            GROUP BY days.day
            ORDER BY days.day ASC
        `);

        res.json({
            stats: {
                certificatesIssued: Number(totalCertificates?.value || 0),
                activeGuards: guardCount,
                totalCourses: Number(totalCourses?.value || 0),
                completionRate: `${Math.min(100, completionRateValue)}%`,
                certificateTrend: certificateTrend.rows
            },
            recentActivity
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getGuardDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            console.error('[Dashboard] No userId found in request');
            return res.status(401).json({ message: 'Unauthorized' });
        }

        console.log(`[Dashboard] Starting stats fetch for user: ${userId}`);

        // 1. Basic Counts
        const [totalCoursesResult] = await db.select({ value: count() }).from(courses);
        const totalCoursesCount = Number(totalCoursesResult?.value || 0);
        console.log(`[Dashboard] totalCoursesCount: ${totalCoursesCount}`);

        const [userCertificatesResult] = await db.select({ value: count() }).from(certificates).where(eq(certificates.userId, userId));
        const certCount = Number(userCertificatesResult?.value || 0);

        // 2. Load ALL Content for accurate math
        const allModules = await db.select({ 
            id: modules.id, 
            duration: modules.duration,
            courseId: modules.courseId,
            video: modules.video
        }).from(modules);

        const videoModules = allModules.filter(m => m.video && m.video !== '');
        console.log(`[Dashboard] Total modules: ${allModules.length}, Video modules: ${videoModules.length}`);

        const allQuizzes = await db.select({ 
            id: quizzes.id, 
            moduleId: quizzes.moduleId,
            courseId: modules.courseId 
        }).from(quizzes).innerJoin(modules, eq(quizzes.moduleId, modules.id));

        // 3. Load User specific progress from DB
        const userModProgress = await db.select().from(userModuleProgress).where(eq(userModuleProgress.userId, userId));
        const userAttempts = await db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId));
        console.log(`[Dashboard] User record counts - progress: ${userModProgress.length}, quizAttempts: ${userAttempts.length}`);

        // 4. Calculate Global Progress
        let totalWatchedSeconds = 0;
        let totalCourseSeconds = 0;
        const startedCourseIds = new Set<string>();
        
        videoModules.forEach(mod => {
            const dur = mod.duration > 0 ? mod.duration : 300;
            totalCourseSeconds += dur;
            const prog = userModProgress.find(p => p.moduleId === mod.id);
            if (prog) {
                startedCourseIds.add(mod.courseId);
                if (prog.videoWatched) totalWatchedSeconds += dur;
                else totalWatchedSeconds += Math.min(prog.lastPosition, dur);
            }
        });

        // Add quiz interactions to started courses
        userAttempts.forEach(att => {
            const quiz = allQuizzes.find(q => q.id === att.quizId);
            if (quiz) startedCourseIds.add(quiz.courseId);
        });

        const totalQuizzesCount = allQuizzes.length;
        const passedQuizIds = new Set(userAttempts.filter(a => a.passed).map(a => a.quizId));
        const passedCount = passedQuizIds.size;

        console.log(`[Dashboard] Math: watched=${totalWatchedSeconds}, total=${totalCourseSeconds}, starts=${startedCourseIds.size}`);

        let videoCompletionPercentage = totalCourseSeconds > 0 
            ? Math.round((totalWatchedSeconds / totalCourseSeconds) * 100) : 0;
        
        // Ensure feedback for early progress
        if (totalWatchedSeconds > 0 && videoCompletionPercentage === 0) {
            videoCompletionPercentage = 1;
        }
        
        const avgScore = userAttempts.length > 0 
            ? Math.round(userAttempts.reduce((s, a) => s + a.score, 0) / userAttempts.length) : 0;

        let overallCompletionPercentage = 0;
        if (totalCourseSeconds > 0) {
            const videoPart = (totalWatchedSeconds / totalCourseSeconds) * 70;
            const quizPart = totalQuizzesCount > 0 ? (passedCount / totalQuizzesCount) * 30 : 30;
            overallCompletionPercentage = Math.round(videoPart + quizPart);
        } else {
            overallCompletionPercentage = totalQuizzesCount > 0 ? Math.round((passedCount / totalQuizzesCount) * 100) : (totalCoursesCount > 0 ? 0 : 0);
        }

        if (totalWatchedSeconds > 0 && overallCompletionPercentage === 0) {
            overallCompletionPercentage = 1;
        }

        overallCompletionPercentage = Math.max(0, Math.min(100, overallCompletionPercentage));

        // 5. Leaderboard
        const rankResult = await db.execute(sql`
            WITH UserScores AS (
                SELECT user_id, SUM(score) as total_points FROM quiz_attempts WHERE passed = true GROUP BY user_id
            ),
            UserRanks AS (
                SELECT user_id, total_points, DENSE_RANK() OVER (ORDER BY total_points DESC) as rank FROM UserScores
            )
            SELECT rank, total_points FROM UserRanks WHERE user_id = ${userId}::uuid
        `);

        let organisationRank = 0;
        let dbTotalPoints = 0;
        if (rankResult.rows.length > 0) {
            organisationRank = Number(rankResult.rows[0]?.rank || 0);
            dbTotalPoints = Number(rankResult.rows[0]?.total_points || 0);
        } else if (userAttempts.length > 0) {
            organisationRank = 1;
        }

        // 6. Continue Course calculation (Identify which course to show in Active Path)
        let continueCourseId: string | null = null;
        const lastActivity = [...userModProgress].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        if (lastActivity) {
            const mod = allModules.find(m => m.id === lastActivity.moduleId);
            continueCourseId = mod?.courseId || null;
            console.log(`[Dashboard] Last activity found in course: ${continueCourseId}`);
        }
        if (!continueCourseId && totalCoursesCount > 0) {
            const [first] = await db.select({ id: courses.id }).from(courses).orderBy(sql`${courses.order} ASC`).limit(1);
            continueCourseId = first?.id || null;
            console.log(`[Dashboard] Fallback to first course: ${continueCourseId}`);
        }

        let continueCourse = null;
        if (continueCourseId) {
            const [details] = await db.select().from(courses).where(eq(courses.id, continueCourseId)).limit(1);
            if (details) {
                const [cert] = await db.select().from(certificates).where(and(eq(certificates.userId, userId), eq(certificates.courseId, continueCourseId))).limit(1);
                
                // Calculate course specific progress for THIS card
                const courseModules = videoModules.filter(m => m.courseId === continueCourseId);
                const courseQuizzes = allQuizzes.filter(q => q.courseId === continueCourseId);
                
                let courseWatched = 0;
                let courseDur = 0;
                courseModules.forEach(m => {
                    const d = m.duration > 0 ? m.duration : 300;
                    courseDur += d;
                    const p = userModProgress.find(up => up.moduleId === m.id);
                    if (p) {
                        if (p.videoWatched) courseWatched += d;
                        else courseWatched += Math.min(p.lastPosition, d);
                    }
                });

                const coursePassed = userAttempts.filter(a => a.passed && courseQuizzes.some(q => q.id === a.quizId)).length;
                
                let courseProg = 0;
                if (courseDur > 0) {
                    const vPart = (courseWatched / courseDur) * 70;
                    const qPart = courseQuizzes.length > 0 ? (coursePassed / courseQuizzes.length) * 30 : 30;
                    courseProg = Math.round(vPart + qPart);
                } else {
                    courseProg = courseQuizzes.length > 0 ? Math.round((coursePassed / courseQuizzes.length) * 100) : 0;
                }

                continueCourse = {
                    id: details.id,
                    title: details.title,
                    thumbnail: details.thumbnail,
                    progress: Math.min(100, courseProg),
                    hasCertificate: !!cert
                };
            }
        }

        const stats = {
            certificatesIssued: certCount,
            totalCourses: totalCoursesCount,
            passedQuizzes: passedCount,
            overallCompletionPercentage,
            videoCompletionPercentage,
            quizCompletionPercentage: avgScore,
            totalAttempts: userAttempts.length,
            averageQuizScore: avgScore,
            highestQuizScore: userAttempts.length > 0 ? Math.max(...userAttempts.map(a => a.score)) : 0,
            organisationRank,
            totalPoints: dbTotalPoints || 0,
            totalProficiency: Math.round((videoCompletionPercentage + avgScore) / 2),
            activeLearnings: totalCoursesCount, // Show assigned courses
        };

        console.log(`[Dashboard] Sending final stats for ${userId}`, stats);
        res.json({ stats, continueCourse });

    } catch (error) {
        console.error('[Dashboard] Fatal error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
