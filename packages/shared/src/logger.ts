import pino, { type Logger } from 'pino';

export interface LoggerOptions {
  service: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({ service, level = 'info', pretty }: LoggerOptions): Logger {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        }
      : undefined,
  });
}

export type { Logger };
