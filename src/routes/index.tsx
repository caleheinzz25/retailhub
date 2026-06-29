import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, onMount } from "solid-js";
import { selectData } from "../utils/db";

export const Route = createFileRoute("/")({
	component: FloorDashboard,
});

interface Activity {
	id: string | number;
	title: string;
	subtitle: string;
	time: string;
	type: "success" | "error" | "info" | "default";
}

function FloorDashboard() {
	const [activeToast, setActiveToast] = createSignal("");
	const [inventoryCount, setInventoryCount] = createSignal(0);
	const [lowStockAlerts, setLowStockAlerts] = createSignal(0);
	const [omsetHariIni, setOmsetHariIni] = createSignal(0);
	const [transaksiCount, setTransaksiCount] = createSignal(0);
	const [activities, setActivities] = createSignal<Activity[]>([]);

	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => {
			setActiveToast("");
		}, 3000);
	}

	onMount(async () => {
		try {
			// 1. Fetch live stock info from Supabase
			const barangRes = await selectData<any[]>("barang");
			if (barangRes) {
				const totalQty = barangRes.reduce(
					(acc, item) => acc + (parseInt(item.stock) || 0),
					0,
				);
				const criticalItems = barangRes.filter(
					(item) =>
						(parseInt(item.stock) || 0) <= (parseInt(item.min_stock) || 5),
				);

				setInventoryCount(totalQty);
				setLowStockAlerts(criticalItems.length);

				// Seed initial activities based on critical stock levels
				const stockActivities: Activity[] = criticalItems
					.slice(0, 2)
					.map((item) => ({
						id: `alert-${item.id}`,
						title: `Stok Kritis: ${item.name}`,
						subtitle: `Segera order ke distributor (Tersisa ${item.stock} Pcs)`,
						time: "Sekarang",
						type: "error",
					}));
				setActivities((prev) => [...stockActivities, ...prev]);
			}

			// 2. Fetch completed transactions
			const txRes = await selectData<any[]>("transaksi");
			if (txRes) {
				// Calculate today's omset (since this is a demo, we sum all invoices)
				const totalRevenue = txRes.reduce(
					(acc, tx) => acc + (parseFloat(tx.grand_total) || 0),
					0,
				);
				setOmsetHariIni(totalRevenue);
				setTransaksiCount(txRes.length);

				// Add transaction entries to activity log
				const txActivities: Activity[] = txRes.slice(0, 3).map((tx) => ({
					id: tx.id,
					title: `Transaksi POS #${tx.invoice_number}`,
					subtitle: `Kasir: ${tx.cashier_name} • Rp ${parseFloat(tx.grand_total).toLocaleString("id-ID")} (${tx.payment_method})`,
					time: new Date(tx.created_at).toLocaleTimeString("id-ID"),
					type: "info",
				}));

				setActivities((prev) => [...txActivities, ...prev]);
			}
		} catch (err) {
			console.error("Gagal memuat statistik dashboard:", err);
		}
	});

	function triggerAction(actionName: string) {
		showToast(`Aksi Cepat: "${actionName}" berhasil dijalankan!`);

		if (actionName === "Restock Baru") {
			setInventoryCount((c) => c + 150);
			setActivities((prev) => [
				{
					id: Date.now(),
					title: "Restock Masuk: +150 Item",
					subtitle: "Ditambahkan ke Gudang Toko",
					time: new Date().toLocaleTimeString(),
					type: "success",
				},
				...prev,
			]);
		} else if (actionName === "Cek Fisik") {
			setLowStockAlerts((prev) => Math.max(0, prev - 1));
			setActivities((prev) => [
				{
					id: Date.now(),
					title: "Audit Stok: Data Fisik Sinkron",
					subtitle: "Oleh Admin Toko",
					time: new Date().toLocaleTimeString(),
					type: "info",
				},
				...prev,
			]);
		}
	}

	return (
		<div class="p-margin-desktop space-y-lg max-w-[1600px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Message Notification */}
			{activeToast() && (
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-sm">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			)}

			{/* Page Title & Shift Details */}
			<div class="flex justify-between items-end mb-lg">
				<div>
					<h1 class="font-display-lg text-display-lg text-on-surface">
						Dashboard Toko
					</h1>
					<p class="text-on-surface-variant font-body-md">
						Pemantauan stok gudang sembako & riwayat kasir real-time.
					</p>
				</div>
				<div class="flex items-center gap-sm text-primary font-data-mono text-sm">
					<span class="material-symbols-outlined text-[14px]">schedule</span>
					<span class="font-bold">Shift Pagi • 07:00 - 14:00</span>
				</div>
			</div>

			{/* Top Metric Cards */}
			<div class="grid grid-cols-1 md:grid-cols-4 gap-gutter">
				{/* 1. Total Stok */}
				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-primary">
							inventory_2
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Total Stok Item
						</span>
						<h3 class="text-3xl font-bold text-on-surface font-data-mono">
							{inventoryCount().toLocaleString()} Pcs
						</h3>
						<div class="text-xs text-tertiary font-medium flex items-center gap-1">
							<span class="material-symbols-outlined text-[14px]">
								check_circle
							</span>
							<span>Kondisi Gudang Aman</span>
						</div>
					</div>
				</div>

				{/* 2. Low Stock Alerts */}
				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-error">
							warning
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Stok Kritis
						</span>
						<h3 class="text-3xl font-bold text-error font-data-mono">
							{lowStockAlerts()} Jenis
						</h3>
						<div class="text-xs text-error font-medium flex items-center gap-1">
							<span class="material-symbols-outlined text-[14px]">
								priority_high
							</span>
							<span>Butuh Restock Segera</span>
						</div>
					</div>
				</div>

				{/* 3. Pending Restocks */}
				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-tertiary">
							local_shipping
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Restock Menunggu
						</span>
						<h3 class="text-3xl font-bold text-tertiary font-data-mono">
							3 PO
						</h3>
						<div class="text-xs text-tertiary font-medium flex items-center gap-1">
							<span class="material-symbols-outlined text-[14px]">
								pending_actions
							</span>
							<span>Estimasi Tiba Hari Ini</span>
						</div>
					</div>
				</div>

				{/* 4. Daily Income */}
				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-primary">
							payments
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Omset Hari Ini
						</span>
						<h3 class="text-2xl font-bold text-on-surface font-data-mono pt-1">
							Rp {omsetHariIni().toLocaleString("id-ID")}
						</h3>
						<div class="text-xs text-primary font-medium flex items-center gap-1">
							<span class="material-symbols-outlined text-[14px]">
								receipt_long
							</span>
							<span>{transaksiCount()} Transaksi Berhasil</span>
						</div>
					</div>
				</div>
			</div>

			{/* Quick Actions & Recent Activities split grid */}
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter items-start">
				{/* Quick Actions Panel */}
				<div class="lg:col-span-1 bg-surface-container border border-outline-variant p-lg rounded-xl space-y-lg shadow-lg">
					<h3 class="font-bold text-on-surface border-b border-outline-variant/35 pb-md flex items-center gap-xs">
						<span class="material-symbols-outlined text-[20px]">bolt</span>
						<span>Aksi Cepat Kasir</span>
					</h3>
					<div class="grid grid-cols-2 gap-sm">
						<button
							type="button"
							onClick={() => triggerAction("Restock Baru")}
							class="p-md rounded-lg bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-on-surface flex flex-col items-center justify-center gap-sm text-xs font-bold transition-all cursor-pointer"
						>
							<span class="material-symbols-outlined text-primary text-2xl">
								local_shipping
							</span>
							<span>Restock Baru</span>
						</button>
						<button
							type="button"
							onClick={() => triggerAction("Cek Fisik")}
							class="p-md rounded-lg bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-on-surface flex flex-col items-center justify-center gap-sm text-xs font-bold transition-all cursor-pointer"
						>
							<span class="material-symbols-outlined text-tertiary text-2xl">
								fact_check
							</span>
							<span>Audit Rak</span>
						</button>
						<button
							type="button"
							onClick={() => triggerAction("Laporan Kasir")}
							class="p-md rounded-lg bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-on-surface flex flex-col items-center justify-center gap-sm text-xs font-bold transition-all cursor-pointer"
						>
							<span class="material-symbols-outlined text-indigo-400 text-2xl">
								description
							</span>
							<span>Laporan Shift</span>
						</button>
						<button
							type="button"
							onClick={() => triggerAction("Buka Laci")}
							class="p-md rounded-lg bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-on-surface flex flex-col items-center justify-center gap-sm text-xs font-bold transition-all cursor-pointer"
						>
							<span class="material-symbols-outlined text-amber-500 text-2xl">
								point_of_sale
							</span>
							<span>Buka Laci Kasir</span>
						</button>
					</div>
				</div>

				{/* Recent Activities Feed */}
				<div class="lg:col-span-2 bg-surface-container border border-outline-variant p-lg rounded-xl space-y-lg shadow-lg">
					<h3 class="font-bold text-on-surface border-b border-outline-variant/35 pb-md flex items-center gap-xs">
						<span class="material-symbols-outlined text-[20px]">history</span>
						<span>Aktivitas Gudang & Kasir Terbaru</span>
					</h3>
					<div class="space-y-md">
						<For
							each={activities()}
							fallback={
								<div class="text-center py-6 text-zinc-500 font-semibold">
									Belum ada catatan aktivitas hari ini.
								</div>
							}
						>
							{(activity) => (
								<div class="flex items-center justify-between p-md bg-surface-container-high/40 rounded-xl hover:bg-surface-variant/10 transition-all border border-outline-variant/30">
									<div class="flex items-center gap-md">
										<div
											class={`w-10 h-10 rounded-xl flex items-center justify-center ${
												activity.type === "success"
													? "bg-tertiary/10 text-tertiary"
													: activity.type === "error"
														? "bg-error/10 text-error"
														: "bg-primary/10 text-primary"
											}`}
										>
											<span class="material-symbols-outlined text-[22px]">
												{activity.type === "success"
													? "local_shipping"
													: activity.type === "error"
														? "warning"
														: "receipt_long"}
											</span>
										</div>
										<div class="min-w-0">
											<h4 class="font-bold text-on-surface text-sm truncate">
												{activity.title}
											</h4>
											<p class="text-xs text-on-surface-variant truncate">
												{activity.subtitle}
											</p>
										</div>
									</div>
									<span class="text-xs font-semibold text-outline font-data-mono shrink-0 pl-sm">
										{activity.time}
									</span>
								</div>
							)}
						</For>
					</div>
				</div>
			</div>
		</div>
	);
}
