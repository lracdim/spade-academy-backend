import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './src/db/index.js';
import { courses, modules } from './src/db/schema.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function cleanup() {
    try {
        console.log('--- Starting Orphan Cleanup ---');
        // 1. Get all files in uploads
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            console.log('Upload directory not found.');
            return;
        }
        const filesOnDisk = fs.readdirSync(uploadDir);
        console.log(`Found ${filesOnDisk.length} files on disk.`);
        // 2. Get all referenced files in DB
        const dbCourses = await db.select({ thumbnail: courses.thumbnail }).from(courses);
        const dbModules = await db.select({ video: modules.video }).from(modules);
        const activeFiles = new Set();
        const extractFilename = (url) => {
            if (!url)
                return null;
            try {
                if (url.startsWith('http')) {
                    const u = new URL(url);
                    return path.basename(u.pathname);
                }
                return path.basename(url);
            }
            catch {
                return path.basename(url);
            }
        };
        dbCourses.forEach(c => {
            const fname = extractFilename(c.thumbnail);
            if (fname)
                activeFiles.add(fname);
        });
        dbModules.forEach(m => {
            const fname = extractFilename(m.video);
            if (fname)
                activeFiles.add(fname);
        });
        console.log(`Active files in DB: ${activeFiles.size}`);
        // 3. Delete orphans
        let deletedCount = 0;
        filesOnDisk.forEach(file => {
            // Skip directories if any
            const filePath = path.join(uploadDir, file);
            if (fs.lstatSync(filePath).isDirectory())
                return;
            if (!activeFiles.has(file)) {
                console.log(`Deleting orphan: ${file}`);
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        });
        console.log(`--- Cleanup Finished. Deleted ${deletedCount} orphans. ---`);
    }
    catch (error) {
        console.error('Cleanup failed:', error);
    }
    finally {
        process.exit(0);
    }
}
cleanup();
//# sourceMappingURL=cleanup_orphans.js.map