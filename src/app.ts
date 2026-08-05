import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { networksRouter } from './routes/networks';
import { ordersRouter } from './routes/orders';
import { paymentsRouter } from './routes/payments';
import { authRouter, meRouter } from './routes/auth';
import { supportRouter } from './routes/support';
import { webhooksRouter } from './routes/webhooks';
import { ussdRouter } from './routes/ussd';
import { adminRouter } from './routes/admin';
import { paymentProvider } from './providers/payment';
import { settingsStore } from './store/settingsStore';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // CSP disabled so the self-contained admin dashboard (inline styles/scripts)
  // can be served from /admin. The customer API is JSON-only.
  app.use(helmet({ contentSecurityPolicy: false }));

  const origins =
    env.corsOrigins === '*' ? true : env.corsOrigins.split(',').map((o) => o.trim());
  app.use(cors({ origin: origins }));

  if (!env.isProduction) app.use(morgan('dev'));

  // Webhooks need the raw body for signature verification, so they are mounted
  // BEFORE the JSON parser with their own raw parser.
  app.use('/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhooksRouter);

  // JSON for everything else. USSD gateways post form-encoded bodies, so accept
  // those too (used by the /ussd endpoint).
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Baseline rate limit across the API.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many requests. Please slow down.' },
    }),
  );

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'skyra-data-backend',
      env: env.nodeEnv,
      paymentProvider: env.paymentProvider,
      telecomProvider: env.telecomProvider,
      time: new Date().toISOString(),
    });
  });

  // Public runtime config the app reads on launch. The backend is the source of
  // truth for which payment rails are enabled (e.g. Airtime), so the app never
  // hard-codes them.
  app.get('/config', (_req, res) => {
    res.json({
      currency: 'GHS',
      paymentMethods: paymentProvider.methods,
      ussdShortCode: settingsStore.get().ussdShortCode,
    });
  });

  // API routes
  app.use('/networks', networksRouter);
  app.use('/orders', ordersRouter);
  app.use('/payments', paymentsRouter);
  app.use('/auth', authRouter);
  app.use('/me', meRouter);
  app.use('/support', supportRouter);
  app.use('/ussd', ussdRouter);
  app.use('/admin/api', adminRouter);

  // Self-contained admin dashboard (static). API is mounted above so /admin/api
  // is matched first. Reached at http://localhost:PORT/admin
  const adminDir = path.join(process.cwd(), 'public', 'admin');
  app.use('/admin', express.static(adminDir));
  app.get('/admin', (_req, res) => res.sendFile(path.join(adminDir, 'index.html')));

  // 404 + error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
