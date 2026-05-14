import type { FastifyInstance } from 'fastify';
import type { EventsBus } from '../events-bus.js';
import { writeSseEvent, writeSseHeaders, writeSseHeartbeat } from '../sse.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerEventsRoute(app: FastifyInstance<any, any, any, any>, deps: { bus: EventsBus }): void {
  app.get('/api/events', async (req, reply) => {
    writeSseHeaders(reply);
    const detach = deps.bus.attach((e) => writeSseEvent(reply, e));
    const heartbeat = setInterval(() => writeSseHeartbeat(reply), 15_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      detach();
    });

    await new Promise<void>(() => {});
  });
}
