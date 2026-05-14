import { eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { users } from '@yank/db/schema';

export async function ensureSingleUser(
  db: Db,
  userId: string,
  displayName = 'You',
): Promise<void> {
  const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (found[0]) return;
  await db.insert(users).values({ id: userId, displayName });
}
