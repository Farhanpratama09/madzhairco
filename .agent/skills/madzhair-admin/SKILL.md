---
name: madzhair-admin
description: Pengembang aplikasi kasir harian /admin berbasis Progressive Web App (PWA) yang dioptimalkan untuk operasi satu tangan di iOS dan Android.
---

# Skill: Divisi Admin & Cross-Platform PWA (`madzhair-admin`)

## 1. Tanggung Jawab Utama
- Membangun antarmuka kasir `/admin` yang cepat dioperasikan di sela-sela aktivitas mencukur pada layar ponsel **iOS (Safari)** dan **Android (Chrome)**.
- Mengonfigurasi kapabilitas **PWA** penuh tanpa ketergantungan pada App Store / Play Store.

## 2. Standar PWA Lintas Platform (Android & iOS)
1. **Web App Manifest (`public/manifest.json`):**
   - `name`: `"Madzhair Barber & Co — Admin"`
   - `short_name`: `"Madzhair"`
   - `start_url`: `"/admin"`
   - `display`: `"standalone"`
   - `background_color`: `"#0B0B0C"`, `theme_color`: `"#0B0B0C"`
   - Menyediakan ikon `/icons/icon-192.png` (`192x192`, `any`), `/icons/icon-512.png` (`512x512`, `any`), dan `/icons/icon-maskable-512.png` (`512x512`, `maskable` untuk Android Adaptive Icons).
2. **Konfigurasi Khusus iOS Safari & Banner Instalasi (`src/components/admin/InstallPwaBanner.tsx`):**
   - Tag `apple-mobile-web-app-capable: yes`, `apple-mobile-web-app-status-bar-style: black-translucent`, dan `apple-touch-icon` ukuran `180x180px` terpasang di `src/app/layout.tsx`.
   - `InstallPwaBanner` mendeteksi mode standalone via `matchMedia('(display-mode: standalone)')` & `navigator.standalone` menggunakan `useSyncExternalStore`. Jika belum ter-install, menampilkan banner 1-baris editorial: instruksi `"Tap Share → Add to Home Screen"` di iOS Safari, atau tombol `"Install App"` (menangkap `beforeinstallprompt`) / panduan menu `⋮` di Android Chrome.

## 3. Autentikasi & Route API Terproteksi
1. **Halaman Login (`/admin/login` — `src/app/admin/login/page.tsx` & `src/components/admin/AdminLoginForm.tsx`):**
   - Autentikasi Supabase Auth (`signInWithPassword`) dengan input `text-base` (>= 16px anti-zoom Safari iOS), touch target `min-h-[44px]`, `min-h-[100dvh]`, dan `pt-safe pb-safe`.
   - Jika variabel environment Supabase belum dikonfigurasi, menampilkan panduan konfigurasi `.env.local` dan migrasi SQL secara aman (tanpa bypass login).
2. **Route API Admin (Zero-Trust Server Verification):**
   - `POST /api/admin/walkin` (`src/app/api/admin/walkin/route.ts`): Memverifikasi `supabase.auth.getUser()` di server (401 jika tidak valid), memvalidasi UUID `serviceId`, tanggal `YYYY-MM-DD`, dan jam `validateServiceTimeFormat`, lalu memanggil RPC `create_booking_safe(..., p_customer_name: 'Walk-in', p_source: 'WALKIN')`.
   - `PATCH /api/admin/bookings/[id]` (`src/app/api/admin/bookings/[id]/route.ts`): Memverifikasi `supabase.auth.getUser()` di server dan memproses aksi `complete` (`complete_booking_safe`), `cancel` (`cancel_booking_safe`), atau `reschedule` (`reschedule_booking_safe`).

## 4. Spesifikasi UX Kasir Satu Tangan (`/admin` — `src/app/admin/page.tsx` & `src/components/admin/AdminCashierDashboard.tsx`)
1. **Bar Aksi Instan (Thumb Zone Sticky Bottom):**
   - Tombol **`+ Walk-in Haircut`** (1 blok / 60 menit via `findWalkinTargetSlot`) dan **`+ Walk-in Chemicals`** (2 blok berurutan / 120 menit via `findWalkinTargetSlot`) berada di zona jempol bawah dengan konfirmasi tap ke-2 tanpa mengetik nama (`<= 2 tap`).
2. **Daftar Antrean Hari Ini Real-time:**
   - Berlangganan `supabase_realtime` (`bookings`, `store_settings`, `weekly_schedules`, `closed_dates`).
   - Menampilkan kartu jadwal terurut waktu dengan indikator tajam `ONLINE` vs `WALK-IN`, kode `MDZ-XXXX`, tautan `/tiket/[code]`, serta tombol aksi `min-h-[44px]`: **Selesai** (1 tap), **Geser** (2 tap memilih slot dari `calculateAvailableSlots(..., { ignoreLeadTime: true, excludeBookingId })`), dan **Batal** (2 tap konfirmasi).
3. **Manajemen Toko & Konten (CMS Ringan):**
   - Saklar **Buka / Tutup Darurat** (`is_force_closed`) di header dengan konfirmasi cepat 1 tap.
   - Editor jam operasional rutin (`weekly_schedules` 0..6), tambah/hapus tanggal libur (`closed_dates`), dan editor harga + varian `services`.
   - Pengelola Galeri (`gallery_items`): Form URL TikTok / Instagram Reels tervalidasi `validateSocialEmbedUrl` serta upload foto dengan **kompresi client-side ke WebP** (`HTMLCanvasElement.toBlob('image/webp', 0.84)`, max 1200px, batas `<= 3 MB`) sebelum diunggah ke Supabase Storage bucket `gallery`.

## 5. Protokol Laporan & Pembaruan Skill
- Setiap perubahan alur interaksi admin atau konfigurasi manifest PWA wajib diperbarui di `SKILL.md` ini dan disetor ke `madzhair-coordinator`.
