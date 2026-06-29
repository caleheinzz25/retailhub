import { createFileRoute } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { selectData } from "../utils/db";

export const Route = createFileRoute("/reports")({
	component: ReportsSimple,
});

interface Barang {
	id: string;
	name: string;
	stock: number;
	min_stock: number;
	sku: string;
}

function ReportsSimple() {
	const [timeRange, setTimeRange] = createSignal("30 Hari Terakhir");
	const [activeToast, setActiveToast] = createSignal("");

	// Helper toast
	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3000);
	}

	// Fetch and process data
	const [reportData] = createResource(timeRange, async (range) => {
		try {
			// Calculate date threshold
			const now = new Date();
			const startDate = new Date();
			if (range === "Hari Ini") {
				startDate.setHours(0, 0, 0, 0);
			} else if (range === "7 Hari Terakhir") {
				startDate.setDate(now.getDate() - 7);
			} else {
				startDate.setDate(now.getDate() - 30);
			}

			const startDateStr = startDate.toISOString();

			// Fetch transactions with their nested details using Supabase embedded query
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const transaksiWithDetails =
				(await selectData<any[]>("transaksi", {
					created_at: `gte.${startDateStr}`,
					select:
						"id, grand_total, detail_transaksi(product_name, quantity, total)",
				})) || [];

			let totalRevenue = 0;
			let totalItemsSold = 0;
			const productSales: Record<string, number> = {};

			for (const t of transaksiWithDetails) {
				totalRevenue += Number(t.grand_total);

				const details = t.detail_transaksi || [];
				for (const d of details) {
					totalItemsSold += Number(d.quantity);

					// Aggregate for top products
					if (!productSales[d.product_name]) {
						productSales[d.product_name] = 0;
					}
					productSales[d.product_name] += Number(d.quantity);
				}
			}

			const transactionCount = transaksiWithDetails.length;

			// Sort top 5 products
			const topProducts = Object.entries(productSales)
				.map(([name, qty]) => ({ name, qty }))
				.sort((a, b) => b.qty - a.qty)
				.slice(0, 5);

			// Fetch low stock items from barang table
			const lowStockItemsRaw =
				(await selectData<Barang[]>("barang", {
					select: "id, name, stock, min_stock, sku",
				})) || [];

			const lowStockItems = lowStockItemsRaw
				.filter((b) => b.stock <= b.min_stock)
				.sort((a, b) => a.stock - b.stock);

			return {
				totalRevenue,
				transactionCount,
				totalItemsSold,
				topProducts,
				lowStockItems,
			};
		} catch (error) {
			console.error("Gagal memuat data laporan:", error);
			showToast("Gagal memuat data laporan dari database.");
			return null;
		}
	});

	function handleExport() {
		const data = reportData();
		if (!data) return;

		showToast(`Membuat laporan CSV untuk rentang ${timeRange()}...`);

		let csvContent = "LAPORAN PENJUALAN RETAILHUB\n";
		csvContent += `Rentang Waktu: ${timeRange()}\n\n`;

		csvContent += "RINGKASAN METRIK\n";
		csvContent += `Total Pendapatan,Rp ${data.totalRevenue}\n`;
		csvContent += `Jumlah Transaksi,${data.transactionCount}\n`;
		csvContent += `Total Barang Terjual,${data.totalItemsSold} Pcs\n\n`;

		csvContent += "PRODUK TERLARIS\n";
		csvContent += "Nama Produk,Jumlah Terjual\n";
		for (const p of data.topProducts) {
			csvContent += `"${p.name}",${p.qty}\n`;
		}
		csvContent += "\n";

		csvContent += "PERINGATAN STOK MENIPIS\n";
		csvContent += "SKU,Nama Produk,Sisa Stok,Batas Minimum\n";
		for (const b of data.lowStockItems) {
			csvContent += `"${b.sku}","${b.name}",${b.stock},${b.min_stock}\n`;
		}

		// HTML5 file download trigger (Works natively on web & Tauri desktop to Downloads folder)
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		const safeDateStr = new Date().toISOString().slice(0, 10);
		const safeTimeRange = timeRange().replace(/ /g, "_");
		link.setAttribute(
			"download",
			`Laporan_RetailHub_${safeTimeRange}_${safeDateStr}.csv`,
		);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);

		setTimeout(() => {
			showToast("Laporan CSV berhasil diunduh ke folder Downloads Anda!");
		}, 500);
	}

	return (
		<div class="p-margin-desktop space-y-lg max-w-[1200px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Notifications */}
			<Show when={activeToast()}>
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-sm">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			</Show>

			{/* Page Title Area */}
			<div class="flex flex-col sm:flex-row sm:items-end justify-between gap-lg mb-xl border-b border-outline-variant/20 pb-md">
				<div>
					<h2 class="font-display-lg text-display-lg text-on-surface">
						Laporan Toko
					</h2>
					<p class="text-on-surface-variant font-body-md">
						Ringkasan pendapatan, penjualan terlaris, dan pengingat stok sembako
						Anda.
					</p>
				</div>
				<div class="flex gap-sm shrink-0">
					<select
						onChange={(e) => setTimeRange(e.currentTarget.value)}
						value={timeRange()}
						class="bg-surface-container border border-outline-variant rounded-lg text-xs font-bold text-zinc-300 py-2.5 px-4 cursor-pointer outline-none focus:ring-1 focus:ring-primary"
					>
						<option>30 Hari Terakhir</option>
						<option>7 Hari Terakhir</option>
						<option>Hari Ini</option>
					</select>
					<button
						type="button"
						onClick={handleExport}
						class="px-lg py-2.5 bg-primary text-on-primary rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-lg disabled:opacity-50"
						disabled={reportData.loading || !reportData()}
					>
						<span class="material-symbols-outlined text-sm">file_download</span>
						<span>Unduh Laporan</span>
					</button>
				</div>
			</div>

			<Show when={reportData.loading}>
				<div class="w-full py-20 flex flex-col items-center justify-center gap-4 text-zinc-500">
					<span class="material-symbols-outlined animate-spin text-4xl">
						autorenew
					</span>
					<p class="text-sm font-semibold animate-pulse">
						Menghitung data transaksi riil...
					</p>
				</div>
			</Show>

			<Show when={reportData()}>
				{(data) => (
					<>
						{/* KPI Grid Sederhana */}
						<div class="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-xl">
							<div class="bg-surface-container border border-outline-variant/60 p-lg rounded-xl shadow-lg">
								<div class="flex items-center gap-sm mb-2 text-tertiary">
									<span class="material-symbols-outlined">payments</span>
									<p class="text-label-caps text-on-surface-variant uppercase font-bold text-xs">
										Total Pendapatan
									</p>
								</div>
								<p class="font-data-mono text-4xl font-bold text-on-surface">
									Rp {data().totalRevenue.toLocaleString("id-ID")}
								</p>
							</div>

							<div class="bg-surface-container border border-outline-variant/60 p-lg rounded-xl shadow-lg">
								<div class="flex items-center gap-sm mb-2 text-primary">
									<span class="material-symbols-outlined">receipt_long</span>
									<p class="text-label-caps text-on-surface-variant uppercase font-bold text-xs">
										Jumlah Transaksi
									</p>
								</div>
								<p class="font-data-mono text-4xl font-bold text-on-surface">
									{data().transactionCount}{" "}
									<span class="text-lg text-zinc-500">Struk</span>
								</p>
							</div>

							<div class="bg-surface-container border border-outline-variant/60 p-lg rounded-xl shadow-lg">
								<div class="flex items-center gap-sm mb-2 text-secondary">
									<span class="material-symbols-outlined">inventory_2</span>
									<p class="text-label-caps text-on-surface-variant uppercase font-bold text-xs">
										Total Barang Keluar
									</p>
								</div>
								<p class="font-data-mono text-4xl font-bold text-on-surface">
									{data().totalItemsSold}{" "}
									<span class="text-lg text-zinc-500">Pcs</span>
								</p>
							</div>
						</div>

						{/* Dua Kolom Tabel Sederhana */}
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter mb-xl">
							{/* Top Produk */}
							<div class="bg-surface-container border border-outline-variant/60 rounded-xl p-lg shadow-xl">
								<h3 class="font-headline-sm text-on-surface text-lg font-bold mb-6 flex items-center gap-2">
									<span class="material-symbols-outlined text-yellow-400">
										star
									</span>
									5 Produk Terlaris
								</h3>
								<div class="space-y-4">
									<Show when={data().topProducts.length === 0}>
										<div class="text-center py-8 text-zinc-500 text-sm italic">
											Belum ada transaksi di rentang waktu ini.
										</div>
									</Show>
									<For each={data().topProducts}>
										{(prod, idx) => (
											<div class="flex items-center justify-between p-3 bg-surface border border-outline-variant/30 rounded-lg">
												<div class="flex items-center gap-3">
													<div class="w-8 h-8 rounded bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
														#{idx() + 1}
													</div>
													<p class="text-sm font-semibold text-zinc-200">
														{prod.name}
													</p>
												</div>
												<div class="text-right">
													<p class="font-data-mono font-bold text-tertiary">
														{prod.qty} Pcs
													</p>
												</div>
											</div>
										)}
									</For>
								</div>
							</div>

							{/* Stok Menipis */}
							<div class="bg-surface-container border border-outline-variant/60 rounded-xl p-lg shadow-xl">
								<h3 class="font-headline-sm text-on-surface text-lg font-bold mb-6 flex items-center gap-2">
									<span class="material-symbols-outlined text-error">
										warning
									</span>
									Pengingat Stok Menipis
								</h3>
								<div class="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
									<Show when={data().lowStockItems.length === 0}>
										<div class="text-center py-8 text-zinc-500 text-sm italic">
											Semua stok barang dalam kondisi aman.
										</div>
									</Show>
									<For each={data().lowStockItems}>
										{(item) => (
											<div class="flex items-center justify-between p-3 bg-error/10 border border-error/30 rounded-lg">
												<div>
													<p class="text-sm font-semibold text-zinc-200">
														{item.name}
													</p>
													<p class="text-xs text-zinc-500 font-mono mt-0.5">
														{item.sku}
													</p>
												</div>
												<div class="text-right flex flex-col items-end">
													<p class="font-data-mono font-bold text-error text-lg leading-none">
														{item.stock}
													</p>
													<p class="text-[10px] text-zinc-400 mt-1">
														Min: {item.min_stock}
													</p>
												</div>
											</div>
										)}
									</For>
								</div>
							</div>
						</div>
					</>
				)}
			</Show>

			{/* System Status Footer info */}
			<div class="px-margin-desktop py-md border-t border-outline-variant/30 flex items-center justify-between opacity-50 text-[10px] uppercase font-bold tracking-widest mt-12">
				<p>© 2026 RETAILHUB RETAIL SYSTEMS. ALL RIGHTS RESERVED.</p>
				<div class="flex items-center gap-md">
					<p class="flex items-center gap-sm">
						<span class="w-2 h-2 bg-tertiary rounded-full animate-pulse" />{" "}
						STATUS KASIR & GUDANG: OPERASIONAL
					</p>
					<p>DATABASE: LOKAL TAURI</p>
				</div>
			</div>
		</div>
	);
}
