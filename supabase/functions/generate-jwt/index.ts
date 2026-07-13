// ====================================================================
// RETAILHUB — JWT Generator Edge Function
// ====================================================================
// Validates user credentials against the `users` table and returns a
// properly signed JWT that Supabase RLS policies will accept.
//
// Used by the browser/web mode of RetailHub where there is no Rust
// backend available to sign JWTs.
//
// Deploy: supabase functions deploy generate-jwt --no-verify-jwt
// ====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username dan password diperlukan" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // ── Query users table (RLS allows SELECT for all) ───────────────
    const { data: users, error } = await supabase
      .from("users")
      .select("id, username, password, fullname, role, phone, shift, toko_id")
      .ilike("username", username.trim().toLowerCase());

    if (error) throw error;

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ error: "Pengguna tidak ditemukan" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const user = users[0];

    // ── Verify password ─────────────────────────────────────────────
    if (user.password !== password) {
      return new Response(
        JSON.stringify({ error: "Password salah" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // ── Fetch toko name ─────────────────────────────────────────────
    let tokoName = "";
    if (user.toko_id) {
      const { data: tokoData } = await supabase
        .from("toko")
        .select("name")
        .eq("id", user.toko_id)
        .single();
      if (tokoData) {
        tokoName = tokoData.name;
      }
    }

    // ── Sign JWT with Supabase's JWT secret ─────────────────────────
    // Same claims structure as the Rust backend (jwt.rs)
    const now = Math.floor(Date.now() / 1000);
    const secretBytes = new TextEncoder().encode(SUPABASE_JWT_SECRET);

    const token = await new jose.SignJWT({
      sub: user.id,
      role: "authenticated",
      user_role: user.role,
      username: user.username,
      fullname: user.fullname,
      toko_id: user.toko_id || "",
      toko_name: tokoName,
      iat: now,
      exp: now + 7 * 24 * 60 * 60, // 7 days
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(secretBytes);

    // ── Return token + user data (includes toko_id, toko_name) ──────
    return new Response(
      JSON.stringify({
        token,
        user: {
          id: user.id,
          username: user.username,
          fullname: user.fullname,
          role: user.role,
          phone: user.phone,
          shift: user.shift,
          toko_id: user.toko_id || "",
          toko_name: tokoName,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    console.error("[generate-jwt] Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
