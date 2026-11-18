import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const connectDatabase = async (uriOverride) => {
  let uri = uriOverride || env.mongoUri;

  if (!uri && env.useInMemoryDb && !env.isProduction) {
    // Development-only local MongoDB (no install needed). By default it stores its data on disk in
    // DEV_DB_PATH (".dev-db"), so data and logins survive restarts. Set DEV_DB_PATH=memory for a
    // throwaway database that is wiped on every restart.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const devDbPath = process.env.DEV_DB_PATH || '.dev-db';
    if (devDbPath === 'memory') {
      memoryServer = await MongoMemoryServer.create();
      console.warn('[db] Using a THROWAWAY in-memory MongoDB — all data is lost when the server stops.');
    } else {
      const dbPath = path.resolve(BACKEND_ROOT, devDbPath);
      fs.mkdirSync(dbPath, { recursive: true });
      memoryServer = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger' } });
      console.info(`[db] Using local development MongoDB stored in ${dbPath} (data persists across restarts).`);
    }
    uri = memoryServer.getUri('athma');
  }

  if (!uri) {
    throw new Error('MONGO_URI is not set. Add your MongoDB Atlas connection string to .env');
  }

  mongoose.set('strictQuery', true);
  // dbName applies only to real connections (the local dev URI already names its database).
  await mongoose.connect(uri, memoryServer || uriOverride ? {} : { dbName: env.dbName });
  return { inMemory: Boolean(memoryServer) };
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop({ doCleanup: false });
    memoryServer = null;
  }
};
