import { pgTable, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// --- CORE ---
export const users = pgTable("users", {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    password: text("password"),
    role: text("role").default("user"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const securityGuards = pgTable("security_guards", {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
    badgeNumber: text("badge_number"),
    licenseNumber: text("license_number"),
    licenseExpiry: timestamp("license_expiry"),
    phoneNumber: text("phone_number"),
    address: text("address"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// --- CONTENT ---
export const courses = pgTable("courses", {
    id: varchar("id", { length: 255 }).primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    thumbnail: text("thumbnail"),
    status: text("status").default("draft"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const modules = pgTable("modules", {
    id: varchar("id", { length: 255 }).primaryKey(),
    courseId: varchar("course_id", { length: 255 }).notNull().references(() => courses.id),
    title: text("title").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
});

export const lessons = pgTable("lessons", {
    id: varchar("id", { length: 255 }).primaryKey(),
    moduleId: varchar("module_id", { length: 255 }).notNull().references(() => modules.id),
    title: text("title").notNull(),
    description: text("description"),
    videoUrl: text("video_url"),
    youtubeId: text("youtube_id"),
    duration: text("duration"),
    orderIndex: integer("order_index").default(0),
    hasQuiz: boolean("has_quiz").default(false),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- QUIZZES ---
export const quizzes = pgTable("quizzes", {
    id: varchar("id", { length: 255 }).primaryKey(),
    lessonId: varchar("lesson_id", { length: 255 }).notNull().references(() => lessons.id),
    question: text("question").notNull(),
    correctAnswer: text("correct_answer"),
    orderIndex: integer("order_index").default(0),
    timestampSeconds: text("timestamp_seconds"),
    quizType: text("quiz_type"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const quizOptions = pgTable("quiz_options", {
    id: varchar("id", { length: 255 }).primaryKey(),
    quizId: varchar("quiz_id", { length: 255 }).notNull().references(() => quizzes.id),
    optionText: text("option_text").notNull(),
    orderIndex: integer("order_index").default(0),
    isCorrect: boolean("is_correct").default(false),
});

export const quizResults = pgTable("quiz_results", {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
    quizId: varchar("quiz_id", { length: 255 }).notNull().references(() => quizzes.id),
    userAnswer: text("user_answer"),
    isCorrect: boolean("is_correct"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const quizScores = pgTable("quiz_scores", {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
    lessonId: varchar("lesson_id", { length: 255 }).notNull().references(() => lessons.id),
    score: integer("score").notNull(),
    totalQuestions: integer("total_questions").notNull(),
    correctAnswers: integer("correct_answers").notNull(),
    passed: boolean("passed").default(false),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- TRACKING ---
export const userProgress = pgTable("user_progress", {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
    lessonId: varchar("lesson_id", { length: 255 }).notNull().references(() => lessons.id),
    completed: boolean("completed").default(false),
    completedAt: timestamp("completed_at"),
    watchTime: text("watch_time"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const certificates = pgTable("certificates", {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
    courseId: varchar("course_id", { length: 255 }).notNull().references(() => courses.id),
    certificateUrl: text("certificate_url"),
    issuedAt: timestamp("issued_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- UTILS / OTHER ---
export const todos = pgTable("todos", {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
    task: text("task").notNull(),
    completed: boolean("completed").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const callieSignals = pgTable("callie_signals", {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
    signalType: text("signal_type").notNull(),
    payload: text("payload"),
    isRead: boolean("is_read").default(false),
    createdAt: timestamp("created_at").defaultNow(),
});

export const roles = pgTable("roles", {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: text("name").notNull().unique(),
    permissions: text("permissions"), // JSON string
    createdAt: timestamp("created_at").defaultNow(),
});
