/**
 * Points each course at the certificate template shipped in public/templates.
 * Run once per environment:  npx tsx src/scripts/assignCertificateTemplates.ts
 */
import { db } from '../db/index.js';
import { courses } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/** First matching pattern wins, so keep the more specific ones first. */
const TEMPLATE_RULES: { template: string; matches: RegExp }[] = [
    { template: '/templates/sb553.png', matches: /\b(sb\s*553|workplace violence)\b/i },
    { template: '/templates/sb396.png', matches: /\b(sb\s*396|sexual harassment)\b/i },
    { template: '/templates/bsis-mandatory.png', matches: /\b(bsis|mandatory|7583)\b/i },
];

async function main() {
    const allCourses = await db.select({ id: courses.id, title: courses.title }).from(courses);
    if (allCourses.length === 0) {
        console.log('No courses found.');
        return;
    }

    for (const course of allCourses) {
        const rule = TEMPLATE_RULES.find((r) => r.matches.test(course.title));
        if (!rule) {
            console.log(`SKIP  ${course.title} — no template rule matched`);
            continue;
        }
        await db
            .update(courses)
            .set({ certificateTemplate: rule.template })
            .where(eq(courses.id, course.id));
        console.log(`SET   ${course.title} -> ${rule.template}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
