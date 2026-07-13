import {
	checkPermissions,
	requestPermissions,
	scan,
} from "@tauri-apps/plugin-barcode-scanner";

/**
 * Checks if the application is running inside a Tauri container on Android.
 */
export function isAndroidMobile(): boolean {
	if (typeof window === "undefined") return false;
	const isTauri =
		(window as Window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__ !== undefined;
	const isAndroid = navigator.userAgent.toLowerCase().includes("android");
	return isTauri && isAndroid;
}

/**
 * Attempts to scan a barcode using the camera if running on Android.
 * Returns the scanned content string, or null if the scan is cancelled,
 * permissions are denied, or not running in Android mobile mode.
 */
export async function scanBarcode(): Promise<string | null> {
	if (!isAndroidMobile()) {
		console.log(
			"[Scanner] Not running on Android mobile. Falling back to simulation.",
		);
		return null;
	}

	try {
		// Check current permissions first
		let permission = await checkPermissions();
		console.log("[Scanner] Current camera permission state:", permission);

		if (permission !== "granted") {
			permission = await requestPermissions();
			console.log("[Scanner] Requested camera permission state:", permission);
		}

		if (permission === "granted") {
			console.log("[Scanner] Starting camera scan...");
			// This opens the native camera overlay view (windowed: false by default)
			const result = await scan({
				cameraDirection: "back",
			});
			console.log("[Scanner] Scan successful:", result);
			return result.content;
		}

		console.warn("[Scanner] Camera permission denied.");
		return null;
	} catch (error) {
		console.error("[Scanner] Error during barcode scanning:", error);
		return null;
	}
}

export interface ExternalProductInfo {
	name: string;
	brand?: string;
	category?: string;
}

/**
 * Searches for product details on the internet using barcode/UPC/EAN.
 * Utilizes Open Food Facts (for food) with fallback to UPCitemdb (for general goods).
 */
export async function lookupProductDetails(
	barcode: string,
): Promise<ExternalProductInfo | null> {
	const cleanBarcode = barcode.trim();
	if (!cleanBarcode) return null;

	console.log(
		`[Scanner] Looking up product details for barcode: ${cleanBarcode}`,
	);

	// 1. Try Open Food Facts first (free, keyless, great for food products)
	try {
		const response = await fetch(
			`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}?fields=product_name,brands,categories`,
		);
		if (response.ok) {
			const data = await response.json();
			if (data.status === 1 && data.product) {
				console.log("[Scanner] Found in Open Food Facts:", data.product);
				return {
					name: data.product.product_name || "",
					brand: data.product.brands || undefined,
					category: data.product.categories || undefined,
				};
			}
		}
	} catch (e) {
		console.warn("[Scanner] Open Food Facts lookup failed:", e);
	}

	// 2. Try UPCitemdb as fallback (free trial, keyless, great for household products)
	try {
		const response = await fetch(
			`https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanBarcode}`,
		);
		if (response.ok) {
			const data = await response.json();
			if (data.items && data.items.length > 0) {
				const item = data.items[0];
				console.log("[Scanner] Found in UPCitemdb:", item);
				return {
					name: item.title || "",
					brand: item.brand || undefined,
					category: item.category || undefined,
				};
			}
		}
	} catch (e) {
		console.warn("[Scanner] UPCitemdb lookup failed:", e);
	}

	return null;
}
