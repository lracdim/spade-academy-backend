import { db } from './db/index.js';
import { courses } from './db/schema.js';
import { sql } from 'drizzle-orm';
async function test() {
    try {
        console.log("Testing course fetch...");
        const res = await db.select().from(courses);
        console.log("fetch courses", res);
        console.log("Testing max order...");
        const [maxOrderResult] = await db.select({ maxOrder: sql `MAX(${courses.order})` }).from(courses);
        const nextOrder = (maxOrderResult?.maxOrder || 0) + 1;
        console.log("nextOrder", nextOrder);
        console.log("Testing insert...");
        const [newCourse] = await db.insert(courses).values({
            title: "Test Course",
            description: "Test Course Description",
            isPublished: false,
            order: nextOrder,
        }).returning();
        console.log("inserted course", newCourse);
        process.exit(0);
    }
    catch (e) {
        console.error("ERROR", e);
        process.exit(1);
    }
}
test();
//# sourceMappingURL=create-course-test.js.map