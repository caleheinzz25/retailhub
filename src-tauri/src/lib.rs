mod supabase;
mod bluetooth;

use bluetooth::BtStateHandle;
use std::sync::Arc;
use tokio::sync::Mutex;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    let _ = dotenvy::dotenv();

    let supabase_url = std::env::var("SUPABASE_URL")
        .ok()
        .or_else(|| option_env!("SUPABASE_URL").map(|s| s.to_string()))
        .unwrap_or_else(|| "https://your-project.supabase.co".to_string());
    let supabase_anon_key = std::env::var("SUPABASE_ANON_KEY")
        .ok()
        .or_else(|| option_env!("SUPABASE_ANON_KEY").map(|s| s.to_string()))
        .unwrap_or_else(|| "your-anon-key".to_string());

    let supabase_client = supabase::SupabaseClient::new(supabase_url, supabase_anon_key);

    // Shared Bluetooth state
    let bt_state: BtStateHandle = Arc::new(Mutex::new(bluetooth::BtState::new()));

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(supabase_client)
        .manage(bt_state);

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            supabase::db::supabase_select,
            supabase::db::supabase_insert,
            supabase::db::supabase_update,
            supabase::db::supabase_delete,
            supabase::db::supabase_rpc,
            supabase::auth::supabase_auth_sign_up,
            supabase::auth::supabase_auth_sign_in,
            supabase::jwt::generate_user_jwt,
            supabase::jwt::verify_user_jwt,
            // Bluetooth printer commands
            bluetooth::bt_scan_printers,
            bluetooth::bt_connect_printer,
            bluetooth::bt_print_raw,
            bluetooth::bt_disconnect_printer,
            bluetooth::bt_is_connected,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
