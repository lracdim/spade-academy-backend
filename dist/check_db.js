import { db } from './src/db/index.js';
import { courses, modules } from './src/db/schema.js';
async function check() {
    try {
        const c = await db.select().from(courses);
        const m = await db.select().from(modules);
        console.log('--- ACTIVE THUMBNAILS ---');
        c.forEach(course => {
            if (course.thumbnail)
                console.log(course.thumbnail);
        });
        console.log('\n--- ACTIVE VIDEOS ---');
        m.forEach(mod => {
            if (mod.video)
                console.log(mod.video);
        });
    }
    catch (error) {
        console.error('Error checking DB:', error);
    }
    finally {
        process.exit(0);
    }
}
check();
//# sourceMappingURL=check_db.js.map