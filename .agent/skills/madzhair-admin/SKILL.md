---
name: madzhair-admin
description: Pengembang aplikasi kasir harian /admin berbasis Progressive Web App (PWA) yang dioptimalkan untuk operasi satu tangan di iOS dan Android.
---

# Skill: Divisi Admin & Cross-Platform PWA (`madzhair-admin`)

## 1. Tanggung Jawab Utama
- Membangun antarmuka kasir `/admin` yang cepat dioperasikan di sela-sela aktivitas mencukur pada layar ponsel **iOS (Safari)** dan **Android (Chrome)**.
- Mengonfigurasi kapabilitas **PWA** penuh tanpa ketergantungan pada App Store / Play Store.
- Menegakkan identitas visual **Charcoal Noir Monochrome System (v2.0)** berpalet `#F7F7F7`, `#FFFFFF`, `#E0E0E0` (Cloud Veil), `#B3B3B3` (Moonlit Silver), `#848484` (Urban Fog), `#565656` (Ironclad Grey), dan `#2B2B2B` (Charcoal Noir, hover `#1F1F1F`) dengan **100% tipografi Google Font `Poppins` (`tabular-nums`)** tanpa `font-mono`, tanpa `font-serif`, tanpa titik bulat dekoratif, dan tanpa warna hijau di area `/admin`.

## 2. Standar PWA Lintas Platform (Android & iOS) & Kompatibilitas Browser Lama
1. **Web App Manifest (`public/manifest.json`) & Service Worker (`public/sw.js`):**
   - `name`: `"Madzhair Barber & Co — Admin"`, `short_name`: `"Madzhair"`, `start_url`: `"/admin"`, `display`: `"standalone"`, `background_color`: `"#F7F7F7"`, `theme_color`: `"#2B2B2B"`.
   - `public/sw.js` menangani `push` dan `notificationclick` ke `/admin` tanpa meng-cache HTML/API dinamis (`/admin`, `/api/*`, `/tiket/*`), dan registrasi di client dibungkus guard `'serviceWorker' in navigator && 'PushManager' in window`.
   - Target transpilasi `browserslist` di `package.json`: `chrome >= 80`, `safari >= 13`, `ios >= 13`, `edge >= 80`, `firefox >= 78` tanpa API modern tanpa fallback.
2. **Konfigurasi iOS Safari & Banner Instalasi (`src/components/admin/InstallPwaBanner.tsx`):**
   - Android/Chrome: tombol install 1-tap `Install App` (`beforeinstallprompt`).
   - iOS Safari non-standalone: tombol **`Cara Pasang di iPhone`** yang membuka modal panduan visual 2 langkah (`Share` → `Add to Home Screen`).
3. **Palet Warna & Geometri Charcoal Noir Admin (v2.0):**
   - Kanvas `#F7F7F7`, kartu & dock `#FFFFFF`, sub-surface / blok `Istirahat` `#E0E0E0`, border `#B3B3B3`, teks utama & tombol utama `#2B2B2B` (hover `#1F1F1F`, teks `#FFFFFF`), sekunder `#565656`, bantuan `#848484`, destruktif `#9E2A2B`.
   - **Dilarang:** warna lama (`#EFE8DD`, `#F7F3EC`, `#C25934`, `#303841`), `font-mono`, `font-serif`, titik bulat dekoratif, serta warna hijau `emerald-live` di `/admin`.

## 3. Autentikasi & Route API Terproteksi
1. **Halaman Login (`/admin/login`):** Supabase Auth (`signInWithPassword`), mendukung login memakai **email** maupun **username** (username tanpa `@` dinormalisasi ke `@admin.madzhair.local`), 100% `Poppins`, `text-base`, `min-h-[44px]`, dengan link `← Kembali ke Halaman Booking`.
2. **Route API Admin (Zero-Trust Server Verification, Next.js 16 `await context.params`):**
   - `POST /api/admin/account` (verifikasi sesi admin + validasi `currentPassword` terlebih dahulu + validasi password baru minimal 8 karakter tanpa log password, memperbarui email/username & password secara langsung lewat `service_role` `supabase.auth.admin.updateUserById` dengan `email_confirm: true` dan `user_metadata.username`).
   - `POST /api/admin/walkin` (`create_booking_safe(..., p_source: 'WALKIN', p_customer_phone: null)`).
   - `PATCH /api/admin/bookings/[id]` (`complete`, `cancel`, `reschedule`, mengembalikan `customerPhone` dari `booking_contacts` khusus sesi admin).
   - `POST /api/admin/auto-complete` (memicu `auto_complete_overdue_bookings()`).
   - `POST/DELETE /api/admin/push/subscribe` & `POST /api/admin/push/test` (Web Push kasir).
   - `GET/POST /api/cron/break-reminder` (fail-closed `CRON_SECRET` `503`/`401`, jendela `[break_end - 15m, break_end + 5m]` zona waktu `Asia/Pontianak` + auto-cleanup H-1 `bookings`/`booking_contacts` & H-7 `closed_dates`).

