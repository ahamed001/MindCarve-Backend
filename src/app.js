import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import apiRoutes from './routes/index.route.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  // Number of proxies in front of the API (Render = 1; Vercel rewrite → Render = 2), so rate limits see the visitor's IP.
  if (env.isProduction || process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientUrls,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Responses never contain cacheable patient data.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
