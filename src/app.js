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
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientUrl.split(',').map((o) => o.trim()),
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
