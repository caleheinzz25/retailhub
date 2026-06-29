mod supabase;

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
        .unwrap_or_else(|_| "https://your-project.supabase.co".to_string());
    let supabase_anon_key = std::env::var("SUPABASE_ANON_KEY")
        .unwrap_or_else(|_| "your-anon-key".to_string());

    let supabase_client = supabase::SupabaseClient::new(supabase_url, supabase_anon_key);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(supabase_client)
        .invoke_handler(tauri::generate_handler![
            greet,
            supabase::db::supabase_select,
            supabase::db::supabase_insert,
            supabase::db::supabase_update,
            supabase::db::supabase_delete,
            supabase::auth::supabase_auth_sign_up,
            supabase::auth::supabase_auth_sign_in,
            supabase::jwt::generate_user_jwt,
            supabase::jwt::verify_user_jwt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
