import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, onMount, Show } from "solid-js";
import {
	getAllToko,
	getCurrentTokoId,
	insertData,
	selectData,
	updateData,
} from "../utils/db";

export const Route = createFileRoute("/users")({
	component: UserManagement,
});

interface StaffUser {
	id: string;
	code: string;
	name: string;
	role: "Pemilik" | "Admin" | "Staff";
	shift: "Pagi" | "Siang" | "Malam" | "Full Time";
	status: "Aktif" | "Offline";
}

interface CustomerUser {
	id: string;
	code: string;
	name: string;
	phone: string;
	points: number;
	transactions: number;
}

interface TokoOption {
	id: string;
	name: string;
}

function UserManagement() {
	const [activeTab, setActiveTab] = createSignal<"staff" | "customer">("staff");
	const [searchQuery, setSearchQuery] = createSignal("");
	const [isAddModalOpen, setIsAddModalOpen] = createSignal(false);
	const [activeToast, setActiveToast] = createSignal("");

	// Extended registration form state for staff
	const [newUserName, setNewUserName] = createSignal("");
	const [newUserRole, setNewUserRole] = createSignal("Staff");
	const [newUserShift, setNewUserShift] = createSignal("Pagi");
	const [newUserPhone, setNewUserPhone] = createSignal("");
	const [newUsername, setNewUsername] = createSignal("");
	const [newPassword, setNewPassword] = createSignal("");
	const [newConfirmPassword, setNewConfirmPassword] = createSignal("");
	const [formError, setFormError] = createSignal("");
	const [isSubmitting, setIsSubmitting] = createSignal(false);

	// Toko selection state for Pemilik role
	const [tokos, setTokos] = createSignal<TokoOption[]>([]);
	const [newUserTokoId, setNewUserTokoId] = createSignal("");

	// Database Staff Data State
	const [staffs, setStaffs] = createSignal<StaffUser[]>([]);

	// Mock Customer Data (Stays mock or local-storage based since not in core DB tables)
	const [customers, setCustomers] = createSignal<CustomerUser[]>([
		{
			id: "1",
			code: "CST-1002",
			name: "Joko Susilo",
			phone: "0812-3456-7890",
			points: 420,
			transactions: 24,
		},
		{
			id: "2",
			code: "CST-1003",
			name: "Siti Rahma",
			phone: "0819-8765-4321",
			points: 750,
			transactions: 48,
		},
		{
			id: "3",
			code: "CST-1004",
			name: "Andi Saputra",
			phone: "0821-4433-2211",
			points: 120,
			transactions: 8,
		},
		{
			id: "4",
			code: "CST-1005",
			name: "Dewi Lestari",
			phone: "0857-1122-3344",
			points: 1250,
			transactions: 89,
		},
	]);

	function showToast(msg: string) {
		setActiveToast(msg);
		setTimeout(() => setActiveToast(""), 3000);
	}

	// Fetch staff members + tokos on mount
	onMount(async () => {
		// Fetch stores (for Pemilik assignment)
		try {
			const allToko = await getAllToko();
			if (allToko && allToko.length > 0) {
				setTokos(
					allToko.map((t: any) => ({
						id: t.id,
						name: t.name,
					})),
				);
			}
		} catch (err) {
			console.error("Gagal mengambil data toko:", err);
		}

		// Fetch staff
		try {
			const tokoId = getCurrentTokoId();
			const query: Record<string, string> = {};
			if (tokoId) {
				query.toko_id = `eq.${tokoId}`;
			}
			const res = await selectData<any[]>("users", query);
			if (res) {
				setStaffs(
					res.map((user, idx) => ({
						id: user.id,
						code: `STF-0${idx + 1}`,
						name: user.fullname,
						role: mapRole(user.role),
						shift: user.shift || "Full Time",
						status: user.status || "Offline",
					})),
				);
			}
		} catch (err) {
			console.error("Gagal mengambil data staf:", err);
		}
	});

	function mapRole(dbRole: string): "Pemilik" | "Admin" | "Staff" {
		if (dbRole === "pemilik") return "Pemilik";
		if (dbRole === "admin") return "Admin";
		return "Staff";
	}

	function mapDbRole(appRole: string): string {
		if (appRole === "Pemilik") return "pemilik";
		if (appRole === "Admin") return "admin";
		return "staff";
	}

	// Staff Quick Action: Change Shift
	async function fnChangeShift(id: string, current: string) {
		const nextShift =
			current === "Pagi" ? "Siang" : current === "Siang" ? "Malam" : "Pagi";
		try {
			await updateData("users", { id: `eq.${id}` }, { shift: nextShift });
			setStaffs((prev) =>
				prev.map((staff) => {
					if (staff.id === id) {
						showToast(`Mengubah shift ${staff.name} ke Shift ${nextShift}.`);
						return { ...staff, shift: nextShift };
					}
					return staff;
				}),
			);
		} catch (err) {
			console.error("Gagal mengubah shift:", err);
			showToast("Gagal mengubah shift.");
		}
	}

	// Customer Quick Action: Add Loyalty Points
	function fnAddPoints(id: string) {
		setCustomers((prev) =>
			prev.map((c) => {
				if (c.id === id) {
					const newPoints = c.points + 20;
					showToast(`Menambah +20 Poin belanja untuk ${c.name}.`);
					return { ...c, points: newPoints, transactions: c.transactions + 1 };
				}
				return c;
			}),
		);
	}

	// Handle role change — auto-fill toko selector if switching to Pemilik
	function onRoleChange(val: string) {
		setNewUserRole(val);
		if (val === "Pemilik" && !newUserTokoId()) {
			// Default to current store
			const currentId = getCurrentTokoId();
			if (currentId) setNewUserTokoId(currentId);
		}
	}

	// Handle Submit Add User Form
	async function fnAddUser(e: Event) {
		e.preventDefault();

		if (activeTab() === "customer") {
			if (!newUserName().trim()) return;
			const newCustomer: CustomerUser = {
				id: Date.now().toString(),
				code: `CST-${1000 + customers().length + 2}`,
				name: newUserName(),
				phone: newUserPhone().trim() || "Tidak ada nomor",
				points: 0,
				transactions: 0,
			};
			setCustomers((prev) => [...prev, newCustomer]);
			showToast(`Pelanggan baru "${newCustomer.name}" berhasil terdaftar.`);
			setIsAddModalOpen(false);
			setNewUserName("");
			setNewUserPhone("");
			return;
		}

		// ── Staff registration with full validation ─────────────────────
		setFormError("");
		setIsSubmitting(true);

		// Validation
		const usernameVal = newUsername().trim().toLowerCase().replace(/\s+/g, "");
		if (!usernameVal) {
			setFormError("Username tidak boleh kosong.");
			setIsSubmitting(false);
			return;
		}
		if (!newPassword().trim()) {
			setFormError("Password tidak boleh kosong.");
			setIsSubmitting(false);
			return;
		}
		if (newPassword().trim().length < 6) {
			setFormError("Password minimal 6 karakter.");
			setIsSubmitting(false);
			return;
		}
		if (newPassword().trim() !== newConfirmPassword().trim()) {
			setFormError("Konfirmasi password tidak cocok.");
			setIsSubmitting(false);
			return;
		}
		if (!newUserName().trim()) {
			setFormError("Nama lengkap tidak boleh kosong.");
			setIsSubmitting(false);
			return;
		}
		if (newUserRole() === "Pemilik" && !newUserTokoId()) {
			setFormError("Pilih toko / cabang untuk Pemilik.");
			setIsSubmitting(false);
			return;
		}

		const role = newUserRole() as "Pemilik" | "Admin" | "Staff";
		const shift = newUserShift() as "Pagi" | "Siang" | "Malam" | "Full Time";

		const newStaffDB: Record<string, any> = {
			username: usernameVal,
			password: newPassword().trim(),
			role: mapDbRole(role),
			fullname: newUserName().trim(),
			phone: newUserPhone().trim() || null,
			shift: shift,
			status: "Offline",
		};

		// For Pemilik, use the selected toko; for Admin, no toko (super admin); for Staff, use current session toko
		if (role === "Pemilik") {
			newStaffDB.toko_id = newUserTokoId();
		} else if (role === "Staff") {
			const tokoId = getCurrentTokoId();
			if (tokoId) {
				newStaffDB.toko_id = tokoId;
			}
		}
		// Admin (super admin) does not get toko_id assignment

		try {
			const res = await insertData<any[]>("users", newStaffDB);
			if (res && res.length > 0) {
				const inserted = res[0];
				const newStaff: StaffUser = {
					id: inserted.id,
					code: `STF-0${staffs().length + 1}`,
					name: inserted.fullname,
					role: mapRole(inserted.role),
					shift: inserted.shift,
					status: inserted.status,
				};
				setStaffs((prev) => [...prev, newStaff]);
				showToast(`Staf baru "${newStaff.name}" berhasil didaftarkan.`);
			}

			// Reset form
			setIsAddModalOpen(false);
			setNewUserName("");
			setNewUsername("");
			setNewPassword("");
			setNewConfirmPassword("");
			setNewUserPhone("");
			setNewUserRole("Staff");
			setNewUserShift("Pagi");
			setNewUserTokoId("");
		} catch (err: any) {
			const msg = err?.message || err?.toString() || "Gagal mendaftarkan staf.";
			if (
				msg.includes("duplicate") ||
				msg.includes("unique") ||
				msg.includes("23505")
			) {
				setFormError(
					`Username "${newUsername().trim().toLowerCase()}" sudah digunakan. Pilih username lain.`,
				);
			} else {
				setFormError(msg);
			}
		} finally {
			setIsSubmitting(false);
		}
	}

	// Filter computed results
	const filteredStaffs = () =>
		staffs().filter(
			(staff) =>
				staff.name.toLowerCase().includes(searchQuery().toLowerCase()) ||
				staff.role.toLowerCase().includes(searchQuery().toLowerCase()) ||
				staff.code.toLowerCase().includes(searchQuery().toLowerCase()),
		);

	const filteredCustomers = () =>
		customers().filter(
			(c) =>
				c.name.toLowerCase().includes(searchQuery().toLowerCase()) ||
				c.phone.includes(searchQuery()) ||
				c.code.toLowerCase().includes(searchQuery().toLowerCase()),
		);

	return (
		<div class="p-margin-mobile md:p-margin-desktop space-y-lg max-w-[1600px] mx-auto w-full animate-fade-in pb-12">
			{/* Toast Notification */}
			{activeToast() && (
				<div class="fixed top-20 right-8 z-50 bg-indigo-600 border border-indigo-400 text-zinc-100 px-6 py-3 rounded-xl shadow-2xl animate-slide-up flex items-center gap-sm">
					<span class="material-symbols-outlined text-sm">info</span>
					<span class="text-sm font-semibold">{activeToast()}</span>
				</div>
			)}

			{/* Page Header */}
			<div class="flex flex-col md:flex-row md:items-end justify-between gap-lg mb-lg">
				<div>
					<h2 class="font-display-lg text-display-lg text-on-surface">
						Kelola Pengguna
					</h2>
					<p class="text-on-surface-variant font-body-md">
						Pendaftaran staf kasir, edit detail shift kerja, dan manajemen
						pelanggan loyal.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-sm shrink-0">
					<div class="flex bg-surface-container p-1 rounded-lg border border-outline-variant">
						<button
							type="button"
							onClick={() => {
								setActiveTab("staff");
								setSearchQuery("");
							}}
							class={`px-md py-1.5 rounded shadow-sm flex items-center gap-sm text-xs font-bold transition-all cursor-pointer ${
								activeTab() === "staff"
									? "bg-surface-container-highest text-primary font-bold"
									: "text-on-surface-variant hover:text-on-surface"
							}`}
						>
							<span class="material-symbols-outlined text-[18px]">badge</span>
							<span>Karyawan & Staf</span>
						</button>
						<button
							type="button"
							onClick={() => {
								setActiveTab("customer");
								setSearchQuery("");
							}}
							class={`px-md py-1.5 rounded shadow-sm flex items-center gap-sm text-xs font-bold transition-all cursor-pointer ${
								activeTab() === "customer"
									? "bg-surface-container-highest text-primary font-bold"
									: "text-on-surface-variant hover:text-on-surface"
							}`}
						>
							<span class="material-symbols-outlined text-[18px]">loyalty</span>
							<span>Pelanggan Setia</span>
						</button>
					</div>
					<button
						type="button"
						onClick={() => setIsAddModalOpen(true)}
						class="bg-surface-container-high border border-outline-variant text-on-surface font-bold px-lg py-2 rounded-lg flex items-center gap-sm hover:bg-surface-variant transition-colors cursor-pointer w-full sm:w-auto justify-center"
					>
						<span class="material-symbols-outlined text-sm">person_add</span>
						<span>
							{activeTab() === "staff" ? "Daftar Staf" : "Daftar Pelanggan"}
						</span>
					</button>
				</div>
			</div>

			{/* Search & Statistics Bar */}
			<div class="bg-surface-container-low border border-outline-variant p-md rounded-xl flex flex-wrap gap-md items-center shadow-lg">
				<div class="relative flex-1 min-w-[240px]">
					<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
						search
					</span>
					<input
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						value={searchQuery()}
						class="w-full bg-surface-container border border-outline-variant rounded-lg pl-10 pr-4 py-1.5 text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
						placeholder={
							activeTab() === "staff"
								? "Cari nama staf, jabatan, kode staf..."
								: "Cari nama pelanggan, nomor telepon, kode..."
						}
						type="text"
					/>
				</div>
				<div class="flex items-center gap-lg sm:ml-auto pr-sm text-xs font-semibold text-on-surface-variant">
					<div>
						TOTAL TERDAFTAR:{" "}
						<span class="text-primary font-bold font-data-mono">
							{activeTab() === "staff" ? staffs().length : customers().length}{" "}
							Orang
						</span>
					</div>
				</div>
			</div>

			{/* Data List Container */}
			<div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-2xl">
				<div class="overflow-x-auto scrollbar-hide">
					<table class="w-full text-left border-collapse">
						<thead class="bg-surface-container-high/50 border-b border-outline-variant">
							<Show
								when={activeTab() === "staff"}
								fallback={
									<tr>
										<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
											KODE PELANGGAN
										</th>
										<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
											NAMA LENGKAP
										</th>
										<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
											NOMOR HANDPHONE
										</th>
										<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs text-right">
											POIN LOYALITAS
										</th>
										<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs text-right">
											TOTAL TRANSAKSI
										</th>
										<th class="px-lg py-md border-b border-outline-variant" />
									</tr>
								}
							>
								<tr>
									<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
										KODE STAF
									</th>
									<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
										NAMA STAF
									</th>
									<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
										JABATAN / PERAN
									</th>
									<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
										SHIFT KERJA
									</th>
									<th class="px-lg py-md text-label-caps font-label-caps text-outline text-xs">
										STATUS
									</th>
									<th class="px-lg py-md border-b border-outline-variant" />
								</tr>
							</Show>
						</thead>
						<tbody class="divide-y divide-outline-variant/35 text-body-md">
							<Show
								when={activeTab() === "staff"}
								fallback={
									<For
										each={filteredCustomers()}
										fallback={
											<tr>
												<td
													colspan="6"
													class="text-center py-12 text-zinc-500 font-semibold"
												>
													Tidak ada data pelanggan setia yang ditemukan.
												</td>
											</tr>
										}
									>
										{(c) => (
											<tr class="hover:bg-surface-variant/10 transition-colors">
												<td class="px-lg py-lg font-data-mono text-xs text-on-surface-variant">
													{c.code}
												</td>
												<td class="px-lg py-lg font-bold text-on-surface">
													{c.name}
												</td>
												<td class="px-lg py-lg text-on-surface-variant">
													{c.phone}
												</td>
												<td class="px-lg py-lg text-right text-tertiary font-data-mono font-bold text-sm">
													{c.points} Pts
												</td>
												<td class="px-lg py-lg text-right font-data-mono text-sm font-semibold">
													{c.transactions} Kali
												</td>
												<td class="px-lg py-lg text-right">
													<div class="flex items-center justify-end gap-sm">
														<button
															type="button"
															onClick={() => fnAddPoints(c.id)}
															class="p-2 text-outline hover:text-tertiary hover:bg-surface-variant/40 rounded-lg transition-colors cursor-pointer"
															title="Tambah 20 Poin Belanja"
														>
															<span class="material-symbols-outlined text-[20px]">
																add_circle
															</span>
														</button>
													</div>
												</td>
											</tr>
										)}
									</For>
								}
							>
								<For
									each={filteredStaffs()}
									fallback={
										<tr>
											<td
												colspan="6"
												class="text-center py-12 text-zinc-500 font-semibold"
											>
												Tidak ada data staf karyawan yang ditemukan.
											</td>
										</tr>
									}
								>
									{(staff) => (
										<tr class="hover:bg-surface-variant/10 transition-colors">
											<td class="px-lg py-lg font-data-mono text-xs text-on-surface-variant">
												{staff.code}
											</td>
											<td class="px-lg py-lg font-bold text-on-surface">
												{staff.name}
											</td>
											<td class="px-lg py-lg">
												<span
													class={`px-3 py-1 rounded-full text-xs font-semibold ${
														staff.role === "Pemilik"
															? "bg-indigo-500/10 text-indigo-400"
															: staff.role === "Admin"
																? "bg-primary/10 text-primary"
																: "bg-surface-variant text-on-surface-variant"
													}`}
												>
													{staff.role}
												</span>
											</td>
											<td class="px-lg py-lg text-on-surface-variant font-semibold">
												Shift {staff.shift}
											</td>
											<td class="px-lg py-lg">
												<span
													class={`px-2 py-0.5 rounded text-[10px] font-bold border ${
														staff.status === "Aktif"
															? "bg-tertiary/10 text-tertiary border-tertiary/20"
															: "bg-surface-container-highest text-zinc-500 border-zinc-800"
													}`}
												>
													{staff.status === "Aktif" ? "ONLINE" : "OFFLINE"}
												</span>
											</td>
											<td class="px-lg py-lg text-right">
												<div class="flex items-center justify-end gap-sm">
													<button
														type="button"
														onClick={() => fnChangeShift(staff.id, staff.shift)}
														class="p-2 text-outline hover:text-primary hover:bg-surface-variant/40 rounded-lg transition-colors cursor-pointer"
														title="Ganti Shift Petugas"
													>
														<span class="material-symbols-outlined text-[20px]">
															published_with_changes
														</span>
													</button>
												</div>
											</td>
										</tr>
									)}
								</For>
							</Show>
						</tbody>
					</table>
				</div>
			</div>

			{/* Add User Modal */}
			<Show when={isAddModalOpen()}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md animate-fade-in">
					<form
						onSubmit={fnAddUser}
						class="w-full max-w-[500px] p-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
					>
						<div class="flex justify-between items-center pb-3 border-b border-zinc-800">
							<h3 class="text-lg font-bold text-zinc-100">
								{activeTab() === "staff"
									? "Daftar Staf Karyawan Baru"
									: "Daftar Pelanggan Setia Baru"}
							</h3>
							<button
								type="button"
								onClick={() => {
									setIsAddModalOpen(false);
									setFormError("");
								}}
								class="text-zinc-500 hover:text-zinc-300"
							>
								<span class="material-symbols-outlined text-sm">close</span>
							</button>
						</div>

						<Show when={activeTab() === "staff"}>
							{/* Error Alert */}
							<Show when={formError()}>
								<div class="p-3 bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold rounded-lg flex items-start gap-2">
									<span class="material-symbols-outlined text-[16px] mt-0.5">
										error
									</span>
									<span>{formError()}</span>
								</div>
							</Show>
						</Show>

						<div class="space-y-4">
							{/* ── Staff form fields ── */}
							<Show
								when={activeTab() === "staff"}
								fallback={
									<>
										<div class="space-y-1">
											<label
												for="user-name"
												class="text-xs font-semibold text-zinc-400 font-sans"
											>
												NAMA LENGKAP
											</label>
											<input
												id="user-name"
												type="text"
												required
												onInput={(e) => setNewUserName(e.currentTarget.value)}
												value={newUserName()}
												class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
												placeholder="e.g. Joko Susilo"
											/>
										</div>
										<div class="space-y-1">
											<label
												for="user-phone"
												class="text-xs font-semibold text-zinc-400 font-sans"
											>
												NOMOR TELEPON (WA)
											</label>
											<input
												id="user-phone"
												type="text"
												required
												onInput={(e) => setNewUserPhone(e.currentTarget.value)}
												value={newUserPhone()}
												class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
												placeholder="e.g. 0812-xxxx-xxxx"
											/>
										</div>
									</>
								}
							>
								{/* Nama Lengkap */}
								<div class="space-y-1">
									<label
										for="user-fullname"
										class="text-xs font-semibold text-zinc-400 font-sans"
									>
										NAMA LENGKAP <span class="text-red-400">*</span>
									</label>
									<input
										id="user-fullname"
										type="text"
										required
										value={newUserName()}
										onInput={(e) => setNewUserName(e.currentTarget.value)}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
										placeholder="e.g. Supriyanto"
									/>
								</div>

								{/* Username */}
								<div class="space-y-1">
									<label
										for="user-username"
										class="text-xs font-semibold text-zinc-400 font-sans"
									>
										USERNAME <span class="text-red-400">*</span>
									</label>
									<input
										id="user-username"
										type="text"
										required
										value={newUsername()}
										onInput={(e) => setNewUsername(e.currentTarget.value)}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
										placeholder="e.g. admin1"
									/>
									<p class="text-[10px] text-zinc-500 mt-1">
										Username akan otomatis diubah menjadi huruf kecil.
									</p>
								</div>

								{/* Password & Confirm Password */}
								<div class="grid grid-cols-1 md:grid-cols-2 gap-md">
									<div class="space-y-1">
										<label
											for="user-password"
											class="text-xs font-semibold text-zinc-400 font-sans"
										>
											PASSWORD <span class="text-red-400">*</span>
										</label>
										<input
											id="user-password"
											type="password"
											required
											value={newPassword()}
											onInput={(e) => setNewPassword(e.currentTarget.value)}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
											placeholder="Min. 6 karakter"
										/>
									</div>
									<div class="space-y-1">
										<label
											for="user-confirm-password"
											class="text-xs font-semibold text-zinc-400 font-sans"
										>
											KONFIRMASI <span class="text-red-400">*</span>
										</label>
										<input
											id="user-confirm-password"
											type="password"
											required
											value={newConfirmPassword()}
											onInput={(e) =>
												setNewConfirmPassword(e.currentTarget.value)
											}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary"
											placeholder="Ulangi password"
										/>
									</div>
								</div>

								{/* Jabatan/Peran */}
								<div class="space-y-1">
									<label
										for="user-role"
										class="text-xs font-semibold text-zinc-400 font-sans"
									>
										JABATAN / PERAN
									</label>
									<select
										id="user-role"
										onChange={(e) => onRoleChange(e.currentTarget.value)}
										value={newUserRole()}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary cursor-pointer"
									>
										<option>Pemilik</option>
										<option>Admin</option>
										<option>Staff</option>
									</select>
								</div>

								{/* Toko / Cabang selector — only for Pemilik */}
								<Show when={newUserRole() === "Pemilik"}>
									<div class="space-y-1">
										<label
											for="user-toko"
											class="text-xs font-semibold text-zinc-400 font-sans"
										>
											TOKO / CABANG <span class="text-red-400">*</span>
										</label>
										<select
											id="user-toko"
											onChange={(e) => setNewUserTokoId(e.currentTarget.value)}
											value={newUserTokoId()}
											class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary cursor-pointer"
										>
											<option value="">-- Pilih Toko --</option>
											<For each={tokos()}>
												{(toko) => <option value={toko.id}>{toko.name}</option>}
											</For>
										</select>
										<p class="text-[10px] text-zinc-500 mt-1">
											Pemilik akan ditempatkan sebagai pemilik dari cabang yang
											dipilih.
										</p>
									</div>
								</Show>

								{/* Shift */}
								<div class="space-y-1">
									<label
										for="user-shift"
										class="text-xs font-semibold text-zinc-400 font-sans"
									>
										SHIFT KERJA
									</label>
									<select
										id="user-shift"
										onChange={(e) => setNewUserShift(e.currentTarget.value)}
										value={newUserShift()}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary cursor-pointer"
									>
										<option>Pagi</option>
										<option>Siang</option>
										<option>Malam</option>
										<option>Full Time</option>
									</select>
								</div>

								{/* Phone */}
								<div class="space-y-1">
									<label
										for="user-phone"
										class="text-xs font-semibold text-zinc-400 font-sans"
									>
										NOMOR TELEPON
									</label>
									<input
										id="user-phone"
										type="text"
										value={newUserPhone()}
										onInput={(e) => setNewUserPhone(e.currentTarget.value)}
										class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary font-mono"
										placeholder="e.g. 0812-3456-7890"
									/>
								</div>
							</Show>
						</div>

						<div class="flex justify-end gap-sm pt-3 border-t border-zinc-800">
							<button
								type="button"
								onClick={() => {
									setIsAddModalOpen(false);
									setFormError("");
								}}
								class="px-lg py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
								disabled={isSubmitting()}
							>
								Batal
							</button>
							<button
								type="submit"
								disabled={isSubmitting()}
								class="px-lg py-2 bg-primary text-on-primary font-bold rounded-lg text-sm hover:brightness-110 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
							>
								<Show
									when={!isSubmitting()}
									fallback={
										<>
											<span class="material-symbols-outlined animate-spin text-sm">
												autorenew
											</span>
											<span>Menyimpan...</span>
										</>
									}
								>
									<span class="material-symbols-outlined text-[16px]">
										how_to_reg
									</span>
									<span>Simpan Pengguna</span>
								</Show>
							</button>
						</div>
					</form>
				</div>
			</Show>
		</div>
	);
}
