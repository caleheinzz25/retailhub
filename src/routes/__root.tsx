import {
	createRootRoute,
	Link,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { createEffect, createSignal, onMount, Show } from "solid-js";
import {
	type ActiveUser,
	clearSessionUser,
	getSessionUser,
	verifySession,
} from "../utils/db";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	const navigate = useNavigate();
	const location = useLocation();
	const [currentUser, setCurrentUser] = createSignal<ActiveUser | null>(
		getSessionUser(),
	);

	// Verify session authenticity on mount (crypto signature & 7-day expiration check)
	onMount(async () => {
		const verified = await verifySession();
		setCurrentUser(verified);
	});

	// Custom event listener to update root session state upon login
	const handleLoginSuccess = () => {
		setCurrentUser(getSessionUser());
	};

	window.addEventListener("retailhub-login-success", handleLoginSuccess);

	// Navigation Guards
	createEffect(() => {
		const user = currentUser();
		const path = location.pathname;

		if (!user && path !== "/login") {
			setTimeout(() => navigate({ to: "/login" }), 0);
		} else if (
			user &&
			user.role === "kasir" &&
			(path === "/reports" || path === "/users")
		) {
			// Kasir cannot access reports or users management
			setTimeout(() => navigate({ to: "/" }), 0);
		}
	});

	const isLoginPage = () => location.pathname === "/login";

	// Global Barcode Scanning simulation state
	const [isScanning, setIsScanning] = createSignal(false);
	const [scanResult, setScanResult] = createSignal("");
	const [isMobileMenuOpen, setIsMobileMenuOpen] = createSignal(false);

	function triggerBarcodeScan() {
		setIsScanning(true);
		setScanResult("");
		// Simulate a successful scan after 2 seconds
		setTimeout(() => {
			if (isScanning()) {
				setScanResult("TERPINDAI: IND-MIE-GRG (Indomie Goreng) - Rp 3.100");
				// Auto-close overlay after showing result
				setTimeout(() => {
					setIsScanning(false);
				}, 1500);
			}
		}, 2000);
	}

	return (
		<Show
			when={!isLoginPage()}
			fallback={
				<div class="bg-background text-on-background font-body-md h-screen w-screen overflow-hidden flex relative">
					<Outlet />
				</div>
			}
		>
			<div class="bg-background text-on-background font-body-md h-screen w-screen overflow-hidden flex relative">
				{/* Shared Sidebar Navigation */}
				<aside class="hidden md:flex flex-col py-lg gap-sm bg-surface-container w-[240px] h-full border-r border-outline-variant/30 shrink-0">
					{/* Brand Logo */}
					<div class="px-lg mb-xl">
						<span class="font-headline-sm text-headline-sm font-black text-primary uppercase tracking-tighter">
							RetailHub
						</span>
						<div class="mt-md flex items-center gap-sm">
							<div class="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant bg-zinc-950 flex items-center justify-center">
								<span class="material-symbols-outlined text-zinc-500">
									account_circle
								</span>
							</div>
							<div class="flex flex-col min-w-0">
								<span class="font-label-caps text-[10px] text-primary uppercase tracking-widest leading-none font-bold">
									{currentUser()?.role || "Kasir"}
								</span>
								<span class="font-body-md text-on-surface font-bold mt-1 truncate max-w-[130px]">
									{currentUser()?.fullname || "Kasir Utama"}
								</span>
							</div>
						</div>
					</div>

					{/* Nav Links */}
					<nav class="flex-1 px-sm space-y-1">
						<Link
							to="/"
							activeProps={{
								class: "bg-surface-container-highest text-primary font-bold",
							}}
							inactiveProps={{
								class: "text-on-surface-variant hover:bg-surface-variant",
							}}
							class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
							activeOptions={{ exact: true }}
						>
							<span class="material-symbols-outlined">dashboard</span>
							<span>Dashboard</span>
						</Link>

						<Link
							to="/inventory"
							activeProps={{
								class: "bg-surface-container-highest text-primary font-bold",
							}}
							inactiveProps={{
								class: "text-on-surface-variant hover:bg-surface-variant",
							}}
							class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
						>
							<span class="material-symbols-outlined">inventory</span>
							<span>Stok Sembako</span>
						</Link>

						<Link
							to="/inbound"
							activeProps={{
								class: "bg-surface-container-highest text-primary font-bold",
							}}
							inactiveProps={{
								class: "text-on-surface-variant hover:bg-surface-variant",
							}}
							class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
						>
							<span class="material-symbols-outlined">input</span>
							<span>Restock Barang</span>
						</Link>

						<Link
							to="/outbound"
							activeProps={{
								class: "bg-surface-container-highest text-primary font-bold",
							}}
							inactiveProps={{
								class: "text-on-surface-variant hover:bg-surface-variant",
							}}
							class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
						>
							<span class="material-symbols-outlined">shopping_cart</span>
							<span>Kasir (POS)</span>
						</Link>

						{/* Role-Protected Nav Links */}
						<Show when={currentUser()?.role !== "kasir"}>
							<Link
								to="/reports"
								activeProps={{
									class: "bg-surface-container-highest text-primary font-bold",
								}}
								inactiveProps={{
									class: "text-on-surface-variant hover:bg-surface-variant",
								}}
								class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
							>
								<span class="material-symbols-outlined">analytics</span>
								<span>Laporan Penjualan</span>
							</Link>

							<Link
								to="/users"
								activeProps={{
									class: "bg-surface-container-highest text-primary font-bold",
								}}
								inactiveProps={{
									class: "text-on-surface-variant hover:bg-surface-variant",
								}}
								class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
							>
								<span class="material-symbols-outlined">group</span>
								<span>Kelola Pengguna</span>
							</Link>
						</Show>
					</nav>

					{/* Bottom Sidebar Controls */}
					<div class="px-sm mt-auto space-y-1 border-t border-outline-variant/30 pt-md">
						<button
							type="button"
							onClick={() =>
								alert("RetailHub Help Center is under construction.")
							}
							class="w-full flex items-center gap-md px-md py-sm text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all cursor-pointer"
						>
							<span class="material-symbols-outlined">help</span>
							<span class="font-label-caps text-label-caps">HELP</span>
						</button>
						<button
							type="button"
							onClick={() => {
								clearSessionUser();
								setCurrentUser(null);
								navigate({ to: "/login" });
							}}
							class="w-full flex items-center gap-md px-md py-sm text-error hover:bg-error-container/20 rounded-lg transition-all cursor-pointer"
						>
							<span class="material-symbols-outlined">logout</span>
							<span class="font-label-caps text-label-caps font-bold">
								LOGOUT
							</span>
						</button>
					</div>
				</aside>

				{/* Main Layout Area */}
				<div class="flex-1 flex flex-col h-full overflow-hidden relative">
					{/* Unified Top Navigation Header */}
					<header class="flex justify-between items-center px-4 md:px-margin-desktop w-full h-16 bg-surface border-b border-outline-variant/30 shrink-0 z-40 gap-md">
						<div class="flex items-center gap-md">
							{/* Mobile Hamburger Menu Button */}
							<button
								type="button"
								onClick={() => setIsMobileMenuOpen(true)}
								class="block md:hidden text-on-surface hover:text-primary transition-colors cursor-pointer"
								title="Buka Menu"
							>
								<span class="material-symbols-outlined text-[24px]">menu</span>
							</button>

							<div class="relative flex items-center">
								<span class="material-symbols-outlined absolute left-3 text-on-surface-variant text-sm">
									search
								</span>
								<input
									class="bg-surface-container-low border border-outline-variant/60 rounded-lg pl-10 pr-4 py-2 text-body-md focus:outline-none focus:border-primary w-[140px] sm:w-[240px] md:w-[320px] transition-all"
									placeholder="Cari..."
									type="text"
								/>
							</div>
						</div>

						{/* Top Header Controls */}
						<div class="flex items-center gap-md">
							<button
								type="button"
								onClick={triggerBarcodeScan}
								class="px-md py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:brightness-115 transition-all flex items-center gap-xs cursor-pointer shadow-md"
							>
								<span class="material-symbols-outlined text-[16px]">
									qr_code_scanner
								</span>
								<span class="hidden sm:inline">Pindai Barcode</span>
							</button>

							<div class="h-6 w-px bg-outline-variant/35 hidden md:block" />

							{/* Role display for mobile / quick check */}
							<div class="flex items-center gap-xs">
								<span class="w-2.5 h-2.5 rounded-full bg-tertiary animate-pulse" />
								<span class="text-xs text-on-surface-variant font-semibold uppercase tracking-wider hidden sm:inline">
									Toko Sembako RetailHub
								</span>
							</div>
						</div>
					</header>

					{/* Route Outlet */}
					<main class="flex-1 overflow-y-auto scrollbar-hide bg-background p-sm md:p-md relative">
						<Outlet />
					</main>
				</div>

				{/* Barcode Scanner Simulation Overlay Modal */}
				<Show when={isScanning()}>
					<div class="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md animate-fade-in">
						<div class="relative w-full max-w-[480px] p-lg mx-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center space-y-6">
							<div class="relative w-full aspect-video bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col items-center justify-center">
								<div class="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

								{/* Scanning Visual Target and Laser Line */}
								<div class="relative z-10">
									<span class="material-symbols-outlined text-6xl text-primary animate-pulse-primary">
										center_focus_weak
									</span>
									<div class="scanning-line absolute w-full top-0 left-0" />
								</div>

								{/* Scanner corners */}
								<div class="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary/50" />
								<div class="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary/50" />
								<div class="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary/50" />
								<div class="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary/50" />
							</div>

							<div class="space-y-2">
								<h3 class="text-xl font-bold text-zinc-100">
									Simulating Active Laser Scanner
								</h3>
								<p class="text-zinc-400 text-sm max-w-[360px]">
									Positioning simulated item camera overlay. Pointing at virtual
									barcode.
								</p>
							</div>

							{/* Dynamic Scan result */}
							<Show
								when={scanResult()}
								fallback={
									<div class="text-xs text-zinc-500 font-mono animate-pulse">
										Awaiting hardware response...
									</div>
								}
							>
								<div class="bg-tertiary/10 border border-tertiary/30 rounded-xl p-3 text-sm text-tertiary font-mono">
									{scanResult()}
								</div>
							</Show>

							<button
								type="button"
								onClick={() => setIsScanning(false)}
								class="px-lg py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all"
							>
								Cancel Scan
							</button>
						</div>
					</div>
				</Show>

				{/* Mobile Navigation Drawer Overlay */}
				<Show when={isMobileMenuOpen()}>
					<div class="fixed inset-0 z-[90] flex md:hidden">
						{/* Backdrop overlay */}
						{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay click closes menu */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop overlay click closes menu */}
						<div
							onClick={() => setIsMobileMenuOpen(false)}
							class="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm animate-fade-in"
						/>
						{/* Drawer Content */}
						<aside class="relative bg-surface-container w-[280px] h-full flex flex-col py-lg gap-sm border-r border-outline-variant/30 animate-slide-right shadow-2xl z-10">
							{/* Close Button */}
							<button
								type="button"
								onClick={() => setIsMobileMenuOpen(false)}
								class="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 cursor-pointer"
								title="Tutup Menu"
							>
								<span class="material-symbols-outlined text-[20px]">close</span>
							</button>

							{/* Brand Logo */}
							<div class="px-lg mb-xl mt-4">
								<span class="font-headline-sm text-headline-sm font-black text-primary uppercase tracking-tighter">
									RetailHub
								</span>
								<div class="mt-md flex items-center gap-sm">
									<div class="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant bg-zinc-950 flex items-center justify-center">
										<span class="material-symbols-outlined text-zinc-500">
											account_circle
										</span>
									</div>
									<div class="flex flex-col min-w-0">
										<span class="font-label-caps text-[10px] text-primary uppercase tracking-widest leading-none font-bold">
											{currentUser()?.role || "kasir"}
										</span>
										<span class="font-bold text-zinc-200 text-sm truncate mt-1">
											{currentUser()?.fullname || "Staff Toko"}
										</span>
									</div>
								</div>
							</div>

							{/* Nav links */}
							<nav class="flex-1 px-sm space-y-1">
								<Link
									to="/"
									onClick={() => setIsMobileMenuOpen(false)}
									class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
									activeClass="bg-primary/10 text-primary border-l-2 border-primary"
								>
									<span class="material-symbols-outlined text-[18px]">
										dashboard
									</span>
									<span>Dashboard</span>
								</Link>
								<Link
									to="/outbound"
									onClick={() => setIsMobileMenuOpen(false)}
									class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
									activeClass="bg-primary/10 text-primary border-l-2 border-primary"
								>
									<span class="material-symbols-outlined text-[18px]">
										point_of_sale
									</span>
									<span>Mesin Kasir</span>
								</Link>
								<Link
									to="/inbound"
									onClick={() => setIsMobileMenuOpen(false)}
									class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
									activeClass="bg-primary/10 text-primary border-l-2 border-primary"
								>
									<span class="material-symbols-outlined text-[18px]">
										input
									</span>
									<span>Penerimaan</span>
								</Link>
								<Link
									to="/inventory"
									onClick={() => setIsMobileMenuOpen(false)}
									class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
									activeClass="bg-primary/10 text-primary border-l-2 border-primary"
								>
									<span class="material-symbols-outlined text-[18px]">
										inventory_2
									</span>
									<span>Stok Sembako</span>
								</Link>

								{/* Admin/Owner Restricted pages */}
								<Show when={currentUser()?.role !== "kasir"}>
									<Link
										to="/reports"
										onClick={() => setIsMobileMenuOpen(false)}
										class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
										activeClass="bg-primary/10 text-primary border-l-2 border-primary"
									>
										<span class="material-symbols-outlined text-[18px]">
											analytics
										</span>
										<span>Laporan Keuangan</span>
									</Link>
									<Link
										to="/users"
										onClick={() => setIsMobileMenuOpen(false)}
										class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
										activeClass="bg-primary/10 text-primary border-l-2 border-primary"
									>
										<span class="material-symbols-outlined text-[18px]">
											group
										</span>
										<span>Kelola Staf</span>
									</Link>
								</Show>
							</nav>

							{/* Footer actions */}
							<div class="px-sm mt-auto border-t border-outline-variant/30 pt-sm space-y-1">
								<button
									type="button"
									onClick={() => {
										setIsMobileMenuOpen(false);
										clearSessionUser();
										setCurrentUser(null);
										navigate({ to: "/login" });
									}}
									class="w-full flex items-center gap-md px-md py-sm text-error hover:bg-error-container/20 rounded-lg transition-all cursor-pointer text-xs font-semibold"
								>
									<span class="material-symbols-outlined text-[18px]">
										logout
									</span>
									<span>Keluar Sesi</span>
								</button>
							</div>
						</aside>
					</div>
				</Show>

				{/* Devtools */}
				<TanStackRouterDevtools position="bottom-right" />
			</div>
		</Show>
	);
}
