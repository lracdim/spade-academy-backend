import { db } from './db/index.js';
import { users } from './db/schema.js';
import { hashPassword } from './utils/auth.js';
async function seed() {
    console.log('Seeding database...');
    const adminPassword = await hashPassword('SpadeAdmin@2024');
    const guardPassword = await hashPassword('Guard@1234');
    try {
        // Admin account
        await db.insert(users).values({
            employeeId: 'admin',
            fullName: 'Spade Admin',
            password: await hashPassword('admiin1234!'),
            role: 'ADMIN',
        }).onConflictDoNothing();
        // Guard accounts
        await db.insert(users).values([
            {
                employeeId: 'GRD001',
                fullName: 'Juan dela Cruz',
                password: guardPassword,
                role: 'GUARD',
            },
            {
                employeeId: 'GRD002',
                fullName: 'Maria Santos',
                password: guardPassword,
                role: 'GUARD',
            }
        ]).onConflictDoNothing();
        console.log('Seeding completed successfully.');
    }
    catch (error) {
        console.error('Seeding failed:', error);
    }
    finally {
        process.exit();
    }
}
seed();
//# sourceMappingURL=seed.js.map