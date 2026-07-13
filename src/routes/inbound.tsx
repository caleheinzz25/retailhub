import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, onMount, Show } from "solid-js";
import {
	findProductByBarcode,
	getCurrentTokoId,
	insertData,
	selectData,
	updateData,
} from "../utils/db";
import {
	isAndroidMobile,
	lookupProductDetails,
	scanBarcode,
} from "../utils/scanner";

export const Route = createFileRoute("/inbound")({
	component: InboundReceipt,
});

interface InboundItem {
	id: string;
	sku: string;
	name: string;
	quantity: number;
	location: string;
	status: "Verified" | "Pending";
}

function InboundReceipt() {
	const [scannedItems, setScannedItems] = createSignal<InboundItem[]>([]);
	const [activeToast, setActiveToast] = createSignal("");
	const [successCount, setSuccessCount] = createSignal(0);
	const [errorCount, setErrorCount] = createSignal(0);
	const [hasSubmitted, setHasSubmitted] = createSignal(false);

	// Catalog for demo scanner selection
	const [catalogItems, setCatalogItems] = createSignal<any[]>([]);

	// Modal states
	const [isAddModalOpen, setIsAddModalOpen] = createSignal(false);
	const [isSearchModalOpen, setIsSearchModalOpen] = createSignal(false);
	const [searchQuery, setSearchQuery] = createSignal("");

	// Add modal form states
	const [newItemName, setNewItemName] = createSignal("");
	const [newItemSku, setNewItemSku] = createSignal("");
	const [newItemCategory, setNewItemCategory] = createSignal("Sembako");
	const [newItemHargaBeli, setNewItemHargaBeli] = createSignal(0);
	const [newItemHargaJual, setNewItemHargaJual] = createSignal(0);
	const [newItemQty, setNewItemQty] = createSignal(10); // Default restock quantity
	const [newItemLocation, setNewItemLocation] = createSignal("");
	const [newItemBarcode, setNewItemBarcode] = createSignal("");
	const [scannerActive, setScannerActive] = createSignal(false);
	const [isRestockOnlyMode, setIsRestockOnlyMode] = createSignal(false);
	const [barcodeSearchInput, setBarcodeSearchInput] = createSignal("");

	const categories = [
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

	// Fetch existing products on mount
	onMount(loadCatalog);

	async function loadCatalog() {
		try {
			const res = await selectData<any[]>("barang", { order: "name.asc" });
			if (res) {
				setCatalogItems(res);
			}
		} catch (err) {
			console.error("Gagal memuat katalog sembako:", err);
		}
	}

	// Save restock list directly to database
	async function saveRestockToDb() {
		const itemsList = scannedItems();
		if (itemsList.length === 0) return;

		let success = 0;
		for (const item of itemsList) {
			try {
				const dbItem = await findProductByBarcode(
					item.sku,
					getCurrentTokoId() || undefined,
				);

				if (dbItem) {
					const newQty = dbItem.stock + item.quantity;
					await updateData(
						"barang",
						{ id: `eq.${dbItem.id}` },
						{ stock: newQty },
					);
					success++;
				} else {
					console.warn(
						`Barang dengan SKU ${item.sku} tidak ditemukan di database.`,
					);
				}
			} catch (err) {
				console.error(`Gagal menyimpan restok barang ${item.sku}:`, err);
			}
		}

		setSuccessCount(success);
		setErrorCount(itemsList.length - success);
		setHasSubmitted(true);
		loadCatalog(); // Refresh local catalog
	}

	// ── Handle Scanned Barcode ────────────────────────────────────
	// Invoked when camera scans a barcode or demo scan simulates one
	async function processScannedBarcode(barcode: string) {
		setScannerActive(true);
		try {
			// 1. Check if barcode is already registered in DB
			const dbItem = await findProductByBarcode(
				barcode,
				getCurrentTokoId() || undefined,
			);

			if (dbItem) {
				// Item exists -> Open modal with all fields populated and disabled, except restock QTY
				setNewItemName(dbItem.name || "");
				setNewItemSku(dbItem.sku || "");
				setNewItemCategory(dbItem.category || "Sembako");
				setNewItemHargaBeli(dbItem.harga_beli || 0);
				setNewItemHargaJual(dbItem.harga_jual || 0);
				setNewItemQty(10); // Default restock QTY
				setNewItemLocation(dbItem.supplier || "RAK-A-01");
				setNewItemBarcode(barcode);
				setIsRestockOnlyMode(true);
				setIsAddModalOpen(true);
				showToast(`Produk ditemukan: ${dbItem.name}. Tentukan jumlah restok.`);
			} else {
				// Check if it exists globally in another store first
				const globalItem = await findProductByBarcode(barcode);
				if (globalItem) {
					// Found globally -> populate details but allow editing (to register in current store)
					showToast(`Produk ditemukan di database (toko lain). Mengisi form...`);
					setNewItemName(globalItem.name || "");
					setNewItemSku(globalItem.sku || barcode);
					setNewItemCategory(globalItem.category || "Sembako");
					setNewItemHargaBeli(globalItem.harga_beli || 0);
					setNewItemHargaJual(globalItem.harga_jual || 0);
					setNewItemQty(20); // Default initial restock quantity
					setNewItemLocation(globalItem.supplier || "RAK-A-01");
					setNewItemBarcode(barcode);
					setIsRestockOnlyMode(false); // Registering in current store
					setIsAddModalOpen(true);
				} else {
					// Item does NOT exist anywhere -> Open modal to add completely new product
					showToast(
						`Barcode ${barcode} belum terdaftar. Membuka form tambah barang...`,
					);

					// Reset form states
					setNewItemName("");
					setNewItemSku(barcode); // Use barcode as default SKU
					setNewItemCategory("Sembako");
					setNewItemHargaBeli(0);
					setNewItemHargaJual(0);
					setNewItemQty(20); // Default initial restock quantity
					setNewItemLocation("RAK-A-01");
					setNewItemBarcode(barcode);
					setIsRestockOnlyMode(false);

					// Query the internet for autofill
					try {
						const details = await lookupProductDetails(barcode);
						if (details) {
							setNewItemName(details.name || "");
							setNewItemCategory(details.category || "Sembako");
							setNewItemHargaBeli(5000); // SUGGESTED
							setNewItemHargaJual(6000); // SUGGESTED
							showToast(`Auto-fill berhasil: ${details.name}`);
						}
					} catch (e) {
						console.warn("Autofill failed:", e);
					}

					setIsAddModalOpen(true);
				}
			}
		} catch (err) {
			console.error("Gagal memproses barcode:", err);
			showToast("Gagal memproses barcode.");
		} finally {
			setScannerActive(false);
		}
	}

	// ── Camera Scan Handler (Android) ─────────────────────────────
	async function handleBarcodeScanner() {
		if (!isAndroidMobile()) {
			showToast("Kamera scan hanya tersedia di perangkat Android.");
			return;
		}
		try {
			const result = await scanBarcode();
			if (result) {
				await processScannedBarcode(result);
			}
		} catch (err) {
			console.error("[BarcodeScanner] Error:", err);
			showToast("Gagal membaca barcode.");
		}
	}

	// ── Manual Item Add Button ────────────────────────────────────
	function handleAddManualClick() {
		// Open the modal with empty fields to add a completely custom product manually
		setNewItemName("");
		setNewItemSku(`BRG-${Math.floor(100 + Math.random() * 900)}`);
		setNewItemCategory("Sembako");
		setNewItemHargaBeli(0);
		setNewItemHargaJual(0);
		setNewItemQty(10);
		setNewItemLocation("");
		setNewItemBarcode("");
		setIsRestockOnlyMode(false); // Creating a new item
		setIsAddModalOpen(true);
	}

	// ── Submit New Product Modal ──────────────────────────────────
	async function handleAddNewProduct(e: Event) {
		e.preventDefault();
		if (!newItemName().trim() || !newItemSku().trim()) {
			showToast("Nama barang dan SKU harus diisi.");
			return;
		}

		const skuVal = newItemSku().toUpperCase();
		const nameVal = newItemName().trim();
		const catVal = newItemCategory();
		const qtyVal = newItemQty();
		const locVal = newItemLocation().toUpperCase() || "RAK-A-01";

		if (isRestockOnlyMode()) {
			// Restock mode: Just add directly to the restock checklist
			const newItem: InboundItem = {
				id: Date.now().toString(),
				sku: skuVal,
				name: nameVal,
				quantity: qtyVal,
				location: locVal,
				status: "Verified",
			};
			setScannedItems((prev) => [...prev, newItem]);
			showToast(`Ditambahkan ke restok: ${nameVal} (+${qtyVal} Pcs)`);
			setIsAddModalOpen(false);
			return;
		}

		// Create mode: Save new product to database
		const newItemDB = {
			sku: skuVal,
			name: nameVal,
			category: catVal,
			harga_beli: newItemHargaBeli(),
			harga_jual: newItemHargaJual(),
			stock: 0, // Inbound will update/save it
			min_stock: 5,
			supplier: locVal,
			toko_id: getCurrentTokoId(),
		};

		try {
			// 1. Insert product
			const res = await insertData<any[]>("barang", newItemDB);
			if (res && res.length > 0) {
				const inserted = res[0];

				// 2. Insert barcode relation if barcode exists
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

				// 3. Add directly to restock checklist
				const newItem: InboundItem = {
					id: Date.now().toString(),
					sku: skuVal,
					name: nameVal,
					quantity: qtyVal,
					location: locVal,
					status: "Verified",
				};

				setScannedItems((prev) => [...prev, newItem]);
				showToast(
					`Produk "${nameVal}" berhasil didaftarkan & masuk daftar restok.`,
				);
				setIsAddModalOpen(false);
				loadCatalog(); // Refresh
			}
		} catch (err) {
			console.error("Gagal menyimpan barang baru:", err);
			showToast("Gagal menyimpan barang baru.");
		}
	}

	// ── Catalog Search & Simulation ──────────────────────────────
	const filteredCatalog = () => {
		const q = searchQuery().toLowerCase().trim();
		if (!q) return catalogItems();
		return catalogItems().filter(
			(item) =>
				(item.name || "").toLowerCase().includes(q) ||
				(item.sku || "").toLowerCase().includes(q),
		);
	};

	function handleSelectCatalogItem(item: any) {
		setNewItemName(item.name || "");
		setNewItemSku(item.sku || "");
		setNewItemCategory(item.category || "Sembako");
		setNewItemHargaBeli(item.harga_beli || 0);
		setNewItemHargaJual(item.harga_jual || 0);
		setNewItemQty(10); // Default restock quantity
		setNewItemLocation(item.supplier || "RAK-A-01");
		setNewItemBarcode(""); // Existing items don't strictly require barcode scan to restock from search
		setIsRestockOnlyMode(true);
		setIsSearchModalOpen(false);
		setIsAddModalOpen(true);
		showToast(`Restok: ${item.name}. Tentukan jumlah barang.`);
	}

	function removeItem(id: string) {
		setScannedItems((prev) => prev.filter((item) => item.id !== id));
	}

	return (
		<div class="p-margin-mobile md:p-margin-desktop max-w-[1200px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Notifications */}
			<Show when={activeToast()}>
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-sm">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			</Show>

			{/* Page Title */}
			<div class="mb-xl border-b border-outline-variant/20 pb-md">
				<h2 class="font-display-lg text-display-lg text-on-surface">
					Restok Barang Masuk
				</h2>
				<p class="text-on-surface-variant font-body-md">
					Catat barang yang masuk ke gudang/toko. Pindai barcode untuk
					mencocokkan stok, atau daftarkan produk baru secara otomatis jika
					belum terdaftar.
				</p>
			</div>

			{/* Barcode Search / Scan Input Bar */}
			<div class="bg-surface-container border border-outline-variant rounded-xl p-md shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-md mb-lg relative">
				<div class="flex-1 relative">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-zinc-500 text-[20px]">
						search
					</span>
					<input
						type="text"
						value={barcodeSearchInput()}
						onInput={(e) => setBarcodeSearchInput(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								processScannedBarcode(barcodeSearchInput());
								setBarcodeSearchInput("");
							}
						}}
						class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-primary"
						placeholder="Scan barcode dengan scanner gun, atau ketik manual..."
					/>
				</div>
				<button
					type="button"
					onClick={() => {
						processScannedBarcode(barcodeSearchInput());
						setBarcodeSearchInput("");
					}}
					class="w-full sm:w-auto px-lg py-2.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:brightness-110 transition-all cursor-pointer whitespace-nowrap text-center flex justify-center"
				>
					Proses Barcode
				</button>
			</div>

			{/* ── Quick Actions ──────────────────────────────────── */}
			<div class="grid grid-cols-2 md:grid-cols-4 gap-gutter mb-xl">
				<button
					type="button"
					onClick={() => {
						setSearchQuery("");
						setIsSearchModalOpen(true);
					}}
					class="p-lg bg-surface-container border border-outline-variant rounded-xl hover:bg-surface-variant text-sm font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-2"
					disabled={hasSubmitted()}
				>
					<span class="material-symbols-outlined text-primary text-3xl">
						manage_search
					</span>
					<span>Cari Produk Toko</span>
				</button>

				<button
					type="button"
					onClick={handleBarcodeScanner}
					class="p-lg bg-surface-container border border-outline-variant rounded-xl hover:bg-surface-variant text-sm font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-2"
					disabled={hasSubmitted()}
				>
					<span class="material-symbols-outlined text-tertiary text-3xl">
						photo_camera
					</span>
					<span>Kamera Scan (HP)</span>
				</button>

				<button
					type="button"
					onClick={handleAddManualClick}
					class="p-lg bg-surface-container border border-outline-variant rounded-xl hover:bg-surface-variant text-sm font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-2"
					disabled={hasSubmitted()}
				>
					<span class="material-symbols-outlined text-secondary text-3xl">
						edit_note
					</span>
					<span>Tambah Manual</span>
				</button>

				<button
					type="button"
					onClick={saveRestockToDb}
					disabled={scannedItems().length === 0 || hasSubmitted()}
					class="p-lg bg-surface-container border border-primary/30 rounded-xl hover:bg-primary/10 text-sm font-bold transition-all cursor-pointer disabled:opacity-40 flex flex-col items-center justify-center gap-2"
				>
					<span class="material-symbols-outlined text-primary text-3xl">
						save
					</span>
					<span>Simpan Restok</span>
				</button>
			</div>

			{/* ── Scanned Items List ────────────────────────────── */}
			<div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-lg">
				<div class="border-b border-outline-variant p-lg flex items-center justify-between">
					<h3 class="font-bold text-on-surface flex items-center gap-sm">
						<span class="material-symbols-outlined text-primary">
							inventory_2
						</span>
						<span>Daftar Barang Masuk ({scannedItems().length})</span>
					</h3>
				</div>

				<For
					each={scannedItems()}
					fallback={
						<div class="py-16 text-center text-zinc-500 font-semibold">
							<div class="material-symbols-outlined text-5xl mb-2 opacity-30">
								scan_delete
							</div>
							<p>Belum ada barang yang dipindai.</p>
							<p class="text-xs mt-1 opacity-70">
								Gunakan tombol "Cari Produk Toko", "Kamera Scan", atau "Tambah
								Manual" di atas.
							</p>
						</div>
					}
				>
					{(item, idx) => (
						<div class="flex items-center justify-between px-lg py-4 border-b border-outline-variant/20 last:border-b-0 hover:bg-surface-variant/10 transition-colors">
							<div class="flex items-center gap-lg">
								<span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-sm text-primary">
									{idx() + 1}
								</span>
								<div>
									<p class="font-semibold text-on-surface">{item.name}</p>
									<div class="flex gap-md text-xs text-on-surface-variant font-mono mt-0.5">
										<span>SKU: {item.sku}</span>
										<span>Lokasi: {item.location}</span>
									</div>
								</div>
							</div>
							<div class="flex items-center gap-lg">
								<div class="text-right">
									<p class="font-data-mono font-bold text-primary text-lg">
										+{item.quantity}
									</p>
									<span
										class={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
											item.status === "Verified"
												? "bg-tertiary/10 text-tertiary"
												: "bg-yellow-500/10 text-yellow-400"
										}`}
									>
										{item.status === "Verified" ? "TERVERIFIKASI" : "PENDING"}
									</span>
								</div>
								{!hasSubmitted() && (
									<button
										type="button"
										onClick={() => removeItem(item.id)}
										class="text-zinc-500 hover:text-error transition-colors cursor-pointer p-1"
									>
										<span class="material-symbols-outlined text-lg">close</span>
									</button>
								)}
							</div>
						</div>
					)}
				</For>
			</div>

			{/* ── Success Banner ────────────────────────────────── */}
			{hasSubmitted() && (
				<div class="mt-xl bg-tertiary/10 border border-tertiary/30 rounded-xl p-lg shadow-lg animate-scale-in">
					<div class="flex items-center gap-lg">
						<div class="w-14 h-14 rounded-full bg-tertiary/20 flex items-center justify-center">
							<span class="material-symbols-outlined text-tertiary text-3xl">
								check_circle
							</span>
						</div>
						<div>
							<h3 class="font-bold text-tertiary text-lg">
								Restok Berhasil Disimpan
							</h3>
							<p class="text-sm text-zinc-300 mt-1">
								{successCount()} barang berhasil diperbarui stoknya.
								{errorCount() > 0 && (
									<span class="text-error ml-2">
										{errorCount()} barang gagal diproses.
									</span>
								)}
							</p>
						</div>
					</div>
				</div>
			)}

			{/* ── Modal: Tambah Barang Baru (Add New Product Modal) ────── */}
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
						<form onSubmit={handleAddNewProduct}>
							<div class="flex items-center justify-between pb-3 border-b border-zinc-800">
								<h3 class="font-bold text-lg text-zinc-100">
									{isRestockOnlyMode()
										? "Restok Sembako Terdaftar"
										: "Daftarkan & Masukkan Barang Baru"}
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
								<div class="grid grid-cols-1 gap-4">
									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											SKU (KODE BARANG)
										</label>
										<input
											type="text"
											required
											disabled={isRestockOnlyMode()}
											value={newItemSku()}
											onInput={(e) => setNewItemSku(e.currentTarget.value)}
											class={`w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase ${
												isRestockOnlyMode()
													? "bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed"
													: "bg-zinc-950 border-zinc-800 text-zinc-200 focus:outline-none focus:border-primary"
											}`}
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
											value={newItemBarcode() || "Tidak ada"}
											class="w-full bg-zinc-900 border border-zinc-800/80 rounded-lg px-3 py-2 text-sm text-zinc-400 font-mono cursor-not-allowed"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											NAMA BARANG
										</label>
										<input
											type="text"
											required
											disabled={isRestockOnlyMode()}
											value={newItemName()}
											onInput={(e) => setNewItemName(e.currentTarget.value)}
											class={`w-full border rounded-lg px-3 py-2 text-sm ${
												isRestockOnlyMode()
													? "bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed"
													: "bg-zinc-950 border-zinc-800 text-zinc-200 focus:outline-none focus:border-primary"
											}`}
											placeholder="Nama Barang"
										/>
									</div>
								</div>

								<div class="grid grid-cols-1 gap-4">
									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											KATEGORI
										</label>
										<select
											disabled={isRestockOnlyMode()}
											onChange={(e) =>
												setNewItemCategory(e.currentTarget.value)
											}
											value={newItemCategory()}
											class={`w-full border rounded-lg px-3 py-2 text-sm ${
												isRestockOnlyMode()
													? "bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed"
													: "bg-zinc-950 border-zinc-800 text-zinc-200 focus:outline-none focus:border-primary cursor-pointer"
											}`}
										>
											<For each={categories}>
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
											disabled={isRestockOnlyMode()}
											value={newItemLocation()}
											onInput={(e) => setNewItemLocation(e.currentTarget.value)}
											class={`w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase ${
												isRestockOnlyMode()
													? "bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed"
													: "bg-zinc-950 border-zinc-800 text-zinc-200 focus:outline-none focus:border-primary"
											}`}
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
											disabled={isRestockOnlyMode()}
											value={newItemHargaBeli()}
											onInput={(e) =>
												setNewItemHargaBeli(Number(e.currentTarget.value))
											}
											class={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${
												isRestockOnlyMode()
													? "bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed"
													: "bg-zinc-950 border-zinc-800 text-zinc-200 focus:outline-none focus:border-primary"
											}`}
											min="0"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											HARGA JUAL (Rp)
										</label>
										<input
											type="number"
											disabled={isRestockOnlyMode()}
											value={newItemHargaJual()}
											onInput={(e) =>
												setNewItemHargaJual(Number(e.currentTarget.value))
											}
											class={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${
												isRestockOnlyMode()
													? "bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed"
													: "bg-zinc-950 border-zinc-800 text-zinc-200 focus:outline-none focus:border-primary"
											}`}
											min="0"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-xs font-semibold text-zinc-400">
											QTY RESTOK MASUK
										</label>
										<input
											type="number"
											value={newItemQty()}
											onInput={(e) =>
												setNewItemQty(Number(e.currentTarget.value))
											}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
											min="1"
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
									{isRestockOnlyMode()
										? "Tambah ke Restok"
										: "Simpan & Tambah Daftar"}
								</button>
							</div>
						</form>
					</div>
				</div>
			</Show>

			{/* ── Modal: Cari & Pilih Produk / Simulasi Scan ────────────── */}
			<Show when={isSearchModalOpen()}>
				<div
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
					onClick={() => setIsSearchModalOpen(false)}
				>
					<div
						class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-lg animate-scale-in max-h-[85vh] flex flex-col"
						style="width: 500px; max-width: calc(100% - 2rem); flex-shrink: 0;"
						onClick={(e) => e.stopPropagation()}
					>
						<div class="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
							<h3 class="font-bold text-lg text-zinc-100 flex items-center gap-sm">
								<span class="material-symbols-outlined text-primary">
									manage_search
								</span>
								<span>Cari Produk Toko</span>
							</h3>
							<button
								type="button"
								onClick={() => setIsSearchModalOpen(false)}
								class="p-2 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
							>
								<span class="material-symbols-outlined">close</span>
							</button>
						</div>

						{/* Search Input */}
						<div class="mt-4 shrink-0">
							<div class="relative">
								<span class="absolute left-3 top-2.5 material-symbols-outlined text-zinc-500 text-sm">
									search
								</span>
								<input
									type="text"
									placeholder="Cari nama barang atau SKU..."
									value={searchQuery()}
									onInput={(e) => setSearchQuery(e.currentTarget.value)}
									class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
									autofocus
								/>
							</div>
						</div>

						<div class="overflow-y-auto flex-1 mt-4 space-y-lg pr-sm min-h-[250px]">
							{/* Catalogue List */}
							<div class="space-y-sm">
								<h4 class="text-xs font-bold text-tertiary uppercase tracking-wider">
									Katalog Produk Toko ({filteredCatalog().length})
								</h4>

								<Show
									when={filteredCatalog().length > 0}
									fallback={
										<div class="text-center py-8 text-zinc-500 text-xs italic">
											Barang tidak ditemukan. Gunakan form pendaftaran barang
											baru dengan scan barcode baru di bawah.
										</div>
									}
								>
									<div class="space-y-1.5 max-h-[260px] overflow-y-auto pr-xs">
										<For each={filteredCatalog()}>
											{(item) => (
												<button
													type="button"
													onClick={() => handleSelectCatalogItem(item)}
													class="w-full text-left px-sm py-2 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer group"
												>
													<div>
														<p class="font-semibold text-zinc-200 group-hover:text-primary transition-colors">
															{item.name}
														</p>
														<div class="flex gap-md text-[10px] text-zinc-500 font-mono mt-0.5">
															<span>SKU: {item.sku}</span>
															<span>Stok Saat Ini: {item.stock} Pcs</span>
														</div>
													</div>
													<span class="material-symbols-outlined text-[16px] text-zinc-500 group-hover:text-primary">
														inbound
													</span>
												</button>
											)}
										</For>
									</div>
								</Show>
							</div>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}
