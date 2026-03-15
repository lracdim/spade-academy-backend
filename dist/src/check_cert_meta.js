import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function checkMeta() {
    try {
        const templatePath = path.join(__dirname, '../public/templates/certificate.png');
        const metadata = await sharp(templatePath).metadata();
        console.log(JSON.stringify(metadata, null, 2));
    }
    catch (e) {
        console.error(e);
    }
}
checkMeta();
//# sourceMappingURL=check_cert_meta.js.map