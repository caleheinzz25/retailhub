use std::collections::HashMap;
use serde_json::Value;
use tauri::State;
use crate::supabase::client::SupabaseClient;

#[tauri::command]
pub async fn supabase_select(
	client_state: State<'_, SupabaseClient>,
	table: String,
	query: Option<HashMap<String, String>>,
	user_token: Option<String>,
) -> Result<Value, String> {
	println!("\x1b[34m[Supabase DB]\x1b[0m SELECT table='{}' query={:?}", table, query);
	let url = format!("{}/rest/v1/{}", client_state.url, table);

	let mut request = client_state.client
		.get(&url)
		.headers(client_state.get_headers(user_token.as_deref()));

	if let Some(params) = query {
		request = request.query(&params);
	}

	let response = request.send().await.map_err(|e| {
		eprintln!("\x1b[31m[Supabase DB CONNECTION ERROR]\x1b[0m SELECT table='{}' error={}", table, e);
		e.to_string()
	})?;

	let status = response.status();
	let text = response.text().await.map_err(|e| e.to_string())?;

	if status.is_success() {
		println!("\x1b[32m[Supabase DB SUCCESS]\x1b[0m SELECT table='{}' status={} response_len={}", table, status, text.len());
		serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))
	} else {
		eprintln!("\x1b[31m[Supabase DB ERROR]\x1b[0m SELECT table='{}' status={} body={}", table, status, text);
		Err(format!("Supabase error ({}): {}", status, text))
	}
}

#[tauri::command]
pub async fn supabase_insert(
	client_state: State<'_, SupabaseClient>,
	table: String,
	body: Value,
	user_token: Option<String>,
) -> Result<Value, String> {
	println!("\x1b[34m[Supabase DB]\x1b[0m INSERT table='{}' body={}", table, body);
	let url = format!("{}/rest/v1/{}", client_state.url, table);
	let mut headers = client_state.get_headers(user_token.as_deref());
	headers.insert(
		reqwest::header::CONTENT_TYPE,
		reqwest::header::HeaderValue::from_static("application/json"),
	);
	headers.insert(
		"Prefer",
		reqwest::header::HeaderValue::from_static("return=representation"),
	);

	let response = client_state.client
		.post(&url)
		.headers(headers)
		.json(&body)
		.send()
		.await
		.map_err(|e| {
			eprintln!("\x1b[31m[Supabase DB CONNECTION ERROR]\x1b[0m INSERT table='{}' error={}", table, e);
			e.to_string()
		})?;

	let status = response.status();
	let text = response.text().await.map_err(|e| e.to_string())?;

	if status.is_success() {
		println!("\x1b[32m[Supabase DB SUCCESS]\x1b[0m INSERT table='{}' status={}", table, status);
		serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))
	} else {
		eprintln!("\x1b[31m[Supabase DB ERROR]\x1b[0m INSERT table='{}' status={} body={}", table, status, text);
		Err(format!("Supabase error ({}): {}", status, text))
	}
}

#[tauri::command]
pub async fn supabase_update(
	client_state: State<'_, SupabaseClient>,
	table: String,
	query: HashMap<String, String>,
	body: Value,
	user_token: Option<String>,
) -> Result<Value, String> {
	println!("\x1b[34m[Supabase DB]\x1b[0m UPDATE table='{}' query={:?} body={}", table, query, body);
	if query.is_empty() {
		return Err("Update query filters cannot be empty".to_string());
	}

	let url = format!("{}/rest/v1/{}", client_state.url, table);
	let mut headers = client_state.get_headers(user_token.as_deref());
	headers.insert(
		reqwest::header::CONTENT_TYPE,
		reqwest::header::HeaderValue::from_static("application/json"),
	);
	headers.insert(
		"Prefer",
		reqwest::header::HeaderValue::from_static("return=representation"),
	);

	let response = client_state.client
		.patch(&url)
		.headers(headers)
		.query(&query)
		.json(&body)
		.send()
		.await
		.map_err(|e| {
			eprintln!("\x1b[31m[Supabase DB CONNECTION ERROR]\x1b[0m UPDATE table='{}' error={}", table, e);
			e.to_string()
		})?;

	let status = response.status();
	let text = response.text().await.map_err(|e| e.to_string())?;

	if status.is_success() {
		println!("\x1b[32m[Supabase DB SUCCESS]\x1b[0m UPDATE table='{}' status={}", table, status);
		serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))
	} else {
		eprintln!("\x1b[31m[Supabase DB ERROR]\x1b[0m UPDATE table='{}' status={} body={}", table, status, text);
		Err(format!("Supabase error ({}): {}", status, text))
	}
}

#[tauri::command]
pub async fn supabase_delete(
	client_state: State<'_, SupabaseClient>,
	table: String,
	query: HashMap<String, String>,
	user_token: Option<String>,
) -> Result<Value, String> {
	println!("\x1b[34m[Supabase DB]\x1b[0m DELETE table='{}' query={:?}", table, query);
	if query.is_empty() {
		return Err("Delete query filters cannot be empty".to_string());
	}

	let url = format!("{}/rest/v1/{}", client_state.url, table);
	let mut headers = client_state.get_headers(user_token.as_deref());
	headers.insert(
		"Prefer",
		reqwest::header::HeaderValue::from_static("return=representation"),
	);

	let response = client_state.client
		.delete(&url)
		.headers(headers)
		.query(&query)
		.send()
		.await
		.map_err(|e| {
			eprintln!("\x1b[31m[Supabase DB CONNECTION ERROR]\x1b[0m DELETE table='{}' error={}", table, e);
			e.to_string()
		})?;

	let status = response.status();
	let text = response.text().await.map_err(|e| e.to_string())?;

	if status.is_success() {
		println!("\x1b[32m[Supabase DB SUCCESS]\x1b[0m DELETE table='{}' status={}", table, status);
		serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))
	} else {
		eprintln!("\x1b[31m[Supabase DB ERROR]\x1b[0m DELETE table='{}' status={} body={}", table, status, text);
		Err(format!("Supabase error ({}): {}", status, text))
	}
}

#[tauri::command]
pub async fn supabase_rpc(
	client_state: State<'_, SupabaseClient>,
	function_name: String,
	params: Value,
	user_token: Option<String>,
) -> Result<Value, String> {
	println!("\x1b[34m[Supabase RPC]\x1b[0m function='{}'", function_name);
	let url = format!("{}/rest/v1/rpc/{}", client_state.url, function_name);

	let mut headers = client_state.get_headers(user_token.as_deref());
	headers.insert(
		reqwest::header::CONTENT_TYPE,
		reqwest::header::HeaderValue::from_static("application/json"),
	);

	let response = client_state.client
		.post(&url)
		.headers(headers)
		.json(&params)
		.send()
		.await
		.map_err(|e| {
			eprintln!("\x1b[31m[Supabase RPC CONNECTION ERROR]\x1b[0m function='{}' error={}", function_name, e);
			e.to_string()
		})?;

	let status = response.status();
	let text = response.text().await.map_err(|e| e.to_string())?;

	if status.is_success() {
		println!("\x1b[32m[Supabase RPC SUCCESS]\x1b[0m function='{}' status={}", function_name, status);
		serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))
	} else {
		eprintln!("\x1b[31m[Supabase RPC ERROR]\x1b[0m function='{}' status={} body={}", function_name, status, text);
		Err(format!("Supabase error ({}): {}", status, text))
	}
}
