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
import { isStorageConfigured, objectExists, signedUrlFor } from './utils/storage.js';

const app = express();
const port: number = Number(PORT) || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = [
  'https://academy.spadesecurityservices.com',
  'https://spade-academy-frontend.vercel.app',
  'https://spade-academy-frontend-production.up.railway.app',
  'https://spade-academy-backend-production.up.railway.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const corsOptions = {
  origin: allowedOrigins,
  credentials: true
};

app.use(cors(corsOptions));

// ✅ Fixed: use '/{*path}' instead of '*'
app.options('/{*path}', cors(corsOptions));

app.use(express.json());
// Uploaded files carry a unique name, so they can be cached hard. Without this
// every replay re-downloads the whole video.
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '365d',
  immutable: true,
}));

// Files served from object storage. express.static above still answers for anything
// left on disk, so URLs issued before the bucket existed keep working.
app.get('/uploads/{*filePath}', async (req, res, next) => {
  if (!isStorageConfigured) return next();
  const uploadPath = decodeURIComponent(req.path);
  try {
    if (!(await objectExists(uploadPath))) return next();
    return res.redirect(await signedUrlFor(uploadPath));
  } catch (error) {
    console.error('[Storage] Failed to serve object:', uploadPath, error);
    return next();
  }
});

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

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
