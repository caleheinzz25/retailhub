import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For } from "solid-js";
import { selectData, updateData } from "../utils/db";

export const Route = createFileRoute("/inbound")({
	component: InboundReceipt,
});

interface InboundItem {
	id: string;
	sku: string;
	name: string;
	quantity: number;
	location: string;
	status: "Verified" | "Processing";
}

function InboundReceipt() {
	const [activeToast, setActiveToast] = createSignal("");
	const [supplier, setSupplier] = createSignal("Gudang Logistik Bulog");
	const [receiveDate, setReceiveDate] = createSignal("2026-06-28");
	const [searchQuery, setSearchQuery] = createSignal("");

	// List of scanned items (starts empty for production)
	const [scannedItems, setScannedItems] = createSignal<InboundItem[]>([]);

	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3000);
	}

	// Delete item from scanned list
	function deleteItem(id: string, name: string) {
		setScannedItems((prev) => prev.filter((item) => item.id !== id));
		showToast(`Menghapus "${name}" dari antrean penerimaan.`);
	}

	// Clear all scanned items
	function clearAll() {
		setScannedItems([]);
		showToast("Antrean manifest restock dibersihkan.");
	}

	// Save restock data directly to database
	async function saveRestockToDb() {
		const itemsList = scannedItems();
		if (itemsList.length === 0) return;

		let successCount = 0;
		for (const item of itemsList) {
			try {
				const dbItems = await selectData<any[]>("barang", {
					sku: `eq.${item.sku}`,
				});

				if (dbItems && dbItems.length > 0) {
					const dbItem = dbItems[0];
					const newQty = dbItem.stock + item.quantity;
					await updateData(
						"barang",
						{ id: `eq.${dbItem.id}` },
						{ stock: newQty },
					);
					successCount++;
				} else {
					console.warn(
						`Barang dengan SKU ${item.sku} tidak ditemukan di database.`,
					);
				}
			} catch (err) {
				console.error(`Gagal menyimpan restok barang ${item.sku}:`, err);
			}
		}

		if (successCount > 0) {
			showToast(`Berhasil menambah stok ${successCount} produk di database.`);
			setScannedItems([]);
		} else {
			showToast("Gagal memproses restok. SKU tidak terdaftar di database.");
		}
	}

	// Simulate Camera Barcode Scan (aligned with seed data SKUs)
	function simulateCameraScan() {
		const newInboundTemplates = [
			{
				sku: "MYK-S02",
				name: "Minyak Goreng Sania 2L",
				location: "RAK-B-03",
			},
			{
				sku: "SBN-L05",
				name: "Sabun Mandi Lifebuoy 85g",
				location: "RAK-E-01",
			},
			{
				sku: "GLA-R03",
				name: "Gula Pasir Rose Brand 1kg",
				location: "RAK-B-04",
			},
		];

		const template =
			newInboundTemplates[
				Math.floor(Math.random() * newInboundTemplates.length)
			];
		const randomQty = Math.floor(10 + Math.random() * 50);

		// Add item
		const newItem: InboundItem = {
			id: Date.now().toString(),
			sku: template.sku,
			name: template.name,
			quantity: randomQty,
			location: template.location,
			status: "Verified",
		};

		setScannedItems((prev) => [newItem, ...prev]);
		showToast(`Kamera memindai: ${template.sku} (Qty: ${randomQty})`);
	}

	const filteredScannedItems = () => {
		return scannedItems().filter(
			(item) =>
				item.sku.toLowerCase().includes(searchQuery().toLowerCase()) ||
				item.name.toLowerCase().includes(searchQuery().toLowerCase()),
		);
	};

	return (
		<div class="flex flex-col lg:flex-row h-full w-full overflow-hidden animate-fade-in">
			{/* Toast Notification */}
			{activeToast() && (
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-sm">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			)}

			{/* Left Content Canvas: Form & List */}
			<section class="flex-1 p-lg flex flex-col gap-lg overflow-y-auto custom-scrollbar">
				{/* Page Title & Search Bar inside header-like section */}
				<div class="flex justify-between items-center border-b border-outline-variant/20 pb-md">
					<div>
						<h2 class="font-display-lg text-display-lg text-on-surface">
							Restock Sembako
						</h2>
						<p class="text-on-surface-variant font-body-md">
							Terima dan verifikasi barang masuk dari distributor sembako secara
							real-time.
						</p>
					</div>
					{/* Search input */}
					<div class="relative w-64 shrink-0 hidden sm:block">
						<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
							search
						</span>
						<input
							class="w-full bg-surface-container-low border border-outline-variant/60 rounded-lg pl-10 pr-4 py-2 text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
							placeholder="Cari item restock..."
							onInput={(e) => setSearchQuery(e.currentTarget.value)}
							value={searchQuery()}
							type="text"
						/>
					</div>
				</div>

				{/* Intake Form */}
				<div class="bg-surface-container p-lg rounded-xl border border-outline-variant/30 shadow-lg">
					<div class="flex items-center gap-sm mb-lg">
						<span class="material-symbols-outlined text-primary">
							description
						</span>
						<h3 class="font-headline-sm text-on-surface text-lg font-bold">
							Form Manifest Pengiriman
						</h3>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
						<div class="space-y-sm">
							<label
								for="supplier-select"
								class="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1"
							>
								DISTRIBUTOR / PEMASOK
							</label>
							<select
								id="supplier-select"
								onChange={(e) => setSupplier(e.currentTarget.value)}
								value={supplier()}
								class="w-full bg-surface-container-low border border-outline-variant/80 rounded-lg text-on-surface focus:ring-primary focus:border-primary cursor-pointer py-2 px-3 text-sm text-zinc-300"
							>
								<option>Gudang Logistik Bulog</option>
								<option>PT. Indofood Sukses Makmur</option>
								<option>PT. Wilmar Cahaya Indonesia</option>
								<option>Distributor Sembako Nasional</option>
							</select>
						</div>
						<div class="space-y-sm">
							<label
								for="receive-date"
								class="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1"
							>
								TANGGAL TERIMA
							</label>
							<input
								id="receive-date"
								onChange={(e) => setReceiveDate(e.currentTarget.value)}
								class="w-full bg-surface-container-low border border-outline-variant/80 rounded-lg text-on-surface focus:ring-primary focus:border-primary py-2 px-3 text-sm text-zinc-300"
								type="date"
								value={receiveDate()}
							/>
						</div>
					</div>
				</div>

				{/* Scanned Items List */}
				<div class="flex-1 flex flex-col min-h-0">
					<div class="flex justify-between items-end mb-md">
						<h3 class="text-label-caps text-outline text-xs font-bold uppercase tracking-wider">
							BARANG DI-SCAN ({scannedItems().length})
						</h3>
						<div class="flex gap-sm">
							<button
								type="button"
								onClick={clearAll}
								disabled={scannedItems().length === 0}
								class="px-sm py-1 border border-outline-variant/60 rounded text-[11px] font-bold text-outline uppercase tracking-wider hover:bg-surface-variant hover:text-zinc-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Batal Semua
							</button>
							<button
								type="button"
								onClick={saveRestockToDb}
								disabled={scannedItems().length === 0}
								class="px-sm py-1 bg-surface-variant rounded text-[11px] font-bold text-primary uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Simpan ke Stok
							</button>
						</div>
					</div>
					<div class="bg-surface-container rounded-xl border border-outline-variant/30 overflow-hidden flex flex-col shadow-lg">
						<div class="overflow-x-auto">
							<table class="w-full text-left border-collapse">
								<thead class="bg-surface-container-high sticky top-0 z-10">
									<tr>
										<th class="px-md py-sm text-label-caps text-outline border-b border-outline-variant/30 text-xs uppercase tracking-wider">
											STATUS
										</th>
										<th class="px-md py-sm text-label-caps text-outline border-b border-outline-variant/30 text-xs uppercase tracking-wider">
											SKU / NAMA PRODUK
										</th>
										<th class="px-md py-sm text-label-caps text-outline border-b border-outline-variant/30 text-xs uppercase tracking-wider text-right">
											QTY
										</th>
										<th class="px-md py-sm text-label-caps text-outline border-b border-outline-variant/30 text-xs uppercase tracking-wider">
											LOKASI RAK
										</th>
										<th class="px-md py-sm border-b border-outline-variant/30" />
									</tr>
								</thead>
								<tbody class="divide-y divide-outline-variant/20 text-body-md">
									<For
										each={filteredScannedItems()}
										fallback={
											<tr>
												<td
													colspan="5"
													class="text-center py-12 text-zinc-500 font-semibold"
												>
													Belum ada barang di-scan. Klik widget kamera scan di
													kanan untuk mensimulasikan restock barang!
												</td>
											</tr>
										}
									>
										{(item) => (
											<tr class="hover:bg-surface-variant/30 transition-colors">
												<td class="px-md py-md">
													<div class="flex items-center gap-xs text-tertiary">
														<span class="material-symbols-outlined text-[18px]">
															check_circle
														</span>
														<span class="font-bold text-xs uppercase tracking-wide">
															{item.status === "Verified"
																? "Terverifikasi"
																: "Proses"}
														</span>
													</div>
												</td>
												<td class="px-md py-md">
													<div class="font-data-mono text-primary font-bold text-sm">
														{item.sku}
													</div>
													<div class="text-[12px] text-on-surface-variant">
														{item.name}
													</div>
												</td>
												<td class="px-md py-md text-right font-data-mono text-sm font-semibold">
													{item.quantity} Pcs
												</td>
												<td class="px-md py-md">
													<span class="bg-secondary-container text-on-secondary-container px-2.5 py-0.5 rounded text-xs font-bold">
														{item.location}
													</span>
												</td>
												<td class="px-md py-md text-right">
													<button
														type="button"
														onClick={() => deleteItem(item.id, item.name)}
														class="text-outline hover:text-error transition-colors cursor-pointer"
														title="Hapus"
													>
														<span class="material-symbols-outlined text-[20px]">
															delete
														</span>
													</button>
												</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</section>

			{/* Right Section: Active Camera Scanner Mockup */}
			<section class="w-full lg:w-[360px] border-t lg:border-t-0 lg:border-l border-outline-variant/30 bg-surface-container-low p-lg flex flex-col gap-lg shrink-0">
				<div class="space-y-sm">
					<h3 class="text-label-caps text-outline text-xs font-bold uppercase tracking-wider">
						KAMERA SCAN BARANG MASUK
					</h3>
					<p class="text-xs text-zinc-500 leading-normal font-semibold">
						Simulasi pemindaian barang. Klik area di bawah ini untuk memindai
						kardus barang sembako yang tiba di gudang.
					</p>
				</div>

				{/* biome-ignore lint/a11y/useKeyWithClickEvents: simulated camera barcode scanner */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: simulated camera barcode scanner */}
				<div
					onClick={simulateCameraScan}
					class="relative w-full aspect-square bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center overflow-hidden cursor-pointer group shadow-xl hover:border-primary/50 transition-all duration-300"
				>
					<div class="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

					{/* Green Laser line */}
					<div class="absolute w-[80%] left-[10%] h-[2px] bg-tertiary/80 shadow-[0_0_8px_#4edea3] scan-line" />

					{/* Viewfinder Target */}
					<div class="relative z-10 text-center space-y-4">
						<span class="material-symbols-outlined text-6xl text-tertiary animate-pulse-subtle group-hover:scale-105 transition-all">
							qr_code_scanner
						</span>
						<div>
							<p class="text-zinc-300 text-xs font-bold uppercase tracking-widest">
								Kamera Aktif
							</p>
							<p class="text-zinc-500 text-[10px] mt-1 font-bold">
								KLIK DI SINI UNTUK SCAN BARANG
							</p>
						</div>
					</div>

					{/* Target brackets */}
					<div class="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-tertiary/40 group-hover:border-tertiary transition-colors" />
					<div class="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-tertiary/40 group-hover:border-tertiary transition-colors" />
					<div class="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-tertiary/40 group-hover:border-tertiary transition-colors" />
					<div class="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-tertiary/40 group-hover:border-tertiary transition-colors" />
				</div>

				{/* Scanner instructions */}
				<div class="bg-surface-container p-md rounded-xl border border-outline-variant/30 space-y-2 mt-auto text-xs">
					<h4 class="font-bold text-zinc-300 flex items-center gap-xs">
						<span class="material-symbols-outlined text-sm text-tertiary">
							info
						</span>
						Panduan Petugas
					</h4>
					<p class="text-zinc-500 leading-normal">
						Posisikan kode barcode produk tepat di depan lensa kamera scan. Data
						kuantitas barang yang terdeteksi otomatis masuk ke antrean manifest
						restock.
					</p>
				</div>
			</section>
		</div>
	);
}
