import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres URL',
    }),
  REDIS_URL: z.string().url().startsWith('redis://'),
  YANK_USER_ID: z.string().uuid({ message: 'YANK_USER_ID must be a UUID v4 or v7' }),
  YANK_PHONE_NUMBER: z
    .string()
    .regex(/^\d{6,15}$/, { message: 'YANK_PHONE_NUMBER must be digits only (6-15 digits)' })
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
