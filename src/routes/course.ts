import { Router } from 'express';
import { getCourses, createCourse, updateCourse, deleteCourse } from '../controllers/course.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, roleMiddleware(['ADMIN', 'GUARD']), getCourses);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), createCourse);
router.patch('/:id', authMiddleware, roleMiddleware(['ADMIN']), updateCourse);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteCourse);

export default router;
