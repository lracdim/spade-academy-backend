import { Router } from 'express';
import { getModulesByCourse, createModule, updateModule, deleteModule, getModuleQuiz, submitModuleQuiz, updateModuleQuiz, getLessonsByModule, createLesson, updateLesson, deleteLesson, completeLesson } from '../controllers/module.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const router = Router({ mergeParams: true }); // Important: mergeParams to access courseId

router.get('/', authMiddleware, roleMiddleware(['ADMIN', 'GUARD']), getModulesByCourse);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), createModule);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), updateModule);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteModule);
router.get('/:id/quiz', authMiddleware, roleMiddleware(['ADMIN', 'GUARD']), getModuleQuiz);
router.post('/:id/quiz/submit', authMiddleware, roleMiddleware(['GUARD']), submitModuleQuiz);
router.put('/:id/quiz', authMiddleware, roleMiddleware(['ADMIN']), updateModuleQuiz);
router.get('/:moduleId/lessons', authMiddleware, roleMiddleware(['ADMIN', 'GUARD']), getLessonsByModule);
router.post('/:moduleId/lessons', authMiddleware, roleMiddleware(['ADMIN']), createLesson);
router.put('/:moduleId/lessons/:lessonId', authMiddleware, roleMiddleware(['ADMIN']), updateLesson);
router.delete('/:moduleId/lessons/:lessonId', authMiddleware, roleMiddleware(['ADMIN']), deleteLesson);
router.post('/lessons/:lessonId/complete', authMiddleware, roleMiddleware(['GUARD']), completeLesson);

export default router;
