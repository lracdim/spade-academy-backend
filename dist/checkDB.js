import { db } from './src/db/index.js';
import { questions } from './src/db/schema.js';
async function logQuestions() {
    const result = await db.select().from(questions);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
}
logQuestions();
//# sourceMappingURL=checkDB.js.map