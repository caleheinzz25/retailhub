import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, onMount, Show } from "solid-js";
import { getSessionUser, insertData, selectData } from "../utils/db";

export const Route = createFileRoute("/outbound")({
	component: CashierPOS,
});

interface CartItem {
	id: string;
	sku: string;
	name: string;
	price: number;
	quantity: number;
}

interface ScanLog {
	id: string;
	status: "SUCCESS" | "UNKNOWN" | "CHECKOUT";
	time: string;
	message: string;
}

interface ReceiptDetails {
	transactionId: string;
	date: string;
	items: CartItem[];
	subtotal: number;
	tax: number;
	total: number;
	paymentMethod: string;
	cashPaid: number;
	change: number;
}

function CashierPOS() {
	const [activeToast, setActiveToast] = createSignal("");
	const [paymentMethod, setPaymentMethod] = createSignal("Tunai");
	const [cashAmount, setCashAmount] = createSignal("");
	const [receiptDialog, setReceiptDialog] = createSignal<ReceiptDetails | null>(
		null,
	);

	// Shopping cart state
	const [cart, setCart] = createSignal<CartItem[]>([]);

	// DB Products Catalog State
	const [catalogItems, setCatalogItems] = createSignal<any[]>([]);

	// Live cashier scan logs
	const [scanLogs, setScanLogs] = createSignal<ScanLog[]>([
		{
			id: "1",
			status: "SUCCESS",
			time: "14:42:10",
			message: "Mesin kasir siap digunakan.",
		},
	]);

	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3000);
	}

	// Fetch live items from Supabase on mount
	onMount(async () => {
		try {
			const res = await selectData<any[]>("barang");
			if (res) {
				setCatalogItems(res);
			}
		} catch (err) {
			console.error("Gagal mengambil data katalog sembako:", err);
		}
	});

	// Calculations
	const subtotal = () =>
		cart().reduce((acc, item) => acc + item.price * item.quantity, 0);
	const tax = () => Math.round(subtotal() * 0.11); // PPN 11%
	const grandTotal = () => subtotal() + tax();
	const totalItems = () => cart().reduce((acc, item) => acc + item.quantity, 0);

	const changeAmount = () => {
		const cash = Number.parseInt(cashAmount(), 10) || 0;
		return Math.max(0, cash - grandTotal());
	};

	const isPaymentValid = () => {
		if (paymentMethod() === "Tunai") {
			const cash = Number.parseInt(cashAmount(), 10) || 0;
			return cash >= grandTotal();
		}
		return true;
	};

	function addLog(status: "SUCCESS" | "UNKNOWN" | "CHECKOUT", message: string) {
		const now = new Date();
		const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
			now.getMinutes(),
		).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

		setScanLogs((prev) => [
			{
				id: Date.now().toString(),
				status,
				time: timeStr,
				message,
			},
			...prev,
		]);
	}

	// Action: Remove single item from cart
	function removeItem(id: string, name: string) {
		setCart((prev) => prev.filter((item) => item.id !== id));
		showToast(`Menghapus "${name}" dari keranjang belanja.`);
	}

	// Clear whole cart
	function clearCart() {
		setCart([]);
		setCashAmount("");
		showToast("Keranjang belanja kasir dibersihkan.");
	}

	const [barcodeInput, setBarcodeInput] = createSignal("");
	const [suggestions, setSuggestions] = createSignal<any[]>([]);
	const [showSuggestions, setShowSuggestions] = createSignal(false);
	const [isLoadingSuggestions, setIsLoadingSuggestions] = createSignal(false);
	let debounceTimer: any = null;

	// Handle user typing manually with a 1 second debounce before querying the database
	function handleInputChange(val: string) {
		setBarcodeInput(val);

		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		if (val.trim().length < 2) {
			setSuggestions([]);
			setShowSuggestions(false);
			return;
		}

		// Wait 1 second after typing stops before reading the database
		debounceTimer = setTimeout(async () => {
			const queryText = val.trim();
			if (!queryText) return;

			setIsLoadingSuggestions(true);
			try {
				const res = await selectData<any[]>("barang", {
					name: `ilike.%${queryText}%`,
				});
				setSuggestions(res || []);
				setShowSuggestions(true);
			} catch (err) {
				console.error("Gagal memuat saran nama barang:", err);
			} finally {
				setIsLoadingSuggestions(false);
			}
		}, 1000);
	}

	// Select and add a product to the cart
	function selectProductFromSuggestion(dbItem: any) {
		// Check stock limit
		if (dbItem.stock <= 0) {
			showToast(`Gagal: Stok untuk ${dbItem.name} habis.`);
			addLog("UNKNOWN", `Gagal tambah: ${dbItem.name} (Stok habis)`);
			return;
		}

		// Check if already in the cart
		let exist = false;
		setCart((prev) =>
			prev.map((item) => {
				if (item.sku === dbItem.sku) {
					exist = true;
					const newQty = item.quantity + 1;
					if (newQty > dbItem.stock) {
						showToast(`Stok tidak mencukupi untuk menambah ${dbItem.name}.`);
						return item;
					}
					addLog("SUCCESS", `Tambah: ${item.name} (${newQty} Pcs)`);
					showToast(`Menambah qty ${item.name} menjadi ${newQty}.`);
					return { ...item, quantity: newQty };
				}
				return item;
			}),
		);

		if (!exist) {
			const newItem: CartItem = {
				id: dbItem.id,
				sku: dbItem.sku,
				name: dbItem.name,
				price: Number.parseFloat(dbItem.harga_jual) || 0,
				quantity: 1,
			};
			setCart((prev) => [...prev, newItem]);
			addLog(
				"SUCCESS",
				`Tambah: ${newItem.name} x1 (Rp ${newItem.price.toLocaleString("id-ID")})`,
			);
			showToast(`Ditambahkan ke keranjang: ${newItem.name}`);
		}

		// Reset inputs and close dropdown
		setBarcodeInput("");
		setSuggestions([]);
		setShowSuggestions(false);
	}

	// Handle Enter key (for physical barcode scanners or quick keyboard submit)
	function handlePhysicalBarcodeScan(sku: string) {
		const cleanSku = sku.trim();
		if (!cleanSku) return;

		// 1. First try to find exact SKU/barcode match in catalog
		const catalog = catalogItems();
		const exactMatch = catalog.find(
			(item) => item.sku.toLowerCase() === cleanSku.toLowerCase(),
		);

		if (exactMatch) {
			selectProductFromSuggestion(exactMatch);
			return;
		}

		// 2. If no exact SKU match, check if we have any name matches in our loaded suggestions list
		const currentSuggestions = suggestions();
		if (currentSuggestions.length > 0) {
			// Auto select first suggested item
			selectProductFromSuggestion(currentSuggestions[0]);
		} else {
			showToast(`Produk "${cleanSku}" tidak ditemukan.`);
			addLog("UNKNOWN", `Scan gagal: "${cleanSku}" tidak dikenal`);
		}
	}

	// Simulate Cashier Scanning Items from database
	function handleBarcodeScanner() {
		const catalog = catalogItems();
		if (catalog.length === 0) {
			showToast("Katalog produk kosong di database.");
			return;
		}

		// Pick a random product from Supabase barang table
		const dbItem = catalog[Math.floor(Math.random() * catalog.length)];

		// Check if already in cart
		let exist = false;
		setCart((prev) =>
			prev.map((item) => {
				if (item.sku === dbItem.sku) {
					exist = true;
					const newQty = item.quantity + 1;
					addLog("SUCCESS", `Scan: ${item.name} (${newQty} Pcs)`);
					showToast(`Menambah qty ${item.name} menjadi ${newQty}.`);
					return { ...item, quantity: newQty };
				}
				return item;
			}),
		);

		if (!exist) {
			const newItem: CartItem = {
				id: dbItem.id,
				sku: dbItem.sku,
				name: dbItem.name,
				price: parseFloat(dbItem.harga_jual) || 0,
				quantity: 1,
			};
			setCart((prev) => [...prev, newItem]);
			addLog(
				"SUCCESS",
				`Scan: ${newItem.name} x1 (Rp ${newItem.price.toLocaleString()})`,
			);
			showToast(`Ditambahkan ke keranjang: ${newItem.name}`);
		}
	}

	// Process Checkout Payment to Supabase
	async function processCheckout(e: Event) {
		e.preventDefault();
		if (!isPaymentValid() || cart().length === 0) return;

		const cashPaid =
			paymentMethod() === "Tunai"
				? Number.parseInt(cashAmount(), 10) || grandTotal()
				: grandTotal();

		const change = cashPaid - grandTotal();

		// Create invoice object
		const cashierName = getSessionUser()?.fullname || "Kasir Utama";
		const invoiceNum = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

		const invoiceDB = {
			invoice_number: invoiceNum,
			cashier_name: cashierName,
			customer_name: null,
			payment_method: paymentMethod(),
			total_price: subtotal(),
			tax: tax(),
			grand_total: grandTotal(),
			cash_received: cashPaid,
			change_returned: change,
		};

		try {
			// 1. Insert parent transaction record
			const txRes = await insertData<any[]>("transaksi", invoiceDB);
			if (txRes && txRes.length > 0) {
				const tx = txRes[0];

				// 2. Insert child detail item rows
				for (const cartItem of cart()) {
					const detailDB = {
						transaction_id: tx.id,
						product_id: cartItem.id,
						product_name: cartItem.name,
						sku: cartItem.sku,
						price: cartItem.price,
						quantity: cartItem.quantity,
						total: cartItem.price * cartItem.quantity,
					};
					await insertData("detail_transaksi", detailDB);
				}

				// 3. Save details to show in receipt dialog
				setReceiptDialog({
					transactionId: tx.invoice_number,
					date: new Date().toLocaleString("id-ID"),
					items: [...cart()],
					subtotal: subtotal(),
					tax: tax(),
					total: grandTotal(),
					paymentMethod: paymentMethod(),
					cashPaid: cashPaid,
					change: change,
				});

				addLog("CHECKOUT", `Checkout Sukses: ${tx.invoice_number}`);
				showToast("Transaksi kasir berhasil diproses!");

				// Refresh catalog to reflect new stock levels
				const refreshed = await selectData<any[]>("barang");
				if (refreshed) {
					setCatalogItems(refreshed);
				}
			}
		} catch (err) {
			showToast(`Gagal memproses transaksi ke database: ${err}`);
		}
	}

	function resetTransaction() {
		setCart([]);
		setCashAmount("");
		setReceiptDialog(null);
	}

	return (
		<div class="p-margin-desktop max-w-[1600px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Notifications */}
			{activeToast() && (
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-sm">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			)}

			{/* Page Header */}
			<div class="flex items-end justify-between gap-md mb-lg">
				<div>
					<h2 class="font-display-lg text-display-lg text-on-surface">
						Kasir Toko (POS)
					</h2>
					<p class="text-on-surface-variant font-body-md">
						Pindai belanjaan sembako, hitung grand total belanja, PPN 11%, dan
						cetak struk.
					</p>
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-lg items-start">
				{/* Left Columns: Scanning & Cart items */}
				<div class="lg:col-span-2 space-y-md">
					{/* Simulated Barcode Scan Viewfinder */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: simulated camera barcode scanner */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: simulated camera barcode scanner */}
					<div
						onClick={handleBarcodeScanner}
						class="relative aspect-[21/9] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col items-center justify-center cursor-pointer group shadow-2xl"
					>
						<div class="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-950/60 z-10" />
						<div class="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

						{/* Center Target overlay */}
						<div class="relative z-20 flex flex-col items-center justify-center space-y-2">
							<span class="material-symbols-outlined text-5xl text-primary animate-pulse group-hover:scale-110 transition-transform">
								qr_code_scanner
							</span>
							<span class="text-xs font-bold text-zinc-400 uppercase tracking-widest group-hover:text-zinc-200 transition-colors">
								Klik untuk Simulasi Scan Barcode Sembako
							</span>
						</div>

						{/* Corner lines */}
						<div class="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-primary/40 group-hover:border-primary/80 transition-colors" />
						<div class="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-primary/40 group-hover:border-primary/80 transition-colors" />
						<div class="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-primary/40 group-hover:border-primary/80 transition-colors" />
						<div class="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-primary/40 group-hover:border-primary/80 transition-colors" />
					</div>

					{/* Physical Barcode Scanner / Manual Input */}
					<div class="bg-surface-container border border-outline-variant rounded-xl p-md shadow-2xl flex items-center gap-md relative">
						<div class="flex-1 relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-zinc-500 text-[20px]">
								search
							</span>
							<input
								type="text"
								placeholder="Scan barcode SKU, atau ketik nama sembako (contoh: Minyak, Beras)..."
								value={barcodeInput()}
								onInput={(e) => handleInputChange(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handlePhysicalBarcodeScan(barcodeInput());
									}
								}}
								class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-primary"
								ref={(el) => {
									// Auto focus input when page mounts
									setTimeout(() => el.focus(), 150);
								}}
							/>

							{/* Suggestions Autocomplete Dropdown */}
							<Show when={showSuggestions() && suggestions().length > 0}>
								<div class="absolute left-0 right-0 top-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl max-h-56 overflow-y-auto z-50 animate-fade-in">
									<For each={suggestions()}>
										{(item) => (
											<button
												type="button"
												onClick={() => selectProductFromSuggestion(item)}
												class="w-full text-left px-md py-sm hover:bg-zinc-800 transition-colors border-b border-zinc-800/60 last:border-b-0 flex justify-between items-center text-xs cursor-pointer"
											>
												<div class="flex flex-col gap-0.5">
													<span class="font-bold text-zinc-200">
														{item.name}
													</span>
													<span class="text-zinc-500 font-mono text-[10px]">
														{item.sku} • {item.category}
													</span>
												</div>
												<div class="text-right">
													<span class="font-bold text-tertiary block">
														Rp{" "}
														{parseFloat(item.harga_jual).toLocaleString(
															"id-ID",
														)}
													</span>
													<span
														class={`text-[10px] ${item.stock <= 5 ? "text-error font-semibold" : "text-zinc-400"}`}
													>
														Stok: {item.stock} Pcs
													</span>
												</div>
											</button>
										)}
									</For>
								</div>
							</Show>

							{/* Loading Spinner for Suggestions */}
							<Show when={isLoadingSuggestions()}>
								<div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
									<div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
								</div>
							</Show>
						</div>
						<button
							type="button"
							onClick={() => handlePhysicalBarcodeScan(barcodeInput())}
							class="px-lg py-2.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
						>
							Cari & Tambah
						</button>
					</div>

					{/* Cart Items Table */}
					<div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-2xl">
						<div class="px-lg py-md bg-surface-container-high/40 border-b border-outline-variant flex justify-between items-center">
							<h3 class="font-bold text-on-surface flex items-center gap-xs">
								<span class="material-symbols-outlined text-[20px]">
									shopping_basket
								</span>
								<span>Keranjang Belanjaan</span>
							</h3>
							<Show when={cart().length > 0}>
								<button
									type="button"
									onClick={clearCart}
									class="text-xs text-error hover:underline font-bold cursor-pointer"
								>
									Kosongkan Keranjang
								</button>
							</Show>
						</div>

						<div class="max-h-[380px] overflow-y-auto scrollbar-hide divide-y divide-outline-variant/35">
							<For
								each={cart()}
								fallback={
									<div class="p-xl text-center text-zinc-500 font-semibold flex flex-col items-center justify-center space-y-md">
										<span class="material-symbols-outlined text-4xl text-zinc-600">
											shopping_cart
										</span>
										<span>
											Keranjang belanja kosong. Harap scan barcode produk.
										</span>
									</div>
								}
							>
								{(item) => (
									<div class="p-lg flex items-center justify-between hover:bg-surface-variant/10 transition-all">
										<div class="space-y-xs min-w-0">
											<span class="text-xs font-semibold text-primary font-mono bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
												{item.sku}
											</span>
											<h4 class="font-bold text-on-surface text-base truncate pr-md">
												{item.name}
											</h4>
										</div>

										<div class="flex items-center gap-xl shrink-0">
											{/* Price calculation */}
											<div class="text-right">
												<div class="font-data-mono font-bold text-on-surface">
													Rp{" "}
													{(item.price * item.quantity).toLocaleString("id-ID")}
												</div>
												<div class="text-xs text-on-surface-variant font-medium">
													{item.quantity} x Rp{" "}
													{item.price.toLocaleString("id-ID")}
												</div>
											</div>

											{/* Remove Button */}
											<button
												type="button"
												onClick={() => removeItem(item.id, item.name)}
												class="p-2 text-outline hover:text-error hover:bg-error-container/20 rounded-lg transition-colors cursor-pointer"
												title="Hapus Item"
											>
												<span class="material-symbols-outlined text-[20px]">
													delete_outline
												</span>
											</button>
										</div>
									</div>
								)}
							</For>
						</div>
					</div>
				</div>

				{/* Right Column: Checkout Form & Logs */}
				<div class="space-y-md">
					{/* POS Checkout panel */}
					<form
						onSubmit={processCheckout}
						class="bg-surface-container border border-outline-variant rounded-xl p-lg space-y-lg shadow-2xl"
					>
						<h3 class="font-bold text-on-surface border-b border-outline-variant/35 pb-md flex items-center gap-xs">
							<span class="material-symbols-outlined text-[20px]">
								payments
							</span>
							<span>Pembayaran & Struk</span>
						</h3>

						{/* Bill summary details */}
						<div class="space-y-xs font-semibold text-sm">
							<div class="flex justify-between text-on-surface-variant">
								<span>Subtotal Barang ({totalItems()} Pcs)</span>
								<span class="font-data-mono">
									Rp {subtotal().toLocaleString("id-ID")}
								</span>
							</div>
							<div class="flex justify-between text-on-surface-variant">
								<span>PPN (11%)</span>
								<span class="font-data-mono font-medium">
									Rp {tax().toLocaleString("id-ID")}
								</span>
							</div>
							<div class="flex justify-between text-on-surface text-lg font-bold border-t border-outline-variant/30 pt-md mt-sm">
								<span>Total Bayar</span>
								<span class="font-data-mono text-tertiary">
									Rp {grandTotal().toLocaleString("id-ID")}
								</span>
							</div>
						</div>

						{/* Payment Methods selector */}
						<div class="space-y-sm">
							<span class="text-xs font-semibold text-zinc-400">
								METODE PEMBAYARAN
							</span>
							<div class="grid grid-cols-3 gap-sm">
								<button
									type="button"
									onClick={() => setPaymentMethod("Tunai")}
									class={`py-2 rounded-lg border font-bold text-xs flex flex-col items-center gap-xs cursor-pointer transition-all ${
										paymentMethod() === "Tunai"
											? "bg-primary/10 border-primary text-primary"
											: "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
									}`}
								>
									<span class="material-symbols-outlined text-[18px]">
										payments
									</span>
									<span>Tunai</span>
								</button>
								<button
									type="button"
									onClick={() => setPaymentMethod("QRIS")}
									class={`py-2 rounded-lg border font-bold text-xs flex flex-col items-center gap-xs cursor-pointer transition-all ${
										paymentMethod() === "QRIS"
											? "bg-primary/10 border-primary text-primary"
											: "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
									}`}
								>
									<span class="material-symbols-outlined text-[18px]">
										qr_code_2
									</span>
									<span>QRIS</span>
								</button>
								<button
									type="button"
									onClick={() => setPaymentMethod("Debit")}
									class={`py-2 rounded-lg border font-bold text-xs flex flex-col items-center gap-xs cursor-pointer transition-all ${
										paymentMethod() === "Debit"
											? "bg-primary/10 border-primary text-primary"
											: "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
									}`}
								>
									<span class="material-symbols-outlined text-[18px]">
										credit_card
									</span>
									<span>Debit</span>
								</button>
							</div>
						</div>

						{/* Cash received calculator */}
						<Show when={paymentMethod() === "Tunai"}>
							<div class="space-y-sm animate-slide-up">
								<label
									for="cash-received"
									class="text-xs font-semibold text-zinc-400"
								>
									UANG DITERIMA (TUNAI)
								</label>
								<div class="relative">
									<span class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">
										Rp
									</span>
									<input
										id="cash-received"
										type="number"
										required
										min={grandTotal()}
										onInput={(e) => setCashAmount(e.currentTarget.value)}
										value={cashAmount()}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono font-bold"
										placeholder="Jumlah Uang"
									/>
								</div>
								{isPaymentValid() && (
									<div class="flex justify-between text-xs text-tertiary font-bold pt-sm">
										<span>Kembalian Kasir:</span>
										<span class="font-mono">
											Rp {changeAmount().toLocaleString("id-ID")}
										</span>
									</div>
								)}
							</div>
						</Show>

						{/* Submit button */}
						<button
							type="submit"
							disabled={!isPaymentValid() || cart().length === 0}
							class="w-full py-3 bg-tertiary hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 text-on-tertiary font-bold rounded-lg text-sm transition-all flex items-center justify-center gap-sm cursor-pointer shadow-lg mt-4"
						>
							<span class="material-symbols-outlined">receipt_long</span>
							<span>Cetak Struk & Bayar</span>
						</button>
					</form>

					{/* Terminal Action Logs */}
					<div class="bg-surface-container border border-outline-variant rounded-xl p-lg space-y-md shadow-2xl h-[220px] flex flex-col overflow-hidden">
						<h4 class="text-xs font-bold text-zinc-400 uppercase tracking-widest pb-sm border-b border-outline-variant/35 flex items-center gap-xs">
							<span class="material-symbols-outlined text-[16px]">
								terminal
							</span>
							<span>Log Pindai Kasir</span>
						</h4>
						<div class="flex-1 overflow-y-auto scrollbar-hide space-y-sm text-xs font-mono">
							<For each={scanLogs()}>
								{(log) => (
									<div class="flex items-start gap-xs">
										<span class="text-zinc-500 shrink-0">[{log.time}]</span>
										<span
											class={`font-bold shrink-0 ${
												log.status === "SUCCESS"
													? "text-tertiary"
													: log.status === "CHECKOUT"
														? "text-primary"
														: "text-error"
											}`}
										>
											[{log.status}]
										</span>
										<span class="text-zinc-300 truncate">{log.message}</span>
									</div>
								)}
							</For>
						</div>
					</div>
				</div>
			</div>

			{/* Invoice Receipt Modal Dialog */}
			<Show when={receiptDialog()}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md animate-fade-in">
					<div class="w-full max-w-[380px] p-lg mx-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl space-y-md flex flex-col">
						{/* Print layout card wrapper */}
						<div class="bg-zinc-950 border border-zinc-850 p-lg rounded-xl font-mono text-xs text-zinc-300 space-y-md shadow-inner">
							<div class="text-center space-y-xs pb-sm border-b border-zinc-800 border-dashed">
								<h4 class="text-lg font-bold text-zinc-100 font-display uppercase tracking-wider">
									RetailHub
								</h4>
								<p class="text-[10px] text-zinc-500">
									Toko Sembako Harian & Bahan Pokok
								</p>
								<p class="text-[9px] text-zinc-600">
									Suryono - Kelola Sembako Berkualitas
								</p>
							</div>

							<div class="space-y-xs pb-sm border-b border-zinc-800 border-dashed text-[10px] text-zinc-400">
								<div>NO INVOICE: {receiptDialog()?.transactionId}</div>
								<div>TANGGAL : {receiptDialog()?.date}</div>
								<div>KASIR : {getSessionUser()?.fullname || "Kasir Utama"}</div>
							</div>

							{/* Items Purchased List */}
							<div class="space-y-sm pb-sm border-b border-zinc-800 border-dashed max-h-[220px] overflow-y-auto scrollbar-hide">
								<For each={receiptDialog()?.items || []}>
									{(item) => (
										<div class="space-y-xs">
											<div class="flex justify-between text-zinc-200 font-bold">
												<span class="truncate pr-sm">{item.name}</span>
												<span>
													Rp{" "}
													{(item.price * item.quantity).toLocaleString("id-ID")}
												</span>
											</div>
											<div class="flex justify-between text-[10px] text-zinc-500 pl-xs">
												<span>
													{item.quantity} x Rp{" "}
													{item.price.toLocaleString("id-ID")}
												</span>
												<span>{item.sku}</span>
											</div>
										</div>
									)}
								</For>
							</div>

							{/* Totals */}
							<div class="space-y-xs pt-xs text-zinc-300 font-semibold">
								<div class="flex justify-between">
									<span>Subtotal</span>
									<span>
										Rp {receiptDialog()?.subtotal.toLocaleString("id-ID")}
									</span>
								</div>
								<div class="flex justify-between text-[10px] text-zinc-500">
									<span>PPN (11%)</span>
									<span>Rp {receiptDialog()?.tax.toLocaleString("id-ID")}</span>
								</div>
								<div class="flex justify-between text-zinc-100 font-bold text-sm pt-xs border-t border-zinc-800 mt-xs">
									<span>Total Bayar</span>
									<span>
										Rp {receiptDialog()?.total.toLocaleString("id-ID")}
									</span>
								</div>
								<div class="flex justify-between text-[10px] text-zinc-500 pt-sm">
									<span>Metode Bayar</span>
									<span class="uppercase font-bold">
										{receiptDialog()?.paymentMethod}
									</span>
								</div>
								<div class="flex justify-between text-[10px] text-zinc-500">
									<span>Tunai Diterima</span>
									<span>
										Rp {receiptDialog()?.cashPaid.toLocaleString("id-ID")}
									</span>
								</div>
								<div class="flex justify-between text-tertiary font-bold text-[11px] pt-xs">
									<span>Kembalian</span>
									<span>
										Rp {receiptDialog()?.change.toLocaleString("id-ID")}
									</span>
								</div>
							</div>

							<div class="text-center text-[9px] text-zinc-600 pt-md border-t border-zinc-800 border-dashed">
								Terima Kasih Atas Kunjungan Anda!
								<br />
								RetailHub - Solusi Belanja Sembako Cepat
							</div>
						</div>

						{/* Action buttons */}
						<div class="flex gap-sm">
							<button
								type="button"
								onClick={() => alert("Cetak struk berhasil (simulasi).")}
								class="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-xs transition-all cursor-pointer"
							>
								<span class="material-symbols-outlined text-[16px]">print</span>
								<span>Print Nota</span>
							</button>
							<button
								type="button"
								onClick={resetTransaction}
								class="flex-1 py-2 bg-primary hover:brightness-110 text-on-primary font-bold rounded-lg text-xs flex items-center justify-center gap-xs transition-all cursor-pointer"
							>
								<span class="material-symbols-outlined text-[16px]">
									autorenew
								</span>
								<span>Transaksi Baru</span>
							</button>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}
