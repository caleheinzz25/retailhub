import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createSignal, createResource, For, Show, onMount } from "solid-js";
import {
	deleteData,
	getCurrentTokoId,
	getSessionUser,
	insertData,
	selectData,
	switchToko,
	updateData,
} from "../utils/db";

export const Route = createFileRoute("/stores")({ component: StoreManagement });

interface Store {
	id: string;
	name: string;
	address: string | null;
	phone: string | null;
	created_at: string;
	pemilik_id: string | null;
}

interface StoreForm {
	name: string;
	address: string;
	phone: string;
}

function StoreManagement() {
	const navigate = useNavigate();
	const currentUser = getSessionUser();
	const currentTokoId = getCurrentTokoId();
	const [stores, { refetch }] = createResource<Store[]>(() => {
		const query: Record<string, string> = {
			select: "id,name,address,phone,created_at,pemilik_id",
			order: "name.asc",
		};
		if (currentUser?.role === "pemilik") {
			query.pemilik_id = `eq.${currentUser.id}`;
		}
		return selectData<Store[]>("toko", query) as Promise<Store[]>;
	});

	// ── User count cache ──────────────────────────────────────────────
	const [userCounts, setUserCounts] = createSignal<Record<string, number>>({});

	const fetchUserCounts = async () => {
		try {
			const users = await selectData<any[]>("users", {
				select: "toko_id",
			});
			if (Array.isArray(users)) {
				const counts: Record<string, number> = {};
				for (const u of users) {
					if (u.toko_id) {
						counts[u.toko_id] = (counts[u.toko_id] || 0) + 1;
					}
				}
				setUserCounts(counts);
			}
		} catch (e) {
			console.error("[Stores] Failed to fetch user counts:", e);
		}
	};

	fetchUserCounts();

	// ── Modal State ───────────────────────────────────────────────────
	const [isModalOpen, setIsModalOpen] = createSignal(false);
	const [editingStore, setEditingStore] = createSignal<Store | null>(null);
	const [formData, setFormData] = createSignal<StoreForm>({
		name: "",
		address: "",
		phone: "",
	});
	const [formError, setFormError] = createSignal("");
	const [isSaving, setIsSaving] = createSignal(false);

	// ── Pemilik List state for Admin Assignment ──────────────────────────
	const [pemilikList, setPemilikList] = createSignal<any[]>([]);
	const [selectedPemilikId, setSelectedPemilikId] = createSignal("");

	onMount(async () => {
		if (currentUser?.role === "admin") {
			try {
				const res = await selectData<any[]>("users", {
					role: "eq.pemilik",
					order: "fullname.asc",
				});
				if (res) setPemilikList(res);
			} catch (e) {
				console.error("[Stores] Failed to fetch pemilik list:", e);
			}
		}
	});

	// ── Delete Confirmation State ─────────────────────────────────────
	const [deleteTarget, setDeleteTarget] = createSignal<Store | null>(null);
	const [isDeleting, setIsDeleting] = createSignal(false);
	const [deleteError, setDeleteError] = createSignal("");

	// ── Toast State ───────────────────────────────────────────────────
	const [toast, setToast] = createSignal({
		show: false,
		message: "",
		type: "",
	});
	const [refreshKey, setRefreshKey] = createSignal(0);

	function showToast(msg: string, type: "success" | "error") {
		setToast({ show: true, message: msg, type });
		setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
	}

	// ── Open modal for add ────────────────────────────────────────────
	function openAddModal() {
		setEditingStore(null);
		setFormData({ name: "", address: "", phone: "" });
		setSelectedPemilikId("");
		setFormError("");
		setIsModalOpen(true);
	}

	// ── Open modal for edit ───────────────────────────────────────────
	function openEditModal(store: Store) {
		setEditingStore(store);
		setFormData({
			name: store.name,
			address: store.address || "",
			phone: store.phone || "",
		});
		setSelectedPemilikId(store.pemilik_id || "");
		setFormError("");
		setIsModalOpen(true);
	}

	// ── Save (insert or update) ───────────────────────────────────────
	async function handleSave(e: Event) {
		e.preventDefault();
		setFormError("");

		const name = formData().name.trim();
		if (!name) {
			setFormError("Nama toko tidak boleh kosong.");
			return;
		}

		setIsSaving(true);
		try {
			const payload: any = {
				name,
				address: formData().address.trim() || null,
				phone: formData().phone.trim() || null,
			};

			if (currentUser?.role === "pemilik") {
				payload.pemilik_id = currentUser.id;
			} else if (currentUser?.role === "admin") {
				payload.pemilik_id = selectedPemilikId() || null;
			}

			if (editingStore()) {
				await updateData("toko", { id: `eq.${editingStore()!.id}` }, payload);
				showToast(`Toko "${name}" berhasil diperbarui.`, "success");
			} else {
				await insertData("toko", payload);
				showToast(`Toko "${name}" berhasil ditambahkan.`, "success");
			}

			setIsModalOpen(false);
			refetch();
			setRefreshKey((k) => k + 1);
		} catch (err: any) {
			setFormError(err.message || "Gagal menyimpan data toko.");
		} finally {
			setIsSaving(false);
		}
	}

	// ── Delete store ──────────────────────────────────────────────────
	async function confirmDelete() {
		const store = deleteTarget();
		if (!store) return;

		setIsDeleting(true);
		setDeleteError("");
		try {
			await deleteData("toko", { id: `eq.${store.id}` });
			showToast(`Toko "${store.name}" berhasil dihapus.`, "success");
			setDeleteTarget(null);
			refetch();
			setRefreshKey((k) => k + 1);
		} catch (err: any) {
			setDeleteError(err.message || "Gagal menghapus toko.");
		} finally {
			setIsDeleting(false);
		}
	}

	// ── Set as active store ───────────────────────────────────────────
	function setActiveStore(store: Store) {
		switchToko(store.id, store.name);
		showToast(`Beralih ke toko "${store.name}".`, "success");
		// Force re-render of active indicator
		setRefreshKey((k) => k + 1);
	}

	// ── Format date ───────────────────────────────────────────────────
	function formatDate(dateStr: string) {
		try {
			return new Date(dateStr).toLocaleDateString("id-ID", {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		} catch {
			return dateStr;
		}
	}

	const getPemilikName = (pemilikId: string | null) => {
		if (!pemilikId) return "Pusat / Admin";
		const found = pemilikList().find((p) => p.id === pemilikId);
		return found ? found.fullname : "Memuat...";
	};

	return (
		<div class="p-margin-mobile md:p-margin-desktop max-w-[1200px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Notifications */}
			<div class="mb-xl border-b border-outline-variant/20 pb-md">
				<h2 class="font-display-lg text-display-lg text-on-surface">
					Kelola Toko
				</h2>
				<p class="text-on-surface-variant font-body-md">
					{currentUser?.role === "admin"
						? "Kelola semua toko/cabang dalam sistem RetailHub."
						: "Kelola toko/cabang Anda."}
				</p>
			</div>

			{/* ── Top Actions ─────────────────────────────────────────── */}
			<div class="flex items-center justify-between mb-xl">
				<p class="text-sm text-on-surface-variant">
					Total{" "}
					<span class="font-bold text-primary">{stores()?.length || 0}</span>{" "}
					toko terdaftar
				</p>
				<button
					type="button"
					onClick={openAddModal}
					class="px-lg py-2.5 bg-primary text-on-primary rounded-lg text-xs font-bold uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-2 cursor-pointer shadow-md"
				>
					<span class="material-symbols-outlined text-[18px]">
						add_business
					</span>
					<span>Tambah Toko Baru</span>
				</button>
			</div>

			{/* ── Store List ──────────────────────────────────────────── */}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-gutter">
				<For
					each={stores()}
					fallback={
						<div class="col-span-full py-16 text-center text-zinc-500 font-semibold">
							<div class="material-symbols-outlined text-5xl mb-2 opacity-30">
								store_off
							</div>
							<p>Belum ada toko terdaftar.</p>
							<p class="text-xs mt-1 opacity-70">
								Klik "Tambah Toko Baru" untuk membuat toko pertama.
							</p>
						</div>
					}
				>
					{(store) => {
						const isActive = store.id === getCurrentTokoId();
						const userCount = userCounts()[store.id] || 0;
						return (
							<div
								class={`rounded-xl border overflow-hidden transition-all ${
									isActive
										? "border-primary/40 bg-primary/5 shadow-md shadow-primary/5"
										: "border-outline-variant/30 bg-surface-container hover:border-outline-variant/60"
								}`}
							>
								<div class="p-md sm:p-lg">
									<div class="flex items-start justify-between">
										<div class="flex items-center gap-3 min-w-0">
											<div
												class={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
													isActive
														? "bg-primary/20 text-primary"
														: "bg-surface-container-highest text-on-surface-variant"
												}`}
											>
												<span class="material-symbols-outlined text-[22px]">
													store
												</span>
											</div>
											<div class="min-w-0">
												<div class="flex items-center gap-2">
													<h3 class="font-bold text-on-surface truncate max-w-[200px]">
														{store.name}
													</h3>
													<Show when={isActive}>
														<span class="text-[9px] bg-primary/15 text-primary font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap">
															Aktif
														</span>
													</Show>
												</div>
												<div class="flex items-center gap-3 mt-1 text-xs text-on-surface-variant">
													<Show when={store.address}>
														<span class="flex items-center gap-1">
															<span class="material-symbols-outlined text-[12px]">
																location_on
															</span>
															<span class="truncate max-w-[160px]">
																{store.address}
															</span>
														</span>
													</Show>
													<Show when={store.phone}>
														<span class="flex items-center gap-1">
															<span class="material-symbols-outlined text-[12px]">
																call
															</span>
															{store.phone}
														</span>
													</Show>
												</div>
											</div>
										</div>
									</div>

									<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-outline-variant/10 text-xs text-on-surface-variant">
										<span>
											<span class="font-bold text-primary">{userCount}</span>{" "}
											pengguna
										</span>
										<Show when={currentUser?.role === "admin"}>
											<span class="truncate max-w-[150px]">
												Pemilik:{" "}
												<span class="font-bold text-primary">
													{getPemilikName(store.pemilik_id)}
												</span>
											</span>
										</Show>
										<span>Dibuat {formatDate(store.created_at)}</span>
									</div>

									<div class="flex items-center gap-2 mt-3 pt-3 border-t border-outline-variant/10">
										<button
											type="button"
											onClick={() => setActiveStore(store)}
											class="flex-1 py-2 bg-surface-container-highest hover:bg-surface-variant text-on-surface text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
											title="Jadikan toko aktif"
										>
											<span class="material-symbols-outlined text-[16px]">
												{isActive ? "check_circle" : "radio_button_unchecked"}
											</span>
											<span>{isActive ? "Toko Aktif" : "Pilih Toko"}</span>
										</button>
										<button
											type="button"
											onClick={() => openEditModal(store)}
											class="py-2 px-3 bg-surface-container-highest hover:bg-surface-variant text-on-surface text-xs font-semibold rounded-lg transition-all cursor-pointer"
											title="Edit toko"
										>
											<span class="material-symbols-outlined text-[16px]">
												edit
											</span>
										</button>
										<button
											type="button"
											onClick={() => setDeleteTarget(store)}
											class="py-2 px-3 bg-surface-container-highest hover:bg-error/10 text-error text-xs font-semibold rounded-lg transition-all cursor-pointer"
											title="Hapus toko"
										>
											<span class="material-symbols-outlined text-[16px]">
												delete
											</span>
										</button>
									</div>
								</div>
							</div>
						);
					}}
				</For>
			</div>

			{/* ── Add/Edit Modal ─────────────────────────────────────── */}
			<Show when={isModalOpen()}>
				<div class="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm animate-fade-in">
					<div class="bg-zinc-900 border border-zinc-800 p-lg rounded-2xl shadow-2xl w-full max-w-[440px] mx-md space-y-6 animate-scale-up">
						<div>
							<h3 class="font-headline-sm text-on-surface text-lg font-bold">
								{editingStore() ? "Edit Toko" : "Tambah Toko Baru"}
							</h3>
							<p class="text-xs text-on-surface-variant font-body-md mt-1">
								{editingStore()
									? `Perbarui informasi toko "${editingStore()!.name}".`
									: "Masukkan informasi toko/cabang baru."}
							</p>
						</div>

						<form onSubmit={handleSave} class="space-y-md">
							<Show when={formError()}>
								<div class="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-lg">
									{formError()}
								</div>
							</Show>

							<div class="space-y-xs">
								<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
									Nama Toko <span class="text-error">*</span>
								</label>
								<input
									type="text"
									required
									value={formData().name}
									onInput={(e) =>
										setFormData((prev) => ({
											...prev,
											name: e.currentTarget.value,
										}))
									}
									class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
									placeholder="e.g. RetailHub Cabang Malang"
								/>
							</div>

							<div class="space-y-xs">
								<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
									Alamat
								</label>
								<textarea
									value={formData().address}
									onInput={(e) =>
										setFormData((prev) => ({
											...prev,
											address: e.currentTarget.value,
										}))
									}
									rows={2}
									class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all resize-none"
									placeholder="e.g. Jl. Raya No. 123, Kota Malang"
								/>
							</div>

							<div class="space-y-xs">
								<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
									Nomor Telepon
								</label>
								<input
									type="text"
									value={formData().phone}
									onInput={(e) =>
										setFormData((prev) => ({
											...prev,
											phone: e.currentTarget.value,
										}))
									}
									class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
									placeholder="e.g. 021-12345678"
								/>
							</div>

							<Show when={currentUser?.role === "admin"}>
								<div class="space-y-xs">
									<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
										Pemilik Toko (Owner)
									</label>
									<select
										value={selectedPemilikId()}
										onChange={(e) =>
											setSelectedPemilikId(e.currentTarget.value)
										}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all cursor-pointer"
									>
										<option value="">Tanpa Pemilik (Pusat / Admin)</option>
										<For each={pemilikList()}>
											{(p) => (
												<option value={p.id}>
													{p.fullname} (@{p.username})
												</option>
											)}
										</For>
									</select>
								</div>
							</Show>

							<div class="flex gap-sm justify-end pt-md">
								<button
									type="button"
									onClick={() => setIsModalOpen(false)}
									class="px-lg py-2.5 border border-outline-variant hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
									disabled={isSaving()}
								>
									Batal
								</button>
								<button
									type="submit"
									class="px-lg py-2.5 bg-primary text-on-primary rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-lg disabled:opacity-50"
									disabled={isSaving()}
								>
									<Show
										when={!isSaving()}
										fallback={
											<>
												<span class="material-symbols-outlined animate-spin text-sm">
													autorenew
												</span>
												<span>Menyimpan...</span>
											</>
										}
									>
										<span>Simpan</span>
									</Show>
								</button>
							</div>
						</form>
					</div>
				</div>
			</Show>

			{/* ── Delete Confirmation Modal ───────────────────────────── */}
			<Show when={deleteTarget()}>
				<div class="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm animate-fade-in">
					<div class="bg-zinc-900 border border-zinc-800 p-lg rounded-2xl shadow-2xl w-full max-w-[400px] mx-md space-y-5 animate-scale-up">
						<div class="flex items-center gap-3">
							<div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center shrink-0">
								<span class="material-symbols-outlined text-error text-2xl">
									warning
								</span>
							</div>
							<div>
								<h3 class="font-bold text-on-surface">Hapus Toko</h3>
								<p class="text-xs text-on-surface-variant mt-0.5">
									Tindakan ini tidak dapat dibatalkan.
								</p>
							</div>
						</div>

						<p class="text-sm text-zinc-300">
							Apakah Anda yakin ingin menghapus{" "}
							<span class="font-bold text-error">{deleteTarget()!.name}</span>?
							Semua data terkait (barang, transaksi, pengguna) juga akan
							terpengaruh.
						</p>

						<Show when={deleteError()}>
							<div class="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-lg">
								{deleteError()}
							</div>
						</Show>

						<div class="flex gap-sm justify-end pt-md">
							<button
								type="button"
								onClick={() => {
									setDeleteTarget(null);
									setDeleteError("");
								}}
								class="px-lg py-2.5 border border-outline-variant hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
								disabled={isDeleting()}
							>
								Batal
							</button>
							<button
								type="button"
								onClick={confirmDelete}
								class="px-lg py-2.5 bg-error text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-lg disabled:opacity-50"
								disabled={isDeleting()}
							>
								<Show
									when={!isDeleting()}
									fallback={
										<>
											<span class="material-symbols-outlined animate-spin text-sm">
												autorenew
											</span>
											<span>Menghapus...</span>
										</>
									}
								>
									<span class="material-symbols-outlined text-[16px]">
										delete
									</span>
									<span>Ya, Hapus</span>
								</Show>
							</button>
						</div>
					</div>
				</div>
			</Show>

			{/* ── Toast Notification ──────────────────────────────────── */}
			<Show when={toast().show}>
				<div
					class={`fixed bottom-6 right-6 z-[200] px-lg py-3 rounded-xl shadow-2xl text-sm font-semibold animate-scale-in flex items-center gap-2 ${
						toast().type === "success"
							? "bg-tertiary/20 border border-tertiary/30 text-tertiary"
							: "bg-error/20 border border-error/30 text-error"
					}`}
				>
					<span class="material-symbols-outlined text-[18px]">
						{toast().type === "success" ? "check_circle" : "error"}
					</span>
					{toast().message}
				</div>
			</Show>
		</div>
	);
}
