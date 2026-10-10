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

// Files that live in object storage are answered first by redirecting to a signed
// link, so guards download them from the bucket and not through this server. A file
// is only redirected once its copy exists there; anything else falls through to the
// disk below, which is what lets videos move over one at a time.
const storageLookup = new Map<string, { found: boolean; until: number }>();
const FOUND_TTL_MS = 10 * 60 * 1000;
const MISSING_TTL_MS = 60 * 1000;
const MAX_LOOKUPS = 5000;

const isInStorage = async (uploadPath: string) => {
  const cached = storageLookup.get(uploadPath);
  if (cached && cached.until > Date.now()) return cached.found;

  const found = await objectExists(uploadPath);
  if (storageLookup.size >= MAX_LOOKUPS) storageLookup.clear();
  storageLookup.set(uploadPath, { found, until: Date.now() + (found ? FOUND_TTL_MS : MISSING_TTL_MS) });
  return found;
};

app.get('/uploads/{*filePath}', async (req, res, next) => {
  if (!isStorageConfigured) return next();
  try {
    const uploadPath = decodeURIComponent(req.path);
    if (!(await isInStorage(uploadPath))) return next();
    // Shorter than the signed link's lifetime, so a cached redirect never points at an expired one.
    res.set('Cache-Control', 'private, max-age=1800');
    return res.redirect(302, await signedUrlFor(uploadPath));
  } catch (error) {
    console.error('[Storage] Failed to serve object:', req.path, error);
    return next();
  }
});

// Uploaded files carry a unique name, so they can be cached hard. Without this
// every replay re-downloads the whole video.
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '365d',
  immutable: true,
}));

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
