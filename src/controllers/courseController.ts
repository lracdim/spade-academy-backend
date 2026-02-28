import { Request, Response } from "express";
import { db } from "../db/index.js";
import { courses, modules, lessons, userProgress } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export const getCourses = async (req: Request, res: Response) => {
    try {
        const allCourses = await db.query.courses.findMany({
            where: eq(courses.status, "published"),
        });
        res.json(allCourses);
    } catch (error) {
        res.status(500).json({ error: "Error fetching courses" });
    }
};

export const getCourse = async (req: Request, res: Response) => {
    try {
        const course = await db.query.courses.findFirst({
            where: eq(courses.id, req.params.id as string),
        });

        if (!course) return res.status(404).json({ error: "Course not found" });

        const courseModules = await db.query.modules.findMany({
            where: eq(modules.courseId, course.id),
            orderBy: (modules, { asc }) => [asc(modules.orderIndex)]
        });

        const modulesWithLessons = await Promise.all(courseModules.map(async (mod) => {
            const modLessons = await db.query.lessons.findMany({
                where: eq(lessons.moduleId, mod.id),
                orderBy: (lessons, { asc }) => [asc(lessons.orderIndex)]
            });
            return {
                ...mod,
                lessons: modLessons
            };
        }));

        res.json({
            ...course,
            modules: modulesWithLessons
        });
    } catch (error) {
        res.status(500).json({ error: "Error fetching course" });
    }
};

export const getLesson = async (req: Request, res: Response) => {
    try {
        const lesson = await db.query.lessons.findFirst({
            where: eq(lessons.id, req.params.id as string)
        });
        if (!lesson) return res.status(404).json({ error: "Lesson not found" });
        res.json(lesson);
    } catch (error) {
        res.status(500).json({ error: "Error fetching lesson" });
    }
};
