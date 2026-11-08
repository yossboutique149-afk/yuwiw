import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { db, seed, UPLOAD_DIR, AUDIO_DIR, NOTIFICATION_CATEGORIES } from './db';
import { attachUser } from './auth';
import { getVapid } from './notify';
import { aiConfig } from './routes/ai';
import authRoutes from './routes/auth';
import socialRoutes from './routes/social';
import messageRoutes from './routes/messages';
import yumeRoutes from './routes/yume';
import contentRoutes from './routes/content';
import musicRoutes from './routes/music';
import studioRoutes from './routes/studio';
import aiRoutes from './routes/ai';
import notificationRoutes from './routes/notifications';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

seed();
getVapid();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));
app.use('/audio', express.static(AUDIO_DIR, { maxAge: '1h' }));

app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'YumEra: Eternal Universe',
    time: new Date().toISOString(),
    database: 'sqlite',
    notifications: { categories: NOTIFICATION_CATEGORIES, push: Boolean(getVapid().publicKey) },
    ai: { configured: aiConfig().configured },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', socialRoutes);
app.use('/api', messageRoutes);
app.use('/api', yumeRoutes);
app.use('/api', contentRoutes);
app.use('/api', musicRoutes);
app.use('/api', studioRoutes);
app.use('/api', aiRoutes);
app.use('/api', notificationRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'endpoint_not_found' });
});

// Static client (built by Vite) with SPA fallback.
const clientDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('YumEra API is running. Build the client with "npm run build" to serve the app.');
  });
}

app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[yumera]', err.message);
  res.status(status).json({ error: status === 500 ? 'internal_error' : err.message });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[yumera] listening on 0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
