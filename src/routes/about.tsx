import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/about")({ component: About });

function About() {
	return (
		<div class="space-y-8 max-w-2xl mx-auto py-10">
			<div class="space-y-4">
				<h1 class="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
					About RetailHub
				</h1>
				<p class="text-zinc-400 text-lg leading-relaxed">
					RetailHub is a desktop management application designed with speed,
					styling, and flexibility in mind. By integrating Tauri with TanStack
					Router, we get the best of both worlds: high-performance native OS
					integration and bulletproof client-side routing.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 space-y-2">
					<h2 class="text-lg font-bold text-indigo-400">Tauri Integration</h2>
					<p class="text-sm text-zinc-500 leading-relaxed">
						Runs as a lightweight native binary on Linux, macOS, and Windows.
						Uses the system's webview to achieve an extremely low memory
						footprint.
					</p>
				</div>

				<div class="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-6 space-y-2">
					<h2 class="text-lg font-bold text-purple-400">TanStack Router</h2>
					<p class="text-sm text-zinc-500 leading-relaxed">
						Provides fully type-safe, performant client-side routing with hash
						history support, ensuring smooth page transitions inside desktop
						windows.
					</p>
				</div>
			</div>
		</div>
	);
}
