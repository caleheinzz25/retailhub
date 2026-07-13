# RetailHub

> **Sistem Kasir & Manajemen Gudang Sembako Desktop**

RetailHub adalah aplikasi desktop kasir (Point of Sales) dan manajemen inventaris toko sembako modern. Dibuat menggunakan kombinasi teknologi berkinerja tinggi: **Tauri (Rust)** untuk backend biner sistem yang aman, **SolidJS** untuk performa UI antarmuka kasir yang sangat responsif, dan **Supabase (PostgreSQL)** untuk penyimpanan database awan terdistribusi.

---

## Fitur Utama

1. **POS Kasir (Outbound)**: Pencatatan belanja cepat, penghitungan pajak & kembalian otomatis, serta simulasi laser scanner barcode.
2. **Mutasi Stok Otomatis**: Integrasi Trigger PostgreSQL yang mengurangi jumlah stok barang di rak gudang secara real-time setiap kali transaksi penjualan berhasil disimpan.
3. **Manajemen Inventaris**: Pengelolaan stok barang dagang dengan kontrol penataan rak gudang, batas minimal stok (*critical warning*), serta tombol mutasi cepat (+1 / -1 Pcs) dan hapus produk.
4. **Otentikasi Staf & Pembatasan Peran (RBAC)**: Login staf kasir dan pemilik toko. Akses halaman laporan omset (`/reports`) dan kelola karyawan (`/users`) dikunci secara ketat dan didelegasikan hanya untuk level admin/owner.
5. **Keamanan Sesi JWT (7 Hari)**: Sesi login kasir dienkripsi menggunakan JSON Web Token (JWT) HMAC-SHA256 yang ditandatangani di sisi Rust backend, memiliki masa aktif tepat 7 hari, dan diverifikasi secara kriptografis pada setiap aplikasi dimulai.
6. **Pencatatan Logger SQL Real-time**: Logging berwarna secara detail di terminal untuk memantau status query data (SELECT, INSERT, UPDATE, DELETE) serta koneksi API Supabase.
7. **Dukungan Mobile Android & Barcode Scanner**: Integrasi native dengan `@tauri-apps/plugin-barcode-scanner` menggunakan kamera HP asli di Android, didukung dengan pemisahan kapabilitas keamanan khusus mobile (`capabilities/mobile.json`).
8. **Compile-time Credentials Embedding**: Penanaman otomatis kredensial Supabase `.env` secara aman ke dalam biner Rust saat kompilasi target mobile, sehingga aplikasi Android dapat terhubung langsung ke database awan tanpa memerlukan file `.env` eksternal di perangkat.

---

## Persyaratan Sistem

Sebelum menjalankan aplikasi, pastikan sistem Anda telah terpasang:

