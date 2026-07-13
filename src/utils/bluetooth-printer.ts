/**
 * Bluetooth Thermal Printer — Cross-Platform Utility
 *
 * Platform strategy:
 *   - Windows  → Tauri invoke → btleplug (WinRT BLE)
 *   - Linux    → Tauri invoke → btleplug (BlueZ)
 *   - Android  → Web Bluetooth API (Android WebView Chromium supports it natively)
 *   - Fallback → Web Bluetooth API (for dev/browser mode)
 *
 * Compatible with common 58mm / 80mm thermal printers:
 * Xprinter, EPPOS, Goojprt, MTP, Peripage, Rongta, etc.
 */

import { invoke } from "@tauri-apps/api/core";

// ─── Platform detection ────────────────────────────────────────────────────────

/** True when running inside Tauri desktop (Windows/Linux/macOS) */
function isTauriDesktop(): boolean {
	return (
		typeof window !== "undefined" &&
		"__TAURI__" in window &&
		// Android WebView also has __TAURI__, but Web Bluetooth works there natively
		!isAndroid()
	);
}

function isAndroid(): boolean {
	return (
		typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)
	);
}

function isWebBluetoothAvailable(): boolean {
	return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BtDevice {
	id: string;
	name: string;
}

export interface ReceiptData {
	transactionId: string;
	date: string;
	cashier: string;
	paymentMethod: string;
	items: Array<{
		name: string;
		sku: string;
		price: number;
		quantity: number;
	}>;
	subtotal: number;
	tax: number;
	total: number;
	cashPaid: number;
	change: number;
}

// ─── Module state (Web Bluetooth path) ─────────────────────────────────────────

let _webDevice: BluetoothDevice | null = null;
let _webChar: BluetoothRemoteGATTCharacteristic | null = null;

const WEB_SERVICE_UUIDS = [
	"000018f0-0000-1000-8000-00805f9b34fb",
	"6e400001-b5a3-f393-e0a9-e50e24dcca9e",
	"e7810a71-73ae-499d-8c15-faa9aef0c3f2",
	"49535343-fe7d-4ae5-8fa9-9fafd205e455",
	"0000ff00-0000-1000-8000-00805f9b34fb",
	"0000ffe0-0000-1000-8000-00805f9b34fb",
];

const WEB_CHAR_UUIDS = [
	"00002af1-0000-1000-8000-00805f9b34fb",
	"6e400002-b5a3-f393-e0a9-e50e24dcca9e",
	"000018f1-0000-1000-8000-00805f9b34fb",
	"0000ff02-0000-1000-8000-00805f9b34fb",
	"0000ffe1-0000-1000-8000-00805f9b34fb",
];

// ─── Public API ────────────────────────────────────────────────────────────────

export type PrinterConnectionState = "disconnected" | "scanning" | "connected";

let _connectedName: string | null = null;

export function getConnectedPrinterName(): string | null {
	return _connectedName;
}

/**
 * Scan for BLE printers.
 * - Desktop (Win/Linux): returns a list of devices to choose from (via Tauri/btleplug)
 * - Android/Web: triggers browser BLE picker → returns single device
 */
export async function scanPrinters(): Promise<BtDevice[]> {
	if (isTauriDesktop()) {
		// Tauri path: scan in background, return device list
		const devices = await invoke<BtDevice[]>("bt_scan_printers");
		return devices;
	}
	// Web/Android path: return empty — connectPrinter handles picker
	return [];
}

/**
 * Connect to printer.
 * - Desktop: pass a device_id from scanPrinters() result
 * - Android/Web: deviceId can be omitted — browser opens native BLE picker
 */
export async function connectPrinter(deviceId?: string): Promise<string> {
	if (isTauriDesktop()) {
		if (!deviceId)
			throw new Error("Pilih printer dari daftar terlebih dahulu.");
		const name = await invoke<string>("bt_connect_printer", {
			deviceId,
		});
		_connectedName = name;
		return name;
	}

	// Web Bluetooth path (Android + Web)
	if (!isWebBluetoothAvailable()) {
		throw new Error(
			"Bluetooth tidak tersedia. Di Linux gunakan versi Desktop (Tauri).",
		);
	}

	const bt = navigator.bluetooth as any;
	const device: BluetoothDevice = await bt.requestDevice({
		acceptAllDevices: true,
		optionalServices: WEB_SERVICE_UUIDS,
	});

	if (!device.gatt) throw new Error("Perangkat tidak mendukung GATT.");
	const server = await device.gatt.connect();

	let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
	for (const svcUUID of WEB_SERVICE_UUIDS) {
		try {
			const service = await server.getPrimaryService(svcUUID);
			for (const cUUID of WEB_CHAR_UUIDS) {
				try {
					const c = await service.getCharacteristic(cUUID);
					if (c.properties.write || c.properties.writeWithoutResponse) {
						writeChar = c;
						break;
					}
				} catch {
					/* try next */
				}
			}
			if (!writeChar) {
				const chars = await service.getCharacteristics();
				for (const c of chars) {
					if (c.properties.write || c.properties.writeWithoutResponse) {
						writeChar = c;
						break;
					}
				}
			}
			if (writeChar) break;
		} catch {
			/* service not found */
		}
	}

	if (!writeChar) {
		device.gatt.disconnect();
		throw new Error(
			"Printer terhubung tapi tidak ada karakteristik tulis. Pastikan printer BLE ESC/POS.",
		);
	}

	_webDevice = device;
	_webChar = writeChar;
	device.addEventListener("gattserverdisconnected", () => {
		_webDevice = null;
		_webChar = null;
		_connectedName = null;
	});

	const name = device.name || "Printer BLE";
	_connectedName = name;
	return name;
}

/** Disconnect from printer */
export async function disconnectPrinter(): Promise<void> {
	if (isTauriDesktop()) {
		await invoke("bt_disconnect_printer");
	} else {
		_webDevice?.gatt?.disconnect();
		_webDevice = null;
		_webChar = null;
	}
	_connectedName = null;
}

/** Check connection status */
export async function isPrinterConnected(): Promise<boolean> {
	if (isTauriDesktop()) {
		return await invoke<boolean>("bt_is_connected");
	}
	return !!(_webDevice?.gatt?.connected && _webChar);
}

/**
 * Print receipt to the connected BLE thermal printer.
 */
export async function printReceiptBluetooth(
	receipt: ReceiptData,
): Promise<void> {
	const data = buildEscPos(receipt);

	if (isTauriDesktop()) {
		// Send as Array (JSON-serializable), Rust will receive Vec<u8>
		await invoke("bt_print_raw", { data: Array.from(data) });
		return;
	}

	// Web Bluetooth path
	if (!_webChar || !_webDevice?.gatt?.connected) {
		throw new Error(
			"Printer belum terhubung. Klik 'Hubungkan Printer' terlebih dahulu.",
		);
	}

	const CHUNK = 512;
	for (let i = 0; i < data.length; i += CHUNK) {
		const chunk = data.slice(i, i + CHUNK);
		if (_webChar.properties.writeWithoutResponse) {
			await _webChar.writeValueWithoutResponse(chunk);
		} else {
			await _webChar.writeValue(chunk);
		}
		if (i + CHUNK < data.length) {
			await new Promise((r) => setTimeout(r, 50));
		}
	}
}

// ─── ESC/POS Builder ──────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const enc = new TextEncoder();

function pushBytes(buf: number[], ...bytes: number[]) {
	buf.push(...bytes);
}

function pushText(buf: number[], text: string) {
	for (const b of enc.encode(text)) buf.push(b);
}

function formatRp(n: number): string {
	return `Rp${n.toLocaleString("id-ID")}`;
}

/**
 * Build ESC/POS byte stream for 58mm thermal printer (32-char width).
 * Works with any ESC/POS compatible printer.
 */
function buildEscPos(r: ReceiptData, width = 32): Uint8Array {
	const buf: number[] = [];
	const LINE = "-".repeat(width);
	const DLINE = "=".repeat(width);

	// ── Initialize ──────────────────────────────────────────────────────
	pushBytes(buf, ESC, 0x40); // ESC @ — reset printer

	// ── Header (centered) ───────────────────────────────────────────────
	pushBytes(buf, ESC, 0x61, 0x01); // center align
	pushBytes(buf, ESC, 0x21, 0x30); // bold + double size
	pushText(buf, "RETAILHUB\n");
	pushBytes(buf, ESC, 0x21, 0x00); // back to normal
	pushText(buf, "Toko Sembako & Bahan Pokok\n");
	pushText(buf, `${DLINE}\n`);

	// ── Transaction info (left) ─────────────────────────────────────────
	pushBytes(buf, ESC, 0x61, 0x00); // left align
	pushText(buf, `NO  : ${r.transactionId}\n`);
	pushText(buf, `TGL : ${r.date}\n`);
	pushText(buf, `KASIR: ${r.cashier}\n`);
	pushText(buf, `${LINE}\n`);

	// ── Items ────────────────────────────────────────────────────────────
	for (const item of r.items) {
		// Item name (truncate if too long)
		const name =
			item.name.length > width ? item.name.slice(0, width - 1) : item.name;
		pushText(buf, `${name}\n`);

		// Qty × price → total (right-aligned)
		const left = `  ${item.quantity}x${formatRp(item.price)}`;
		const right = formatRp(item.price * item.quantity);
		const spaces = Math.max(1, width - left.length - right.length);
		pushText(buf, `${left}${" ".repeat(spaces)}${right}\n`);
	}

	pushText(buf, `${LINE}\n`);

	// ── Totals ────────────────────────────────────────────────────────────
	function twoCol(label: string, value: string) {
		const sp = Math.max(1, width - label.length - value.length);
		pushText(buf, `${label}${" ".repeat(sp)}${value}\n`);
	}

	twoCol("Subtotal", formatRp(r.subtotal));
	twoCol("PPN (11%)", formatRp(r.tax));
	pushText(buf, `${LINE}\n`);

	// TOTAL — bold
	pushBytes(buf, ESC, 0x21, 0x08);
	twoCol("TOTAL BAYAR", formatRp(r.total));
	pushBytes(buf, ESC, 0x21, 0x00);

	twoCol("Bayar", formatRp(r.cashPaid));
	twoCol("Kembali", formatRp(r.change));
	twoCol("Metode", r.paymentMethod.toUpperCase());

	// ── Footer (centered) ─────────────────────────────────────────────────
	pushText(buf, `${DLINE}\n`);
	pushBytes(buf, ESC, 0x61, 0x01); // center
	pushText(buf, "Terima kasih!\n");
	pushText(buf, "** RetailHub POS **\n");

	// Feed + partial cut
	pushBytes(buf, LF, LF, LF, LF);
	pushBytes(buf, GS, 0x56, 0x41, 0x00); // GS V A — partial cut

	return new Uint8Array(buf);
}
