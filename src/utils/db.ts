import { invoke } from "@tauri-apps/api/core";

// Detect if running in Tauri desktop shell
const isTauri =
	typeof window !== "undefined" &&
	(window as any).__TAURI_INTERNALS__ !== undefined;

// Vite loads env prefixed with VITE_ to the client bundle
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export function getSessionToken(): string | null {
	try {
		if (
			typeof window !== "undefined" &&
			typeof localStorage !== "undefined" &&
			localStorage
		) {
			return localStorage.getItem("retailhub_session_token");
		}
	} catch (err) {
		console.warn("localStorage is not available:", err);
	}
	return null;
}

function getWebHeaders(userToken?: string) {
	const headers: Record<string, string> = {
		apikey: SUPABASE_ANON_KEY,
		"Content-Type": "application/json",
	};
	const token = userToken || getSessionToken() || SUPABASE_ANON_KEY;
	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}
	return headers;
}

// Convert a flat Record query into URL search parameters
function buildQueryString(query?: Record<string, string>): string {
	if (!query || Object.keys(query).length === 0) return "";
	const params = new URLSearchParams(query);
	return `?${params.toString()}`;
}

export async function selectData<T = any>(
	table: string,
	query?: Record<string, string>,
	userToken?: string,
): Promise<T> {
	if (isTauri) {
		return invoke<T>("supabase_select", {
			table,
			query: query || null,
			userToken: userToken || getSessionToken() || null,
		});
	} else {
		const qs = buildQueryString(query);
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
			method: "GET",
			headers: getWebHeaders(userToken),
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json() as Promise<T>;
	}
}

export async function insertData<T = any>(
	table: string,
	body: any,
	userToken?: string,
): Promise<T> {
	if (isTauri) {
		return invoke<T>("supabase_insert", {
			table,
			body,
			userToken: userToken || getSessionToken() || null,
		});
	} else {
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
			method: "POST",
			headers: {
				...getWebHeaders(userToken),
				Prefer: "return=representation",
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json() as Promise<T>;
	}
}

export async function updateData<T = any>(
	table: string,
	query: Record<string, string>,
	body: any,
	userToken?: string,
): Promise<T> {
	if (isTauri) {
		return invoke<T>("supabase_update", {
			table,
			query,
			body,
			userToken: userToken || getSessionToken() || null,
		});
	} else {
		const qs = buildQueryString(query);
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
			method: "PATCH",
			headers: {
				...getWebHeaders(userToken),
				Prefer: "return=representation",
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json() as Promise<T>;
	}
}

export async function deleteData<T = any>(
	table: string,
	query: Record<string, string>,
	userToken?: string,
): Promise<T> {
	if (isTauri) {
		return invoke<T>("supabase_delete", {
			table,
			query,
			userToken: userToken || getSessionToken() || null,
		});
	} else {
		const qs = buildQueryString(query);
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
			method: "DELETE",
			headers: {
				...getWebHeaders(userToken),
				Prefer: "return=representation",
			},
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json() as Promise<T>;
	}
}

export async function authSignUp(
	email: string,
	password: string,
): Promise<any> {
	if (isTauri) {
		return invoke<any>("supabase_auth_sign_up", { email, password });
	} else {
		const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
			method: "POST",
			headers: getWebHeaders(),
			body: JSON.stringify({ email, password }),
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}
}

export async function authSignIn(
	email: string,
	password: string,
): Promise<any> {
	if (isTauri) {
		return invoke<any>("supabase_auth_sign_in", { email, password });
	} else {
		const res = await fetch(
			`${SUPABASE_URL}/auth/v1/token?grant_type=password`,
			{
				method: "POST",
				headers: getWebHeaders(),
				body: JSON.stringify({ email, password }),
			},
		);
		if (!res.ok) throw new Error(await res.text());
		return res.json();
	}
}

// Session Management Helpers
export interface ActiveUser {
	id: string;
	username: string;
	fullname: string;
	role: "admin" | "pemilik" | "kasir";
	shift?: string;
	phone?: string;
}

export function getSessionUser(): ActiveUser | null {
	try {
		if (
			typeof window === "undefined" ||
			typeof localStorage === "undefined" ||
			!localStorage
		) {
			return null;
		}
		const data = localStorage.getItem("retailhub_session");
		if (!data) return null;
		return JSON.parse(data);
	} catch (err) {
		console.warn("localStorage is not available:", err);
		return null;
	}
}

export async function setSessionUser(user: ActiveUser): Promise<void> {
	try {
		if (
			typeof window !== "undefined" &&
			typeof localStorage !== "undefined" &&
			localStorage
		) {
			let token: string;
			if (isTauri) {
				// Call backend to generate a signed JWT
				token = await invoke<string>("generate_user_jwt", {
					id: user.id,
					role: user.role,
					username: user.username,
					fullname: user.fullname,
				});
			} else {
				// Simulating JWT generation on client side for web compatibility (base64 payload encoding)
				const claims = {
					sub: user.id,
					role: "authenticated",
					user_role: user.role,
					username: user.username,
					fullname: user.fullname,
					exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days expiration
				};
				const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
				const payload = btoa(JSON.stringify(claims));
				token = `${header}.${payload}.web-simulated-signature`;
			}
			localStorage.setItem("retailhub_session_token", token);
			localStorage.setItem("retailhub_session", JSON.stringify(user));
		}
	} catch (err) {
		console.error("Failed to generate JWT session:", err);
	}
}

export function clearSessionUser() {
	try {
		if (
			typeof window !== "undefined" &&
			typeof localStorage !== "undefined" &&
			localStorage
		) {
			localStorage.removeItem("retailhub_session");
			localStorage.removeItem("retailhub_session_token");
		}
	} catch (err) {
		console.warn("localStorage.removeItem failed:", err);
	}
}

export async function verifySession(): Promise<ActiveUser | null> {
	try {
		if (
			typeof window === "undefined" ||
			typeof localStorage === "undefined" ||
			!localStorage
		) {
			return null;
		}

		const token = localStorage.getItem("retailhub_session_token");
		if (!token) return null;

		let claims: any;
		if (isTauri) {
			// Verify token and retrieve claims via Rust backend
			claims = await invoke<any>("verify_user_jwt", { token });
		} else {
			// Simulating JWT verification on client side for web compatibility (base64 payload decoding)
			const parts = token.split(".");
			if (parts.length !== 3) throw new Error("Invalid token format");
			claims = JSON.parse(atob(parts[1]));
			if (claims.exp && Date.now() / 1000 > claims.exp) {
				throw new Error("Token expired");
			}
		}

		const verifiedUser: ActiveUser = {
			id: claims.sub,
			role: claims.role,
			username: claims.username,
			fullname: claims.fullname,
		};

		// Synchronize the local session cache
		localStorage.setItem("retailhub_session", JSON.stringify(verifiedUser));
		return verifiedUser;
	} catch (err) {
		console.warn("JWT Session verification failed:", err);
		// Clear invalid/expired session
		clearSessionUser();
		return null;
	}
}