* [Bun](https://bun.sh/) (Rekomendasi Manajer Paket)
* [Rust &amp; Cargo Toolchain](https://www.rust-lang.org/)
* Dependency Tauri untuk OS Anda (Lihat Panduan Instalasi [Tauri](https://tauri.app/start/prerequisites/))

---

## Panduan Memulai

### 1. Migrasi Database Supabase

Aplikasi ini berjalan di atas database PostgreSQL Supabase.

1. Buat proyek baru di [Dashboard Supabase](https://supabase.com/).
2. Salin seluruh isi berkas **[`supabase/schema.sql`](supabase/schema.sql)**.
3. Buka **SQL Editor** pada dashboard Supabase proyek Anda, tempelkan skrip SQL tersebut, lalu klik **Run**.
4. Skrip ini akan membuat tabel-tabel (`users`, `barang`, `transaksi`, `detail_transaksi`), mengaktifkan RLS dan keamanan lanjutan untuk production, memasang trigger fungsi pengurang stok otomatis, serta meregistrasi data pengguna utama.

### 2. Konfigurasi Variabel Lingkungan (`.env`)

Salin berkas template `.env.example` menjadi `.env` di direktori utama:

```bash
cp .env.example .env
```

Buka berkas `.env` dan lengkapi kredensial proyek Supabase Anda beserta kunci JWT:

```env
SUPABASE_URL="https://id-proyek-anda.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsIn..."
JWT_SECRET="kunci-rahasia-jwt-heksadesimal-anda"
```

*(Anda dapat menghasilkan kunci JWT_SECRET aman 256-bit di terminal menggunakan perintah: `openssl rand -hex 32`)*

### 3. Instalasi Dependensi & Menjalankan Mode Dev

Instal paket JavaScript/Node:

```bash
bun install
```

Jalankan aplikasi dalam mode pengembangan:

#### A. Mode Desktop (Tauri Window)

```bash
bun run tauri dev
```

*(Menjalankan webview native dengan integrasi logger Rust di terminal)*

#### B. Mode Web (Browser Biasa)

```bash
bun run dev
```

*(Membuka port 1420 di browser biasa. Secara otomatis melakukan bypass Tauri IPC dan menembak langsung ke Supabase REST API menggunakan `fetch`)*

#### C. Mode Android (Emulator / HP Fisik)

```bash
# Set JAVA_HOME ke JDK 21 yang kompatibel dengan Gradle 8.14
JAVA_HOME=/usr/lib/jvm/java-21-temurin bun tauri android dev
```

*(Menjalankan aplikasi di emulator atau perangkat Android fisik yang terhubung via ADB, lengkap dengan port forwarding otomatis dan hot-reload)*

---

## Kredensial Login Utama

Setelah menjalankan `schema.sql`, database hanya akan memuat satu akun Administrator yang bersih untuk standar produksi. Silakan gunakan kredensial berikut untuk masuk pertama kali:

| Username                  | Password          | Hak Akses (Role)                                     |
| :------------------------ | :---------------- | :--------------------------------------------------- |
| **`louiscalvin`** | `fireflies2244` | Administrator (Akses penuh seluruh sistem & laporan) |

---

## Kompilasi Aplikasi (Production Build)

### 1. Kompilasi untuk Linux

Untuk membuat paket aplikasi Linux (`.deb` / `.tar.gz` / AppImage):

```bash
# Jalankan kompilasi pada mesin host Linux Anda
bun run tauri:build
```

Hasil paket installer akan tersimpan di direktori `src-tauri/target/release/bundle/deb/`.

### 2. Kompilasi untuk Windows

Untuk menghasilkan file installer Windows (`.exe` / `.msi`):

* **Cara Paling Direkomendasikan**: Jalankan kompilasi secara langsung di mesin host Windows:
  ```bash
  # Buka Windows PowerShell/CMD di direktori proyek
  bun run tauri:build
  ```
* **Lintas Kompilasi (Cross-Compile dari Linux)**:
  Anda juga bisa melakukan lintas kompilasi dari Linux ke Windows menggunakan target Cargo Rust `x86_64-pc-windows-msvc` dengan mengaktifkan toolchain `lld-link` dan dependensi MSVC SDK. Namun, cara ini memerlukan konfigurasi linker eksternal yang kompleks. Disarankan untuk menggunakan GitHub Actions untuk otomatisasi build lintas-platform.

### 3. Kompilasi untuk Android (Signed Release Build)

Untuk menghasilkan file APK dan AAB (Android App Bundle) yang telah ditandatangani (*signed*):

```bash
# Jalankan build dengan menyertakan kredensial keystore rilis
ANDROID_KEYSTORE_PATH="path/to/retailhub.keystore" \
ANDROID_KEY_ALIAS="retailhub" \
ANDROID_KEY_PASSWORD="password_anda" \
ANDROID_STORE_PASSWORD="password_anda" \
JAVA_HOME="/usr/lib/jvm/java-21-temurin" \
bun tauri android build
```

Hasil kompilasi akan tersimpan di:

* **APK**: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
* **AAB**: `src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

Hasil build web statis biasa (tanpa pembungkus desktop) dapat di-compile dengan:

```bash
bun run build
```

Folder hasil kompilasi web statis (`dist/`) siap dideploy langsung ke Vercel, Netlify, atau Firebase Hosting.

---

## Linter & Formatting

Proyek ini menggunakan **Biome** untuk analisis statis kode dan formatting yang super cepat:

```bash
# Menjalankan linter dan format otomatis
bun x biome check --write src/
```
