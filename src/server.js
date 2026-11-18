import { env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { User } from './users/model/user.model.js';
import { runSeed } from './seed/seed.js';

const start = async () => {
  const { inMemory } = await connectDatabase();

  // The ephemeral in-memory database starts empty on every boot, so seed it automatically.
  if (inMemory && !(await User.exists({}))) {
    console.info('[seed] Empty local dev database — seeding instruments and demonstration data (first run only)...');
    await runSeed({ withDemo: true });
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.info(`[server] Athma API listening on http://localhost:${env.port}/api (${env.nodeEnv}${inMemory ? ', local dev DB' : ''})`);
  });
};

start().catch((error) => {
  console.error('[server] Failed to start:', error.message);
  process.exit(1);
});
