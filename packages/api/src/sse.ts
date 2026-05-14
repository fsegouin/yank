import type { FastifyReply } from 'fastify';
import type { DaemonEvent } from '@yank/shared';

export function writeSseHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write(': connected\n\n');
}

export function writeSseEvent(reply: FastifyReply, evt: DaemonEvent): void {
  reply.raw.write(`event: ${evt.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(evt)}\n\n`);
}

export function writeSseHeartbeat(reply: FastifyReply): void {
  reply.raw.write(': ping\n\n');
}
