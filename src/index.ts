import { createApp } from './app';
import { assertProductionConfig, env } from './config/env';
import { initStorage } from './store/persist';
import { catalogueStore } from './store/catalogueStore';
import { settingsStore } from './store/settingsStore';
import { store } from './store/store';

async function bootstrap() {
  assertProductionConfig();

  // Connect persistence (Postgres or local files) and load saved state before
  // the server starts serving, so admin edits and history are already in place.
  await initStorage();
  await Promise.all([catalogueStore.hydrate(), settingsStore.hydrate(), store.hydrate()]);

  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '  Skyra Data backend',
        `  ▸ listening        http://localhost:${env.port}`,
        `  ▸ environment      ${env.nodeEnv}`,
        `  ▸ payment provider ${env.paymentProvider}`,
        `  ▸ telecom provider ${env.telecomProvider}`,
        `  ▸ admin            http://localhost:${env.port}/admin`,
        `  ▸ health           http://localhost:${env.port}/health`,
        '',
      ].join('\n'),
    );
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[Skyra] Failed to start:', err);
  process.exit(1);
});
