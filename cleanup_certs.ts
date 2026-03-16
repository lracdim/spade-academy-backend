
import { db } from './src/db/index.js';
import { certificates } from './src/db/schema.js';
import fs from 'fs';
import path from 'path';

async function cleanup() {
    console.log('[Cleanup] Starting database and file cleanup...');
    try {
        // Delete all rows from certificates table
        await db.delete(certificates);
        console.log('[Success] Deleted all certificate records from database.');

        // Clean up the uploads folder
        const uploadDir = path.join(process.cwd(), 'public/uploads/certificates');
        if (fs.existsSync(uploadDir)) {
            const files = fs.readdirSync(uploadDir);
            for (const file of files) {
                if (file.endsWith('.png')) {
                    const filePath = path.join(uploadDir, file);
                    fs.unlinkSync(filePath);
                }
            }
            console.log('[Success] Deleted all generated certificate images from storage.');
        } else {
            console.log('[Info] Upload directory not found, skipping file deletion.');
        }
    } catch (err) {
        console.error('[Cleanup Failed]', err);
    }
}

cleanup().then(() => process.exit(0));
