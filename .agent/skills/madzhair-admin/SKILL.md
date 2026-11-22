---
name: madzhair-admin
description: Pengembang aplikasi kasir harian /admin berbasis Progressive Web App (PWA) yang dioptimalkan untuk operasi satu tangan di iOS dan Android.
---

# Skill: Divisi Admin & Cross-Platform PWA (`madzhair-admin`)

## 1. Tanggung Jawab Utama
- Membangun antarmuka kasir `/admin` yang cepat dioperasikan di sela-sela aktivitas mencukur pada layar ponsel **iOS (Safari)** dan **Android (Chrome)**.
- Mengonfigurasi kapabilitas **PWA** penuh tanpa ketergantungan pada App Store / Play Store.
- Menegakkan identitas visual **Soft-Editorial Minimalist (v1.9)** berpalet **Warm Alabaster (`#EFE8DD`)**, **Soft Ivory (`#F7F3EC`)**, **Deep Slate Charcoal (`#303841`)**, & **Burnt Terracotta (`#C25934`)** dengan **100% tipografi Google Font `Poppins` (`tabular-nums`)** tanpa `font-mono`, tanpa `font-serif`, tanpa titik bulat dekoratif, dan tanpa warna hijau di area `/admin`.

## 2. Standar PWA Lintas Platform (Android & iOS) & Identitas Visual
1. **Web App Manifest (`public/manifest.json`) & Service Worker (`public/sw.js`):**
   - `name`: `"Madzhair Barber & Co — Admin"`, `short_name`: `"Madzhair"`, `start_url`: `"/admin"`, `display`: `"standalone"`, `background_color`: `"#EFE8DD"`, `theme_color`: `"#EFE8DD"`.
   - `public/sw.js` menangani `push` dan `notificationclick` ke `/admin` tanpa meng-cache HTML/API dinamis (`/admin`, `/api/*`, `/tiket/*`).
2. **Konfigurasi iOS Safari & Banner Instalasi (`src/components/admin/InstallPwaBanner.tsx`):**
   - Android/Chrome: tombol install 1-tap `Install App` (`beforeinstallprompt`).
   - iOS Safari non-standalone: tombol **`Cara Pasang di iPhone`** yang membuka modal panduan visual 2 langkah (`Share` → `Add to Home Screen`).
3. **Palet Warna & Geometri Soft-Editorial Admin (v1.9):**
   - Kanvas `bg-alabaster` (`#EFE8DD`), kartu & dock `bg-surface` (`#F7F3EC`), sub-surface `bg-surface-elevated` (`#E6DDD0`), hairline `#DCD4C6`, teks `text-ink` (`#303841`), sekunder `text-muted` (`#5C646D`), aksen `bg-terracotta text-surface` (`#C25934`), dan peringatan `crimson-alert` (`#B83B3B`).
   - **Dilarang:** `font-mono`, `font-serif`, titik bulat (`●` / `h-2 w-2 rounded-full`) di depan judul/status, serta warna hijau `emerald-live` di `/admin`.

## 3. Autentikasi & Route API Terproteksi
1. **Halaman Login (`/admin/login`):** Supabase Auth (`signInWithPassword`), 100% `Poppins`, `text-base`, `min-h-[44px]`.
2. **Route API Admin (Zero-Trust Server Verification, Next.js 16 `await context.params`):**
   - `POST /api/admin/walkin` (`create_booking_safe(..., p_source: 'WALKIN', p_customer_phone: null)`).
   - `PATCH /api/admin/bookings/[id]` (`complete`, `cancel`, `reschedule`, mengembalikan `customerPhone` dari `booking_contacts` khusus sesi admin).
   - `POST /api/admin/auto-complete` (memicu `auto_complete_overdue_bookings()`).
   - `POST/DELETE /api/admin/push/subscribe` & `POST /api/admin/push/test` (Web Push kasir).
   - `GET/POST /api/cron/break-reminder` (fail-closed `CRON_SECRET` `503`/`401`, jendela `[break_end - 15m, break_end + 5m]` zona waktu `Asia/Pontianak`).

## 4. Spesifikasi UX Kasir Satu Tangan (`/admin` — `src/app/admin/page.tsx` & `src/components/admin/AdminCashierDashboard.tsx`)
1. **Header 1 Baris Ringkas:** Logo `Madzhair.co` kiri; `LiveStatusTag` berikon kalender, Refresh, & Keluar kanan.
2. **Visual Time-Block Timeline Minimalis Real-Time (Tab `Kasir & Antrean`):**
   - Menjalankan `auto_complete_overdue_bookings()` berurutan sebelum memuat booking di SSR & secara otomatis saat `nowTick` mendeteksi sesi lewat `end_time + 15 menit` (`Asia/Pontianak`).
   - Indikator 1 baris `Menunggu · Selesai · Batal` di atas date scrubber horizontal (`snap-x`).
   - Blok **`Istirahat`** tampil non-interaktif di layer `z-[5]` di bawah blok booking `BOOKED` (`z-10`) agar jadwal lama tetap dapat di-tap & diproses.
   - **1-Tap WA Notifikasi Perubahan:** Setelah admin berhasil **Geser Jadwal** atau **Batalkan** pada jadwal dengan `booking_contacts.phone`, tampil banner & tombol **`Kirim Info ke WA Pelanggan`** (`https://wa.me/{phone}?text=...`) di Tab 1 dan Bottom Sheet Detail.
3. **Bottom Sheet Detail & Bar Walk-in Sticky Bottom:**
   - Tombol aksi lega (`min-h-[48px]`): **Tandai Selesai**, **Geser Jadwal**, **Batalkan**, **Kirim Info ke WA Pelanggan** (kondisional), dan **Buka Smart Ticket**.
4. **Manajemen Toko & Konten (Tab `Operasional & CMS`):**
   - **Status Studio Hari Ini (`Sungai Kunyit, Kalimantan Barat — WIB`):** 2 tombol tutup cepat khusus tanggal hari ini (`Tutup Mulai Jam Sekarang` via `closed_dates.close_from_time` & `Tutup Seharian Ini` via `close_from_time = NULL`) + `Buka Kembali Studio`, tanpa mengubah `weekly_schedules`, beserta daftar peringatan booking aktif hari ini dengan tombol `Info WA`.
   - **Jam Istirahat Harian:** Toggle `break_enabled`, input `break_start` (`17:15`) & `break_end` (`18:30`).
   - **Notifikasi HP Kasir (`PushNotificationCard.tsx`):** Guard `typeof Notification !== "undefined"` + deteksi iOS Home Screen, tombol `Aktifkan Notifikasi HP` & `Tes Kirim Notif`.
   - **QR Code Studio Siap Cetak (`StudioQrCodeCard.tsx`):** QR lokal via `<canvas>` menuju `${origin}/#reservasi` + `Download PNG Siap Cetak` berbingkai `Madzhair.co · Sungai Kunyit, Kalimantan Barat`.
   - **Tarif & Varian Layanan:** Form 3 elemen 1 baris (`Nama Varian`, `Harga (Rp)` bertitik ribuan otomatis, `Hapus`) dengan auto-kalkulasi `price_min`, `price_max`, `price_display`, & preview baca-saja.
   - **Galeri & Reels:** Khusus Instagram Reels & upload foto WebP (Judul + Link/File), kartu daftar media 1 baris ringkas.

## 5. Protokol Laporan & Pembaruan Skill
- Setiap perubahan alur interaksi admin, timeline kasir, atau konfigurasi PWA wajib diperbarui di `SKILL.md` ini dan disetor ke `madzhair-coordinator`.
