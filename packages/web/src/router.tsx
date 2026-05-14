import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { Home, ChatRoute } from './routes/home.js';
import { Setup } from './routes/setup.js';

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const home = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });
const chat = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$chatId',
  component: ChatRoute,
});
const setup = createRoute({ getParentRoute: () => rootRoute, path: '/setup', component: Setup });

const tree = rootRoute.addChildren([home, chat, setup]);
export const router = createRouter({ routeTree: tree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
