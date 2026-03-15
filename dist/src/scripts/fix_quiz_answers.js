import { db } from '../db/index.js';
import { questions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
async function fixQuizzes() {
    console.log('Starting quiz fix script...');
    const allQuestions = await db.select().from(questions);
    for (const q of allQuestions) {
        if (!q.answerText)
            continue;
        const ans = q.answerText.trim().toUpperCase();
        let targetIndex = -1;
        if (ans === 'TRUE' || ans === 'A') {
            targetIndex = 0;
        }
        else if (ans === 'FALSE' || ans === 'B') {
            targetIndex = 1;
        }
        else if (ans === 'C') {
            targetIndex = 2;
        }
        else if (ans === 'D') {
            targetIndex = 3;
        }
        if (targetIndex !== -1 && Array.isArray(q.options)) {
            const currentOptions = JSON.parse(JSON.stringify(q.options));
            // Only fix if there's actually a discrepancy (maybe they created a new one perfectly)
            // But actually let's just force the targetIndex to be the only true one.
            let changed = false;
            for (let i = 0; i < currentOptions.length; i++) {
                if (i === targetIndex) {
                    if (!currentOptions[i].isCorrect)
                        changed = true;
                    currentOptions[i].isCorrect = true;
                }
                else {
                    if (currentOptions[i].isCorrect)
                        changed = true;
                    currentOptions[i].isCorrect = false;
                }
            }
            if (changed) {
                console.log(`Fixing question: \${q.text.substring(0, 30)}... setting option \${targetIndex} as correct based on explanation '\${q.answerText}'`);
                await db.update(questions)
                    .set({ options: currentOptions })
                    .where(eq(questions.id, q.id));
            }
        }
    }
    console.log('Done fixing quizzes.');
    process.exit(0);
}
fixQuizzes().catch(e => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=fix_quiz_answers.js.map