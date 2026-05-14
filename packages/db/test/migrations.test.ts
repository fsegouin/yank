import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { users, chats, chatAssignments, messages } from '../src/schema/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', 'drizzle');

describe('migrations', () => {
  let pg: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 1 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await pg?.stop();
  });

  it('creates the users table and accepts a row', async () => {
    await db.insert(users).values({
      id: '0193fe00-0000-7000-8000-000000000001',
      displayName: 'Florent',
    });
    const got = await db.select().from(users);
    expect(got).toHaveLength(1);
    expect(got[0]?.displayName).toBe('Florent');
  });

  it('inserts a chat and an assignment', async () => {
    await db.insert(chats).values({
      id: '0193fe00-0000-7000-8000-000000000010',
      userId: '0193fe00-0000-7000-8000-000000000001',
      jid: '15555550100@s.whatsapp.net',
      type: 'dm',
    });
    await db.insert(chatAssignments).values({
      chatId: '0193fe00-0000-7000-8000-000000000010',
      workspace: 'triage',
    });
    const got = await db.select().from(chatAssignments);
    expect(got).toHaveLength(1);
    expect(got[0]?.workspace).toBe('triage');
  });

  it('inserts a message and finds it via FTS', async () => {
    await db.insert(messages).values({
      id: '0193fe00-0000-7000-8000-000000000020',
      userId: '0193fe00-0000-7000-8000-000000000001',
      chatId: '0193fe00-0000-7000-8000-000000000010',
      senderJid: '15555550100@s.whatsapp.net',
      ts: new Date(),
      kind: 'text',
      text: 'hello taut world from yank',
      status: 'sent',
    });

    const rows = await db.execute<{ id: string }>(
      sql`SELECT id FROM messages WHERE text_tsv @@ plainto_tsquery('english', 'yank')`,
    );
    expect(rows).toHaveLength(1);
  });

  it('finds messages with trigram fuzzy match', async () => {
    const rows = await db.execute<{ id: string }>(
      sql`SELECT id FROM messages WHERE 'yankk' <% text`, // intentional typo — word_similarity operator
    );
    // pg_trgm word_similarity: "yankk" matches the word "yank" inside the message text
    expect(rows.length).toBeGreaterThan(0);
  });
});
