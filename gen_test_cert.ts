
import { generateCertificate } from './src/controllers/certificate.js';
import { db } from './src/db/index.js';
import { users, courses } from './src/db/schema.js';

async function generateTestCert() {
    console.log('[Test] Starting generation...');
    try {
        const [user] = await db.select().from(users).limit(1);
        const [course] = await db.select().from(courses).limit(1);
        
        if (!user || !course) {
            console.error('[Error] No user or course found in database.');
            return;
        }

        const certCode = `CERT-TEST-${Date.now().toString().slice(-6)}`;
        console.log(`[Test] Generating for: ${user.fullName}`);
        console.log(`[Test] Course: ${course.title}`);
        console.log(`[Test] Code: ${certCode}`);

        await generateCertificate({
            recipientName: user.fullName,
            courseTitle: course.title,
            date: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            verificationUrl: `http://localhost:5173/verify-certificate/${certCode}`,
            certificateNumber: certCode,
            userId: user.id,
            courseId: course.id
        });
        
        console.log(`[Success] Certificate generated: public/uploads/certificates/${certCode}.png`);
    } catch (err) {
        console.error('[Test Failed]', err);
    }
}

generateTestCert();
