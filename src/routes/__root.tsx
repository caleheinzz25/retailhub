import {
	createRootRoute,
	Link,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import {
	type ActiveUser,
	clearSessionUser,
	findProductByBarcode,
	getAllToko,
	getCurrentTokoId,
	getCurrentTokoName,
	getSessionUser,
	selectData,
	switchToko,
	updateData,
	verifySession,
} from "../utils/db";
import { isAndroidMobile, scanBarcode } from "../utils/scanner";

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

	// ── Store (Toko) Selector State ──────────────────────────────────
	const [stores, setStores] = createSignal<any[]>([]);
	const [isStoreModalOpen, setIsStoreModalOpen] = createSignal(false);
	const [currentTokoId, setCurrentTokoId] = createSignal(
		getCurrentTokoId() || "",
	);
	const [currentTokoName, setCurrentTokoName] = createSignal(
		getCurrentTokoName() || "Pilih Toko",
	);

	// Listen for toko changes from other tabs / switchToko calls
	const handleTokoChanged = (e: CustomEvent) => {
		if (e.detail) {
			setCurrentTokoId(e.detail.toko_id || "");
			setCurrentTokoName(e.detail.toko_name || "Pilih Toko");
		}
	};

	const fetchStores = async () => {
		const allToko = await getAllToko();
		if (Array.isArray(allToko)) {
			setStores(allToko);
		}
	};

	onMount(async () => {
		const verified = await verifySession();
		setCurrentUser(verified);

		// Load stores for the selector
		await fetchStores();

		// Sync current toko from session
		const tid = getCurrentTokoId();
		const tn = getCurrentTokoName();
		if (tid) setCurrentTokoId(tid);
		if (tn) setCurrentTokoName(tn);

		// Low stock polling — admin/pemilik only
		if (verified?.role !== "staff") {
			await fetchLowStock();
			setInterval(async () => {
				if (currentUser()?.role !== "staff") {
					await fetchLowStock();
				}
			}, 120_000);
		}
	});

	// Custom event listener to update root session state upon login
	const handleLoginSuccess = () => {
		setCurrentUser(getSessionUser());
		// Reload stores after login
		fetchStores();
	};

	window.addEventListener(
		"retailhub-toko-changed",
		handleTokoChanged as EventListener,
	);
	window.addEventListener("retailhub-login-success", handleLoginSuccess);

	// Navigation Guards
	createEffect(() => {
		const user = currentUser();
		const path = location.pathname;

		if (!user && path !== "/login" && path !== "/register") {
			setTimeout(() => navigate({ to: "/login" }), 0);
		} else if (
			user &&
			user.role === "staff" &&
			(path === "/reports" || path === "/users" || path === "/stores")
		) {
			// Staff cannot access reports, users management, or store management
			setTimeout(() => navigate({ to: "/" }), 0);
		}
	});

	const isPublicPage = () =>
		location.pathname === "/login" || location.pathname === "/register";

	// Low Stock Notification state
	const [lowStockCount, setLowStockCount] = createSignal(0);
	const [lowStockItems, setLowStockItems] = createSignal<any[]>([]);
	const [lowStockDismissed, setLowStockDismissed] = createSignal(false);

	const fetchLowStock = async () => {
		try {
			const items = await selectData<any[]>("barang", {
				select: "id,name,stock,min_stock",
				order: "stock.asc",
			});
			if (Array.isArray(items)) {
				const low = items.filter((b) => b.stock <= b.min_stock);
				setLowStockItems(low);
				setLowStockCount(low.length);
				// Reset dismissed state on each refresh so new data shows
				setLowStockDismissed(false);
			}
		} catch (e) {
			console.error("[LowStock] Failed to fetch low stock items:", e);
		}
	};

	// Global Barcode Scanning simulation state
	const [isScanning, setIsScanning] = createSignal(false);
	const [scanResult, setScanResult] = createSignal("");
	const [isMobileMenuOpen, setIsMobileMenuOpen] = createSignal(false);

	async function triggerBarcodeScan() {
		if (isAndroidMobile()) {
			setIsScanning(true);
			setScanResult("");
			try {
				const result = await scanBarcode();
				if (result) {
					const item = await findProductByBarcode(result);
					if (item) {
						setScanResult(
							`TERPINDAI: ${item.sku} (${item.name}) - Rp ${parseFloat(item.harga_jual).toLocaleString()}`,
						);
					} else {
						setScanResult(`TERPINDAI: ${result} (Tidak terdaftar)`);
					}
					setTimeout(() => {
						setIsScanning(false);
					}, 3000);
				} else {
					setIsScanning(false);
				}
			} catch (e) {
				console.error("[Scanner] Global scanner error:", e);
				setScanResult("Gagal memindai barcode.");
				setTimeout(() => {
					setIsScanning(false);
				}, 3000);
			}
		} else {
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
	}

	// Change Password Modal States
	const [isChangePasswordOpen, setIsChangePasswordOpen] = createSignal(false);
	const [newPassword, setNewPassword] = createSignal("");
	const [confirmPassword, setConfirmPassword] = createSignal("");
	const [changePasswordError, setChangePasswordError] = createSignal("");
	const [changePasswordSuccess, setChangePasswordSuccess] = createSignal("");
	const [isChangePasswordLoading, setIsChangePasswordLoading] =
		createSignal(false);

	async function handleUpdatePassword(e: Event) {
		e.preventDefault();
		setChangePasswordError("");
		setChangePasswordSuccess("");

		if (!newPassword()) {
			setChangePasswordError("Kata sandi baru tidak boleh kosong.");
			return;
		}

		if (newPassword().length < 6) {
			setChangePasswordError("Kata sandi minimal harus 6 karakter.");
			return;
		}

		if (newPassword() !== confirmPassword()) {
			setChangePasswordError("Konfirmasi kata sandi tidak cocok.");
			return;
		}

		const user = currentUser();
		if (!user) {
			setChangePasswordError("Sesi login aktif tidak ditemukan.");
			return;
		}

		setIsChangePasswordLoading(true);
		try {
			await updateData(
				"users",
				{ id: `eq.${user.id}` },
				{ password: newPassword() },
			);
			setChangePasswordSuccess("Kata sandi Anda berhasil diperbarui!");
			setNewPassword("");
			setConfirmPassword("");
			setTimeout(() => {
				setIsChangePasswordOpen(false);
				setChangePasswordSuccess("");
			}, 1500);
		} catch (err: any) {
			setChangePasswordError(
				`Gagal memperbarui kata sandi: ${err.message || err}`,
			);
		} finally {
			setIsChangePasswordLoading(false);
		}
	}

	return (
		<Show
			when={!isPublicPage()}
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
								<span class="font-body-md text-on-surface font-bold truncate max-w-[130px]">
									{currentUser()?.fullname || "Staff"}
								</span>
								<span class="font-label-caps text-[10px] text-primary uppercase tracking-widest leading-none font-bold mt-1">
									{currentUser()?.role || "Staff"}
								</span>
							</div>
						</div>
					</div>

					{/* Store Selector */}
					<div class="px-lg mb-sm">
						<button
							type="button"
							onClick={async () => {
								await fetchStores();
								setIsStoreModalOpen(true);
							}}
							class="w-full flex items-center gap-2 px-3 py-2 bg-surface-container-low hover:bg-surface-variant border border-outline-variant/30 rounded-lg transition-all cursor-pointer text-left"
						>
							<span class="material-symbols-outlined text-primary text-[18px]">
								store
							</span>
							<div class="flex-1 min-w-0">
								<div class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
									Toko Aktif
								</div>
								<div class="text-xs text-on-surface font-bold truncate max-w-[130px]">
									{currentTokoName()}
								</div>
							</div>
							<span class="material-symbols-outlined text-on-surface-variant text-[16px]">
								expand_more
							</span>
						</button>
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
							class="relative flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
						>
							<span class="material-symbols-outlined">inventory</span>
							<span>Stok Sembako</span>
							<Show when={lowStockCount() > 0}>
								<span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-md">
									{lowStockCount()}
								</span>
							</Show>
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
						<Show when={currentUser()?.role !== "staff"}>
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
								to="/history"
								activeProps={{
									class: "bg-surface-container-highest text-primary font-bold",
								}}
								inactiveProps={{
									class: "text-on-surface-variant hover:bg-surface-variant",
								}}
								class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
							>
								<span class="material-symbols-outlined">receipt_long</span>
								<span>Riwayat Transaksi</span>
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

							<Link
								to="/stores"
								activeProps={{
									class: "bg-surface-container-highest text-primary font-bold",
								}}
								inactiveProps={{
									class: "text-on-surface-variant hover:bg-surface-variant",
								}}
								class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps"
							>
								<span class="material-symbols-outlined">store</span>
								<span>Kelola Toko</span>
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
							onClick={() => setIsChangePasswordOpen(true)}
							class="w-full flex items-center gap-md px-md py-sm text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all cursor-pointer"
						>
							<span class="material-symbols-outlined">lock_reset</span>
							<span class="font-label-caps text-label-caps">UBAH SANDI</span>
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
									{currentTokoName()}
								</span>
							</div>
						</div>
					</header>

					{/* Route Outlet */}
					<main class="flex-1 overflow-y-auto scrollbar-hide bg-background p-sm md:p-md relative">
						{/* Low Stock Alert Banner */}
						<Show
							when={
								lowStockCount() > 0 &&
								!lowStockDismissed() &&
								currentUser()?.role !== "staff"
							}
						>
							<div class="mb-3 flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3 text-amber-300 text-sm shadow-sm">
								<span class="material-symbols-outlined text-amber-400 text-[20px] shrink-0 mt-0.5">
									warning
								</span>
								<div class="flex-1 min-w-0">
									<span class="font-bold text-amber-200">
										{lowStockCount()} produk stok menipis:{" "}
									</span>
									<span class="text-amber-300/90">
										{lowStockItems()
											.slice(0, 3)
											.map((b) => b.name)
											.join(", ")}
										{lowStockItems().length > 3
											? `, +${lowStockItems().length - 3} lainnya`
											: ""}
									</span>
									<span class="mx-1 text-amber-500">—</span>
									<Link
										to="/inventory"
										class="underline underline-offset-2 font-semibold text-amber-200 hover:text-amber-100 transition-colors"
									>
										Lihat Inventaris
									</Link>
								</div>
								<button
									type="button"
									onClick={() => setLowStockDismissed(true)}
									class="shrink-0 text-amber-400 hover:text-amber-200 transition-colors cursor-pointer"
									title="Tutup peringatan"
								>
									<span class="material-symbols-outlined text-[18px]">
										close
									</span>
								</button>
							</div>
						</Show>
						<Outlet />
					</main>
				</div>

				{/* Store Selector Modal */}
				<Show when={isStoreModalOpen()}>
					<div class="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm animate-fade-in">
						<div class="bg-zinc-900 border border-zinc-800 p-lg rounded-2xl shadow-2xl w-full max-w-[420px] mx-md space-y-4 animate-scale-up">
							<div class="flex items-center justify-between">
								<div>
									<h3 class="font-headline-sm text-on-surface text-lg font-bold">
										Pilih Toko
									</h3>
									<p class="text-xs text-on-surface-variant font-body-md mt-1">
										Ganti toko untuk menampilkan data yang berbeda.
									</p>
								</div>
								<button
									type="button"
									onClick={() => setIsStoreModalOpen(false)}
									class="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
								>
									<span class="material-symbols-outlined text-[20px]">
										close
									</span>
								</button>
							</div>

							<div class="space-y-1 max-h-[320px] overflow-y-auto">
								<For each={stores()}>
									{(store) => (
										<button
											type="button"
											onClick={() => {
												switchToko(store.id, store.name);
												setCurrentTokoId(store.id);
												setCurrentTokoName(store.name);
												setIsStoreModalOpen(false);
											}}
											class={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${
												currentTokoId() === store.id
													? "bg-primary/10 border border-primary/30 text-primary"
													: "bg-zinc-950/60 border border-zinc-800/60 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700"
											}`}
										>
											<div
												class={`w-9 h-9 rounded-lg flex items-center justify-center ${
													currentTokoId() === store.id
														? "bg-primary/20 text-primary"
														: "bg-zinc-800 text-zinc-400"
												}`}
											>
												<span class="material-symbols-outlined text-[18px]">
													store
												</span>
											</div>
											<div class="flex-1 min-w-0">
												<div class="text-sm font-bold truncate">
													{store.name}
												</div>
												<Show when={store.address}>
													<div class="text-[11px] text-zinc-500 truncate">
														{store.address}
													</div>
												</Show>
											</div>
											<Show when={currentTokoId() === store.id}>
												<span class="material-symbols-outlined text-primary text-[18px]">
													check_circle
												</span>
											</Show>
										</button>
									)}
								</For>

								<Show when={stores().length === 0}>
									<div class="text-center py-8 text-zinc-500 text-sm">
										Tidak ada toko tersedia.
									</div>
								</Show>
							</div>

							<button
								type="button"
								onClick={() => setIsStoreModalOpen(false)}
								class="w-full py-2.5 border border-outline-variant hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
							>
								Tutup
							</button>
						</div>
					</div>
				</Show>

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
										<span class="font-bold text-zinc-200 text-sm truncate">
											{currentUser()?.fullname || "Staff Toko"}
										</span>
										<span class="font-label-caps text-[10px] text-primary uppercase tracking-widest leading-none font-bold mt-1">
											{currentUser()?.role || "staff"}
										</span>
									</div>
								</div>
							</div>

							{/* Mobile Store Selector */}
							<div class="px-lg mb-sm">
								<button
									type="button"
									onClick={async () => {
										setIsMobileMenuOpen(false);
										await fetchStores();
										setIsStoreModalOpen(true);
									}}
									class="w-full flex items-center gap-2 px-3 py-2 bg-surface-container-low hover:bg-surface-variant border border-outline-variant/30 rounded-lg transition-all cursor-pointer text-left"
								>
									<span class="material-symbols-outlined text-primary text-[16px]">
										store
									</span>
									<div class="flex-1 min-w-0">
										<div class="text-[9px] text-on-surface-variant uppercase tracking-wider font-semibold">
											Toko Aktif
										</div>
										<div class="text-xs text-on-surface font-bold truncate max-w-[160px]">
											{currentTokoName()}
										</div>
									</div>
									<span class="material-symbols-outlined text-on-surface-variant text-[14px]">
										expand_more
									</span>
								</button>
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
									class="relative flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
									activeClass="bg-primary/10 text-primary border-l-2 border-primary"
								>
									<span class="material-symbols-outlined text-[18px]">
										inventory_2
									</span>
									<span>Stok Sembako</span>
									<Show when={lowStockCount() > 0}>
										<span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-md">
											{lowStockCount()}
										</span>
									</Show>
								</Link>

								{/* Admin/Owner Restricted pages */}
								<Show when={currentUser()?.role !== "staff"}>
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
										to="/history"
										onClick={() => setIsMobileMenuOpen(false)}
										class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
										activeClass="bg-primary/10 text-primary border-l-2 border-primary"
									>
										<span class="material-symbols-outlined text-[18px]">
											receipt_long
										</span>
										<span>Riwayat Transaksi</span>
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
									<Link
										to="/stores"
										onClick={() => setIsMobileMenuOpen(false)}
										class="flex items-center gap-md px-md py-sm rounded-lg transition-all duration-150 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant"
										activeClass="bg-primary/10 text-primary border-l-2 border-primary"
									>
										<span class="material-symbols-outlined text-[18px]">
											store
										</span>
										<span>Kelola Toko</span>
									</Link>
								</Show>
							</nav>

							{/* Footer actions */}
							<div class="px-sm mt-auto border-t border-outline-variant/30 pt-sm space-y-1">
								<button
									type="button"
									onClick={() => {
										setIsMobileMenuOpen(false);
										setIsChangePasswordOpen(true);
									}}
									class="w-full flex items-center gap-md px-md py-sm text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all cursor-pointer text-xs font-semibold"
								>
									<span class="material-symbols-outlined text-[18px]">
										lock_reset
									</span>
									<span>Ubah Sandi</span>
								</button>
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

				{/* Change Password Modal */}
				<Show when={isChangePasswordOpen()}>
					<div class="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm animate-fade-in">
						<div class="bg-zinc-900 border border-zinc-800 p-lg rounded-2xl shadow-2xl w-full max-w-[400px] mx-md space-y-6 animate-scale-up">
							<div>
								<h3 class="font-headline-sm text-on-surface text-lg font-bold">
									Ubah Kata Sandi
								</h3>
								<p class="text-xs text-on-surface-variant font-body-md mt-1">
									Ganti kata sandi akun aktif Anda.
								</p>
							</div>

							<form onSubmit={handleUpdatePassword} class="space-y-md">
								<Show when={changePasswordError()}>
									<div class="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-lg">
										{changePasswordError()}
									</div>
								</Show>

								<Show when={changePasswordSuccess()}>
									<div class="p-3 bg-tertiary/15 border border-tertiary/30 text-tertiary text-xs font-semibold rounded-lg animate-pulse">
										{changePasswordSuccess()}
									</div>
								</Show>

								<div class="space-y-xs">
									<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
										Kata Sandi Baru
									</label>
									<input
										type="password"
										required
										value={newPassword()}
										onInput={(e) => setNewPassword(e.currentTarget.value)}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
										placeholder="Minimal 6 karakter"
									/>
								</div>

								<div class="space-y-xs">
									<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
										Konfirmasi Kata Sandi Baru
									</label>
									<input
										type="password"
										required
										value={confirmPassword()}
										onInput={(e) => setConfirmPassword(e.currentTarget.value)}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
										placeholder="Masukkan kembali kata sandi baru"
									/>
								</div>

								<div class="flex gap-sm justify-end pt-md">
									<button
										type="button"
										onClick={() => {
											setIsChangePasswordOpen(false);
											setNewPassword("");
											setConfirmPassword("");
											setChangePasswordError("");
											setChangePasswordSuccess("");
										}}
										class="px-lg py-2.5 border border-outline-variant hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
										disabled={isChangePasswordLoading()}
									>
										Batal
									</button>
									<button
										type="submit"
										class="px-lg py-2.5 bg-primary text-on-primary rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-lg disabled:opacity-50"
										disabled={isChangePasswordLoading()}
									>
										<Show
											when={isChangePasswordLoading()}
											fallback={<span>Simpan</span>}
										>
											<span class="material-symbols-outlined animate-spin text-sm">
												autorenew
											</span>
											<span>Menyimpan...</span>
										</Show>
									</button>
								</div>
							</form>
						</div>
					</div>
				</Show>

				{/* Devtools */}
				<TanStackRouterDevtools position="bottom-right" />
			</div>
		</Show>
	);
}
