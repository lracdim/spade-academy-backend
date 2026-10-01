import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, getGuardProfile } from '../controllers/user.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, roleMiddleware(['ADMIN']), getUsers);
router.get('/:id/profile', authMiddleware, roleMiddleware(['ADMIN']), getGuardProfile);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), createUser);
router.patch('/:id', authMiddleware, roleMiddleware(['ADMIN']), updateUser);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteUser);

export default router;
