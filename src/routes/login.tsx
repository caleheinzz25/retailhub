import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import { selectData, setSessionUser } from "../utils/db";

export const Route = createFileRoute("/login")({
	component: LoginScreen,
});

function LoginScreen() {
	const navigate = useNavigate();
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [isLoading, setIsLoading] = createSignal(false);
	const [errorMessage, setErrorMessage] = createSignal("");

	async function handleLogin(e: Event) {
		e.preventDefault();
		if (!username().trim() || !password().trim()) {
			setErrorMessage("Username dan password tidak boleh kosong.");
			return;
		}

		setIsLoading(true);
		setErrorMessage("");

		try {
			// Query the users table in Supabase (lowercased for case-insensitivity)
			const users = await selectData<any[]>("users", {
				username: `eq.${username().trim().toLowerCase()}`,
			});

			if (!users || users.length === 0) {
				setErrorMessage("Pengguna tidak ditemukan.");
				setIsLoading(false);
				return;
			}

			const user = users[0];

			// Simple password check matching seed data
			if (user.password !== password().trim()) {
				setErrorMessage("Password yang Anda masukkan salah.");
				setIsLoading(false);
				return;
			}

			// Save session and redirect
			await setSessionUser({
				id: user.id,
				username: user.username,
				fullname: user.fullname,
				role: user.role,
				shift: user.shift,
				phone: user.phone,
			});

			// Dispatch a custom event to notify __root.tsx navigation guards
			window.dispatchEvent(new Event("retailhub-login-success"));

			navigate({ to: "/" });
		} catch (error: any) {
			console.error("Login error:", error);
			setErrorMessage(`Gagal terhubung ke database: ${error.message || error}`);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 p-6 overflow-hidden">
			{/* Decorative Backdrop Glows */}
			<div class="absolute -top-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
			<div class="absolute -bottom-[20%] -right-[10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

			<div class="w-full max-w-[420px] bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-xl p-xl rounded-2xl shadow-2xl space-y-lg animate-fade-in relative z-10">
				{/* Logo / Brand Header */}
				<div class="text-center space-y-sm">
					<div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
						<span class="material-symbols-outlined text-[32px]">store</span>
					</div>
					<div>
						<h1 class="text-2xl font-bold tracking-tight text-zinc-100 font-display">
							RetailHub
						</h1>
						<p class="text-xs text-zinc-400 font-semibold uppercase tracking-wider mt-1">
							Sistem Kasir & Gudang Sembako
						</p>
					</div>
				</div>

				{/* Error Notice */}
				{errorMessage() && (
					<div class="p-md rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-start gap-sm animate-slide-up">
						<span class="material-symbols-outlined text-sm">warning</span>
						<span>{errorMessage()}</span>
					</div>
				)}

				{/* Login Form */}
				<form onSubmit={handleLogin} class="space-y-md">
					<div class="space-y-1">
						<label
							for="username"
							class="text-xs font-semibold text-zinc-400 uppercase tracking-wide"
						>
							Username Staf
						</label>
						<div class="relative">
							<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[20px]">
								person
							</span>
							<input
								id="username"
								type="text"
								required
								disabled={isLoading()}
								onInput={(e) => setUsername(e.currentTarget.value)}
								value={username()}
								class="w-full bg-zinc-950/60 border border-zinc-800/80 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-primary disabled:opacity-50"
								placeholder="e.g. kasir1"
							/>
						</div>
					</div>

					<div class="space-y-1">
						<label
							for="password"
							class="text-xs font-semibold text-zinc-400 uppercase tracking-wide"
						>
							Kata Sandi (Password)
						</label>
						<div class="relative">
							<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[20px]">
								lock
							</span>
							<input
								id="password"
								type="password"
								required
								disabled={isLoading()}
								onInput={(e) => setPassword(e.currentTarget.value)}
								value={password()}
								class="w-full bg-zinc-950/60 border border-zinc-800/80 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-primary disabled:opacity-50"
								placeholder="••••••••"
							/>
						</div>
					</div>

					<button
						type="submit"
						disabled={isLoading()}
						class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:opacity-50 text-zinc-100 font-bold rounded-lg text-sm transition-all shadow-lg flex items-center justify-center gap-sm cursor-pointer mt-4"
					>
						{isLoading() ? (
							<>
								<div class="w-4 h-4 border-2 border-zinc-100 border-t-transparent rounded-full animate-spin" />
								<span>Memverifikasi...</span>
							</>
						) : (
							<>
								<span class="material-symbols-outlined text-sm">login</span>
								<span>Masuk Sistem</span>
							</>
						)}
					</button>
				</form>

				{/* Help / Mock Reminder Info */}
				<div class="pt-sm text-center">
					<p class="text-[10px] text-zinc-500 leading-normal">
						Gunakan akun seed default untuk pengujian:
						<br />
						Kasir: <span class="font-mono text-zinc-400">kasir1</span> (pass:{" "}
						<span class="font-mono text-zinc-400">kasir123</span>) | Pemilik:{" "}
						<span class="font-mono text-zinc-400">pemilik</span> (pass:{" "}
						<span class="font-mono text-zinc-400">owner123</span>)
					</p>
				</div>
			</div>
		</div>
	);
}
