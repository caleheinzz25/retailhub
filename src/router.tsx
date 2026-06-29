import {
	createHashHistory,
	createRouter as createTanStackRouter,
} from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const hashHistory = createHashHistory();
	const router = createTanStackRouter({
		routeTree,
		history: hashHistory,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});

	return router;
}

declare module "@tanstack/solid-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
