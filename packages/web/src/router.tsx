import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
