use btleplug::api::{
    Central, Manager as _, Peripheral as _, ScanFilter, WriteType,
};
use btleplug::platform::{Adapter, Manager, Peripheral};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::sync::Mutex;
use uuid::Uuid;

// ─── State ────────────────────────────────────────────────────────────────────

pub struct BtState {
    pub adapter: Option<Adapter>,
    pub found: HashMap<String, Peripheral>,  // id -> peripheral
    pub connected: Option<Peripheral>,
    pub write_char: Option<Uuid>,
}

pub type BtStateHandle = Arc<Mutex<BtState>>;

impl BtState {
    pub fn new() -> Self {
        Self {
            adapter: None,
            found: HashMap::new(),
            connected: None,
            write_char: None,
        }
    }
}

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct BtDevice {
    pub id: String,
    pub name: String,
}

// ─── Known BLE service/characteristic UUIDs for thermal printers ──────────────

fn printer_char_uuids() -> Vec<Uuid> {
    vec![
        // Generic write char
        Uuid::parse_str("00002af1-0000-1000-8000-00805f9b34fb").unwrap(),
        // NUS TX (write)
        Uuid::parse_str("6e400002-b5a3-f393-e0a9-e50e24dcca9e").unwrap(),
        Uuid::parse_str("000018f1-0000-1000-8000-00805f9b34fb").unwrap(),
        Uuid::parse_str("0000ff02-0000-1000-8000-00805f9b34fb").unwrap(),
        // HM-10 write
        Uuid::parse_str("0000ffe1-0000-1000-8000-00805f9b34fb").unwrap(),
        // STAAR write
        Uuid::parse_str("bef8d6c9-9c21-4c9e-b632-bd58c1009f9f").unwrap(),
    ]
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Scan for nearby BLE printers (5 seconds). Returns list of found devices.
#[tauri::command]
pub async fn bt_scan_printers(state: State<'_, BtStateHandle>) -> Result<Vec<BtDevice>, String> {
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    let adapter = adapters.into_iter().next().ok_or("Tidak ada Bluetooth adapter ditemukan.")?;

    adapter.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;

    // Scan for 5 seconds
    tokio::time::sleep(Duration::from_secs(5)).await;

    adapter.stop_scan().await.map_err(|e| e.to_string())?;

    let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;

    let mut found_map = HashMap::new();
    let mut result = Vec::new();

    for p in peripherals {
        let props = p.properties().await.ok().flatten();
        let name = props
            .as_ref()
            .and_then(|p| p.local_name.clone())
            .unwrap_or_else(|| "Unknown".to_string());

        // Include all devices — user picks the printer
        let id = p.id().to_string();
        found_map.insert(id.clone(), p);
        result.push(BtDevice { id, name });
    }

    let mut guard = state.lock().await;
    guard.adapter = Some(adapter);
    guard.found = found_map;

    Ok(result)
}

/// Connect to a specific BLE device by its ID.
#[tauri::command]
pub async fn bt_connect_printer(
    device_id: String,
    state: State<'_, BtStateHandle>,
) -> Result<String, String> {
    let mut guard = state.lock().await;

    let peripheral = guard
        .found
        .get(&device_id)
        .cloned()
        .ok_or("Perangkat tidak ditemukan. Scan ulang.")?;

    peripheral.connect().await.map_err(|e| format!("Gagal konek: {e}"))?;
    peripheral
        .discover_services()
        .await
        .map_err(|e| format!("Gagal discover services: {e}"))?;

    // Find first writable characteristic
    let chars = peripheral.characteristics();
    let printer_chars = printer_char_uuids();

    let mut write_uuid: Option<Uuid> = None;

    // First: try known UUIDs
    for known in &printer_chars {
        if let Some(c) = chars.iter().find(|c| &c.uuid == known) {
            if c.properties
                .contains(btleplug::api::CharPropFlags::WRITE)
                || c.properties
                    .contains(btleplug::api::CharPropFlags::WRITE_WITHOUT_RESPONSE)
            {
                write_uuid = Some(c.uuid);
                break;
            }
        }
    }

    // Fallback: any writable characteristic
    if write_uuid.is_none() {
        for c in &chars {
            if c.properties
                .contains(btleplug::api::CharPropFlags::WRITE)
                || c.properties
                    .contains(btleplug::api::CharPropFlags::WRITE_WITHOUT_RESPONSE)
            {
                write_uuid = Some(c.uuid);
                break;
            }
        }
    }

    let write_uuid =
        write_uuid.ok_or("Tidak ada karakteristik tulis ditemukan di printer.")?;

    let props = peripheral.properties().await.ok().flatten();
    let name = props
        .and_then(|p| p.local_name)
        .unwrap_or_else(|| "Printer BLE".to_string());

    guard.connected = Some(peripheral);
    guard.write_char = Some(write_uuid);

    Ok(name)
}

/// Send raw ESC/POS bytes to the connected printer.
#[tauri::command]
pub async fn bt_print_raw(
    data: Vec<u8>,
    state: State<'_, BtStateHandle>,
) -> Result<(), String> {
    let guard = state.lock().await;

    let peripheral = guard
        .connected
        .as_ref()
        .ok_or("Printer belum terhubung.")?;
    let char_uuid = guard.write_char.ok_or("Karakteristik tulis tidak ditemukan.")?;

    let chars = peripheral.characteristics();
    let characteristic = chars
        .iter()
        .find(|c| c.uuid == char_uuid)
        .ok_or("Karakteristik tidak tersedia.")?;

    let write_type = if characteristic
        .properties
        .contains(btleplug::api::CharPropFlags::WRITE_WITHOUT_RESPONSE)
    {
        WriteType::WithoutResponse
    } else {
        WriteType::WithResponse
    };

    // Send in 512-byte chunks
    const CHUNK: usize = 512;
    for chunk in data.chunks(CHUNK) {
        peripheral
            .write(characteristic, chunk, write_type)
            .await
            .map_err(|e| format!("Gagal kirim data: {e}"))?;
        // Small delay to avoid overflow
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    Ok(())
}

/// Disconnect from the current printer.
#[tauri::command]
pub async fn bt_disconnect_printer(state: State<'_, BtStateHandle>) -> Result<(), String> {
    let mut guard = state.lock().await;
    if let Some(p) = guard.connected.take() {
        p.disconnect().await.ok();
    }
    guard.write_char = None;
    Ok(())
}

/// Check if printer is still connected.
#[tauri::command]
pub async fn bt_is_connected(state: State<'_, BtStateHandle>) -> Result<bool, String> {
    let guard = state.lock().await;
    if let Some(p) = &guard.connected {
        return Ok(p.is_connected().await.unwrap_or(false));
    }
    Ok(false)
}
