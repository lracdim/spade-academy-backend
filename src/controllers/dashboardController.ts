import { Request, Response } from "express";
import { db } from "../db/index.js";
import { users, courses, userProgress, certificates, lessons, modules } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export const getGuardDashboard = async (req: any, res: Response) => {
    const userId = req.user.id;

    try {
        // 1. Fetch Overall Stats
        const [progRes, coursesRes, certRes] = await Promise.all([
            db.query.userProgress.findMany({ where: eq(userProgress.userId, userId) }),
            db.query.courses.findMany({ where: eq(courses.status, 'published') }),
            db.query.certificates.findMany({ where: eq(certificates.userId, userId) })
        ]);

        const totalLessons = await db.select({ count: sql<number>`count(*)` }).from(lessons);
        const completedLessons = progRes.filter(p => p.completed).length;

        const stats = {
            total_trainings: coursesRes.length,
            completed: certRes.length,
            in_progress: coursesRes.length - certRes.length,
            overall_progress: totalLessons[0].count > 0 ? Math.round((completedLessons / totalLessons[0].count) * 100) : 0
        };

        // 2. Wrap courses with progress for the view
        const trainings = await Promise.all(coursesRes.map(async (course) => {
            const courseModules = await db.query.modules.findMany({ where: eq(modules.courseId, course.id) });
            // Simplified for now
            return {
                ...course,
                progress: 0 // Logic to calculate per course would go here
            };
        }));

        res.json({ stats, trainings });
    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).json({ error: "Error fetching dashboard" });
    }
};

export const getAdminStats = async (req: any, res: Response) => {
    try {
        const [guardsCount, coursesCount, certsCount] = await Promise.all([
            db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, 'guard')),
            db.select({ count: sql<number>`count(*)` }).from(courses),
            db.select({ count: sql<number>`count(*)` }).from(certificates)
        ]);

        res.json({
            active_guards: guardsCount[0].count,
            total_courses: coursesCount[0].count,
            total_certificates: certsCount[0].count,
            completion_rate: 0 // Placeholder
        });
    } catch (error) {
        res.status(500).json({ error: "Error fetching admin stats" });
    }
};
