import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Db = PostgresJsDatabase<typeof schema>;

export interface CreateDbOptions {
  url: string;
  max?: number;
}

export function createDb({ url, max = 10 }: CreateDbOptions): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max });
  const db = drizzle(client, { schema });
  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

export * as schema from './schema/index.js';
