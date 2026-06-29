import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, onMount, Show } from "solid-js";
import {
	deleteData,
	getSessionUser,
	insertData,
	selectData,
	updateData,
} from "../utils/db";

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
	status: "In Stock" | "Low Stock" | "Out of Stock" | "Reserved";
	location: string;
}

function InventoryManagement() {
	const currentUser = getSessionUser();

	// Active filters state
	const [searchQuery, setSearchQuery] = createSignal("");
	const [selectedCategory, setSelectedCategory] =
		createSignal("All Categories");
	const [selectedStatus, setSelectedStatus] = createSignal("All Status");
	const [isAddModalOpen, setIsAddModalOpen] = createSignal(false);
	const [activeToast, setActiveToast] = createSignal("");

	// State for History Modal
	const [historyModalOpen, setHistoryModalOpen] = createSignal(false);
	const [selectedItemForHistory, setSelectedItemForHistory] =
		createSignal<InventoryItem | null>(null);
	const [historyRecords, setHistoryRecords] = createSignal<any[]>([]);
	const [isLoadingHistory, setIsLoadingHistory] = createSignal(false);

	// State for row-level stock adjustment inputs
	const [adjustQuantities, setAdjustQuantities] = createSignal<
		Record<string, number>
	>({});

	// New item form state
	const [newItemName, setNewItemName] = createSignal("");
	const [newItemSku, setNewItemSku] = createSignal("");
	const [newItemCategory, setNewItemCategory] = createSignal("Bahan Pokok");
	const [newItemQty, setNewItemQty] = createSignal(50);
	const [newItemLocation, setNewItemLocation] = createSignal("RAK-A-1");

	// State for live inventory items
	const [items, setItems] = createSignal<InventoryItem[]>([]);

	// Helper: Recalculate status based on quantity
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
			const res = await selectData<any[]>("barang");
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
				// Map transaction lines to history log rows
				const mapped = res.map((row: any) => ({
					date: row.transaksi?.created_at || new Date().toISOString(),
					invoice: row.transaksi?.invoice_number || "N/A",
					cashier: row.transaksi?.cashier_name || "System",
					type: "Penjualan (Outbound)",
					quantity: -row.quantity,
					price: row.price,
				}));

				// Sort by date descending
				mapped.sort(
					(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
				);
				setHistoryRecords(mapped);
			}
		} catch (err) {
			showToast(`Gagal memuat riwayat mutasi: ${err}`);
		} finally {
			setIsLoadingHistory(false);
		}
	}

	// Action: Save/Set exact absolute stock quantity
	async function saveQuantity(id: string, newQty: number) {
		if (newQty < 0) {
			showToast("Stok tidak boleh kurang dari 0!");
			return;
		}
		const target = items().find((item) => item.id === id);
		if (!target) return;
		const newStatus =
			target.status === "Reserved" ? "Reserved" : getItemStatus(newQty);

		try {
			await updateData("barang", { id: `eq.${id}` }, { stock: newQty });
			setItems((prev) =>
				prev.map((item) => {
					if (item.id === id) {
						showToast(
							`Stok ${item.name} berhasil diubah dari ${item.quantity} menjadi ${newQty} unit.`,
						);
						return { ...item, quantity: newQty, status: newStatus };
					}
					return item;
				}),
			);
		} catch (err) {
			showToast(`Gagal memperbarui stok di database: ${err}`);
		}
	}

	// Action: Mutate Quantity by delta (+1 or -1)
	async function mutateQuantity(id: string, delta: number) {
		const target = items().find((item) => item.id === id);
		if (!target) return;
		const newQty = Math.max(0, target.quantity + delta);
		const newStatus =
			target.status === "Reserved" ? "Reserved" : getItemStatus(newQty);

		try {
			await updateData("barang", { id: `eq.${id}` }, { stock: newQty });
			setItems((prev) =>
				prev.map((item) => {
					if (item.id === id) {
						showToast(
							delta > 0
								? `Menambah stok ${item.name} sebanyak ${delta} unit.`
								: `Mengurangi stok ${item.name} sebanyak ${Math.abs(delta)} unit.`,
						);
						return { ...item, quantity: newQty, status: newStatus };
					}
					return item;
				}),
			);
		} catch (err) {
			showToast(`Gagal memperbarui stok di database: ${err}`);
		}
	}

	// Action: Delete Product
	async function handleDeleteProduct(id: string, name: string) {
		if (!confirm(`Apakah Anda yakin ingin menghapus produk "${name}"?`)) return;

		try {
			await deleteData("barang", { id: `eq.${id}` });
			setItems((prev) => prev.filter((item) => item.id !== id));
			showToast(`Produk "${name}" berhasil dihapus.`);
		} catch (err) {
			showToast(`Gagal menghapus produk dari database: ${err}`);
		}
	}

	// Action: Add New Item
	async function handleAddItem(e: Event) {
		e.preventDefault();
		if (!newItemName().trim() || !newItemSku().trim()) return;

		const skuVal = newItemSku().toUpperCase();
		const nameVal = newItemName().trim();
		const catVal = newItemCategory();
		const qtyVal = newItemQty();
		const locVal = newItemLocation().toUpperCase();

		const newItemDB = {
			sku: skuVal,
			name: nameVal,
			category: catVal,
			harga_beli: 10000.0, // Default cost
			harga_jual: 12500.0, // Default retail price
			stock: qtyVal,
			min_stock: 5,
			supplier: locVal,
		};

		try {
			const res = await insertData<any[]>("barang", newItemDB);
			if (res && res.length > 0) {
				const inserted = res[0];
				const newItem: InventoryItem = {
					id: inserted.id,
					barcode: inserted.sku,
					name: inserted.name,
					sku: inserted.sku,
					category: inserted.category,
					quantity: inserted.stock,
					status: getItemStatus(inserted.stock),
					location: inserted.supplier,
				};
				setItems((prev) => [newItem, ...prev]);
				showToast(`Produk "${newItem.name}" berhasil ditambahkan.`);

				// Clear form
				setNewItemName("");
				setNewItemSku("");
				setNewItemQty(50);
				setIsAddModalOpen(false);
			}
		} catch (err) {
			showToast(`Gagal menambahkan barang ke database: ${err}`);
		}
	}

	function generateSku() {
		let catCode = "GEN";
		const cat = newItemCategory();
		if (cat === "Bahan Pokok") catCode = "BRS";
		else if (cat === "Minyak & Gula") catCode = "MYK";
		else if (cat === "Mie Instan") catCode = "MIE";
		else if (cat === "Minuman") catCode = "MNM";
		else if (cat === "Kebersihan") catCode = "KSH";

		let nameInitials = "BRG";
		const name = newItemName().trim();
		if (name) {
			const words = name.split(/\s+/).filter(Boolean);
			const initials = words.map((w) => w[0].toUpperCase()).join("");
			nameInitials = initials.slice(0, 3);
		}

		const rand = Math.floor(100 + Math.random() * 900);
		const generated = `${catCode}-${nameInitials}-${rand}`;
		setNewItemSku(generated);
	}

	// Helper to show toasts
	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3000);
	}

	// Filtered items computation
	const filteredItems = () => {
		return items().filter((item) => {
			const matchesSearch =
				item.name.toLowerCase().includes(searchQuery().toLowerCase()) ||
				item.sku.toLowerCase().includes(searchQuery().toLowerCase()) ||
				item.location.toLowerCase().includes(searchQuery().toLowerCase());

			const matchesCategory =
				selectedCategory() === "All Categories" ||
				item.category === selectedCategory();

			const matchesStatus =
				selectedStatus() === "All Status" || item.status === selectedStatus();

			return matchesSearch && matchesCategory && matchesStatus;
		});
	};

	const totalSKUs = () => items().length;
	const outOfStockCount = () =>
		items().filter((i) => i.status === "Out of Stock").length;
	const lowStockCount = () =>
		items().filter((i) => i.status === "Low Stock").length;

	return (
		<div class="p-margin-desktop space-y-lg max-w-[1600px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Notice */}
			{activeToast() && (
				<div class="fixed top-20 right-8 z-50 bg-tertiary border border-tertiary/40 text-on-tertiary px-lg py-sm rounded-xl shadow-2xl animate-slide-up flex items-center gap-xs font-semibold">
					<span class="material-symbols-outlined text-[20px]">
						notifications
					</span>
					<span class="text-sm">{activeToast()}</span>
				</div>
			)}

			{/* Page Header Area */}
			<div class="flex flex-col md:flex-row md:items-end justify-between gap-lg">
				<div>
					<h2 class="font-display-lg text-display-lg text-on-surface">
						Stok Gudang Sembako
					</h2>
					<p class="text-on-surface-variant font-body-md">
						Manajemen data beras, minyak, gula, mie instan, serta penataan tata
						letak rak.
					</p>
				</div>
				<div class="flex items-center gap-sm shrink-0">
					<div class="flex bg-surface-container p-1 rounded-lg border border-outline-variant">
						<button
							type="button"
							onClick={() => setSelectedStatus("All Status")}
							class={`px-md py-1.5 rounded shadow-sm flex items-center gap-sm text-xs font-bold transition-all cursor-pointer ${
								selectedStatus() === "All Status"
									? "bg-surface-container-highest text-primary font-bold"
									: "text-on-surface-variant hover:text-on-surface"
							}`}
						>
							<span class="material-symbols-outlined text-[18px]">
								list_alt
							</span>
							<span>Semua Stok</span>
						</button>
						<button
							type="button"
							onClick={() => setSelectedStatus("Low Stock")}
							class={`px-md py-1.5 rounded shadow-sm flex items-center gap-sm text-xs font-bold transition-all cursor-pointer ${
								selectedStatus() === "Low Stock"
									? "bg-surface-container-highest text-error font-bold"
									: "text-on-surface-variant hover:text-on-surface"
							}`}
						>
							<span class="material-symbols-outlined text-[18px]">warning</span>
							<span>Stok Kritis</span>
						</button>
					</div>
					<Show when={currentUser?.role !== "kasir"}>
						<button
							type="button"
							onClick={() => setIsAddModalOpen(true)}
							class="bg-surface-container-high border border-outline-variant text-on-surface font-bold px-lg py-2 rounded-lg flex items-center gap-sm hover:bg-surface-variant transition-colors cursor-pointer"
						>
							<span class="material-symbols-outlined text-sm">add</span>
							<span>Tambah Produk</span>
						</button>
					</Show>
				</div>
			</div>

			{/* Bento Stats Cards */}
			<div class="grid grid-cols-1 md:grid-cols-4 gap-gutter">
				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-primary">
							category
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Total Jenis Barang
						</span>
						<h3 class="text-3xl font-bold text-on-surface font-data-mono">
							{totalSKUs()} jenis
						</h3>
					</div>
				</div>

				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-error">
							warning
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Barang Stok Kritis
						</span>
						<h3 class="text-3xl font-bold text-error font-data-mono">
							{lowStockCount()} item
						</h3>
					</div>
				</div>

				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-outline">
							remove_shopping_cart
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Barang Habis
						</span>
						<h3 class="text-3xl font-bold text-on-surface-variant font-data-mono">
							{outOfStockCount()} item
						</h3>
					</div>
				</div>

				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant relative overflow-hidden group shadow-lg">
					<div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<span class="material-symbols-outlined text-6xl text-tertiary">
							inventory_2
						</span>
					</div>
					<div class="space-y-sm">
						<span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
							Kapasitas Terpakai
						</span>
						<h3 class="text-3xl font-bold text-tertiary font-data-mono">92%</h3>
					</div>
				</div>
			</div>

			{/* Filter Search Bar */}
			<div class="bg-surface-container-low border border-outline-variant p-md rounded-xl flex flex-wrap gap-md items-center shadow-lg">
				{/* Search Field */}
				<div class="relative flex-1 min-w-[240px]">
					<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
						search
					</span>
					<input
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						value={searchQuery()}
						class="w-full bg-surface-container border border-outline-variant rounded-lg pl-10 pr-4 py-1.5 text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
						placeholder="Cari berdasarkan nama sembako, SKU, atau barcode..."
						type="text"
					/>
				</div>

				{/* Category dropdown */}
				<div class="relative min-w-[160px]">
					<select
						onChange={(e) => setSelectedCategory(e.currentTarget.value)}
						value={selectedCategory()}
						class="w-full bg-surface-container border border-outline-variant rounded-lg px-4 py-1.5 text-xs font-bold text-on-surface-variant focus:outline-none focus:border-primary cursor-pointer"
					>
						<option>All Categories</option>
						<option>Bahan Pokok</option>
						<option>Minyak & Gula</option>
						<option>Mie Instan</option>
						<option>Minuman</option>
						<option>Kebersihan</option>
					</select>
				</div>
			</div>

			{/* Inventory Table Card */}
			<div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-2xl">
				<div class="overflow-x-auto scrollbar-hide">
					<table class="w-full text-left border-collapse">
						<thead class="bg-surface-container-high/50 border-b border-outline-variant">
							<tr>
								<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
									KODE BARANG / BARCODE
								</th>
								<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
									NAMA PRODUK SEMBAKO
								</th>
								<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
									KATEGORI
								</th>
								<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
									TATA LETAK RAK
								</th>
								<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs text-right">
									JUMLAH STOK
								</th>
								<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
									STATUS STOK
								</th>
								<th class="px-lg py-md border-b border-outline-variant" />
							</tr>
						</thead>
						<tbody class="divide-y divide-outline-variant/35 text-body-md">
							<For
								each={filteredItems()}
								fallback={
									<tr>
										<td
											colspan="7"
											class="text-center py-12 text-zinc-500 font-semibold"
										>
											Tidak ada produk sembako yang cocok dengan filter
											pencarian.
										</td>
									</tr>
								}
							>
								{(item) => (
									<tr class="hover:bg-surface-variant/10 transition-colors">
										{/* SKU / Barcode */}
										<td class="px-lg py-lg">
											<div class="flex flex-col">
												<span class="font-bold text-on-surface text-sm">
													{item.barcode}
												</span>
												<span class="text-[10px] text-on-surface-variant font-data-mono uppercase tracking-wider mt-1">
													SKU: {item.sku}
												</span>
											</div>
										</td>

										{/* Name */}
										<td class="px-lg py-lg font-bold text-on-surface">
											{item.name}
										</td>

										{/* Category */}
										<td class="px-lg py-lg text-on-surface-variant">
											{item.category}
										</td>

										{/* Location / Supplier */}
										<td class="px-lg py-lg">
											<div class="flex items-center gap-xs font-semibold text-xs text-primary">
												<span class="material-symbols-outlined text-[16px]">
													shelves
												</span>
												<span>{item.location}</span>
											</div>
										</td>

										{/* Qty */}
										<td class="px-lg py-lg text-right font-bold font-data-mono text-sm text-on-surface">
											{item.quantity} Pcs
										</td>

										{/* Status badge */}
										<td class="px-lg py-lg">
											<span
												class={`px-2 py-0.5 rounded text-[10px] font-bold border ${
													item.status === "In Stock"
														? "bg-tertiary/10 text-tertiary border-tertiary/20"
														: item.status === "Low Stock"
															? "bg-error/10 text-error border-error/20"
															: "bg-surface-container-highest text-zinc-500 border-zinc-800"
												}`}
											>
												{item.status.toUpperCase()}
											</span>
										</td>

										{/* Action buttons */}
										<td class="px-lg py-lg text-right">
											<div class="flex items-center justify-end gap-sm">
												<button
													type="button"
													onClick={() => openHistory(item)}
													class="p-2 text-outline hover:text-primary hover:bg-surface-variant/40 rounded-lg transition-colors cursor-pointer"
													title="Lihat Riwayat"
												>
													<span class="material-symbols-outlined text-[20px]">
														history
													</span>
												</button>
												<Show when={currentUser?.role !== "kasir"}>
													<div class="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 ml-2">
														<input
															type="number"
															min="0"
															value={
																adjustQuantities()[item.id] !== undefined
																	? adjustQuantities()[item.id]
																	: item.quantity
															}
															onInput={(e) => {
																const val = parseInt(e.currentTarget.value);
																const safeVal = isNaN(val) ? 0 : val;
																setAdjustQuantities((prev) => ({
																	...prev,
																	[item.id]: safeVal,
																}));
															}}
															class="w-12 bg-transparent text-center text-xs text-zinc-200 focus:outline-none font-mono"
															title="Ketik jumlah stok baru"
														/>
														<button
															type="button"
															onClick={() => {
																const val =
																	adjustQuantities()[item.id] !== undefined
																		? adjustQuantities()[item.id]
																		: item.quantity;
																saveQuantity(item.id, val);
															}}
															class="p-1 text-tertiary hover:bg-zinc-800 rounded transition-colors cursor-pointer"
															title="Simpan Jumlah Stok Baru"
														>
															<span class="material-symbols-outlined text-[16px]">
																done
															</span>
														</button>
													</div>
													<button
														type="button"
														onClick={() =>
															handleDeleteProduct(item.id, item.name)
														}
														class="p-2 text-outline hover:text-error hover:bg-surface-variant/40 rounded-lg transition-colors cursor-pointer"
														title="Hapus Produk"
													>
														<span class="material-symbols-outlined text-[20px]">
															delete_outline
														</span>
													</button>
												</Show>
											</div>
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>
				<div class="px-lg py-md border-t border-outline-variant/35 bg-surface-container-high/20 flex items-center justify-between text-xs text-on-surface-variant font-semibold">
					<span>
						Menampilkan {filteredItems().length} dari {totalSKUs()} jenis barang
					</span>
					<span>RetailHub Storage Locker</span>
				</div>
			</div>

			{/* Add Product Modal Overlay */}
			<Show when={isAddModalOpen()}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md animate-fade-in">
					<form
						onSubmit={handleAddItem}
						class="w-full max-w-[500px] p-lg mx-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl space-y-md"
					>
						<div class="flex justify-between items-center pb-3 border-b border-zinc-800">
							<h3 class="text-lg font-bold text-zinc-100">
								Tambah Barang Sembako Baru
							</h3>
							<button
								type="button"
								onClick={() => setIsAddModalOpen(false)}
								class="text-zinc-500 hover:text-zinc-300"
							>
								<span class="material-symbols-outlined text-sm">close</span>
							</button>
						</div>

						<div class="space-y-4">
							<div class="space-y-1">
								<label
									for="item-name"
									class="text-xs font-semibold text-zinc-400 font-sans"
								>
									NAMA PRODUK SEMBAKO
								</label>
								<input
									id="item-name"
									type="text"
									required
									onInput={(e) => setNewItemName(e.currentTarget.value)}
									value={newItemName()}
									class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
									placeholder="e.g. Beras Pandan Wangi 5kg"
								/>
							</div>

							<div class="space-y-1">
								<label
									for="item-sku"
									class="text-xs font-semibold text-zinc-400 font-sans"
								>
									KODE SKU / IDENTIFIKASI
								</label>
								<div class="flex gap-sm">
									<input
										id="item-sku"
										type="text"
										required
										onInput={(e) => setNewItemSku(e.currentTarget.value)}
										value={newItemSku()}
										class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
										placeholder="e.g. BRS-PDN-5K"
									/>
									<button
										type="button"
										onClick={generateSku}
										class="bg-zinc-850 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs px-md py-2 rounded-lg flex items-center gap-xs font-bold transition-all shrink-0 cursor-pointer"
									>
										<span class="material-symbols-outlined text-[16px]">
											magic_button
										</span>
										<span>Generate</span>
									</button>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-md">
								<div class="space-y-1">
									<label
										for="item-category"
										class="text-xs font-semibold text-zinc-400"
									>
										KATEGORI
									</label>
									<select
										id="item-category"
										onChange={(e) => setNewItemCategory(e.currentTarget.value)}
										value={newItemCategory()}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary cursor-pointer text-zinc-300"
									>
										<option>Bahan Pokok</option>
										<option>Minyak & Gula</option>
										<option>Mie Instan</option>
										<option>Minuman</option>
										<option>Kebersihan</option>
									</select>
								</div>

								<div class="space-y-1">
									<label
										for="item-qty"
										class="text-xs font-semibold text-zinc-400"
									>
										STOK AWAL (QTY)
									</label>
									<input
										id="item-qty"
										type="number"
										required
										min="0"
										onInput={(e) =>
											setNewItemQty(parseInt(e.currentTarget.value) || 0)
										}
										value={newItemQty()}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
									/>
								</div>
							</div>

							<div class="space-y-1">
								<label
									for="item-location"
									class="text-xs font-semibold text-zinc-400"
								>
									KODE LOKASI PENATAAN RAK
								</label>
								<input
									id="item-location"
									type="text"
									required
									onInput={(e) => setNewItemLocation(e.currentTarget.value)}
									value={newItemLocation()}
									class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
									placeholder="e.g. RAK-A-01"
								/>
							</div>
						</div>

						<div class="flex justify-end gap-sm pt-3 border-t border-zinc-800">
							<button
								type="button"
								onClick={() => setIsAddModalOpen(false)}
								class="px-lg py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
							>
								Batal
							</button>
							<button
								type="submit"
								class="px-lg py-2 bg-primary text-on-primary font-bold rounded-lg text-sm hover:brightness-110 transition-all cursor-pointer"
							>
								Simpan Produk
							</button>
						</div>
					</form>
				</div>
			</Show>
			{/* Stock History Modal */}
			<Show when={historyModalOpen()}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md animate-fade-in">
					<div class="w-full max-w-[650px] p-lg mx-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl space-y-md flex flex-col max-h-[85vh]">
						<div class="flex justify-between items-center pb-3 border-b border-zinc-800">
							<div class="space-y-1">
								<h3 class="text-lg font-bold text-zinc-100">
									Riwayat Mutasi Stok
								</h3>
								<p class="text-xs text-zinc-400 font-mono">
									{selectedItemForHistory()?.name} (
									{selectedItemForHistory()?.barcode})
								</p>
							</div>
							<button
								type="button"
								onClick={() => setHistoryModalOpen(false)}
								class="text-zinc-500 hover:text-zinc-300 cursor-pointer"
							>
								<span class="material-symbols-outlined text-sm">close</span>
							</button>
						</div>

						<div class="flex-1 overflow-y-auto min-h-[250px] pr-1">
							<Show
								when={!isLoadingHistory()}
								fallback={
									<div class="flex flex-col items-center justify-center py-12 space-y-2">
										<div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
										<span class="text-xs text-zinc-400">
											Memuat data mutasi...
										</span>
									</div>
								}
							>
								<Show
									when={historyRecords().length > 0}
									fallback={
										<div class="flex flex-col items-center justify-center py-12 text-center space-y-3">
											<span class="material-symbols-outlined text-4xl text-zinc-600">
												inventory_2
											</span>
											<div class="space-y-1">
												<p class="text-zinc-300 text-sm font-semibold">
													Belum Ada Riwayat
												</p>
												<p class="text-zinc-500 text-xs max-w-xs">
													Belum ada transaksi keluar/masuk untuk produk ini yang
													tercatat di database.
												</p>
											</div>
										</div>
									}
								>
									<table class="w-full text-left border-collapse">
										<thead>
											<tr class="border-b border-zinc-800 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
												<th class="py-2">Tanggal</th>
												<th class="py-2">Tipe</th>
												<th class="py-2">Referensi</th>
												<th class="py-2">Operator</th>
												<th class="py-2 text-right">Jumlah</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-zinc-800/50 text-xs">
											<For each={historyRecords()}>
												{(record) => (
													<tr class="hover:bg-zinc-800/30">
														<td class="py-3 text-zinc-400 font-mono">
															{new Date(record.date).toLocaleDateString(
																"id-ID",
																{
																	day: "2-digit",
																	month: "short",
																	year: "numeric",
																	hour: "2-digit",
																	minute: "2-digit",
																},
															)}
														</td>
														<td class="py-3 font-semibold text-zinc-300">
															{record.type}
														</td>
														<td class="py-3 text-zinc-400 font-mono">
															{record.invoice}
														</td>
														<td class="py-3 text-zinc-400">{record.cashier}</td>
														<td class="py-3 text-right font-mono font-bold text-error">
															{record.quantity} Pcs
														</td>
													</tr>
												)}
											</For>
										</tbody>
									</table>
								</Show>
							</Show>
						</div>

						<div class="pt-3 border-t border-zinc-800 flex justify-end">
							<button
								type="button"
								onClick={() => setHistoryModalOpen(false)}
								class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
							>
								Tutup
							</button>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}
