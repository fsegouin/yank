import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { z } from 'zod';

// Resolve a writable default for YANK_MEDIA_DIR. The Node built-ins are
// imported as namespaces — Vite externalises `node:*` modules for the browser
// bundle, and a namespace import remains compatible with the browser stub
// because the property accesses below are not evaluated until `loadEnv` runs.
// `loadEnv` itself is never called from the web package.
function defaultMediaDir(): string {
  return nodePath.join(nodeOs.tmpdir(), 'yank-media');
}

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres URL',
    }),
  REDIS_URL: z.string().url().startsWith('redis://'),
  YANK_USER_ID: z.string().uuid({ message: 'YANK_USER_ID must be a UUID v4 or v7' }),
  YANK_MEDIA_DIR: z.string().default(() => defaultMediaDir()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
