import dotenv from 'dotenv';

dotenv.config();

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT || 5000),
  // DATABASE_URL / DATABASE_NAME / FRONTEND_URL are accepted as aliases (team naming).
  mongoUri: process.env.MONGO_URI || process.env.DATABASE_URL || '',
  dbName: process.env.DATABASE_NAME || process.env.MONGO_DB_NAME || undefined,
  useInMemoryDb: process.env.USE_IN_MEMORY_DB === 'true',
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientUrl: process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
  invitationTtlHours: Number(process.env.INVITATION_TTL_HOURS || 72),
  resetTtlMinutes: Number(process.env.RESET_TTL_MINUTES || 30),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Athma Mind Care Hospital <no-reply@athma.local>',
  },
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@athma.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    name: process.env.SEED_ADMIN_NAME || 'Athma Admin',
  },
  seedPatient: {
    email: process.env.SEED_PATIENT_EMAIL || '',
    password: process.env.SEED_PATIENT_PASSWORD || '',
    name: process.env.SEED_PATIENT_NAME || 'Test Patient',
  },
};

if (isProduction && env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
