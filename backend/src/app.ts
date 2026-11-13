import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isProd } from './lib/env';
import { prisma } from './lib/prisma';
import { errorHandler, HttpError } from './lib/errors';
import { requireAuth } from './middleware/auth';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import productRoutes from './routes/products';
import fileRoutes from './routes/files';
import settingsRoutes from './routes/settings';
import auditRoutes from './routes/audit';
import { areaRouter, branchRouter, employeeRouter, vendorRouter } from './routes/master';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // di belakang Nginx
  app.disable('x-powered-by');
  app.use(helmet());
  if (env.CORS_ORIGIN) app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan(isProd ? 'combined' : 'dev'));

  // Proteksi CSRF sederhana: request yang mengubah data wajib JSON / multipart
  // (form HTML lintas situs tidak bisa mengirim content-type ini tanpa preflight CORS).
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const ct = req.headers['content-type'] ?? '';
      const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'];
      if (hasBody && !ct.includes('application/json') && !ct.includes('multipart/form-data')) {
        return next(new HttpError(415, 'Content-Type harus application/json'));
      }
    }
    next();
  });

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);

  // Semua route di bawah ini wajib login.
  app.use('/api', requireAuth);
  app.use('/api/users', userRoutes);
  app.use('/api/areas', areaRouter);
  app.use('/api/branches', branchRouter);
  app.use('/api/vendors', vendorRouter);
  app.use('/api/employees', employeeRouter);
  app.use('/api/products', productRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/company-settings', settingsRoutes);
  app.use('/api/audit-logs', auditRoutes);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint tidak ditemukan')));
  app.use(errorHandler);
  return app;
}
