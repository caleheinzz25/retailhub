#[derive(Clone)]
pub struct SupabaseClient {
	pub url: String,
	pub anon_key: String,
	pub client: reqwest::Client,
}

impl SupabaseClient {
	pub fn new(url: String, anon_key: String) -> Self {
		let clean_url = url.trim_end_matches('/').to_string();
		println!("\x1b[32m[Supabase Client]\x1b[0m Initialized with API URL: {}", clean_url);
		Self {
			url: clean_url,
			anon_key,
			client: reqwest::Client::new(),
		}
	}

	pub fn get_headers(&self, user_token: Option<&str>) -> reqwest::header::HeaderMap {
		let mut headers = reqwest::header::HeaderMap::new();
		
		if let Ok(val) = reqwest::header::HeaderValue::from_str(&self.anon_key) {
			headers.insert("apikey", val);
		}
		
		let auth_token = user_token.unwrap_or(&self.anon_key);
		if let Ok(val) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", auth_token)) {
			headers.insert("Authorization", val);
		}

		headers
	}
}
