---
name: madzhair-admin
description: Pengembang aplikasi kasir harian /admin berbasis Progressive Web App (PWA) yang dioptimalkan untuk operasi satu tangan di iOS dan Android.
---

# Skill: Divisi Admin & Cross-Platform PWA (`madzhair-admin`)

## 1. Tanggung Jawab Utama
- Membangun antarmuka kasir `/admin` yang cepat dioperasikan di sela-sela aktivitas mencukur pada layar ponsel **iOS (Safari)** dan **Android (Chrome)**.
- Mengonfigurasi kapabilitas **PWA** penuh tanpa ketergantungan pada App Store / Play Store.
- Menegakkan identitas visual **Soft-Editorial Minimalist (v1.4)** berpalet **Warm Alabaster (`#EFE8DD`)**, **Soft Ivory (`#F7F3EC`)**, **Deep Slate Charcoal (`#303841`)**, & **Burnt Terracotta (`#C25934`)** dengan tipografi `Plus Jakarta Sans` Sentence Case dan `Instrument Serif` (tanpa prefiks `01 //` maupun label `font-mono` ALL-CAPS).

## 2. Standar PWA Lintas Platform (Android & iOS) & Identitas Visual
1. **Web App Manifest (`public/manifest.json`):**
   - `name`: `"Madzhair Barber & Co — Admin"`, `short_name`: `"Madzhair"`, `start_url`: `"/admin"`, `display`: `"standalone"`, `background_color`: `"#EFE8DD"`, `theme_color`: `"#EFE8DD"`.
   - Ikon `/icons/icon-192.png`, `/icons/icon-512.png`, dan `/icons/icon-maskable-512.png`.
2. **Konfigurasi iOS Safari & Banner Instalasi (`src/components/admin/InstallPwaBanner.tsx`):**
   - Banner 1-baris Soft-Editorial menggunakan Sentence Case `Plus Jakarta Sans`.
3. **Palet Warna & Geometri Soft-Editorial Admin:**
   - Kanvas `bg-alabaster` (`#EFE8DD`), kartu & dock `bg-surface` (`#F7F3EC`), sub-surface `bg-surface-elevated` (`#E6DDD0`), hairline `#DCD4C6`, teks `text-ink` (`#303841`), sekunder `text-muted` (`#5C646D`), aksen `bg-terracotta text-surface` (`#C25934`), semantik `emerald-live` (`#2E6F56`) & `crimson-alert` (`#B83B3B`).
   - `JetBrains Mono` (`tabular-nums`) **hanya** digunakan untuk angka jam, tanggal angka, harga, statistik angka, dan kode tiket `MDZ-XXXX`.

## 3. Autentikasi & Route API Terproteksi
1. **Halaman Login (`/admin/login` — `src/app/admin/login/page.tsx` & `src/components/admin/AdminLoginForm.tsx`):**
   - Autentikasi Supabase Auth (`signInWithPassword`), tipografi Sentence Case bersih, input `text-base` (`>= 16px`), touch target `min-h-[44px]`, `min-h-[100dvh]`, dan `pt-safe pb-safe`.
2. **Route API Admin (Zero-Trust Server Verification):**
   - `POST /api/admin/walkin` (`create_booking_safe(..., p_customer_name: 'Walk-in', p_source: 'WALKIN')`).
   - `PATCH /api/admin/bookings/[id]` (`complete`, `cancel`, `reschedule`).

## 4. Spesifikasi UX Kasir Satu Tangan (`/admin` — `src/app/admin/page.tsx` & `src/components/admin/AdminCashierDashboard.tsx`)
1. **Visual Time-Block Timeline Minimalis Real-Time (Tab Kasir & Antrean):**
   - Berlangganan `supabase_realtime` (`bookings`, `store_settings`, `weekly_schedules`, `closed_dates`).
   - Strip pemilih hari horizontal (`snap-x`, `no-scrollbar`, `rounded-xl`) diikuti statistik harian ringkas (`Menunggu`, `Selesai`, `Batal`).
   - Skala tinggi per 60 menit adalah **`HOUR_ROW_HEIGHT_PX = 88`** dengan **Live Current-Time Line** (`#C25934`) berujung lingkaran `rounded-full`.
   - Setiap blok booking aktif (`BOOKED`) di timeline berupa elemen interaktif bersih (`<button type="button">`) dalam tipografi Sentence Case yang **HANYA menampilkan**: **Jam (`HH:MM–HH:MM`)**, **Nama Pelanggan**, **Layanan** (plus indikator `2 blok · 120 menit` untuk 2 jam), dan **Tag `Online` / `Walk-in`** beserta petunjuk `Detail`.
   - Booking berstatus **`COMPLETED`** dipisahkan ke kartu ringkas **Riwayat selesai** (slot kursi pada jam tersebut langsung kembali kosong dan dapat diisi booking baru tanpa tumpang tindih), sedangkan **`CANCELLED`** dipisahkan ke **Riwayat dibatalkan** di bawahnya; item di kedua riwayat tetap dapat di-tap untuk membuka **Bottom Sheet Detail**.
2. **Bottom Sheet / Modal Detail Blok Jadwal:**
   - State `selectedBookingId: string | null` dengan `selectedBooking` sinkron *live* dengan Realtime.
   - Menampilkan badge `Online`/`Walk-in`, status (`Terjadwal`/`Selesai`/`Dibatalkan`), kode tiket `MDZ-XXXX`, aksi `BOOKED` (**Tandai Selesai**, **Geser Jadwal**, **Batalkan Booking**), serta tautan **Lihat Smart Ticket**.
3. **Bar Aksi Instan (Thumb Zone Sticky Bottom):**
   - Dock `fixed inset-x-0 bottom-0 rounded-t-2xl border-t border-hairline bg-surface/95 pb-safe backdrop-blur-md` dengan tombol `+ Walk-in Haircut` dan `+ Walk-in Chemicals` (`<= 2 tap`).
4. **Manajemen Toko & Konten (Tab Operasional & CMS):**
   - Saklar Tutup Darurat, editor jam operasional mingguan, tanggal libur khusus, tarif & varian layanan, dan pengelola galeri (link TikTok/IG + upload WebP client-side).

## 5. Protokol Laporan & Pembaruan Skill
- Setiap perubahan alur interaksi admin, timeline kasir, atau konfigurasi manifest PWA wajib diperbarui di `SKILL.md` ini dan disetor ke `madzhair-coordinator`.
