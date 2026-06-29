use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use crate::supabase::client::SupabaseClient;

#[derive(Serialize, Deserialize)]
struct AuthBody {
	email: String,
	password: String,
}

#[tauri::command]
pub async fn supabase_auth_sign_up(
	client_state: State<'_, SupabaseClient>,
	email: String,
	password: String,
) -> Result<Value, String> {
	println!("\x1b[35m[Supabase Auth]\x1b[0m SIGNUP email='{}'", email);
	let url = format!("{}/auth/v1/signup", client_state.url);
	let mut headers = client_state.get_headers(None);
	headers.insert(
		reqwest::header::CONTENT_TYPE,
		reqwest::header::HeaderValue::from_static("application/json"),
	);

	let body = AuthBody { email: email.clone(), password };

	let response = client_state.client
		.post(&url)
		.headers(headers)
		.json(&body)
		.send()
		.await
		.map_err(|e| {
			eprintln!("\x1b[31m[Supabase Auth CONNECTION ERROR]\x1b[0m SIGNUP email='{}' error={}", email, e);
			e.to_string()
		})?;

	let status = response.status();
	let text = response.text().await.map_err(|e| e.to_string())?;

	if status.is_success() {
		println!("\x1b[32m[Supabase Auth SUCCESS]\x1b[0m SIGNUP email='{}' status={}", email, status);
		serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))
	} else {
		eprintln!("\x1b[31m[Supabase Auth ERROR]\x1b[0m SIGNUP email='{}' status={} body={}", email, status, text);
		Err(format!("Supabase Auth error ({}): {}", status, text))
	}
}

#[tauri::command]
pub async fn supabase_auth_sign_in(
	client_state: State<'_, SupabaseClient>,
	email: String,
	password: String,
) -> Result<Value, String> {
	println!("\x1b[35m[Supabase Auth]\x1b[0m SIGNIN email='{}'", email);
	let url = format!("{}/auth/v1/token?grant_type=password", client_state.url);
	let mut headers = client_state.get_headers(None);
	headers.insert(
		reqwest::header::CONTENT_TYPE,
		reqwest::header::HeaderValue::from_static("application/json"),
	);

	let body = AuthBody { email: email.clone(), password };

	let response = client_state.client
		.post(&url)
		.headers(headers)
		.json(&body)
		.send()
		.await
		.map_err(|e| {
			eprintln!("\x1b[31m[Supabase Auth CONNECTION ERROR]\x1b[0m SIGNIN email='{}' error={}", email, e);
			e.to_string()
		})?;

	let status = response.status();
	let text = response.text().await.map_err(|e| e.to_string())?;

	if status.is_success() {
		println!("\x1b[32m[Supabase Auth SUCCESS]\x1b[0m SIGNIN email='{}' status={}", email, status);
		serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))
	} else {
		eprintln!("\x1b[31m[Supabase Auth ERROR]\x1b[0m SIGNIN email='{}' status={} body={}", email, status, text);
		Err(format!("Supabase Auth error ({}): {}", status, text))
	}
}
