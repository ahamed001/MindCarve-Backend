import { env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { User } from './users/model/user.model.js';
import { runSeed, syncSeedInstruments } from './seed/seed.js';

const start = async () => {
  const { inMemory } = await connectDatabase();

  // The ephemeral in-memory database starts empty on every boot, so seed it automatically.
  if (inMemory && !(await User.exists({}))) {
    console.info('[seed] Empty local dev database — seeding instruments and demonstration data (first run only)...');
    await runSeed({ withDemo: true });
  } else if (!env.isProduction) {
    // Keep the built-in instruments' scoring configuration in sync with the code (publishes a new version if changed).
    const changes = (await syncSeedInstruments()).filter((l) => !l.endsWith('up to date'));
    changes.forEach((l) => console.info(`[seed] ${l}`));
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
