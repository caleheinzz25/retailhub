import { createFileRoute } from "@tanstack/solid-router";
import { jsPDF } from "jspdf";
import { createResource, createSignal, For, Show } from "solid-js";
import { buildXlsxBlob } from "../utils/xlsx";
import { getCurrentTokoId, selectData } from "../utils/db";

export const Route = createFileRoute("/reports")({
	component: ReportsSimple,
});

interface Barang {
	id: string;
	name: string;
	stock: number;
	min_stock: number;
	sku: string;
	harga_beli: number;
	harga_jual: number;
}

function ReportsSimple() {
	const [timeRange, setTimeRange] = createSignal("30 Hari Terakhir");
	const [activeToast, setActiveToast] = createSignal("");

	// Helper toast
	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3500);
	}

	// Fetch and process data
	const [reportData] = createResource(timeRange, async (range) => {
		try {
			const tokoId = getCurrentTokoId();
			const tokoFilter = tokoId ? { toko_id: `eq.${tokoId}` } : {};

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

			const transaksiWithDetails =
				(await selectData<any[]>("transaksi", {
					...tokoFilter,
					created_at: `gte.${startDateStr}`,
					status: "neq.voided",
					select:
						"id, grand_total, detail_transaksi(product_name, quantity, total)",
				})) || [];

			let totalRevenue = 0;
			let totalItemsSold = 0;
			const productSales: Record<string, number> = {};

			// Track product qty AND revenue for margin calc
			const productQtyMap: Record<string, number> = {};
			const productRevenueMap: Record<string, number> = {};

			for (const t of transaksiWithDetails) {
				totalRevenue += Number(t.grand_total);
				const details = t.detail_transaksi || [];
				for (const d of details) {
					totalItemsSold += Number(d.quantity);
					if (!productQtyMap[d.product_name]) {
						productQtyMap[d.product_name] = 0;
						productRevenueMap[d.product_name] = 0;
					}
					productQtyMap[d.product_name] += Number(d.quantity);
					productRevenueMap[d.product_name] += Number(d.total);
				}
			}

			const transactionCount = transaksiWithDetails.length;

			const topProducts = Object.entries(productQtyMap)
				.map(([name, qty]) => ({
					name,
					qty,
					revenue: productRevenueMap[name] || 0,
				}))
				.sort((a, b) => b.qty - a.qty)
				.slice(0, 5);

			const allBarang =
				(await selectData<Barang[]>("barang", {
					...tokoFilter,
					select: "id, name, stock, min_stock, sku, harga_beli, harga_jual",
				})) || [];

			// Build a map from product name to harga_beli for gross profit calc
			const costMap: Record<string, number> = {};
			for (const b of allBarang) {
				costMap[b.name] = Number(b.harga_beli) || 0;
			}

			// Gross profit = sum of (qty * (harga_jual - harga_beli)) per product sold
			let totalGrossProfit = 0;
			for (const [name, qty] of Object.entries(productQtyMap)) {
				const cost = costMap[name] || 0;
				const rev = (productRevenueMap[name] || 0) / (qty || 1);
				totalGrossProfit += (rev - cost) * qty;
			}

			const lowStockItems = allBarang
				.filter((b) => b.stock <= b.min_stock)
				.sort((a, b) => a.stock - b.stock);

			return {
				totalRevenue,
				transactionCount,
				totalItemsSold,
				topProducts,
				lowStockItems,
				totalGrossProfit,
			};
		} catch (error) {
			console.error("Gagal memuat data laporan:", error);
			showToast("Gagal memuat data laporan.");
			return null;
		}
	});

	// ─── Export: CSV ─────────────────────────────────────────────────────────
	function handleExportCsv() {
		const data = reportData();
		if (!data) return;

		showToast("Membuat laporan CSV...");

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

		triggerDownload(
			new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
			`Laporan_RetailHub_${safeFileName()}.csv`,
		);
		setTimeout(() => showToast("Laporan CSV berhasil diunduh!"), 400);
	}

	// ─── Export: Excel (.xlsx) ───────────────────────────────────────────────
	function handleExportExcel() {
		const data = reportData();
		if (!data) return;

		showToast("Membuat laporan Excel...");

		const blob = buildXlsxBlob([
			{
				name: "Ringkasan",
				colWidths: [30, 25],
				rows: [
					["LAPORAN PENJUALAN RETAILHUB"],
					["Rentang Waktu", timeRange()],
					["Tanggal Cetak", new Date().toLocaleDateString("id-ID")],
					[],
					["RINGKASAN METRIK"],
					["Metrik", "Nilai"],
					["Total Pendapatan", data.totalRevenue],
					["Jumlah Transaksi", data.transactionCount],
					["Total Barang Terjual", data.totalItemsSold],
				],
			},
			{
				name: "Produk Terlaris",
				colWidths: [12, 40, 22],
				rows: [
					["5 PRODUK TERLARIS"],
					["Peringkat", "Nama Produk", "Jumlah Terjual (Pcs)"],
					...data.topProducts.map(
						(p, i) => [i + 1, p.name, p.qty] as (string | number)[],
					),
				],
			},
			{
				name: "Stok Menipis",
				colWidths: [18, 40, 14, 16],
				rows: [
					["PERINGATAN STOK MENIPIS"],
					["SKU", "Nama Produk", "Sisa Stok", "Batas Minimum"],
					...data.lowStockItems.map(
						(b) => [b.sku, b.name, b.stock, b.min_stock] as (string | number)[],
					),
				],
			},
		]);

		triggerDownload(blob, `Laporan_RetailHub_${safeFileName()}.xlsx`);
		setTimeout(() => showToast("Laporan Excel (.xlsx) berhasil diunduh!"), 400);
	}

	// ─── Export: PDF (Ringkasan) ─────────────────────────────────────────────
	function handleExportPdf() {
		const data = reportData();
		if (!data) return;

		showToast("Membuat laporan PDF ringkasan...");

		const doc = new jsPDF({
			orientation: "portrait",
			unit: "mm",
			format: "a4",
		});
		const pageW = doc.internal.pageSize.getWidth();
		const margin = 18;
		const colRight = pageW - margin;
		let y = margin;

		// ── Header ──────────────────────────────────────────────────────────
		doc.setFillColor(30, 30, 40);
		doc.rect(0, 0, pageW, 28, "F");
		doc.setTextColor(250, 250, 255);
		doc.setFontSize(18);
		doc.setFont("helvetica", "bold");
		doc.text("RETAILHUB", margin, 13);
		doc.setFontSize(9);
		doc.setFont("helvetica", "normal");
		doc.setTextColor(180, 180, 210);
		doc.text("Laporan Ringkas Penjualan Toko", margin, 20);
		doc.text(
			`Dicetak: ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`,
			colRight,
			13,
			{ align: "right" },
		);
		doc.text(`Periode: ${timeRange()}`, colRight, 20, { align: "right" });
		y = 38;

		// ── KPI Cards ───────────────────────────────────────────────────────
		const cardW = (pageW - margin * 2 - 8) / 3;
		const cards = [
			{
				label: "Total Pendapatan",
				value: `Rp ${data.totalRevenue.toLocaleString("id-ID")}`,
				color: [34, 197, 94] as [number, number, number],
			},
			{
				label: "Jumlah Transaksi",
				value: `${data.transactionCount} Struk`,
				color: [99, 102, 241] as [number, number, number],
			},
			{
				label: "Barang Terjual",
				value: `${data.totalItemsSold} Pcs`,
				color: [234, 179, 8] as [number, number, number],
			},
		];

		for (let i = 0; i < cards.length; i++) {
			const cx = margin + i * (cardW + 4);
			doc.setFillColor(20, 20, 32);
			doc.setDrawColor(...cards[i].color);
			doc.setLineWidth(0.5);
			doc.roundedRect(cx, y, cardW, 22, 3, 3, "FD");
			doc.setTextColor(...cards[i].color);
			doc.setFontSize(7);
			doc.setFont("helvetica", "bold");
			doc.text(cards[i].label.toUpperCase(), cx + 4, y + 8);
			doc.setTextColor(240, 240, 255);
			doc.setFontSize(11);
			doc.text(cards[i].value, cx + 4, y + 18);
		}
		y += 32;

		// ── Top Produk Table ────────────────────────────────────────────────
		doc.setTextColor(240, 240, 255);
		doc.setFontSize(11);
		doc.setFont("helvetica", "bold");
		doc.text("5 Produk Terlaris", margin, y);
		y += 6;

		// Table header
		doc.setFillColor(40, 40, 60);
		doc.rect(margin, y, pageW - margin * 2, 8, "F");
		doc.setTextColor(150, 150, 220);
		doc.setFontSize(8);
		doc.text("#", margin + 3, y + 5.5);
		doc.text("Nama Produk", margin + 14, y + 5.5);
		doc.text("Terjual", colRight - 2, y + 5.5, { align: "right" });
		y += 8;

		if (data.topProducts.length === 0) {
			doc.setTextColor(120, 120, 150);
			doc.setFont("helvetica", "italic");
			doc.setFontSize(8);
			doc.text(
				"Belum ada transaksi pada rentang waktu ini.",
				margin + 3,
				y + 6,
			);
			y += 14;
		} else {
			for (let i = 0; i < data.topProducts.length; i++) {
				const p = data.topProducts[i];
				const rowY = y;
				const bg = i % 2 === 0 ? [22, 22, 34] : [18, 18, 28];
				doc.setFillColor(bg[0], bg[1], bg[2]);
				doc.rect(margin, rowY, pageW - margin * 2, 8, "F");
				doc.setTextColor(200, 200, 230);
				doc.setFont("helvetica", "normal");
				doc.setFontSize(8);
				doc.text(`${i + 1}`, margin + 3, rowY + 5.5);
				doc.text(p.name.slice(0, 52), margin + 14, rowY + 5.5);
				doc.setFont("helvetica", "bold");
				doc.setTextColor(34, 197, 94);
				doc.text(`${p.qty} Pcs`, colRight - 2, rowY + 5.5, { align: "right" });
				y += 8;
			}
		}
		y += 8;

		// ── Low-Stock Alert Table ───────────────────────────────────────────
		doc.setTextColor(240, 240, 255);
		doc.setFontSize(11);
		doc.setFont("helvetica", "bold");
		doc.text("Peringatan Stok Menipis", margin, y);
		y += 6;

		doc.setFillColor(50, 25, 25);
		doc.rect(margin, y, pageW - margin * 2, 8, "F");
		doc.setTextColor(220, 100, 100);
		doc.setFontSize(8);
		doc.text("SKU", margin + 3, y + 5.5);
		doc.text("Nama Produk", margin + 38, y + 5.5);
		doc.text("Stok", colRight - 20, y + 5.5);
		doc.text("Min", colRight - 2, y + 5.5, { align: "right" });
		y += 8;

		if (data.lowStockItems.length === 0) {
			doc.setTextColor(120, 120, 150);
			doc.setFont("helvetica", "italic");
			doc.setFontSize(8);
			doc.text("Semua stok dalam kondisi aman.", margin + 3, y + 6);
			y += 14;
		} else {
			for (let i = 0; i < data.lowStockItems.slice(0, 12).length; i++) {
				const b = data.lowStockItems[i];
				const rowY = y;
				const bg = i % 2 === 0 ? [32, 16, 16] : [24, 12, 12];
				doc.setFillColor(bg[0], bg[1], bg[2]);
				doc.rect(margin, rowY, pageW - margin * 2, 8, "F");
				doc.setTextColor(210, 170, 170);
				doc.setFont("helvetica", "normal");
				doc.setFontSize(7.5);
				doc.text(b.sku.slice(0, 16), margin + 3, rowY + 5.5);
				doc.text(b.name.slice(0, 42), margin + 38, rowY + 5.5);
				doc.setFont("helvetica", "bold");
				doc.setTextColor(239, 68, 68);
				doc.text(`${b.stock}`, colRight - 20, rowY + 5.5);
				doc.setTextColor(160, 160, 190);
				doc.setFont("helvetica", "normal");
				doc.text(`${b.min_stock}`, colRight - 2, rowY + 5.5, {
					align: "right",
				});
				y += 8;
			}
		}

		// ── Footer ──────────────────────────────────────────────────────────
		const pageH = doc.internal.pageSize.getHeight();
		doc.setFillColor(30, 30, 40);
		doc.rect(0, pageH - 14, pageW, 14, "F");
		doc.setTextColor(100, 100, 130);
		doc.setFontSize(7);
		doc.setFont("helvetica", "normal");
		doc.text(
			"© 2026 RetailHub Retail Systems — Dokumen ini dibuat otomatis oleh sistem.",
			margin,
			pageH - 5,
		);
		doc.text(`Halaman 1 / 1`, colRight, pageH - 5, { align: "right" });

		doc.save(`Laporan_Ringkas_RetailHub_${safeFileName()}.pdf`);
		setTimeout(() => showToast("Laporan PDF ringkasan berhasil diunduh!"), 400);
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────
	function safeFileName() {
		const date = new Date().toISOString().slice(0, 10);
		return `${timeRange().replace(/ /g, "_")}_${date}`;
	}

	function triggerDownload(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.setAttribute("download", filename);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	// ─── Render ──────────────────────────────────────────────────────────────
	return (
		<div class="p-margin-mobile md:p-margin-desktop space-y-lg max-w-[1200px] mx-auto w-full animate-fade-in pb-12">
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

				{/* Controls row */}
				<div class="flex flex-wrap gap-sm shrink-0 items-center">
					{/* Time range picker */}
					<select
						onChange={(e) => setTimeRange(e.currentTarget.value)}
						value={timeRange()}
						class="bg-surface-container border border-outline-variant rounded-lg text-xs font-bold text-zinc-300 py-2.5 px-4 cursor-pointer outline-none focus:ring-1 focus:ring-primary"
					>
						<option>30 Hari Terakhir</option>
						<option>7 Hari Terakhir</option>
						<option>Hari Ini</option>
					</select>

					{/* CSV Button */}
					<button
						type="button"
						onClick={handleExportCsv}
						class="px-md py-2.5 bg-surface-container border border-outline-variant text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:brightness-125 transition-all cursor-pointer shadow-md disabled:opacity-40"
						disabled={reportData.loading || !reportData()}
						title="Unduh CSV"
					>
						<span class="material-symbols-outlined text-sm">table_view</span>
						<span>CSV</span>
					</button>

					{/* Excel Button */}
					<button
						type="button"
						onClick={handleExportExcel}
						class="px-md py-2.5 bg-[#1a6c34] hover:bg-[#217a3d] border border-[#2ea44f]/50 text-zinc-100 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-40"
						disabled={reportData.loading || !reportData()}
						title="Unduh Excel"
					>
						<span class="material-symbols-outlined text-sm">grid_on</span>
						<span>Excel</span>
					</button>

					{/* PDF Button */}
					<button
						type="button"
						onClick={handleExportPdf}
						class="px-md py-2.5 bg-[#b91c1c] hover:bg-[#dc2626] border border-red-700/50 text-zinc-100 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-40"
						disabled={reportData.loading || !reportData()}
						title="Unduh PDF Ringkasan"
					>
						<span class="material-symbols-outlined text-sm">
							picture_as_pdf
						</span>
						<span>PDF</span>
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
						{/* KPI Grid — 4 cards */}
						<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-xl">
							<div class="bg-surface-container border border-outline-variant/60 p-md sm:p-lg rounded-xl shadow-lg">
								<div class="flex items-center gap-sm mb-2 text-tertiary">
									<span class="material-symbols-outlined">payments</span>
									<p class="text-label-caps text-on-surface-variant uppercase font-bold text-xs">
										Total Pendapatan
									</p>
								</div>
								<p class="font-data-mono text-2xl font-bold text-on-surface">
									Rp {data().totalRevenue.toLocaleString("id-ID")}
								</p>
							</div>

							<div class="bg-surface-container border border-emerald-500/30 p-md sm:p-lg rounded-xl shadow-lg text-emerald-400">
								<div class="flex items-center gap-sm mb-2 text-emerald-400">
									<span class="material-symbols-outlined">trending_up</span>
									<p class="text-label-caps text-on-surface-variant uppercase font-bold text-xs">
										Laba Kotor
									</p>
								</div>
								<p class="font-data-mono text-2xl font-bold text-emerald-400">
									Rp{" "}
									{Math.max(0, data().totalGrossProfit).toLocaleString("id-ID")}
								</p>
							</div>

							<div class="bg-surface-container border border-outline-variant/60 p-md sm:p-lg rounded-xl shadow-lg">
								<div class="flex items-center gap-sm mb-2 text-primary">
									<span class="material-symbols-outlined">receipt_long</span>
									<p class="text-label-caps text-on-surface-variant uppercase font-bold text-xs">
										Jumlah Transaksi
									</p>
								</div>
								<p class="font-data-mono text-2xl font-bold text-on-surface">
									{data().transactionCount}{" "}
									<span class="text-base text-zinc-500">Struk</span>
								</p>
							</div>

							<div class="bg-surface-container border border-outline-variant/60 p-md sm:p-lg rounded-xl shadow-lg">
								<div class="flex items-center gap-sm mb-2 text-secondary">
									<span class="material-symbols-outlined">inventory_2</span>
									<p class="text-label-caps text-on-surface-variant uppercase font-bold text-xs">
										Total Barang Keluar
									</p>
								</div>
								<p class="font-data-mono text-2xl font-bold text-on-surface">
									{data().totalItemsSold}{" "}
									<span class="text-base text-zinc-500">Pcs</span>
								</p>
							</div>
						</div>

						{/* Dua Kolom Tabel */}
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter mb-xl">
							{/* Top Produk */}
							<div class="bg-surface-container border border-outline-variant/60 rounded-xl p-md sm:p-lg shadow-xl">
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
												<div class="text-right space-y-0.5">
													<p class="font-data-mono font-bold text-tertiary">
														{prod.qty} Pcs
													</p>
													<p class="text-[10px] text-zinc-500 font-mono">
														Rp {prod.revenue.toLocaleString("id-ID")}
													</p>
												</div>
											</div>
										)}
									</For>
								</div>
							</div>

							{/* Stok Menipis */}
							<div class="bg-surface-container border border-outline-variant/60 rounded-xl p-md sm:p-lg shadow-xl">
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

			{/* System Status Footer */}
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
