import { invoke } from "@tauri-apps/api/core";

// Detect if running in Tauri desktop shell
export const isTauri =
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

// ── Store (Toko) helpers ────────────────────────────────────────────

/** Get currently active toko ID from session */
export function getCurrentTokoId(): string | null {
	try {
		const user = getSessionUser();
		return user?.toko_id || null;
	} catch {
		return null;
	}
}

/** Get currently active toko name from session */
export function getCurrentTokoName(): string | null {
	try {
		const user = getSessionUser();
		return user?.toko_name || null;
	} catch {
		return null;
	}
}

/** Switch active store: update session + dispatch event so all pages refresh */
export function switchToko(tokoId: string, tokoName: string) {
	const user = getSessionUser();
	if (!user) return;

	const updated = { ...user, toko_id: tokoId, toko_name: tokoName };
	try {
		localStorage.setItem("retailhub_session", JSON.stringify(updated));
		// Dispatch event so root layout and all pages re-read from session
		window.dispatchEvent(
			new CustomEvent("retailhub-toko-changed", {
				detail: { toko_id: tokoId, toko_name: tokoName },
			}),
		);
	} catch (err) {
		console.warn("Failed to switch toko:", err);
	}
}

/** Fetch all stores (pemilik sees their own, admin sees all, staff sees their assigned store) */
export async function getAllToko(): Promise<any[]> {
	try {
		const user = getSessionUser();
		const query: Record<string, string> = { order: "name.asc" };
		if (user) {
			if (user.role === "pemilik") {
				query.pemilik_id = `eq.${user.id}`;
			} else if (user.role === "staff" && user.toko_id) {
				query.id = `eq.${user.toko_id}`;
			}
		}
		return await selectData<any[]>("toko", query);
	} catch (err) {
		console.error("[getAllToko] Failed:", err);
		return [];
	}
}

// ── Data access ────────────────────────────────────────────────────

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

// ── Session Management ────────────────────────────────────────────

export interface ActiveUser {
	id: string;
	username: string;
	fullname: string;
	role: "admin" | "pemilik" | "staff";
	shift?: string;
	phone?: string;
	toko_id?: string;
	toko_name?: string;
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
	// Only works in Tauri Desktop mode.
	// Web mode uses the Supabase Edge Function (generate-jwt) directly from login.tsx.
	if (!isTauri) return;

	try {
		if (
			typeof window !== "undefined" &&
			typeof localStorage !== "undefined" &&
			localStorage
		) {
			const token = await invoke<string>("generate_user_jwt", {
				id: user.id,
				role: user.role,
				username: user.username,
				fullname: user.fullname,
				toko_id: user.toko_id || "",
				toko_name: user.toko_name || "",
			});
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

		// Decode JWT claims on client side for both Tauri and Web.
		// Cryptographic signature is validated by the Supabase database server on every request.
		// Decoding in JS avoids signature verification failures caused by secret mismatches
		// (e.g. Supabase Edge Function cloud secret vs local Tauri environment secret).
		const parts = token.split(".");
		if (parts.length !== 3) throw new Error("Invalid token format");

		let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		while (base64.length % 4) {
			base64 += "=";
		}

		const claims = JSON.parse(atob(base64));
		if (claims.exp && Date.now() / 1000 > claims.exp) {
			throw new Error("Token expired");
		}

		const verifiedUser: ActiveUser = {
			id: claims.sub,
			// Note: JWT stores "authenticated" in `role` for PostgREST compatibility.
			// The actual app role (admin/pemilik/staff) is in `user_role`.
			role: claims.user_role || claims.role,
			username: claims.username,
			fullname: claims.fullname || claims.username,
			toko_id: claims.toko_id,
			toko_name: claims.toko_name,
		};

		// Synchronize the local session cache
		localStorage.setItem("retailhub_session", JSON.stringify(verifiedUser));
		return verifiedUser;
	} catch (err) {
		console.warn("Session verification failed:", err);
		// Clear invalid/expired session
		clearSessionUser();
		return null;
	}
}

export async function findProductByBarcode(
	barcode: string,
	toko_id?: string,
): Promise<any | null> {
	try {
		// 1. Try to find directly in barang table by SKU/barcode (scoped to toko if provided)
		const barangQuery: Record<string, string> = { sku: `eq.${barcode}` };
		if (toko_id) {
			barangQuery.toko_id = `eq.${toko_id}`;
		}
		const resBarang = await selectData<any[]>("barang", barangQuery);
		if (resBarang && resBarang.length > 0) {
			return resBarang[0];
		}

		// 2. If not found, try to find in barcode table
		const resBarcode = await selectData<any[]>("barcode", {
			barcode: `eq.${barcode}`,
		});
		if (resBarcode && resBarcode.length > 0) {
			const barangId = resBarcode[0].barang_id;
			const resBarangById = await selectData<any[]>("barang", {
				id: `eq.${barangId}`,
			});
			if (resBarangById && resBarangById.length > 0) {
				return resBarangById[0];
			}
		}
	} catch (err) {
		console.error("[db] Error finding product by barcode:", err);
	}
	return null;
}

/**
 * Call a Supabase RPC (PostgREST) function.
 * Works in both Tauri (Rust invoke) and Web (fetch) modes.
 */
export async function callRpc<T = any>(
	functionName: string,
	params: Record<string, any>,
	userToken?: string,
): Promise<T> {
	if (isTauri) {
		return invoke<T>("supabase_rpc", {
			functionName,
			params,
			userToken: userToken || getSessionToken() || null,
		});
	} else {
		const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
			method: "POST",
			headers: {
				...getWebHeaders(userToken),
				"Content-Type": "application/json",
			},
			body: JSON.stringify(params),
		});
		if (!res.ok) throw new Error(await res.text());
		return res.json() as Promise<T>;
	}
}
