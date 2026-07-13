import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, onMount, Show } from "solid-js";
import {
	deleteData,
	findProductByBarcode,
	getCurrentTokoId,
	getSessionUser,
	insertData,
	selectData,
	updateData,
} from "../utils/db";
import {
	isAndroidMobile,
	lookupProductDetails,
	scanBarcode,
} from "../utils/scanner";

export const Route = createFileRoute("/inventory")({
	component: InventoryManagement,
});

interface InventoryItem {
	id: string;
	barcode: string;
	name: string;
	sku: string;
	category: string;
	quantity: number;
	status: string;
	location: string;
	harga_beli: number;
	harga_jual: number;
}

interface InventoryHistory {
	id: string;
	date: string;
	type: string;
	ref: string;
	qty: number;
}

interface MutationRecord {
	quantity: number;
	price: number;
	transaksi: {
		invoice_number: string;
		cashier_name: string;
		created_at: string;
	} | null;
}

function InventoryManagement() {
	const [items, setItems] = createSignal<InventoryItem[]>([]);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [filterCategory, setFilterCategory] = createSignal("Semua");
	const [activeTab, setActiveTab] = createSignal<"grid" | "table">("table");
	const [isAddModalOpen, setIsAddModalOpen] = createSignal(false);
	const [activeToast, setActiveToast] = createSignal("");
	const [selectedItemForHistory, setSelectedItemForHistory] =
		createSignal<InventoryItem | null>(null);
	const [historyModalOpen, setHistoryModalOpen] = createSignal(false);
	const [isLoadingHistory, setIsLoadingHistory] = createSignal(false);
	const [historyRecords, setHistoryRecords] = createSignal<InventoryHistory[]>(
		[],
	);
	const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);

	// States for barcode scanner on mobile
	const [scannerActive, setScannerActive] = createSignal(false);

	// Add modal form states
	const [newItemName, setNewItemName] = createSignal("");
	const [newItemSku, setNewItemSku] = createSignal("");
	const [newItemCategory, setNewItemCategory] = createSignal("Sembako");
	const [newItemHargaBeli, setNewItemHargaBeli] = createSignal(0);
	const [newItemHargaJual, setNewItemHargaJual] = createSignal(0);
	const [newItemQty, setNewItemQty] = createSignal(0);
	const [newItemLocation, setNewItemLocation] = createSignal("");
	const [newItemBarcode, setNewItemBarcode] = createSignal("");

	const categories = [
		"Semua",
		"Sembako",
		"Minuman",
		"Snack",
		"Rokok",
		"Lauk Pauk",
		"Bumbu Dapur",
		"Perawatan Tubuh",
		"Alat Rumah Tangga",
		"Minuman Kaleng",
		"Lainnya",
	];

	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3000);
	}

	function getItemStatus(
		qty: number,
	): "In Stock" | "Low Stock" | "Out of Stock" {
		if (qty <= 0) return "Out of Stock";
		if (qty <= 15) return "Low Stock";
		return "In Stock";
	}

	// Fetch data from database on mount
	onMount(async () => {
		try {
			const tokoId = getCurrentTokoId();
			const tokoFilter = tokoId ? { toko_id: `eq.${tokoId}` } : {};
			const res = await selectData<any[]>("barang", tokoFilter);
			if (res) {
				setItems(
					res.map((item) => ({
						id: item.id,
						barcode: item.sku,
						name: item.name,
						sku: item.sku,
						category: item.category,
						quantity: item.stock,
						status: getItemStatus(item.stock),
						location: item.supplier || "RAK-A-01",
						harga_beli: Number(item.harga_beli) || 0,
						harga_jual: Number(item.harga_jual) || 0,
					})),
				);
			}
		} catch (err) {
			console.error("Gagal memuat data barang dari Supabase:", err);
		}
	});

	// Action: Open History Modal & Load mutations
	async function openHistory(item: InventoryItem) {
		setSelectedItemForHistory(item);
		setHistoryModalOpen(true);
		setIsLoadingHistory(true);
		setHistoryRecords([]);
		try {
			// Query detail_transaksi with embedded parent transaksi details
			const res = await selectData<any[]>("detail_transaksi", {
				product_id: `eq.${item.id}`,
				select:
					"quantity,price,transaksi(invoice_number,cashier_name,created_at)",
			});
			if (res) {
				const mapped: InventoryHistory[] = res
					.filter((d) => d.transaksi !== null)
					.map((d) => ({
						id: crypto.randomUUID(),
						date: d.transaksi.created_at,
						type: "Penjualan",
						ref: d.transaksi.invoice_number,
						qty: d.quantity,
					}));
				setHistoryRecords(mapped);
			}
		} catch (err) {
			console.error("Gagal memuat histori barang:", err);
			showToast("Gagal memuat histori barang.");
		} finally {
			setIsLoadingHistory(false);
		}
	}

	// Filter computed results
	const filtered = () => {
		const q = searchQuery().toLowerCase();
		const cat = filterCategory();
		return items().filter((item) => {
			const matchSearch =
				!q ||
				item.name.toLowerCase().includes(q) ||
				item.sku.toLowerCase().includes(q) ||
				item.barcode.includes(q);
			const matchCategory = cat === "Semua" || item.category === cat;
			return matchSearch && matchCategory;
		});
	};

	const totalQuantity = () =>
		items().reduce((sum, item) => sum + item.quantity, 0);
	const totalValue = () =>
		items().reduce((sum, item) => sum + item.quantity * item.harga_beli, 0);

	// ── Barcode Scanner (Android) ────────────────────────────────
	async function handleScanBarcode() {
		if (!isAndroidMobile()) {
			showToast("Fitur scan hanya tersedia di perangkat Android.");
			return;
		}
		setScannerActive(true);
		try {
			const barcode = await scanBarcode();
			if (barcode) {
				setNewItemBarcode(barcode);
				
				// 1. Search database first (current store, then globally)
				let dbItem = await findProductByBarcode(barcode, getCurrentTokoId() || undefined);
				if (!dbItem) {
					dbItem = await findProductByBarcode(barcode);
				}

				if (dbItem) {
					setNewItemName(dbItem.name || "");
					setNewItemSku(dbItem.sku || barcode);
					setNewItemCategory(dbItem.category || "Sembako");
					setNewItemHargaBeli(dbItem.harga_beli || 0);
					setNewItemHargaJual(dbItem.harga_jual || 0);
					setNewItemLocation(dbItem.supplier || "RAK-A-01");
					showToast(`Produk ditemukan di database: ${dbItem.name}`);
				} else {
					// 2. Fallback to internet details lookup
					const details = await lookupProductDetails(barcode);
					setNewItemSku(barcode);
					if (details) {
						setNewItemName(details.name || "");
						setNewItemCategory(details.category || "Sembako");
						setNewItemHargaBeli(0);
						setNewItemHargaJual(0);
						showToast(`Produk ditemukan di internet: ${details.name}`);
					} else {
						setNewItemName("");
						showToast(`Barcode terbaca: ${barcode}`);
					}
				}
			}
		} catch (err) {
			console.error("Scanner error:", err);
			showToast("Gagal membaca barcode.");
		} finally {
			setScannerActive(false);
		}
	}

	// ── Search Barcode API (Web/Desktop) ──────────────────────────
	async function handleSearchByBarcode() {
		const barcode = newItemBarcode().trim();
		if (!barcode) {
			showToast("Masukkan kode barcode terlebih dahulu.");
			return;
		}
		try {
			// 1. Search database first (current store, then globally)
			let dbItem = await findProductByBarcode(barcode, getCurrentTokoId() || undefined);
			if (!dbItem) {
				dbItem = await findProductByBarcode(barcode);
			}

			if (dbItem) {
				setNewItemName(dbItem.name || "");
				setNewItemCategory(dbItem.category || "Sembako");
				setNewItemHargaBeli(dbItem.harga_beli || 0);
				setNewItemHargaJual(dbItem.harga_jual || 0);
				setNewItemSku(dbItem.sku || barcode);
				setNewItemLocation(dbItem.supplier || "RAK-A-01");
				showToast(`Produk ditemukan di database: ${dbItem.name}`);
			} else {
				// 2. Fallback to internet lookup
				const details = await lookupProductDetails(barcode);
				if (details) {
					setNewItemName(details.name || "");
					setNewItemCategory(details.category || "Sembako");
					setNewItemHargaBeli(0);
					setNewItemHargaJual(0);
					setNewItemSku(barcode);
					showToast(`Produk ditemukan di internet: ${details.name}`);
				} else {
					showToast("Barcode tidak ditemukan.");
				}
			}
		} catch (err) {
			console.error("Barcode lookup error:", err);
			showToast("Gagal mencari barcode.");
		}
	}

	// ── Add New Item ──────────────────────────────────────────────
	async function handleAddItem(e: Event) {
		e.preventDefault();
		if (!newItemName().trim() || !newItemSku().trim()) {
			showToast("Nama barang dan SKU harus diisi.");
			return;
		}

		const skuVal = newItemSku().toUpperCase();
		const nameVal = newItemName().trim();
		const catVal = newItemCategory();
		const qtyVal = newItemQty();
		const locVal = newItemLocation().toUpperCase();

		const newItemDB = {
			sku: skuVal,
			name: nameVal,
			category: catVal,
			harga_beli: newItemHargaBeli(),
			harga_jual: newItemHargaJual(),
			stock: qtyVal,
			min_stock: 5,
			supplier: locVal,
			toko_id: getCurrentTokoId(),
		};

		try {
			const res = await insertData<any[]>("barang", newItemDB);
			if (res && res.length > 0) {
				const inserted = res[0];

				if (newItemBarcode()) {
					try {
						await insertData("barcode", {
							barcode: newItemBarcode(),
							barang_id: inserted.id,
						});
					} catch (bErr) {
						console.error("Gagal menyimpan barcode:", bErr);
					}
				}

				const newItem: InventoryItem = {
					id: inserted.id,
					barcode: skuVal,
					name: nameVal,
					sku: skuVal,
					category: catVal,
					quantity: qtyVal,
					status: getItemStatus(qtyVal),
					location: locVal,
					harga_beli: newItemHargaBeli(),
					harga_jual: newItemHargaJual(),
				};
				setItems((prev) => [...prev, newItem]);
				showToast(`Barang "${nameVal}" berhasil ditambahkan ke gudang.`);
				setIsAddModalOpen(false);
				// Reset form
				setNewItemName("");
				setNewItemSku("");
				setNewItemCategory("Sembako");
				setNewItemHargaBeli(0);
				setNewItemHargaJual(0);
				setNewItemQty(0);
				setNewItemLocation("");
				setNewItemBarcode("");
			}
		} catch (err) {
			console.error("Gagal menyimpan barang:", err);
			showToast("Gagal menyimpan barang ke database.");
		}
	}

	// ── Delete Item ───────────────────────────────────────────────
	async function confirmDeleteItem(id: string) {
		try {
			await deleteData("barang", { id: `eq.${id}` });
			setItems((prev) => prev.filter((item) => item.id !== id));
			showToast("Barang berhasil dihapus.");
		} catch (err) {
			console.error("Gagal menghapus barang:", err);
			showToast("Gagal menghapus barang.");
		}
		setConfirmDelete(null);
	}

	// ── Update Item ──────────────────────────────────────────────
	async function saveItem(item: InventoryItem) {
		const newName = prompt("Nama Barang:", item.name);
		if (!newName || newName.trim() === "") return;
		const newCategory = prompt("Kategori:", item.category);
		if (!newCategory) return;
		const newPrice = prompt("Harga Beli (Rp):", String(item.harga_beli));
		if (newPrice === null) return;
		const newSellPrice = prompt("Harga Jual (Rp):", String(item.harga_jual));
		if (newSellPrice === null) return;
		const newStock = prompt("Jumlah Stok:", String(item.quantity));
		if (newStock === null) return;
		const newLocation = prompt("Lokasi Rak:", item.location);
		if (newLocation === null) return;

		try {
			await updateData(
				"barang",
				{ id: `eq.${item.id}` },
				{
					name: newName.trim(),
					category: newCategory,
					harga_beli: Number(newPrice),
					harga_jual: Number(newSellPrice),
					stock: Number(newStock),
					supplier: newLocation.toUpperCase(),
				},
			);
			setItems((prev) =>
				prev.map((i) =>
					i.id === item.id
						? {
								...i,
								name: newName.trim(),
								category: newCategory,
								harga_beli: Number(newPrice),
								harga_jual: Number(newSellPrice),
								quantity: Number(newStock),
								status: getItemStatus(Number(newStock)),
								location: newLocation.toUpperCase(),
							}
						: i,
				),
			);
			showToast("Barang berhasil diperbarui.");
		} catch (err) {
			console.error("Gagal memperbarui barang:", err);
			showToast("Gagal memperbarui barang.");
		}
	}

	return (
		<div class="p-margin-mobile md:p-margin-desktop max-w-[1600px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Message Notification */}
			{activeToast() && (
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-sm">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			)}

			{/* Header */}
			<div class="flex flex-col md:flex-row md:items-end justify-between gap-lg mb-lg">
				<div>
					<h2 class="font-display-lg text-display-lg text-on-surface">
						Manajemen Stok
					</h2>
					<p class="text-on-surface-variant font-body-md">
						Kelola stok barang sembako, pemantauan gudang, dan data inventaris
						toko Anda.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-sm shrink-0">
					{/* Tab Toggle */}
					<div class="flex bg-surface-container p-1 rounded-lg border border-outline-variant">
						<button
							type="button"
							onClick={() => setActiveTab("table")}
							class={`px-3 py-1.5 rounded shadow-sm flex items-center gap-sm text-xs font-bold transition-all cursor-pointer ${
								activeTab() === "table"
									? "bg-surface-container-highest text-primary"
									: "text-on-surface-variant hover:text-on-surface"
							}`}
						>
							<span class="material-symbols-outlined text-[18px]">table</span>
							<span>Tabel</span>
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("grid")}
							class={`px-3 py-1.5 rounded shadow-sm flex items-center gap-sm text-xs font-bold transition-all cursor-pointer ${
								activeTab() === "grid"
									? "bg-surface-container-highest text-primary"
									: "text-on-surface-variant hover:text-on-surface"
							}`}
						>
							<span class="material-symbols-outlined text-[18px]">
								grid_view
							</span>
							<span>Grid</span>
						</button>
					</div>

					<button
						type="button"
						onClick={() => setIsAddModalOpen(true)}
						class="bg-surface-container-high border border-outline-variant text-on-surface font-bold px-lg py-2 rounded-lg flex items-center gap-sm hover:bg-surface-variant transition-colors cursor-pointer w-full sm:w-auto justify-center"
					>
						<span class="material-symbols-outlined text-sm">add</span>
						<span>Tambah Barang</span>
					</button>
				</div>
			</div>

			{/* Search & Filter Bar */}
			<div class="bg-surface-container border border-outline-variant p-md rounded-xl flex flex-wrap gap-md items-center shadow-lg mb-lg">
				<div class="relative flex-1 min-w-[240px]">
					<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[20px]">
						search
					</span>
					<input
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						value={searchQuery()}
						class="w-full bg-surface-container border border-outline-variant rounded-lg pl-10 pr-4 py-1.5 text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
						placeholder="Cari nama barang, SKU, atau barcode..."
						type="text"
					/>
				</div>
				<select
					onChange={(e) => setFilterCategory(e.currentTarget.value)}
					value={filterCategory()}
					class="bg-surface-container border border-outline-variant rounded-lg text-xs font-bold text-zinc-300 py-2 px-3 cursor-pointer outline-none focus:ring-1 focus:ring-primary"
				>
					<For each={categories}>{(cat) => <option>{cat}</option>}</For>
				</select>
				<div class="flex items-center gap-lg ml-auto pr-sm text-xs font-semibold text-on-surface-variant">
					<div>
						TOTAL ITEM:{" "}
						<span class="text-primary font-bold font-data-mono">
							{items().length}
						</span>
					</div>
					<div>
						QTY:{" "}
						<span class="text-tertiary font-bold font-data-mono">
							{totalQuantity().toLocaleString()}
						</span>
					</div>
				</div>
			</div>

			{/* ────────────────── TABLE VIEW ────────────────── */}
			<Show when={activeTab() === "table"}>
				<div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-2xl">
					<div class="overflow-x-auto">
						<table class="w-full text-left border-collapse">
							<thead class="bg-surface-container-high/50 border-b border-outline-variant">
								<tr>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										SKU
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Nama Barang
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Kategori
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider text-right">
										Harga Beli
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider text-right">
										Harga Jual
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider text-right">
										Stok
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Status
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Lokasi
									</th>
									<th class="px-lg py-md text-xs font-bold text-outline uppercase tracking-wider">
										Aksi
									</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-outline-variant/30">
								<For
									each={filtered()}
									fallback={
										<tr>
											<td
												colspan="9"
												class="text-center py-12 text-zinc-500 font-semibold"
											>
												Tidak ada barang ditemukan.
											</td>
										</tr>
									}
								>
									{(item) => (
										<tr class="hover:bg-surface-variant/10 transition-colors">
											<td class="px-lg py-lg font-mono text-xs text-outline">
												{item.sku}
											</td>
											<td class="px-lg py-lg font-semibold text-on-surface">
												{item.name}
											</td>
											<td class="px-lg py-lg">
												<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
													{item.category}
												</span>
											</td>
											<td class="px-lg py-lg text-right font-data-mono text-sm text-tertiary">
												Rp {item.harga_beli.toLocaleString("id-ID")}
											</td>
											<td class="px-lg py-lg text-right font-data-mono text-sm text-primary">
												Rp {item.harga_jual.toLocaleString("id-ID")}
											</td>
											<td class="px-lg py-lg text-right font-data-mono font-bold text-on-surface">
												{item.quantity}
											</td>
											<td class="px-lg py-lg">
												<span
													class={`px-2 py-0.5 rounded text-[10px] font-bold border ${
														item.status === "In Stock"
															? "bg-tertiary/10 text-tertiary border-tertiary/20"
															: item.status === "Low Stock"
																? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
																: "bg-error/10 text-error border-error/20"
													}`}
												>
													{item.status === "In Stock"
														? "AMAN"
														: item.status === "Low Stock"
															? "MENIPIS"
															: "HABIS"}
												</span>
											</td>
											<td class="px-lg py-lg text-on-surface-variant text-sm">
												{item.location}
											</td>
											<td class="px-lg py-lg">
												<div class="flex items-center gap-sm">
													<button
														type="button"
														onClick={() => saveItem(item)}
														class="p-1.5 text-zinc-500 hover:text-primary hover:bg-surface-variant rounded-lg transition-colors cursor-pointer"
														title="Edit Barang"
													>
														<span class="material-symbols-outlined text-lg">
															edit
														</span>
													</button>
													<button
														type="button"
														onClick={() => openHistory(item)}
														class="p-1.5 text-zinc-500 hover:text-tertiary hover:bg-surface-variant rounded-lg transition-colors cursor-pointer"
														title="Lihat Riwayat"
													>
														<span class="material-symbols-outlined text-lg">
															history
														</span>
													</button>
													<button
														type="button"
														onClick={() => setConfirmDelete(item.id)}
														class="p-1.5 text-zinc-500 hover:text-error hover:bg-surface-variant rounded-lg transition-colors cursor-pointer"
														title="Hapus Barang"
													>
														<span class="material-symbols-outlined text-lg">
															delete
														</span>
													</button>
												</div>
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</div>
				</div>
			</Show>

			{/* ────────────────── GRID VIEW ────────────────── */}
			<Show when={activeTab() === "grid"}>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter">
					<For
						each={filtered()}
						fallback={
							<div class="col-span-full text-center py-12 text-zinc-500 font-semibold">
								Tidak ada barang ditemukan.
							</div>
						}
					>
						{(item) => (
							<div class="bg-surface-container border border-outline-variant rounded-xl p-lg shadow-lg hover:shadow-xl transition-all group">
								<div class="flex items-start justify-between mb-md">
									<div>
										<p class="text-xs text-outline font-mono font-bold">
											{item.sku}
										</p>
										<h3 class="font-bold text-on-surface mt-0.5">
											{item.name}
										</h3>
									</div>
									<span
										class={`px-2 py-0.5 rounded text-[10px] font-bold border ${
											item.status === "In Stock"
												? "bg-tertiary/10 text-tertiary border-tertiary/20"
												: item.status === "Low Stock"
													? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
													: "bg-error/10 text-error border-error/20"
										}`}
									>
										{item.status === "In Stock"
											? "AMAN"
											: item.status === "Low Stock"
												? "MENIPIS"
												: "HABIS"}
									</span>
								</div>

								<div class="bg-surface-container-high/40 rounded-lg p-md space-y-1.5 mb-md">
									<div class="flex justify-between text-xs">
										<span class="text-outline font-semibold">Kategori</span>
										<span class="text-on-surface">{item.category}</span>
									</div>
									<div class="flex justify-between text-xs">
										<span class="text-outline font-semibold">Harga Beli</span>
										<span class="text-tertiary font-data-mono font-bold">
											Rp {item.harga_beli.toLocaleString("id-ID")}
										</span>
									</div>
									<div class="flex justify-between text-xs">
										<span class="text-outline font-semibold">Harga Jual</span>
										<span class="text-primary font-data-mono font-bold">
											Rp {item.harga_jual.toLocaleString("id-ID")}
										</span>
									</div>
									<div class="flex justify-between text-xs">
										<span class="text-outline font-semibold">Lokasi</span>
										<span class="text-on-surface-variant">{item.location}</span>
									</div>
								</div>

								<div class="flex items-center justify-between">
									<div>
										<span class="text-[10px] text-outline font-semibold uppercase">
											Stok Tersedia
										</span>
										<p class="font-data-mono text-2xl font-bold text-on-surface">
											{item.quantity}
										</p>
									</div>
									<div class="flex gap-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
										<button
											type="button"
											onClick={() => saveItem(item)}
											class="w-9 h-9 flex items-center justify-center bg-surface-container-high border border-outline-variant text-primary rounded-lg hover:bg-primary/20 transition-colors cursor-pointer"
											title="Edit"
										>
											<span class="material-symbols-outlined text-lg">
												edit
											</span>
										</button>
										<button
											type="button"
											onClick={() => openHistory(item)}
											class="w-9 h-9 flex items-center justify-center bg-surface-container-high border border-outline-variant text-tertiary rounded-lg hover:bg-tertiary/20 transition-colors cursor-pointer"
											title="History"
										>
											<span class="material-symbols-outlined text-lg">
												history
											</span>
										</button>
										<button
											type="button"
											onClick={() => setConfirmDelete(item.id)}
											class="w-9 h-9 flex items-center justify-center bg-surface-container-high border border-outline-variant text-error rounded-lg hover:bg-error/20 transition-colors cursor-pointer"
											title="Hapus"
										>
											<span class="material-symbols-outlined text-lg">
												delete
											</span>
										</button>
									</div>
								</div>
							</div>
						)}
					</For>
				</div>
			</Show>

			{/* ── Confirm Delete Modal ───────────────────────────────── */}
			<Show when={confirmDelete()}>
				<div
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
					onClick={() => setConfirmDelete(null)}
				>
					<div
						class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-lg animate-scale-in"
						style="width: 380px; max-width: calc(100% - 2rem); flex-shrink: 0;"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 class="font-bold text-lg text-zinc-100 mb-2">Hapus Barang</h3>
						<p class="text-sm text-zinc-400 mb-lg">
							Apakah Anda yakin ingin menghapus barang ini? Tindakan ini tidak
							dapat dibatalkan.
						</p>
						<div class="flex justify-end gap-sm">
							<button
								type="button"
								onClick={() => setConfirmDelete(null)}
								class="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition-colors cursor-pointer"
							>
								Batal
							</button>
							<button
								type="button"
								onClick={() => confirmDeleteItem(confirmDelete()!)}
								class="px-4 py-2 bg-error text-white rounded-lg text-sm hover:brightness-110 transition-all cursor-pointer"
							>
								Hapus
							</button>
						</div>
					</div>
				</div>
			</Show>

			{/* ── History Modal ──────────────────────────────────────── */}
			<Show when={historyModalOpen()}>
				<div
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
					onClick={() => setHistoryModalOpen(false)}
				>
					<div
						class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-lg animate-scale-in max-h-[80vh] flex flex-col"
						style="width: 650px; max-width: calc(100% - 2rem); flex-shrink: 0;"
						onClick={(e) => e.stopPropagation()}
					>
						<div class="flex items-center justify-between pb-3 border-b border-zinc-800">
							<div>
								<h3 class="font-bold text-lg text-zinc-100">Riwayat Mutasi</h3>
								<p class="text-sm text-zinc-400">
									{selectedItemForHistory()?.name} (
									{selectedItemForHistory()?.sku})
								</p>
							</div>
							<button
								type="button"
								onClick={() => setHistoryModalOpen(false)}
								class="p-2 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
							>
								<span class="material-symbols-outlined">close</span>
							</button>
						</div>

						<div class="overflow-y-auto flex-1 mt-4">
							{isLoadingHistory() ? (
								<div class="py-12 flex flex-col items-center text-zinc-500 gap-3">
									<span class="material-symbols-outlined animate-spin text-3xl">
										autorenew
									</span>
									<p class="text-sm font-semibold animate-pulse">
										Memuat riwayat...
									</p>
								</div>
							) : historyRecords().length === 0 ? (
								<div class="py-12 text-center text-zinc-500 font-semibold">
									Belum ada mutasi untuk barang ini.
								</div>
							) : (
								<div class="space-y-2">
									<For each={historyRecords()}>
										{(record) => (
											<div class="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg border border-zinc-800">
												<div class="flex items-center gap-3">
													<div class="w-8 h-8 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center">
														<span class="material-symbols-outlined text-sm">
															shopping_cart
														</span>
													</div>
													<div>
														<p class="text-sm font-semibold text-zinc-200">
															{record.type}
														</p>
														<p class="text-xs text-zinc-500">{record.ref}</p>
													</div>
												</div>
												<div class="text-right">
													<p class="font-data-mono font-bold text-tertiary">
														-{record.qty}
													</p>
													<p class="text-[10px] text-zinc-500">
														{new Date(record.date).toLocaleDateString("id-ID")}
													</p>
												</div>
											</div>
										)}
									</For>
								</div>
							)}
						</div>
					</div>
				</div>
			</Show>

			{/* ── Add Item Modal ──────────────────────────────────────── */}
			<Show when={isAddModalOpen()}>
				<div
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
					onClick={() => setIsAddModalOpen(false)}
				>
					<div
						class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-lg animate-scale-in max-h-[90vh] overflow-y-auto"
						style="width: 500px; max-width: calc(100% - 2rem); flex-shrink: 0;"
						onClick={(e) => e.stopPropagation()}
					>
						<form onSubmit={handleAddItem}>
							<div class="flex items-center justify-between pb-3 border-b border-zinc-800">
								<h3 class="font-bold text-lg text-zinc-100">
									Tambah Barang Baru
								</h3>
								<button
									type="button"
									onClick={() => setIsAddModalOpen(false)}
									class="p-2 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
								>
									<span class="material-symbols-outlined">close</span>
								</button>
							</div>

							<div class="space-y-4 mt-4">
								{/* Barcode Scanner (Android Only) */}
								{isAndroidMobile() && (
									<div class="flex gap-sm">
										<button
											type="button"
											onClick={handleScanBarcode}
											disabled={scannerActive()}
											class="flex-1 py-2.5 bg-primary/20 border border-primary/30 text-primary font-bold rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-primary/30 transition-colors cursor-pointer disabled:opacity-40"
										>
											<span class="material-symbols-outlined text-sm">
												{scannerActive() ? "hourglass_top" : "qr_code_scanner"}
											</span>
											<span>
												{scannerActive()
													? "Memindai..."
													: "Pindai via Kamera (HP)"}
											</span>
										</button>
									</div>
								)}

								{/* Manual Barcode Entry */}
								<div class="flex gap-sm items-end">
									<div class="flex-1 space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											BARCODE (INPUT MANUAL)
										</label>
										<input
											type="text"
											value={newItemBarcode()}
											onInput={(e) => setNewItemBarcode(e.currentTarget.value)}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
											placeholder="Masukkan kode barcode"
										/>
									</div>
									<button
										type="button"
										onClick={handleSearchByBarcode}
										class="py-2 px-4 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors cursor-pointer"
									>
										Cari
									</button>
								</div>

								<div class="grid grid-cols-1 gap-4">
									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											SKU (KODE BARANG)
										</label>
										<input
											type="text"
											required
											value={newItemSku()}
											onInput={(e) => setNewItemSku(e.currentTarget.value)}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono uppercase"
											placeholder="e.g. BRG-001"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											BARCODE TERKAIT
										</label>
										<input
											type="text"
											disabled
											readonly
											value={newItemBarcode() || "Belum ada"}
											class="w-full bg-zinc-900 border border-zinc-800/80 rounded-lg px-3 py-2 text-sm text-zinc-400 font-mono cursor-not-allowed"
											placeholder="Belum ada"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											NAMA BARANG
										</label>
										<input
											type="text"
											required
											value={newItemName()}
											onInput={(e) => setNewItemName(e.currentTarget.value)}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
											placeholder="e.g. Beras Premium 5kg"
										/>
									</div>
								</div>

								<div class="grid grid-cols-1 gap-4">
									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											KATEGORI
										</label>
										<select
											onChange={(e) =>
												setNewItemCategory(e.currentTarget.value)
											}
											value={newItemCategory()}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary cursor-pointer"
										>
											<For each={categories.filter((c) => c !== "Semua")}>
												{(cat) => <option>{cat}</option>}
											</For>
										</select>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											LOKASI RAK
										</label>
										<input
											type="text"
											value={newItemLocation()}
											onInput={(e) => setNewItemLocation(e.currentTarget.value)}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono uppercase"
											placeholder="e.g. RAK-A-01"
										/>
									</div>
								</div>

								<div class="grid grid-cols-1 gap-4">
									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											HARGA BELI (Rp)
										</label>
										<input
											type="number"
											value={newItemHargaBeli()}
											onInput={(e) =>
												setNewItemHargaBeli(Number(e.currentTarget.value))
											}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
											placeholder="0"
											min="0"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											HARGA JUAL (Rp)
										</label>
										<input
											type="number"
											value={newItemHargaJual()}
											onInput={(e) =>
												setNewItemHargaJual(Number(e.currentTarget.value))
											}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
											placeholder="0"
											min="0"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											STOK AWAL
										</label>
										<input
											type="number"
											value={newItemQty()}
											onInput={(e) =>
												setNewItemQty(Number(e.currentTarget.value))
											}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
											placeholder="0"
											min="0"
										/>
									</div>
								</div>
							</div>

							<div class="flex justify-end gap-sm mt-6 pt-3 border-t border-zinc-800">
								<button
									type="button"
									onClick={() => setIsAddModalOpen(false)}
									class="px-lg py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 transition-colors cursor-pointer"
								>
									Batal
								</button>
								<button
									type="submit"
									class="px-lg py-2 bg-primary text-on-primary font-bold rounded-lg text-sm hover:brightness-110 transition-all cursor-pointer"
								>
									Simpan Barang
								</button>
							</div>
						</form>
					</div>
				</div>
			</Show>
		</div>
	);
}
