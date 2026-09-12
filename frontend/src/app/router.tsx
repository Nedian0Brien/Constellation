import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { parseSearch } from "./navigation";
import App from "../App";
const root = createRootRoute({ component: () => <Outlet /> });
const index = createRoute({
  getParentRoute: () => root,
  path: "/",
  validateSearch: parseSearch,
  component: App,
});
export const router = createRouter({
  routeTree: root.addChildren([index]),
  defaultPreload: "intent",
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
