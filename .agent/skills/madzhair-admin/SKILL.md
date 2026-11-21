---
name: madzhair-admin
description: Pengembang aplikasi kasir harian /admin berbasis Progressive Web App (PWA) yang dioptimalkan untuk operasi satu tangan di iOS dan Android.
---

# Skill: Divisi Admin & Cross-Platform PWA (`madzhair-admin`)

## 1. Tanggung Jawab Utama
- Membangun antarmuka kasir `/admin` yang cepat dioperasikan di sela-sela aktivitas mencukur pada layar ponsel **iOS (Safari)** dan **Android (Chrome)**.
- Mengonfigurasi kapabilitas **PWA** penuh tanpa ketergantungan pada App Store / Play Store.
- Menegakkan identitas visual **Soft-Editorial Minimalist (v1.8)** berpalet **Warm Alabaster (`#EFE8DD`)**, **Soft Ivory (`#F7F3EC`)**, **Deep Slate Charcoal (`#303841`)**, & **Burnt Terracotta (`#C25934`)** dengan **100% tipografi Google Font `Poppins` (`tabular-nums`)** tanpa `font-mono`, tanpa `font-serif`, tanpa titik bulat dekoratif, dan tanpa warna hijau di area `/admin`.

## 2. Standar PWA Lintas Platform (Android & iOS) & Identitas Visual
1. **Web App Manifest (`public/manifest.json`):**
   - `name`: `"Madzhair Barber & Co — Admin"`, `short_name`: `"Madzhair"`, `start_url`: `"/admin"`, `display`: `"standalone"`, `background_color`: `"#EFE8DD"`, `theme_color`: `"#EFE8DD"`.
   - Ikon `/icons/icon-192.png`, `/icons/icon-512.png`, dan `/icons/icon-maskable-512.png`.
2. **Konfigurasi iOS Safari & Banner Instalasi (`src/components/admin/InstallPwaBanner.tsx`):**
   - Banner 1-baris Soft-Editorial menggunakan Sentence Case `Poppins` (`font-sans`).
3. **Palet Warna & Geometri Soft-Editorial Admin (v1.8):**
   - Kanvas `bg-alabaster` (`#EFE8DD`), kartu & dock `bg-surface` (`#F7F3EC`), sub-surface `bg-surface-elevated` (`#E6DDD0`), hairline `#DCD4C6`, teks `text-ink` (`#303841`), sekunder `text-muted` (`#5C646D`), aksen `bg-terracotta text-surface` (`#C25934`), dan peringatan pembatalan/tutup darurat `crimson-alert` (`#B83B3B`).
   - **Dilarang:** `font-mono`, `font-serif`, titik bulat (`●` / `h-2 w-2 rounded-full`) di depan judul/status, serta warna hijau `emerald-live` pada angka/badge/tombol `Selesai` di `/admin`. Gunakan `#303841` (`ink`) dan `#C25934` (`terracotta`) secara seragam.

## 3. Autentikasi & Route API Terproteksi
1. **Halaman Login (`/admin/login` — `src/app/admin/login/page.tsx` & `src/components/admin/AdminLoginForm.tsx`):**
   - Autentikasi Supabase Auth (`signInWithPassword`), 100% `Poppins` Sentence Case, ikon `AlertTriangle` untuk pesan galat (tanpa titik bulat), input `text-base` (`>= 16px`), touch target `min-h-[44px]`, `min-h-[100dvh]`, dan `pt-safe pb-safe`.
2. **Route API Admin (Zero-Trust Server Verification):**
   - `POST /api/admin/walkin` (`create_booking_safe(..., p_customer_name: 'Walk-in', p_source: 'WALKIN')`).
   - `PATCH /api/admin/bookings/[id]` (`complete`, `cancel`, `reschedule`).

## 4. Spesifikasi UX Kasir Satu Tangan (`/admin` — `src/app/admin/page.tsx` & `src/components/admin/AdminCashierDashboard.tsx`)
1. **Header 1 Baris Ringkas:**
   - Kiri: Logo `Madzhair.co` (tanpa teks email admin).
   - Kanan: `LiveStatusTag` berikon kalender (`Sedang buka` / `Booking tersedia` / `Tutup hari ini`), tombol Refresh, dan tombol Keluar. Sakelar Tutup Darurat dipindahkan ke Tab `Operasional & CMS`.
