import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { whatsappSessions } from '@yank/db/schema';
import type { CommandsBus } from '../commands-bus.js';

export interface SetupDeps {
  db: Db;
  userId: string;
  commands: CommandsBus;
}

export function registerSetupRoutes(app: FastifyInstance, deps: SetupDeps): void {
  app.post('/api/setup/link', async (req) => {
    const body = (req.body ?? {}) as { method?: 'qr' | 'code' };
    const method = body.method ?? 'code';
    await deps.commands.publish({ type: 'pair', userId: deps.userId, method });
    return { ok: true, method };
  });

  app.get('/api/setup/status', async () => {
    const row = await deps.db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.userId, deps.userId))
      .limit(1);
    if (!row[0]) {
      return { status: 'unlinked' as const };
    }
    return {
      status: row[0].status,
      jid: row[0].jid,
      phone: row[0].phoneNumber,
      lastConnectedAt: row[0].lastConnectedAt,
    };
  });
}
