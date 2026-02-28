import { Router } from "express";
import * as authController from "../controllers/authController.js";
import * as courseController from "../controllers/courseController.js";
import * as progressController from "../controllers/progressController.js";
import * as dashboardController from "../controllers/dashboardController.js";
import * as guardController from "../controllers/guardController.js";
import * as quizController from "../controllers/quizController.js";
import * as utilityController from "../controllers/utilityController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// Public routes
router.post("/auth/login", authController.login);

// Protected routes
router.use(authenticateToken as any);

router.get("/auth/me", authController.getMe);

// Dashboard
router.get("/dashboard/guard", dashboardController.getGuardDashboard);
router.get("/dashboard/stats", dashboardController.getAdminStats);

// Courses & Lessons
router.get("/courses", courseController.getCourses);
router.get("/courses/:id", courseController.getCourse);
router.get("/lessons/:id", courseController.getLesson);

// Quizzes
router.get("/lessons/:lessonId/quizzes", quizController.getLessonQuizzes);
router.post("/quizzes/submit", progressController.submitQuiz);

// Progress
router.get("/progress", progressController.getProgress);
router.post("/progress", progressController.updateProgress);

// Guards
router.get("/guards", guardController.getGuards);
router.get("/guards/:userId/profile", guardController.getGuardProfile);
router.post("/guards/:userId/profile", guardController.updateGuardProfile);

// Utils
router.get("/todos", utilityController.getTodos);
router.post("/todos", utilityController.createTodo);
router.get("/signals", utilityController.getSignals);

export default router;