## 4. Spesifikasi UX Kasir Satu Tangan (`/admin` — `src/app/admin/page.tsx` & `src/components/admin/AdminCashierDashboard.tsx`)
1. **Navbar `/admin` Steril & Bar Status Ringkas (Max 2 Baris Mobile):**
   - **Hapus total link `Beranda` (`/`):** Kiri navbar menampilkan tombol identitas ringkas **`Madzhair · Kasir`** yang saat di-tap mereset ke tab `Jadwal & Kasir` pada tanggal hari ini (tetap di dalam `/admin`); kanan navbar **HANYA** tombol **`Keluar`**.
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
   - Visual Time-Block Timeline ringkas (`76px/jam`): isi slot kosong pada jam yang tertutup rentang istirahat disembunyikan, dan blok **`Istirahat`** dirender solid opaque `#E0E0E0` (`z-[5]`) di bawah blok `BOOKED` (`z-10`) agar nol tabrakan teks.
   - **1-Tap WA Notifikasi Perubahan:** Seluruh pesan `wa.me` memakai nama brand **`Madzhair Barber & Co`** (tanpa `.co`) dengan link bersih tanpa simbol `#` (`${origin}/`) dan link e-tiket pada baris terakhir terpisah.
   - **Bottom Sheet Detail & Bar Walk-in Sticky Bottom:** Tombol aksi lega (`min-h-[48px]`): **Tandai Selesai**, **Geser Jadwal**, **Batalkan**, **Kirim Info ke WA Pelanggan** (kondisional), dan **Buka Smart Ticket**.
4. **Tab `Operasional & CMS` (3 Sub-Tab Pill + Collapsible Accordion Anti-Scroll Panjang & Aman `320px–430px`):**
   - Sub-tab **`Operasional`**: kartu **Status Studio Hari Ini** + 4 accordion ringkas:
     - `Jam Istirahat Harian` & `Jadwal Operasional Mingguan`: dropdown `<select>` jam interval 15 menit (`grid-cols-1 min-[380px]:grid-cols-2`, `w-full min-w-0 max-w-full box-border`) anti-tabrakan di Android Chrome `320px–360px`.
     - `Tanggal Libur Khusus`: label eksplisit `Pilih Tanggal Libur` & `Keterangan (Opsional)` dengan `w-full min-w-0 max-w-full box-border`.
     - `Akun & Keamanan Admin`: form ubah Email/Username Login, Password Lama (wajib konfirmasi), Password Baru (min. 8 karakter), dan Konfirmasi Password Baru yang terhubung ke `POST /api/admin/account`.
   - Sub-tab **`Layanan & Galeri`**: accordion per layanan (form tarif 3 elemen 1 baris) + accordion `Galeri Foto & Instagram Reels`.
   - Sub-tab **`Notifikasi & QR`**:
     - `PushNotificationCard.tsx`: accordion ringkas berstatus 1 baris + `Aktifkan Notifikasi HP` & `Tes Kirim Notif`.
     - `StudioQrCodeCard.tsx`: baris ringkas dengan modal **`Preview & Unduh QR PNG`** monokrom Charcoal Noir berjudul **`Madzhair Barber & Co`** dengan URL bersih langsung ke root domain (`/`, tanpa `#reservasi`) + **`Download PNG Siap Cetak`** + **`Salin Link Booking`** + **`Buka Halaman Pelanggan`** (tab baru).

## 5. Protokol Laporan & Pembaruan Skill
- Setiap perubahan alur interaksi admin, timeline kasir, atau konfigurasi PWA wajib diperbarui di `SKILL.md` ini dan diverifikasi pada lebar `320x740`, `360x844`, dan `390x844`.

