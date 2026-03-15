import { Router } from 'express';
import { getModulesByCourse, createModule, updateModule, deleteModule, getModuleQuiz, submitModuleQuiz, updateModuleQuiz } from '../controllers/module.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const router = Router({ mergeParams: true }); // Important: mergeParams to access courseId

router.get('/', authMiddleware, roleMiddleware(['ADMIN', 'GUARD']), getModulesByCourse);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), createModule);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), updateModule);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteModule);
router.get('/:id/quiz', authMiddleware, roleMiddleware(['ADMIN', 'GUARD']), getModuleQuiz);
router.post('/:id/quiz/submit', authMiddleware, roleMiddleware(['GUARD']), submitModuleQuiz);
router.put('/:id/quiz', authMiddleware, roleMiddleware(['ADMIN']), updateModuleQuiz);

export default router;
