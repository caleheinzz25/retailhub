import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { insertData } from "../utils/db";

export const Route = createFileRoute("/register")({ component: RegisterOwner });

function RegisterOwner() {
	const navigate = useNavigate();

	// ── Form State ──────────────────────────────────────────────────
	const [storeName, setStoreName] = createSignal("");
	const [storeAddress, setStoreAddress] = createSignal("");
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [confirmPassword, setConfirmPassword] = createSignal("");
	const [fullname, setFullname] = createSignal("");
	const [phone, setPhone] = createSignal("");

	// ── UI State ────────────────────────────────────────────────────
	const [isSubmitting, setIsSubmitting] = createSignal(false);
	const [formError, setFormError] = createSignal("");
	const [toast, setToast] = createSignal({ show: false, message: "" });
	const [success, setSuccess] = createSignal(false);

	function showToast(msg: string) {
		setToast({ show: true, message: msg });
		setTimeout(() => setToast({ show: false, message: "" }), 4000);
	}

	// ── Handle Registration ─────────────────────────────────────────
	async function handleRegister(e: Event) {
		e.preventDefault();
		setFormError("");
		setSuccess(false);

		// Validation
		const storeNameVal = storeName().trim();
		if (!storeNameVal) {
			setFormError("Nama toko tidak boleh kosong.");
			return;
		}

		const usernameVal = username().trim().toLowerCase().replace(/\s+/g, "");
		if (!usernameVal) {
			setFormError("Username tidak boleh kosong.");
			return;
		}
		if (!password().trim()) {
			setFormError("Password tidak boleh kosong.");
			return;
		}
		if (password().trim().length < 6) {
			setFormError("Password minimal 6 karakter.");
			return;
		}
		if (password().trim() !== confirmPassword().trim()) {
			setFormError("Konfirmasi password tidak cocok.");
			return;
		}
		if (!fullname().trim()) {
			setFormError("Nama lengkap tidak boleh kosong.");
			return;
		}

		setIsSubmitting(true);
		try {
			// 1. Create new store (toko)
			const tokoResult = await insertData<any[]>("toko", {
				name: storeNameVal,
				address: storeAddress().trim() || null,
			});

			const newToko = Array.isArray(tokoResult) ? tokoResult[0] : tokoResult;
			if (!newToko || !newToko.id) {
				throw new Error("Gagal membuat toko baru. Silakan coba lagi.");
			}

			// 2. Create user as pemilik (owner) of the new store
			await insertData("users", {
				username: usernameVal,
				password: password().trim(),
				role: "pemilik",
				fullname: fullname().trim(),
				toko_id: newToko.id,
				phone: phone().trim() || null,
				shift: "Full Time",
				status: "Offline",
			});

			setSuccess(true);
			showToast(
				`Toko "${storeNameVal}" dan pengguna "${fullname().trim()}" berhasil didaftarkan!`,
			);

			// Clear form
			setStoreName("");
			setStoreAddress("");
			setUsername("");
			setPassword("");
			setConfirmPassword("");
			setFullname("");
			setPhone("");
		} catch (err: any) {
			const msg =
				err?.message || err?.toString() || "Gagal mendaftarkan pengguna.";
			if (
				msg.includes("duplicate") ||
				msg.includes("unique") ||
				msg.includes("23505")
			) {
				setFormError(
					`Username "${username().trim().toLowerCase()}" sudah digunakan. Pilih username lain.`,
				);
			} else {
				setFormError(msg);
			}
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 p-6 overflow-hidden">
			{/* Decorative Backdrop Glows */}
			<div class="absolute -top-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
			<div class="absolute -bottom-[20%] -right-[10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

			<div class="w-full max-w-[520px] bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-xl p-xl rounded-2xl shadow-2xl space-y-lg animate-fade-in relative z-10 overflow-y-auto max-h-[90vh]">
				{/* Header */}
				<div class="text-center space-y-sm">
					<div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
						<span class="material-symbols-outlined text-[32px]">
							storefront
						</span>
					</div>
					<div>
						<h1 class="text-2xl font-bold tracking-tight text-zinc-100 font-display">
							Daftar Toko Baru
						</h1>
						<p class="text-xs text-zinc-400 font-semibold uppercase tracking-wider mt-1">
							Buat toko baru dan daftar sebagai pemilik untuk memulai
						</p>
					</div>
				</div>

				{/* Form */}
				<form onSubmit={handleRegister} class="space-y-md">
					{/* Error Alert */}
					<Show when={formError()}>
						<div class="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-lg flex items-start gap-2">
							<span class="material-symbols-outlined text-[16px] mt-0.5">
								error
							</span>
							<span>{formError()}</span>
						</div>
					</Show>

					{/* Success Alert */}
					<Show when={success()}>
						<div class="p-3 bg-tertiary/15 border border-tertiary/30 text-tertiary text-xs font-semibold rounded-lg flex items-start gap-2">
							<span class="material-symbols-outlined text-[16px] mt-0.5">
								check_circle
							</span>
							<div>
								<p class="font-bold">Pendaftaran berhasil!</p>
								<p class="text-[11px] mt-0.5 text-tertiary/80">
									Toko dan akun pemilik telah dibuat. Silakan login dengan akun
									baru Anda.
								</p>
							</div>
						</div>
					</Show>

					{/* ── Informasi Toko ── */}
					<div class="border-b border-zinc-800/60 pb-2">
						<p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
							Informasi Toko
						</p>
					</div>

					{/* Store Name */}
					<div class="space-y-xs">
						<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
							Nama Toko <span class="text-error">*</span>
						</label>
						<input
							type="text"
							required
							value={storeName()}
							onInput={(e) => setStoreName(e.currentTarget.value)}
							class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
							placeholder="e.g. Toko Sembako Sejahtera"
						/>
					</div>

					{/* Store Address */}
					<div class="space-y-xs">
						<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
							Alamat Toko
						</label>
						<textarea
							value={storeAddress()}
							onInput={(e) => setStoreAddress(e.currentTarget.value)}
							class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all resize-none"
							placeholder="e.g. Jl. Merdeka No. 123, Jakarta"
							rows={2}
						/>
					</div>

					{/* ── Informasi Pemilik ── */}
					<div class="border-b border-zinc-800/60 pb-2 pt-2">
						<p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
							Informasi Pemilik
						</p>
					</div>

					{/* Fullname */}
					<div class="space-y-xs">
						<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
							Nama Lengkap <span class="text-error">*</span>
						</label>
						<input
							type="text"
							required
							value={fullname()}
							onInput={(e) => setFullname(e.currentTarget.value)}
							class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
							placeholder="e.g. Bambang Sutrisno"
						/>
					</div>

					{/* Username */}
					<div class="space-y-xs">
						<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
							Username <span class="text-error">*</span>
						</label>
						<input
							type="text"
							required
							value={username()}
							onInput={(e) => setUsername(e.currentTarget.value)}
							class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
							placeholder="e.g. pemilik1"
						/>
						<p class="text-[10px] text-zinc-500 mt-1">
							Username akan otomatis diubah menjadi huruf kecil.
						</p>
					</div>

					{/* Password & Confirm Password */}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-md">
						<div class="space-y-xs">
							<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
								Password <span class="text-error">*</span>
							</label>
							<input
								type="password"
								required
								value={password()}
								onInput={(e) => setPassword(e.currentTarget.value)}
								class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
								placeholder="Min. 6 karakter"
							/>
						</div>
						<div class="space-y-xs">
							<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
								Konfirmasi Password <span class="text-error">*</span>
							</label>
							<input
								type="password"
								required
								value={confirmPassword()}
								onInput={(e) => setConfirmPassword(e.currentTarget.value)}
								class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
								placeholder="Ulangi password"
							/>
						</div>
					</div>

					{/* Phone */}
					<div class="space-y-xs">
						<label class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
							Nomor Telepon
						</label>
						<input
							type="text"
							value={phone()}
							onInput={(e) => setPhone(e.currentTarget.value)}
							class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-primary text-sm transition-all"
							placeholder="e.g. 0812-3456-7890"
						/>
					</div>

					{/* Role info — read only */}
					<div class="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-start gap-3">
						<span class="material-symbols-outlined text-primary text-[18px] mt-0.5">
							badge
						</span>
						<div>
							<p class="text-xs font-bold text-primary">Peran: Pemilik Toko</p>
							<p class="text-[10px] text-zinc-400 mt-0.5">
								Akun ini akan terdaftar sebagai pemilik (Pemilik) dari toko yang
								Anda buat. Anda dapat menambahkan staf (admin/staff) nanti
								melalui menu Kelola Pengguna.
							</p>
						</div>
					</div>

					{/* Submit & Back */}
					<div class="flex gap-sm justify-end pt-md border-t border-outline-variant/10">
						<button
							type="button"
							onClick={() => navigate({ to: "/login" })}
							class="px-lg py-2.5 border border-outline-variant hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
							disabled={isSubmitting()}
						>
							Kembali
						</button>
						<button
							type="submit"
							class="px-lg py-2.5 bg-primary text-on-primary rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-lg disabled:opacity-50"
							disabled={isSubmitting()}
						>
							<Show
								when={!isSubmitting()}
								fallback={
									<>
										<span class="material-symbols-outlined animate-spin text-sm">
											autorenew
										</span>
										<span>Mendaftarkan...</span>
									</>
								}
							>
								<span class="material-symbols-outlined text-[16px]">
									how_to_reg
								</span>
								<span>Daftarkan Toko</span>
							</Show>
						</button>
					</div>
				</form>
			</div>

			{/* Toast Notification */}
			<Show when={toast().show}>
				<div class="fixed bottom-6 right-6 z-[200] px-lg py-3 rounded-xl shadow-2xl text-sm font-semibold animate-scale-in flex items-center gap-2 bg-tertiary/20 border border-tertiary/30 text-tertiary">
					<span class="material-symbols-outlined text-[18px]">
						check_circle
					</span>
					{toast().message}
				</div>
			</Show>
		</div>
	);
}
