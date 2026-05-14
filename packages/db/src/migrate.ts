import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadEnv, createLogger } from '@yank/shared';

const env = loadEnv();
const log = createLogger({ service: 'migrate', level: env.LOG_LEVEL, pretty: env.NODE_ENV !== 'production' });

const client = postgres(env.DATABASE_URL, { max: 1 });

try {
  log.info('applying migrations');
  await migrate(drizzle(client), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  log.info('migrations complete');
} catch (err) {
  log.error({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await client.end();
}
