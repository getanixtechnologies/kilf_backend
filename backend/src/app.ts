import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { swaggerSpec } from './config/swagger';
import { generalLimiter } from './middleware/rateLimiters';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import adminRoutes from './routes/admin';
import publicRoutes from './routes/public';
import webhookRoutes from './routes/webhook.routes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: [env.FRONTEND_URL, env.ADMIN_URL],
      credentials: true,
    })
  );
  app.use(compression());
  app.use(
    express.json({
      limit: '2mb',
      // Capture the exact raw bytes alongside the parsed body: webhook
      // signature verification (Razorpay et al.) must HMAC the untouched
      // request bytes, not a re-serialization of req.body, which can differ
      // in key order/whitespace and would make every signature check fail.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));
  app.use(generalLimiter);

  app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));

  app.get('/health', (_req, res) => {
    res.json({ success: true, message: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  app.use('/api/admin', adminRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api', publicRoutes);

  // Optional single-port mode: if the admin panel has been built into
  // backend/public (see admin-panel's `build:embedded` script), serve it
  // from the same Express server/port as the API. Requests under /api/*
  // that don't match a route above still fall through to the JSON 404
  // handler below instead of returning the SPA's index.html.
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(path.join(publicDir, 'index.html'))) {
    app.use(express.static(publicDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
