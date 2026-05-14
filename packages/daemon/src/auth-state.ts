import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';

export interface AuthStateHandle {
  state: Awaited<ReturnType<typeof useMultiFileAuthState>>['state'];
  saveCreds: () => Promise<void>;
}

export async function loadAuthState(rootDir: string, userId: string): Promise<AuthStateHandle> {
  const dir = join(rootDir, userId);
  await mkdir(dir, { recursive: true });
  return useMultiFileAuthState(dir);
}
