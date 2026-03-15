import './config.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import courseRoutes from './routes/course.js';
import moduleRoutes from './routes/module.js';
import userRoutes from './routes/user.js';
import uploadRoutes from './routes/upload.js';
import notificationRoutes from './routes/notification.js';
import quizRoutes from './routes/quiz.js';
import progressRoutes from './routes/progress.js';
import certificateRoutes from './routes/certificate.js';

import { PORT } from './config.js';

const app = express();
const port: number = Number(PORT) || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ CORS
app.use(cors({
  origin: [
    'https://academy.spadesecurityservices.com', // ← ADD THIS
    'https://spade-academy-frontend-production.up.railway.app',
    'https://spade-academy-backend-production.up.railway.app',
    'http://localhost:5173'
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/courses', courseRoutes);
app.use('/api/admin/courses/:courseId/modules', moduleRoutes);
app.use('/api/admin/modules', moduleRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/certificates', certificateRoutes);

app.get('/', (req, res) => {
    res.send('Spade Academy LMS API');
});

// ✅ Bind to 0.0.0.0 — required for Railway
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});