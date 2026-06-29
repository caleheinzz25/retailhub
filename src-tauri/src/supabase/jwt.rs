use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
	pub sub: String,       // user_id
	pub role: String,      // user_role
	pub username: String,
	pub fullname: String,
	pub exp: usize,        // expiration timestamp
}

fn get_jwt_secret() -> Vec<u8> {
	std::env::var("JWT_SECRET")
		.unwrap_or_else(|_| "retailhub-fallback-super-secret-key-123456789".to_string())
		.into_bytes()
}

#[tauri::command]
pub fn generate_user_jwt(
	id: String,
	role: String,
	username: String,
	fullname: String,
) -> Result<String, String> {
	let current_time = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_err(|e| e.to_string())?
		.as_secs() as usize;

	// Expire in 7 days (7 * 24 * 60 * 60 seconds)
	let exp = current_time + (7 * 24 * 60 * 60);

	let claims = Claims {
		sub: id,
		role,
		username,
		fullname,
		exp,
	};

	let secret = get_jwt_secret();
	encode(
		&Header::default(),
		&claims,
		&EncodingKey::from_secret(&secret),
	)
	.map_err(|e| format!("Failed to generate JWT: {}", e))
}

#[tauri::command]
pub fn verify_user_jwt(token: String) -> Result<Value, String> {
	let secret = get_jwt_secret();
	let validation = Validation::default();
	
	let token_data = decode::<Claims>(
		&token,
		&DecodingKey::from_secret(&secret),
		&validation,
	)
	.map_err(|e| format!("Invalid or expired token: {}", e))?;

	serde_json::to_value(token_data.claims)
		.map_err(|e| format!("Failed to serialize claims: {}", e))
}
