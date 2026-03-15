import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const deleteFileFromUrl = (fileUrl: string | null) => {
    if (!fileUrl) return;

    try {
        let filename: string;

        if (fileUrl.startsWith('http')) {
            const urlObj = new URL(fileUrl);
            filename = path.basename(urlObj.pathname);
        } else {
            // Treat as relative path
            filename = path.basename(fileUrl);
        }

        if (!filename || filename === '.' || filename === '/') return;

        const filePath = path.join(__dirname, '../../public/uploads', filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Successfully deleted file: ${filePath}`);
        } else {
            console.log(`File not found for deletion: ${filePath}`);
        }
    } catch (error) {
        console.error(`Error deleting file from URL/path ${fileUrl}:`, error);
    }
};
