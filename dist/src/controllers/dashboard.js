import { db } from '../db/index.js';
import { users, courses, certificates, quizAttempts, quizzes, modules, userModuleProgress } from '../db/schema.js';
import { eq, and, count, desc, inArray, sql, isNotNull, ne } from 'drizzle-orm';
export const getDashboardStats = async (req, res) => {
    try {
        const totalCertificates = (await db.select({ value: count() }).from(certificates))[0];
        const totalGuards = (await db.select({ value: count() }).from(users).where(eq(users.role, 'GUARD')))[0];
        const totalCourses = (await db.select({ value: count() }).from(courses))[0];
        const passedAttempts = (await db.select({ value: count() }).from(quizAttempts).where(eq(quizAttempts.passed, true)))[0];
        const totalAttempts = (await db.select({ value: count() }).from(quizAttempts))[0];
        const completionRateValue = (totalAttempts && Number(totalAttempts.value) > 0)
            ? Math.round((Number(passedAttempts?.value || 0) / Number(totalAttempts.value)) * 100)
            : 0;
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
        res.json({
            stats: {
                certificatesIssued: Number(totalCertificates?.value || 0),
                activeGuards: Number(totalGuards?.value || 0),
                totalCourses: Number(totalCourses?.value || 0),
                completionRate: `${completionRateValue}%`,
            },
            recentActivity
        });
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const getGuardDashboardStats = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        // Total Courses
        const totalCoursesCountResult = (await db.select({ value: count(courses.id) }).from(courses))[0];
        const totalCoursesCount = parseInt(totalCoursesCountResult?.value?.toString() || '0', 10);
        console.log(`[Dashboard] totalCoursesCount: ${totalCoursesCount}`);
        // User Certificates
        const userCertificatesResult = (await db.select({ value: count() }).from(certificates).where(eq(certificates.userId, userId)))[0];
        const certCount = parseInt(userCertificatesResult?.value?.toString() || '0', 10);
        // Overall progress calculation: (Watched Videos + Passed Quizzes) / (Total Milestones)
        // Only count modules and quizzes from published courses
        const publishedCourses = await db.select({ id: courses.id }).from(courses).where(eq(courses.isPublished, true));
        const publishedCourseIds = publishedCourses.map(c => c.id);
        console.log(`[Dashboard] userId: ${userId}, publishedCourseIds: ${JSON.stringify(publishedCourseIds)}`);
        if (publishedCourseIds.length === 0) {
            return res.json({
                stats: {
                    certificatesIssued: certCount,
                    totalCourses: totalCoursesCount,
                    passedQuizzes: 0,
                    overallCompletionPercentage: 0,
                    videoCompletionPercentage: 0,
                    quizCompletionPercentage: 0,
                    totalAttempts: 0,
                    averageQuizScore: 0,
                    highestQuizScore: 0,
                    organisationRank: 0,
                    totalPoints: 0,
                    activeLearnings: 0,
                },
                continueCourse: null
            });
        }
        const allModules = await db.select({ id: modules.id })
            .from(modules)
            .where(and(inArray(modules.courseId, publishedCourseIds), sql `${modules.video} IS NOT NULL`, sql `${modules.video} != ''`));
        const totalModulesCount = allModules.length;
        const allQuizzes = await db.select({ id: quizzes.id })
            .from(quizzes)
            .innerJoin(modules, eq(quizzes.moduleId, modules.id))
            .where(inArray(modules.courseId, publishedCourseIds));
        const totalQuizzesCount = allQuizzes.length;
        const totalPossibleMilestones = totalModulesCount + totalQuizzesCount;
        // Count watched videos (filtered by published courses)
        const watchedVideos = await db.select({ id: userModuleProgress.id })
            .from(userModuleProgress)
            .innerJoin(modules, eq(userModuleProgress.moduleId, modules.id))
            .where(and(eq(userModuleProgress.userId, userId), eq(userModuleProgress.videoWatched, true), inArray(modules.courseId, publishedCourseIds), sql `${modules.video} IS NOT NULL`, sql `${modules.video} != ''`));
        const watchedCount = watchedVideos.length;
        // Quiz Scores Calculations
        const userAttempts = await db.select({ score: quizAttempts.score, passed: quizAttempts.passed, quizId: quizAttempts.quizId }).from(quizAttempts).where(eq(quizAttempts.userId, userId));
        let averageQuizScore = 0;
        let highestQuizScore = 0;
        let totalPoints = 0;
        let totalAttempts = userAttempts.length;
        if (userAttempts.length > 0) {
            const totalScore = userAttempts.reduce((sum, current) => sum + current.score, 0);
            averageQuizScore = Math.round(totalScore / userAttempts.length);
            highestQuizScore = Math.max(...userAttempts.map(a => a.score));
            totalPoints = userAttempts.filter(a => a.passed).reduce((sum, a) => sum + a.score, 0);
        }
        // Count unique passed quizzes (for the scoreboard card)
        const passedQuizzesResult = await db.select({ quizId: quizAttempts.quizId })
            .from(quizAttempts)
            .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
            .innerJoin(modules, eq(quizzes.moduleId, modules.id))
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.passed, true), inArray(modules.courseId, publishedCourseIds)));
        const passedCount = new Set(passedQuizzesResult.map(q => q.quizId)).size;
        // Count unique attempted quizzes (filtered by published courses)
        const attemptedQuizzesResult = await db.select({ quizId: quizAttempts.quizId })
            .from(quizAttempts)
            .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
            .innerJoin(modules, eq(quizzes.moduleId, modules.id))
            .where(and(eq(quizAttempts.userId, userId), inArray(modules.courseId, publishedCourseIds)));
        const attemptedCount = new Set(attemptedQuizzesResult.map(q => q.quizId)).size;
        const overallCompletionPercentage = totalPossibleMilestones > 0
            ? Math.floor(((watchedCount + attemptedCount) / totalPossibleMilestones) * 100)
            : 0;
        console.log(`[Dashboard] watched: ${watchedCount}, attempted: ${attemptedCount}, total: ${totalPossibleMilestones}, overall: ${overallCompletionPercentage}%`);
        const videoCompletionPercentage = totalModulesCount > 0
            ? Math.round((watchedCount / totalModulesCount) * 100)
            : 0;
        // QUIZ ASSESSMENT: Per user request, this should show the Average Score in percentage format.
        // It is not related to course completion status.
        const quizAssessmentPercentage = averageQuizScore;
        // Leaderboard calculation
        const allGuardAttempts = await db.select({
            userId: quizAttempts.userId,
            score: quizAttempts.score,
        }).from(quizAttempts).where(eq(quizAttempts.passed, true));
        const guardScoresMap = {};
        for (const attempt of allGuardAttempts) {
            guardScoresMap[attempt.userId] = (guardScoresMap[attempt.userId] || 0) + attempt.score;
        }
        const sortedGuardIds = Object.keys(guardScoresMap).sort((a, b) => (guardScoresMap[b] || 0) - (guardScoresMap[a] || 0));
        let organisationRank = sortedGuardIds.length > 0 ? sortedGuardIds.length : 1;
        if (sortedGuardIds.includes(userId)) {
            organisationRank = sortedGuardIds.indexOf(userId) + 1;
        }
        else if (userAttempts.length === 0) {
            organisationRank = 0;
        }
        // Calculate the "Continue Course"
        const lastModuleProgress = await db.select({
            moduleId: userModuleProgress.moduleId,
            updatedAt: userModuleProgress.updatedAt
        })
            .from(userModuleProgress)
            .where(eq(userModuleProgress.userId, userId))
            .orderBy(desc(userModuleProgress.updatedAt))
            .limit(1);
        const lastQuizAttempt = await db.select({
            quizId: quizAttempts.quizId,
            attemptedAt: quizAttempts.attemptedAt
        })
            .from(quizAttempts)
            .where(eq(quizAttempts.userId, userId))
            .orderBy(desc(quizAttempts.attemptedAt))
            .limit(1);
        let continueCourseId = null;
        if (lastModuleProgress.length > 0 && lastQuizAttempt.length > 0) {
            const modProg = lastModuleProgress[0];
            const quizAtt = lastQuizAttempt[0];
            if (modProg && quizAtt && new Date(modProg.updatedAt) > new Date(quizAtt.attemptedAt)) {
                const [mod] = await db.select({ courseId: modules.courseId }).from(modules).where(eq(modules.id, modProg.moduleId)).limit(1);
                continueCourseId = mod?.courseId || null;
            }
            else if (quizAtt) {
                const [q] = await db.select({ courseId: modules.courseId })
                    .from(quizzes)
                    .innerJoin(modules, eq(quizzes.moduleId, modules.id))
                    .where(eq(quizzes.id, quizAtt.quizId))
                    .limit(1);
                continueCourseId = q?.courseId || null;
            }
        }
        else if (lastModuleProgress.length > 0) {
            const modProg = lastModuleProgress[0];
            if (modProg) {
                const [mod] = await db.select({ courseId: modules.courseId }).from(modules).where(eq(modules.id, modProg.moduleId)).limit(1);
                continueCourseId = mod?.courseId || null;
            }
        }
        else if (lastQuizAttempt.length > 0) {
            const quizAtt = lastQuizAttempt[0];
            if (quizAtt) {
                const [q] = await db.select({ courseId: modules.courseId })
                    .from(quizzes)
                    .innerJoin(modules, eq(quizzes.moduleId, modules.id))
                    .where(eq(quizzes.id, quizAtt.quizId))
                    .limit(1);
                continueCourseId = q?.courseId || null;
            }
        }
        // FALLBACK: If no interaction, suggest the first course
        if (!continueCourseId && totalCoursesCount > 0) {
            const [firstCourse] = await db.select({ id: courses.id }).from(courses).orderBy(sql `${courses.order} ASC`).limit(1);
            continueCourseId = firstCourse?.id || null;
        }
        let continueCourse = null;
        if (continueCourseId) {
            const [courseDetails] = await db.select().from(courses).where(eq(courses.id, continueCourseId)).limit(1);
            if (courseDetails) {
                const [cert] = await db.select()
                    .from(certificates)
                    .where(and(eq(certificates.userId, userId), eq(certificates.courseId, continueCourseId)))
                    .limit(1);
                // Calculate PROGRESS specifically for THIS course to avoid contradictions
                const activeCourseModules = await db.select({ id: modules.id })
                    .from(modules)
                    .where(and(eq(modules.courseId, continueCourseId), sql `${modules.video} IS NOT NULL`, sql `${modules.video} != ''`));
                const activeModuleIds = activeCourseModules.map(m => m.id);
                const activeQuizzes = activeModuleIds.length > 0 ? await db.select({ id: quizzes.id }).from(quizzes).where(inArray(quizzes.moduleId, activeModuleIds)) : [];
                const activeQuizIds = activeQuizzes.map(q => q.id);
                const activeWatchedCountResult = activeModuleIds.length > 0 ? (await db.select({ value: count() })
                    .from(userModuleProgress)
                    .where(and(eq(userModuleProgress.userId, userId), eq(userModuleProgress.videoWatched, true), inArray(userModuleProgress.moduleId, activeModuleIds))))[0] : { value: 0 };
                const activeAttemptedQuizzesResult = activeQuizIds.length > 0 ? await db.select({ id: quizAttempts.quizId })
                    .from(quizAttempts)
                    .where(and(eq(quizAttempts.userId, userId), inArray(quizAttempts.quizId, activeQuizIds))) : [];
                const activeAttemptedCount = new Set(activeAttemptedQuizzesResult.map(q => q.id)).size;
                const activeTotalMilestones = activeModuleIds.length + activeQuizIds.length;
                const activeProgress = activeTotalMilestones > 0
                    ? Math.floor(((Number(activeWatchedCountResult?.value || 0) + activeAttemptedCount) / activeTotalMilestones) * 100)
                    : 0;
                // Return basic course info for the "Continue" card
                continueCourse = {
                    id: courseDetails.id,
                    title: courseDetails.title,
                    thumbnail: courseDetails.thumbnail,
                    progress: activeProgress,
                    hasCertificate: !!cert
                };
            }
        }
        const responseData = {
            stats: {
                certificatesIssued: certCount,
                totalCourses: totalCoursesCount,
                passedQuizzes: passedCount,
                overallCompletionPercentage,
                videoCompletionPercentage,
                quizCompletionPercentage: quizAssessmentPercentage,
                totalAttempts: totalAttempts,
                averageQuizScore,
                highestQuizScore,
                organisationRank,
                totalPoints,
                totalProficiency: Math.round((videoCompletionPercentage + averageQuizScore) / 2),
                activeLearnings: totalCoursesCount > 0 && overallCompletionPercentage < 100 ? 1 : 0,
            },
            continueCourse
        };
        console.log(`[Dashboard] Final response for user ${userId}:`, JSON.stringify(responseData, null, 2));
        res.json(responseData);
    }
    catch (error) {
        console.error('Guard dashboard stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
//# sourceMappingURL=dashboard.js.map