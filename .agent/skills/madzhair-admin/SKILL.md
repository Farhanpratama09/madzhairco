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
1. **Navbar `/admin` Steril & Bar Status Ringkas (Max 2 Baris Mobile):**
   - **Hapus total link `Beranda` (`/`):** Kiri navbar menampilkan tombol identitas **`Madzhair.co · Kasir`** yang saat di-tap mereset ke tab `Jadwal & Kasir` pada tanggal hari ini (tetap di dalam `/admin`); kanan navbar **HANYA** tombol **`Keluar`**.
   - Link `← Kembali ke Halaman Booking` khusus dipertahankan di `/admin/login`.
   - Tepat di bawah navbar tampil 1 baris status operasional hari ini (berikon kalender + badge state-machine `Asia/Pontianak` + tombol `Refresh`).
2. **State-Machine 5 Kondisi Status Operasional Hari Ini (`getAdminTodayOperationalState` di `src/lib/slots.ts`):**
   - `EARLY_CLOSED` (`close_from_time !== null`): badge `Ditutup Mendadak mulai {cutoff} WIB` + hanya tombol `Buka Kembali Studio`.
   - `CLOSED_ALL_DAY` (`is_force_closed` / `!is_open` / `close_from_time === null`): badge `Studio Tutup Hari Ini` + `Buka Kembali Studio` (bila override/force-close).
   - `ENDED_TODAY` (`nowWib >= effective_close_time`): badge netral `Operasional Hari Ini Selesai (Tutup {close} WIB)`, sembunyikan tombol `Tutup Mulai Jam Sekarang` & `Tutup Seharian Ini`.
   - `BEFORE_OPEN` (`nowWib < open_time`): badge `Belum Buka · Buka {open} WIB`, hanya tampilkan `Tutup Seharian Ini`.
   - `OPEN_NOW` (`open_time <= nowWib < effective_close_time`): badge `Sedang Buka · Tutup {close} WIB` + tombol `Tutup Mulai Jam Sekarang` & `Tutup Seharian Ini`.
3. **Tab `Jadwal & Kasir` (Fokus Penuh Antrean Harian — Zero CMS Leak):**
   - Menjalankan `auto_complete_overdue_bookings()` berurutan sebelum memuat booking di SSR & secara otomatis saat `nowTick` mendeteksi sesi lewat `end_time + 15 menit` (`Asia/Pontianak`).
   - Date scrubber horizontal (`snap-x`) + ringkasan 1 baris `Menunggu · Selesai · Batal` + legenda `Online`/`Walk-in`.
   - Visual Time-Block Timeline ringkas (`76px/jam`), blok **`Istirahat`** non-interaktif di `z-[5]` di bawah blok `BOOKED` (`z-10`), serta `Riwayat selesai` & `Riwayat dibatalkan` dalam accordion collapsible ringkas.
   - **1-Tap WA Notifikasi Perubahan:** Setelah admin berhasil **Geser Jadwal** atau **Batalkan** pada jadwal dengan `booking_contacts.phone`, tampil banner & tombol **`Kirim Info ke WA Pelanggan`** (`https://wa.me/{phone}?text=...`) di Tab 1 dan Bottom Sheet Detail.
   - **Bottom Sheet Detail & Bar Walk-in Sticky Bottom:** Tombol aksi lega (`min-h-[48px]`): **Tandai Selesai**, **Geser Jadwal**, **Batalkan**, **Kirim Info ke WA Pelanggan** (kondisional), dan **Buka Smart Ticket**.
4. **Tab `Operasional & CMS` (3 Sub-Tab Pill + Collapsible Accordion Anti-Scroll Panjang):**
   - Sub-tab **`Operasional`**: kartu **Status Studio Hari Ini** (state-machine 5 kondisi + daftar peringatan booking aktif ber-tombol `Info WA`) + 3 accordion ringkas (`Jam Istirahat Harian`, `Jadwal Operasional Mingguan`, `Tanggal Libur Khusus`) dengan ringkasan 1 baris pada header masing-masing.
   - Sub-tab **`Layanan & Galeri`**: accordion per layanan (form tarif 3 elemen 1 baris dengan auto-kalkulasi range) + accordion `Galeri Foto & Instagram Reels` (form padat & daftar media `p-3`).
   - Sub-tab **`Notifikasi & QR`**:
     - `PushNotificationCard.tsx`: accordion ringkas berstatus 1 baris (`Aktif` / `Belum aktif` / `iOS Home Screen`) + `Aktifkan Notifikasi HP` & `Tes Kirim Notif`.
     - `StudioQrCodeCard.tsx`: baris ringkas tanpa preview poster besar terbuka di halaman utama CMS; tombol **`Preview & Unduh QR PNG`** membuka modal pratinjau `<canvas>` QR + **`Download PNG Siap Cetak`** + **`Salin Link Booking`** + **`Buka Halaman Pelanggan`** (tab baru ke `/#reservasi`).

## 5. Protokol Laporan & Pembaruan Skill
- Setiap perubahan alur interaksi admin, timeline kasir, atau konfigurasi PWA wajib diperbarui di `SKILL.md` ini dan disetor ke `madzhair-coordinator`.
