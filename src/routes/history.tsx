import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { buildXlsxBlob } from "../utils/xlsx";
import {
	callRpc,
	getCurrentTokoId,
	getSessionUser,
	selectData,
} from "../utils/db";

export const Route = createFileRoute("/history")({
	component: TransactionHistory,
});

interface TransactionRow {
	id: string;
	invoice_number: string;
	cashier_name: string;
	payment_method: string;
	grand_total: number;
	cash_received: number;
	change_returned: number;
	created_at: string;
	status: string;
	voided_at?: string;
	voided_by?: string;
	void_reason?: string;
	detail_transaksi?: DetailRow[];
}

interface DetailRow {
	product_name: string;
	sku: string;
	quantity: number;
	price: number;
	total: number;
}

function TransactionHistory() {
	const navigate = useNavigate();
	const currentUser = getSessionUser();

	// Role guard — redirect staff
	if (currentUser?.role === "staff") {
		navigate({ to: "/" });
		return null;
	}

	const [activeToast, setActiveToast] = createSignal("");
	const [searchQuery, setSearchQuery] = createSignal("");
	const [filterMethod, setFilterMethod] = createSignal("Semua");
	const [filterStatus, setFilterStatus] = createSignal("Aktif");
	const [expandedId, setExpandedId] = createSignal<string | null>(null);
	const [page, setPage] = createSignal(1);
	const [voidDialog, setVoidDialog] = createSignal<TransactionRow | null>(null);
	const [voidReason, setVoidReason] = createSignal("");
	const [isVoiding, setIsVoiding] = createSignal(false);
	const PAGE_SIZE = 20;

	const isAdminOrOwner = () =>
		currentUser?.role === "admin" || currentUser?.role === "pemilik";

	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3000);
	}

	// Fetch all transactions with nested details
	const [transactions] = createResource(async () => {
		try {
			const tokoId = getCurrentTokoId();
			const query: Record<string, string> = {
				select:
					"id,invoice_number,cashier_name,payment_method,grand_total,cash_received,change_returned,created_at,status,voided_at,voided_by,void_reason,detail_transaksi(product_name,sku,quantity,price,total)",
				order: "created_at.desc",
			};
			if (tokoId) {
				query.toko_id = `eq.${tokoId}`;
			}
			const res = await selectData<TransactionRow[]>("transaksi", query);
			return res || [];
		} catch (err) {
			console.error("Gagal memuat riwayat transaksi:", err);
			showToast("Gagal memuat riwayat transaksi.");
			return [];
		}
	});

	// Filtered + searched + status filtered list
	const filtered = () => {
		const q = searchQuery().toLowerCase();
		const m = filterMethod();
		const s = filterStatus();
		return (transactions() || []).filter((t) => {
			const matchSearch =
				!q ||
				t.invoice_number.toLowerCase().includes(q) ||
				t.cashier_name.toLowerCase().includes(q);
			const matchMethod = m === "Semua" || t.payment_method === m;
			const matchStatus =
				s === "Semua" ||
				(s === "Aktif" && t.status === "active") ||
				(s === "Voided" && t.status === "voided");
			return matchSearch && matchMethod && matchStatus;
		});
	};

	const paginated = () => {
		const start = (page() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	};

	const totalPages = () =>
		Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));

	// KPI Calculations
	const totalRevenue = () =>
		filtered().reduce((s, t) => s + Number(t.grand_total), 0);
	const avgTransaction = () =>
		filtered().length > 0 ? totalRevenue() / filtered().length : 0;

	function toggleExpand(id: string) {
		setExpandedId((prev) => (prev === id ? null : id));
	}

	// Void transaction
	async function handleVoid() {
		const tx = voidDialog();
		if (!tx || !voidReason().trim()) return;
		setIsVoiding(true);
		try {
			const result = await callRpc<{ success: boolean; error?: string }>(
				"void_transaction",
				{
					p_transaction_id: tx.id,
					p_voided_by:
						currentUser?.fullname || currentUser?.username || "unknown",
					p_reason: voidReason().trim(),
				},
			);
			if (!result.success) {
				showToast(result.error || "Gagal membatalkan transaksi.");
				return;
			}
			showToast(`Transaksi ${tx.invoice_number} berhasil dibatalkan.`);
			setVoidDialog(null);
			setVoidReason("");
			// Refresh data
			transactions.refetch();
		} catch (err) {
			console.error("Gagal void transaksi:", err);
			showToast("Gagal menghubungi server.");
		} finally {
			setIsVoiding(false);
		}
	}

	// Export filtered list to Excel
	function handleExportExcel() {
		const data = filtered();
		if (data.length === 0) {
			showToast("Tidak ada data untuk diekspor.");
			return;
		}
		showToast("Membuat laporan Excel...");
		const blob = buildXlsxBlob([
			{
				name: "Riwayat Transaksi",
				colWidths: [24, 18, 16, 14, 16, 16],
				rows: [
					[
						"No. Invoice",
						"Kasir",
						"Metode Bayar",
						"Total",
						"Bayar",
						"Kembalian",
						"Waktu",
					],
					...data.map((t) => [
						t.invoice_number,
						t.cashier_name,
						t.payment_method,
						Number(t.grand_total),
						Number(t.cash_received),
						Number(t.change_returned),
						new Date(t.created_at).toLocaleString("id-ID"),
					]),
				],
			},
		]);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `Riwayat_Transaksi_${new Date().toISOString().slice(0, 10)}.xlsx`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		setTimeout(() => showToast("Laporan Excel berhasil diunduh!"), 400);
	}

	return (
		<div class="p-margin-mobile md:p-margin-desktop max-w-[1400px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast */}
			<Show when={activeToast()}>
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-2">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			</Show>

			{/* Header */}
			<div class="flex flex-col sm:flex-row sm:items-end justify-between gap-lg mb-xl border-b border-outline-variant/20 pb-md">
				<div>
					<h2 class="font-display-lg text-display-lg text-on-surface">
						Riwayat Transaksi
					</h2>
					<p class="text-on-surface-variant font-body-md">
						Audit seluruh transaksi penjualan — filter, cari, dan lihat detail
						per struk.
					</p>
				</div>
				<button
					type="button"
					onClick={handleExportExcel}
					disabled={transactions.loading || filtered().length === 0}
					class="px-md py-2.5 bg-[#1a6c34] hover:bg-[#217a3d] border border-[#2ea44f]/50 text-zinc-100 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-40"
				>
					<span class="material-symbols-outlined text-sm">grid_on</span>
					<span>Unduh Excel</span>
				</button>
			</div>

			{/* KPI Strip */}
			<Show when={!transactions.loading}>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-gutter mb-lg">
					<div class="bg-surface-container border border-outline-variant/60 p-md rounded-xl">
						<p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
							Total Transaksi
						</p>
						<p class="font-data-mono text-2xl font-bold text-on-surface">
							{filtered().length}{" "}
							<span class="text-base text-zinc-500">Struk</span>
						</p>
					</div>
					<div class="bg-surface-container border border-outline-variant/60 p-md rounded-xl">
						<p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
							Total Pendapatan
						</p>
						<p class="font-data-mono text-2xl font-bold text-tertiary">
							Rp {totalRevenue().toLocaleString("id-ID")}
						</p>
					</div>
					<div class="bg-surface-container border border-outline-variant/60 p-md rounded-xl">
						<p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
							Rata-rata / Struk
						</p>
						<p class="font-data-mono text-2xl font-bold text-primary">
							Rp {Math.round(avgTransaction()).toLocaleString("id-ID")}
						</p>
					</div>
				</div>
			</Show>

			{/* Filters */}
			<div class="flex flex-wrap gap-sm items-center mb-md">
				<div class="relative flex-1 min-w-[200px]">
					<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[18px]">
						search
					</span>
					<input
						type="text"
						placeholder="Cari no. invoice atau kasir..."
						value={searchQuery()}
						onInput={(e) => {
							setSearchQuery(e.currentTarget.value);
							setPage(1);
						}}
						class="w-full bg-surface-container border border-outline-variant rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
					/>
				</div>
				<select
					value={filterMethod()}
					onChange={(e) => {
						setFilterMethod(e.currentTarget.value);
						setPage(1);
					}}
					class="bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-xs font-bold text-zinc-300 focus:outline-none cursor-pointer"
				>
					<option>Semua</option>
					<option>Tunai</option>
					<option>QRIS</option>
					<option>Debit</option>
				</select>
				<select
					value={filterStatus()}
					onChange={(e) => {
						setFilterStatus(e.currentTarget.value);
						setPage(1);
					}}
					class="bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-xs font-bold text-zinc-300 focus:outline-none cursor-pointer"
				>
					<option>Aktif</option>
					<option>Voided</option>
					<option>Semua</option>
				</select>
			</div>

			{/* Table */}
			<div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-2xl">
				<Show when={transactions.loading}>
					<div class="py-20 flex flex-col items-center justify-center gap-3 text-zinc-500">
						<span class="material-symbols-outlined animate-spin text-4xl">
							autorenew
						</span>
						<p class="text-sm font-semibold animate-pulse">
							Memuat riwayat transaksi...
						</p>
					</div>
				</Show>

				<Show when={!transactions.loading}>
					<div class="overflow-x-auto">
						<table class="w-full text-left border-collapse">
							<thead class="bg-surface-container-high/50 border-b border-outline-variant">
								<tr>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										No. Invoice
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Kasir
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Metode
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider text-right">
										Grand Total
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Waktu
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider text-center">
										Aksi
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider text-center">
										Detail
									</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-outline-variant/30">
								<Show
									when={paginated().length > 0}
									fallback={
										<tr>
											<td
												colspan="7"
												class="text-center py-16 text-zinc-500 font-semibold text-sm italic"
											>
												Tidak ada transaksi yang cocok dengan filter pencarian.
											</td>
										</tr>
									}
								>
									<For each={paginated()}>
										{(tx) => (
											<>
												<tr
													class={`hover:bg-surface-variant/10 transition-colors cursor-pointer ${expandedId() === tx.id ? "bg-surface-variant/10" : ""} ${tx.status === "voided" ? "bg-red-950/20 opacity-70" : ""}`}
													onClick={() => toggleExpand(tx.id)}
												>
													<td class="px-lg py-md">
														<Show
															when={tx.status === "voided"}
															fallback={
																<span class="font-mono text-xs font-bold text-primary">
																	{tx.invoice_number}
																</span>
															}
														>
															<div class="flex items-center gap-2">
																<span class="font-mono text-xs font-bold text-zinc-500 line-through">
																	{tx.invoice_number}
																</span>
																<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600/20 text-red-400 border border-red-500/30 uppercase tracking-wider">
																	VOIDED
																</span>
															</div>
														</Show>
													</td>
													<td class="px-lg py-md text-sm text-zinc-300">
														{tx.cashier_name}
													</td>
													<td class="px-lg py-md">
														<span
															class={`px-2 py-0.5 rounded text-[10px] font-bold border ${
																tx.payment_method === "Tunai"
																	? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
																	: tx.payment_method === "QRIS"
																		? "bg-primary/10 text-primary border-primary/20"
																		: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
															}`}
														>
															{tx.payment_method}
														</span>
													</td>
													<td class="px-lg py-md text-right font-data-mono font-bold text-on-surface text-sm">
														Rp {Number(tx.grand_total).toLocaleString("id-ID")}
													</td>
													<td class="px-lg py-md text-xs text-zinc-400">
														{new Date(tx.created_at).toLocaleString("id-ID", {
															dateStyle: "short",
															timeStyle: "short",
														})}
													</td>
													<td class="px-lg py-md text-center">
														<Show
															when={tx.status === "active" && isAdminOrOwner()}
														>
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	setVoidDialog(tx);
																	setVoidReason("");
																}}
																class="px-2 py-1 rounded text-[10px] font-bold bg-red-600/10 text-red-400 border border-red-500/20 hover:bg-red-600/20 transition-colors cursor-pointer"
															>
																Batalkan
															</button>
														</Show>
													</td>
													<td class="px-lg py-md text-center">
														<span
															class={`material-symbols-outlined text-[18px] text-zinc-500 transition-transform ${expandedId() === tx.id ? "rotate-180" : ""}`}
														>
															expand_more
														</span>
													</td>
												</tr>

												{/* Expandable detail row */}
												<Show when={expandedId() === tx.id}>
													<tr>
														<td
															colspan="7"
															class="bg-zinc-950 border-y border-outline-variant/30 px-lg py-md"
														>
															<p class="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
																Detail Item — {tx.invoice_number}
															</p>
															{/* Void info banner */}
															<Show when={tx.status === "voided"}>
																<div class="mb-3 p-3 rounded-lg bg-red-950/30 border border-red-500/20">
																	<p class="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">
																		Transaksi Dibatalkan
																	</p>
																	<p class="text-xs text-zinc-400">
																		Oleh:{" "}
																		<span class="font-semibold text-zinc-300">
																			{tx.voided_by || "-"}
																		</span>
																		{" | "}Alasan:{" "}
																		<span class="font-semibold text-zinc-300">
																			{tx.void_reason || "-"}
																		</span>
																		{tx.voided_at
																			? ` | ${new Date(tx.voided_at).toLocaleString("id-ID")}`
																			: ""}
																	</p>
																</div>
															</Show>
															<div class="space-y-2">
																<Show
																	when={(tx.detail_transaksi || []).length > 0}
																	fallback={
																		<p class="text-xs text-zinc-500 italic">
																			Tidak ada detail item.
																		</p>
																	}
																>
																	<For each={tx.detail_transaksi}>
																		{(d) => (
																			<div class="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2 text-sm">
																				<div>
																					<span class="font-semibold text-zinc-200">
																						{d.product_name}
																					</span>
																					<span class="text-[10px] text-zinc-500 font-mono ml-2">
																						{d.sku}
																					</span>
																				</div>
																				<div class="text-right">
																					<span class="text-zinc-400 text-xs">
																						{d.quantity} × Rp{" "}
																						{Number(d.price).toLocaleString(
																							"id-ID",
																						)}{" "}
																						={" "}
																					</span>
																					<span class="font-bold font-mono text-tertiary text-sm">
																						Rp{" "}
																						{Number(d.total).toLocaleString(
																							"id-ID",
																						)}
																					</span>
																				</div>
																			</div>
																		)}
																	</For>
																	{/* Totals row */}
																	<div class="flex items-center justify-between border-t border-zinc-800 pt-2 mt-1 text-sm">
																		<div class="text-xs text-zinc-400 space-x-4">
																			<span>
																				Bayar:{" "}
																				<span class="font-bold text-zinc-300">
																					Rp{" "}
																					{Number(
																						tx.cash_received,
																					).toLocaleString("id-ID")}
																				</span>
																			</span>
																			<span>
																				Kembalian:{" "}
																				<span class="font-bold text-zinc-300">
																					Rp{" "}
																					{Number(
																						tx.change_returned,
																					).toLocaleString("id-ID")}
																				</span>
																			</span>
																		</div>
																		<div class="font-bold text-on-surface">
																			Total:{" "}
																			<span class="text-tertiary font-mono">
																				Rp{" "}
																				{Number(tx.grand_total).toLocaleString(
																					"id-ID",
																				)}
																			</span>
																		</div>
																	</div>
																</Show>
															</div>
														</td>
													</tr>
												</Show>
											</>
										)}
									</For>
								</Show>
							</tbody>
						</table>
					</div>

					{/* Pagination */}
					<div class="px-lg py-md border-t border-outline-variant/30 flex items-center justify-between text-xs text-zinc-400 font-semibold">
						<span>
							{filtered().length} transaksi | Halaman {page()} dari{" "}
							{totalPages()}
						</span>
						<div class="flex gap-sm">
							<button
								type="button"
								disabled={page() <= 1}
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								class="px-3 py-1.5 rounded-lg bg-surface border border-outline-variant hover:bg-surface-variant disabled:opacity-40 cursor-pointer transition-colors"
							>
								← Prev
							</button>
							<button
								type="button"
								disabled={page() >= totalPages()}
								onClick={() => setPage((p) => Math.min(totalPages(), p + 1))}
								class="px-3 py-1.5 rounded-lg bg-surface border border-outline-variant hover:bg-surface-variant disabled:opacity-40 cursor-pointer transition-colors"
							>
								Next →
							</button>
						</div>
					</div>
				</Show>
			</div>

			{/* Void Confirmation Modal */}
			<Show when={voidDialog()}>
				<div
					class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
					onClick={() => setVoidDialog(null)}
				>
					<div
						class="bg-zinc-900 border border-outline-variant rounded-2xl shadow-2xl w-full max-w-md mx-4 p-lg animate-scale-in"
						onClick={(e) => e.stopPropagation()}
					>
						<div class="flex items-center gap-3 mb-md">
							<div class="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center">
								<span class="material-symbols-outlined text-red-400 text-xl">
									warning
								</span>
							</div>
							<div>
								<h3 class="font-display-sm text-display-sm text-on-surface">
									Batalkan Transaksi
								</h3>
								<p class="text-xs text-zinc-400">
									{voidDialog()?.invoice_number}
								</p>
							</div>
						</div>

						<p class="text-sm text-zinc-300 mb-4">
							Apakah Anda yakin ingin membatalkan transaksi ini? Stok barang
							akan dikembalikan ke gudang. Tindakan ini tidak dapat dibatalkan.
						</p>

						<textarea
							placeholder="Alasan pembatalan (wajib diisi)..."
							value={voidReason()}
							onInput={(e) => setVoidReason(e.currentTarget.value)}
							class="w-full bg-zinc-800 border border-outline-variant rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-primary resize-none mb-md"
							rows={3}
						/>

						<div class="flex justify-end gap-sm">
							<button
								type="button"
								onClick={() => setVoidDialog(null)}
								disabled={isVoiding()}
								class="px-4 py-2 rounded-lg bg-surface border border-outline-variant text-zinc-300 text-xs font-bold hover:bg-surface-variant transition-colors cursor-pointer disabled:opacity-40"
							>
								Batal
							</button>
							<button
								type="button"
								onClick={handleVoid}
								disabled={isVoiding() || !voidReason().trim()}
								class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-2"
							>
								<Show when={isVoiding()}>
									<span class="material-symbols-outlined text-sm animate-spin">
										autorenew
									</span>
								</Show>
								{isVoiding() ? "Memproses..." : "Ya, Batalkan"}
							</button>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}
