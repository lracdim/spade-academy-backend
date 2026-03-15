import { db } from '../db/index.js';
import { courses, modules, lessons, quizzes, questions } from '../db/schema.js';
import { eq, count, sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { deleteFileFromUrl } from '../utils/file.js';

export const getCourses = async (req: AuthRequest, res: Response) => {
    try {
        const coursesWithCounts = await db.execute(sql`
            SELECT 
                c.id, 
                c.title, 
                c.description, 
                c.thumbnail, 
                c.is_published as "isPublished", 
                c.order, 
                c.created_at as "createdAt",
                COUNT(DISTINCT m.id) as "moduleCount",
                COUNT(DISTINCT l.id) as "lessonCount"
            FROM courses c
            LEFT JOIN modules m ON c.id = m.course_id
            LEFT JOIN lessons l ON m.id = l.module_id
            WHERE 1=1
            ${req.user?.role === 'GUARD' ? sql`AND c.is_published = true` : sql``}
            GROUP BY c.id
            ORDER BY c.order ASC
        `);

        res.json(coursesWithCounts.rows.map(row => ({
            ...row,
            moduleCount: Number(row.moduleCount),
            lessonCount: Number(row.lessonCount),
            isPublished: Boolean(row.isPublished)
        })));
    } catch (error) {
        console.error('Fetch courses error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createCourse = async (req: AuthRequest, res: Response) => {
    const { title, description, isPublished, thumbnail } = req.body;

    if (!title || !description) {
        return res.status(400).json({ message: 'Title and description are required' });
    }

    try {
        const [maxOrderResult] = await db.select({ 
            maxOrder: sql<number>`MAX(${courses.order})` 
        }).from(courses);
        
        const nextOrder = (maxOrderResult?.maxOrder || 0) + 1;

        const [newCourse] = await db.insert(courses).values({
            title,
            description,
            isPublished: !!isPublished,
            thumbnail: thumbnail || null,
            order: nextOrder,
        }).returning();

        res.status(201).json(newCourse);
    } catch (error) {
        console.error('Create course error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateCourse = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, isPublished, thumbnail } = req.body;

    try {
        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (isPublished !== undefined) updateData.isPublished = isPublished;
        if (thumbnail !== undefined) updateData.thumbnail = thumbnail;

        const courseId = id as string;

        const [oldCourse] = await db.select()
            .from(courses)
            .where(eq(courses.id, courseId))
            .limit(1);

        const [updatedCourse] = await db.update(courses)
            .set(updateData)
            .where(eq(courses.id, courseId))
            .returning();

        if (!updatedCourse) {
            return res.status(404).json({ message: 'Course not found' });
        }

        if (thumbnail && oldCourse?.thumbnail && oldCourse.thumbnail !== thumbnail) {
            deleteFileFromUrl(oldCourse.thumbnail);
        }

        res.json(updatedCourse);
    } catch (error) {
        console.error('Update course error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteCourse = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
        const courseId = id as string;

        // 1. Fetch course
        const [courseToDelete] = await db.select()
            .from(courses)
            .where(eq(courses.id, courseId))
            .limit(1);

        if (!courseToDelete) {
            return res.status(404).json({ message: 'Course not found' });
        }

        // 2. Fetch all modules for this course
        const courseModules = await db.select({
            id: modules.id,
            video: modules.video
        }).from(modules).where(eq(modules.courseId, courseId));

        const moduleIds = courseModules.map(m => m.id);

        if (moduleIds.length > 0) {
            // 3. Fetch all quizzes for these modules
            const courseQuizzes = await db.select({ id: quizzes.id })
                .from(quizzes)
                .where(sql`${quizzes.moduleId} = ANY(ARRAY[${sql.join(moduleIds.map(id => sql`${id}::uuid`), sql`, `)}])`);

            const quizIds = courseQuizzes.map(q => q.id);

            if (quizIds.length > 0) {
                // 4. Delete quiz attempts
                await db.execute(sql`
                    DELETE FROM quiz_attempts 
                    WHERE quiz_id = ANY(ARRAY[${sql.join(quizIds.map(id => sql`${id}::uuid`), sql`, `)}])
                `);

                // 5. Delete questions
                await db.execute(sql`
                    DELETE FROM questions 
                    WHERE quiz_id = ANY(ARRAY[${sql.join(quizIds.map(id => sql`${id}::uuid`), sql`, `)}])
                `);

                // 6. Delete quizzes
                await db.execute(sql`
                    DELETE FROM quizzes 
                    WHERE id = ANY(ARRAY[${sql.join(quizIds.map(id => sql`${id}::uuid`), sql`, `)}])
                `);
            }

            // 7. Delete user module progress
            await db.execute(sql`
                DELETE FROM user_module_progress 
                WHERE module_id = ANY(ARRAY[${sql.join(moduleIds.map(id => sql`${id}::uuid`), sql`, `)}])
            `);

            // 8. Delete lessons
            await db.execute(sql`
                DELETE FROM lessons 
                WHERE module_id = ANY(ARRAY[${sql.join(moduleIds.map(id => sql`${id}::uuid`), sql`, `)}])
            `);

            // 9. Delete video files
            for (const mod of courseModules) {
                if (mod.video) deleteFileFromUrl(mod.video);
            }

            // 10. Delete modules
            await db.execute(sql`
                DELETE FROM modules 
                WHERE course_id = ${courseId}::uuid
            `);
        }

        // 11. Delete certificates for this course
        await db.execute(sql`
            DELETE FROM certificates 
            WHERE course_id = ${courseId}::uuid
        `);

        // 12. Finally delete the course
        const [deletedCourse] = await db.delete(courses)
            .where(eq(courses.id, courseId))
            .returning();

        // 13. Delete thumbnail file
        if (deletedCourse?.thumbnail) {
            deleteFileFromUrl(deletedCourse.thumbnail);
        }

        return res.json({ message: 'Course deleted successfully' });
    } catch (error) {
        console.error('Delete course error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}