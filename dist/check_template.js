import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function check() {
    try {
        const templatePath = path.join(process.cwd(), 'public/templates/certificate.png');
        const metadata = await sharp(templatePath).metadata();
        console.log(`WIDTH: \${metadata.width}, HEIGHT: \${metadata.height}`);
    }
    catch (err) {
        console.error('Error:', err.message);
    }
    finally {
        process.exit(0);
    }
}
check();
//# sourceMappingURL=check_template.js.map