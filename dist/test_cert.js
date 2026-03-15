import { db } from './src/db/index.js';
import { users, courses, certificates } from './src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateCertificateLogic } from './src/controllers/certificate.js';
async function test() {
    console.log('--- MANUAL CERTIFICATE GENERATION TEST ---');
    try {
        const [user] = await db.select().from(users).where(eq(users.fullName, 'JC Dimatulac')).limit(1);
        const [course] = await db.select().from(courses).limit(1);
        if (!user || !course) {
            console.error('User or Course not found in DB');
            process.exit(1);
        }
        console.log('User ID:', user.id);
        console.log('Course ID:', course.id);
        console.log('Attempting generation...');
        await generateCertificateLogic(user.id, course.id);
        console.log('SUCCESS: Logic executed without throwing.');
        const [cert] = await db.select().from(certificates).where(and(eq(certificates.userId, user.id), eq(certificates.courseId, course.id))).limit(1);
        if (cert) {
            console.log('CERTIFICATE CREATED IN DB:', cert.certCode);
            console.log('IMAGE URL:', cert.imageUrl);
        }
        else {
            console.log('FAILURE: Certificate not found in DB after generation call.');
        }
    }
    catch (err) {
        console.error('TEST FAILED WITH ERROR:');
        console.error(err);
    }
    finally {
        process.exit(0);
    }
}
test();
//# sourceMappingURL=test_cert.js.map