2. **Visual Time-Block Timeline Minimalis Real-Time (Tab `Kasir & Antrean`):**
   - Berlangganan `supabase_realtime` (`bookings`, `store_settings`, `weekly_schedules`, `closed_dates`).
   - Indikator ringkas 1 baris **`Menunggu · Selesai · Batal`** diletakkan **di atas** strip pemilih hari horizontal (`snap-x`, `no-scrollbar`, `rounded-xl`).
   - Skala tinggi per 60 menit adalah **`HOUR_ROW_HEIGHT_PX = 88`** dengan **Live Current-Time Line** (`#C25934`).
   - Setiap blok booking aktif (`BOOKED`) di timeline berupa elemen interaktif bersih (`<button type="button">`) dalam tipografi `Poppins` (`tabular-nums`) yang menampilkan **Jam (`HH:MM–HH:MM`)**, **Nama Pelanggan**, **Layanan** (`2 blok · 120 menit` untuk 2 jam), dan **Tag `Online` / `Walk-in`** tanpa titik bulat.
   - Booking **`COMPLETED`** dipisahkan ke kartu ringkas **Riwayat selesai** (slot kursi langsung bebas kembali) dan **`CANCELLED`** ke **Riwayat dibatalkan** di bawahnya; keduanya tetap dapat di-tap untuk membuka **Bottom Sheet Detail**.
3. **Bottom Sheet / Modal Detail Blok Jadwal:**
   - State `selectedBookingId: string | null` sinkron *live* dengan Realtime.
   - Tombol aksi lega (`min-h-[48px]`): **Tandai Selesai** (`bg-ink`), **Geser Jadwal**, **Batalkan**, serta tautan **Buka Smart Ticket**.
4. **Bar Aksi Instan (Thumb Zone Sticky Bottom):**
   - Dock `fixed inset-x-0 bottom-0 rounded-t-2xl border-t border-hairline bg-surface/95 pb-safe backdrop-blur-md` dengan tombol `+ Walk-in Haircut` dan `+ Walk-in Chemicals` (`<= 2 tap`).
5. **Manajemen Toko & Konten (Tab `Operasional & CMS`):**
   - Urutan dari atas: **Status Studio & Sakelar Tutup Darurat**, **Jam Operasional Mingguan**, **Tanggal Libur Khusus**, **Tarif & Varian Layanan**, dan **Galeri & Reels**.
   - **Tarif & Varian Layanan:** Input manual `Teks harga tampil`, `Minimal (Rp)`, `Maksimal (Rp)`, dan teks pendek varian (`30k`) dihapus. Setiap baris varian berupa 1 baris 3 elemen (`Nama Varian` `flex-1`, `Harga (Rp)` `w-36` `inputMode="numeric"` dengan titik ribuan otomatis tanpa spinner, dan tombol hapus `44x44px`). Preview baca-saja `Tampil di halaman depan: ...` serta `price_min`, `price_max`, `price_display`, dan `display` varian dikalkulasi otomatis sebelum simpan.
   - Form video **khusus Instagram Reels** (`Tambah Link Instagram Reels`, `instagram.com/reel/...`, 0 referensi TikTok).
   - Form **Upload Foto** (kompresi WebP otomatis tetap aktif) & **Tambah Link Instagram Reels** disederhanakan menjadi **Judul** + **File/Link** saja (tanpa input keterangan/caption).
   - Daftar media aktif berupa kartu 1 baris ringkas: thumbnail kecil kiri (`h-12 w-12`), judul + tipe (`Foto` / `Instagram Reels`) tengah tanpa menampilkan path mentah `/images/...` atau caption lama, serta tombol `Tampil`/`Sembunyi` dan hapus di kanan.

## 5. Protokol Laporan & Pembaruan Skill
- Setiap perubahan alur interaksi admin, timeline kasir, atau konfigurasi manifest PWA wajib diperbarui di `SKILL.md` ini dan disetor ke `madzhair-coordinator`.
