import { pgTable, text, timestamp, boolean, uuid, integer, pgEnum, jsonb, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['ADMIN', 'GUARD']);
export const questionTypeEnum = pgEnum('question_type', ['MULTIPLE_CHOICE', 'TRUE_OR_FALSE']);

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: text('employee_id').notNull().unique(),
    fullName: text('full_name').notNull(),
    email: text('email').unique(),
    password: text('password').notNull(),
    role: roleEnum('role').default('GUARD').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const courses = pgTable('courses', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    thumbnail: text('thumbnail'),
    isPublished: boolean('is_published').default(false).notNull(),
    order: integer('order').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const modules = pgTable('modules', {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').references(() => courses.id).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    video: text('video'),
    duration: integer('duration').default(0).notNull(),
    order: integer('order').notNull(),
});

export const quizzes = pgTable('quizzes', {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id').references(() => modules.id).notNull().unique(),
    passMark: integer('pass_mark').default(70).notNull(),
});

export const questions = pgTable('questions', {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id').references(() => quizzes.id).notNull(),
    text: text('text').notNull(),
    type: questionTypeEnum('type').notNull(),
    options: jsonb('options').notNull(), // Array of { id, text, isCorrect }
    answerText: text('answer_text'), // General answer/explanation input
});

export const quizAttempts = pgTable('quiz_attempts', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    quizId: uuid('quiz_id').references(() => quizzes.id).notNull(),
    score: integer('score').notNull(),
    passed: boolean('passed').notNull(),
    answers: jsonb('answers').notNull(),
    attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
});

export const certificates = pgTable('certificates', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    courseId: uuid('course_id').references(() => courses.id).notNull(),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
    certCode: text('cert_code').notNull().unique(),
    imageUrl: text('image_url'),
}, (table) => ({
    unq: unique().on(table.userId, table.courseId),
}));


export const userModuleProgress = pgTable('user_module_progress', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    moduleId: uuid('module_id').references(() => modules.id).notNull(),
    videoWatched: boolean('video_watched').default(false).notNull(),
    lastPosition: integer('last_position').default(0).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    unq: unique().on(table.userId, table.moduleId),
}));

export const lessons = pgTable('lessons', {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id').references(() => modules.id).notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    order: integer('order').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    quizAttempts: many(quizAttempts),
    certificates: many(certificates),
    notifications: many(notifications),
    moduleProgress: many(userModuleProgress),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
    modules: many(modules),
    certificates: many(certificates),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
    course: one(courses, { fields: [modules.courseId], references: [courses.id] }),
    quiz: one(quizzes, { fields: [modules.id], references: [quizzes.moduleId] }),
    lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
    module: one(modules, { fields: [lessons.moduleId], references: [modules.id] }),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
    module: one(modules, { fields: [quizzes.moduleId], references: [modules.id] }),
    questions: many(questions),
    attempts: many(quizAttempts),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
    quiz: one(quizzes, { fields: [questions.quizId], references: [quizzes.id] }),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
    user: one(users, { fields: [quizAttempts.userId], references: [users.id] }),
    quiz: one(quizzes, { fields: [quizAttempts.quizId], references: [quizzes.id] }),
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
    user: one(users, { fields: [certificates.userId], references: [users.id] }),
    course: one(courses, { fields: [certificates.courseId], references: [courses.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
    user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const userModuleProgressRelations = relations(userModuleProgress, ({ one }) => ({
    user: one(users, { fields: [userModuleProgress.userId], references: [users.id] }),
    module: one(modules, { fields: [userModuleProgress.moduleId], references: [modules.id] }),
}));
