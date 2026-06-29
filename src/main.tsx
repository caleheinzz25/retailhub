import "./styles.css";
import {
	createHashHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { routeTree } from "./routeTree.gen";

const hashHistory = createHashHistory();

const router = createRouter({
	routeTree,
	history: hashHistory,
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
	scrollRestoration: true,
});

declare module "@tanstack/solid-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (rootElement) {
	render(() => <RouterProvider router={router} />, rootElement);
}
