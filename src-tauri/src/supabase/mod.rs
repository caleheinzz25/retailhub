pub mod client;
pub mod db;
pub mod auth;
pub mod jwt;

// Re-export core items for lib.rs
pub use client::SupabaseClient;
