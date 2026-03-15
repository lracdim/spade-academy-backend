import { db } from './db/index.js';
import { courses, modules, lessons } from './db/schema.js';
import { sql } from 'drizzle-orm';
async function test() {
    try {
        console.log("Testing full getCourses query...");
        const allCourses = await db.select({
            id: courses.id,
            title: courses.title,
            description: courses.description,
            thumbnail: courses.thumbnail,
            isPublished: courses.isPublished,
            order: courses.order,
            createdAt: courses.createdAt,
            moduleCount: sql `(SELECT COUNT(*) FROM ${modules} WHERE ${modules.courseId} = ${courses.id})`.mapWith(Number),
            lessonCount: sql `(SELECT COUNT(*) FROM ${lessons} JOIN ${modules} ON ${lessons.moduleId} = ${modules.id} WHERE ${modules.courseId} = ${courses.id})`.mapWith(Number),
        })
            .from(courses)
            .orderBy(courses.order);
        console.log("Success! Found courses:", allCourses.length);
        process.exit(0);
    }
    catch (e) {
        console.error("ERROR in getCourses query:", e);
        process.exit(1);
    }
}
test();
//# sourceMappingURL=get-courses-test.js.map