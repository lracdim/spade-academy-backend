import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
async function wipe() {
    console.log('Wiping database...');
    try {
        await db.execute(sql `
            DROP SCHEMA public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO postgres;
            GRANT ALL ON SCHEMA public TO public;
        `);
        console.log('Database wiped successfully.');
    }
    catch (error) {
        console.error('Wipe failed:', error);
    }
    finally {
        process.exit();
    }
}
wipe();
//# sourceMappingURL=wipe.js.map