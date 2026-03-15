import { db } from '../db/index.js';
import { courses, modules, lessons, quizzes, questions } from '../db/schema.js';
import { eq, count, sql } from 'drizzle-orm';
import { deleteFileFromUrl } from '../utils/file.js';
export const getCourses = async (req, res) => {
    try {
        // Fetch all courses
        // Base query
        const baseQuery = db.select({
            id: courses.id,
            title: courses.title,
            description: courses.description,
            thumbnail: courses.thumbnail,
            isPublished: courses.isPublished,
            order: courses.order,
            createdAt: courses.createdAt,
        }).from(courses);
        // Fetch courses based on role
        const allCourses = req.user?.role === 'GUARD'
            ? await baseQuery.where(eq(courses.isPublished, true)).orderBy(courses.order)
            : await baseQuery.orderBy(courses.order);
        // For each course, count modules and lessons
        const coursesWithCounts = await Promise.all(allCourses.map(async (course) => {
            const [modCount] = await db
                .select({ count: count() })
                .from(modules)
                .where(eq(modules.courseId, course.id));
            const [lessonCount] = await db
                .select({ count: count() })
                .from(lessons)
                .innerJoin(modules, eq(lessons.moduleId, modules.id))
                .where(eq(modules.courseId, course.id));
            return {
                ...course,
                moduleCount: modCount?.count || 0,
                lessonCount: lessonCount?.count || 0,
            };
        }));
        res.json(coursesWithCounts);
    }
    catch (error) {
        console.error('Fetch courses error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const createCourse = async (req, res) => {
    const { title, description, isPublished, thumbnail } = req.body;
    if (!title || !description) {
        return res.status(400).json({ message: 'Title and description are required' });
    }
    try {
        // Get the current max order
        const [maxOrderResult] = await db.select({ maxOrder: sql `MAX(${courses.order})` }).from(courses);
        const nextOrder = (maxOrderResult?.maxOrder || 0) + 1;
        const [newCourse] = await db.insert(courses).values({
            title,
            description,
            isPublished: !!isPublished,
            thumbnail: thumbnail || null,
            order: nextOrder,
        }).returning();
        res.status(201).json(newCourse);
    }
    catch (error) {
        console.error('Create course error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const updateCourse = async (req, res) => {
    const { id } = req.params;
    const { title, description, isPublished, thumbnail } = req.body;
    try {
        const updateData = {};
        if (title !== undefined)
            updateData.title = title;
        if (description !== undefined)
            updateData.description = description;
        if (isPublished !== undefined)
            updateData.isPublished = isPublished;
        if (thumbnail !== undefined)
            updateData.thumbnail = thumbnail;
        const courseId = id;
        // Fetch old course data to check for file replacement
        const [oldCourse] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
        const [updatedCourse] = await db.update(courses)
            .set(updateData)
            .where(eq(courses.id, courseId))
            .returning();
        if (!updatedCourse) {
            return res.status(404).json({ message: 'Course not found' });
        }
        // Cleanup old thumbnail if replaced
        if (thumbnail && oldCourse?.thumbnail && oldCourse.thumbnail !== thumbnail) {
            deleteFileFromUrl(oldCourse.thumbnail);
        }
        res.json(updatedCourse);
    }
    catch (error) {
        console.error('Update course error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const deleteCourse = async (req, res) => {
    const { id } = req.params;
    try {
        // Need to delete dependencies first due to foreign keys, or rely on ON DELETE CASCADE.
        // Assuming no cascade configured right now, let's manually delete lessons, quizzes, modules, certificates related to this course.
        // For a more robust approach, ON DELETE CASCADE on the schema is preferred.
        // Modules point to course. Lessons point to module. Quizzes point to module.
        // For simplicity, we'll try to delete the course and handle FK errors if they exist, 
        // to force deleting modules first.
        const courseId = id;
        // Fetch course first to get thumbnail
        const [courseToDelete] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
        if (!courseToDelete) {
            return res.status(404).json({ message: 'Course not found' });
        }
        // Fetch related modules to get their videos
        const courseModules = await db.select({ id: modules.id, video: modules.video }).from(modules).where(eq(modules.courseId, courseId));
        const moduleIds = courseModules.map(m => m.id);
        for (const mod of courseModules) {
            // Delete lessons
            await db.delete(lessons).where(eq(lessons.moduleId, mod.id));
            // Delete quizzes
            // First fetch quizzes to delete questions
            const [modQuiz] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.moduleId, mod.id));
            if (modQuiz) {
                await db.delete(questions).where(eq(questions.quizId, modQuiz.id));
                await db.delete(quizzes).where(eq(quizzes.id, modQuiz.id));
            }
            // Delete the video file
            if (mod.video) {
                deleteFileFromUrl(mod.video);
            }
        }
        // Delete modules
        await db.delete(modules).where(eq(modules.courseId, courseId));
        // Delete course
        const [deletedCourse] = await db.delete(courses)
            .where(eq(courses.id, courseId))
            .returning();
        // Delete the course thumbnail
        if (deletedCourse?.thumbnail) {
            deleteFileFromUrl(deletedCourse.thumbnail);
        }
        res.json({ message: 'Course deleted successfully' });
    }
    catch (error) {
        console.error('Delete course error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
//# sourceMappingURL=course.js.map