---
name: madzhair-admin
description: Pengembang aplikasi kasir harian /admin berbasis Progressive Web App (PWA) yang dioptimalkan untuk operasi satu tangan di iOS dan Android.
---

# Skill: Divisi Admin & Cross-Platform PWA (`madzhair-admin`)

## 1. Tanggung Jawab Utama
- Membangun antarmuka kasir `/admin` yang cepat dioperasikan di sela-sela aktivitas mencukur pada layar ponsel **iOS (Safari)** dan **Android (Chrome)**.
- Mengonfigurasi kapabilitas **PWA** penuh tanpa ketergantungan pada App Store / Play Store.
- Menegakkan identitas visual **Soft-Editorial Warm Alabaster (v1.3 — Mobile-Minimalist)** pada seluruh halaman admin (`/admin`, `/admin/login`, dan banner instalasi PWA).

## 2. Standar PWA Lintas Platform (Android & iOS) & Identitas Visual
1. **Web App Manifest (`public/manifest.json`):**
   - `name`: `"Madzhair Barber & Co — Admin"`
   - `short_name`: `"Madzhair"`
   - `start_url`: `"/admin"`
   - `display`: `"standalone"`
   - `background_color`: `"#EFE8DD"`, `theme_color`: `"#EFE8DD"` (Warm Alabaster).
   - Menyediakan ikon `/icons/icon-192.png` (`192x192`, `any`), `/icons/icon-512.png` (`512x512`, `any`), dan `/icons/icon-maskable-512.png` (`512x512`, `maskable` untuk Android Adaptive Icons).
2. **Konfigurasi Khusus iOS Safari & Banner Instalasi (`src/components/admin/InstallPwaBanner.tsx`):**
   - Tag `apple-mobile-web-app-capable: yes`, `apple-mobile-web-app-status-bar-style: default`, `viewport` `themeColor: "#EFE8DD"`, dan `apple-touch-icon` ukuran `180x180px` terpasang di `src/app/layout.tsx`.
   - `InstallPwaBanner` mendeteksi mode standalone via `matchMedia('(display-mode: standalone)')` & `navigator.standalone` menggunakan `useSyncExternalStore`. Jika belum ter-install, menampilkan banner 1-baris Soft-Editorial (`rounded-xl bg-surface border border-hairline` + aksen vertikal kiri `bg-terracotta`): instruksi `"Tap Share → Add to Home Screen"` di iOS Safari, atau tombol `"Install App"` (menangkap `beforeinstallprompt`) / panduan menu `⋮` di Android Chrome.
3. **Palet Warna & Geometri Soft-Editorial Admin:**
   - Kanvas `bg-alabaster` (`#EFE8DD`), kartu & dock `bg-surface` (`#F7F3EC`), sub-surface `bg-surface-elevated` (`#E6DDD0`), garis batas `border-hairline` (`#DCD4C6`), teks utama `text-ink` (`#303841`), sekunder `text-muted` (`#5C646D`), aksen utama `bg-terracotta text-surface` (`#C25934` / `#F7F3EC`), semantik `emerald-live` (`#2E6F56`) & `crimson-alert` (`#B83B3B`).
   - Dilarang `rounded-full` pill dekoratif. Gunakan `rounded-2xl` (kartu utama, panel ringkasan, container timeline, form CMS, dock bawah `rounded-t-2xl`, serta **Bottom Sheet Detail** `rounded-t-2xl sm:rounded-2xl`) dan `rounded-xl` (navigasi tab, date scrubber, blok timeline, input `>= 16px`, dan tombol aksi `min-h-[44px]` / `min-h-[48px]`).

## 3. Autentikasi & Route API Terproteksi
1. **Halaman Login (`/admin/login` — `src/app/admin/login/page.tsx` & `src/components/admin/AdminLoginForm.tsx`):**
   - Autentikasi Supabase Auth (`signInWithPassword`) dengan palet Warm Alabaster, kartu `rounded-2xl bg-surface`, tombol primary `bg-terracotta text-surface`, input `text-base` (>= 16px anti-zoom Safari iOS), touch target `min-h-[44px]`, `min-h-[100dvh]`, dan `pt-safe pb-safe`.
   - Jika variabel environment Supabase belum dikonfigurasi, menampilkan panduan konfigurasi `.env.local` dan migrasi SQL secara aman (tanpa bypass login).
2. **Route API Admin (Zero-Trust Server Verification):**
   - `POST /api/admin/walkin` (`src/app/api/admin/walkin/route.ts`): Memverifikasi `supabase.auth.getUser()` di server (401 jika tidak valid), memvalidasi UUID `serviceId`, tanggal `YYYY-MM-DD`, dan jam `validateServiceTimeFormat`, lalu memanggil RPC `create_booking_safe(..., p_customer_name: 'Walk-in', p_source: 'WALKIN')`.
   - `PATCH /api/admin/bookings/[id]` (`src/app/api/admin/bookings/[id]/route.ts`): Memverifikasi `supabase.auth.getUser()` di server dan memproses aksi `complete` (`complete_booking_safe`), `cancel` (`cancel_booking_safe`), atau `reschedule` (`reschedule_booking_safe`).

## 4. Spesifikasi UX Kasir Satu Tangan (`/admin` — `src/app/admin/page.tsx` & `src/components/admin/AdminCashierDashboard.tsx`)
1. **Visual Time-Block Timeline Minimalis Real-Time (Tab Kasir & Antrean):**
   - Berlangganan `supabase_realtime` (`bookings`, `store_settings`, `weekly_schedules`, `closed_dates`).
   - Strip pemilih hari horizontal (`snap-x`, `no-scrollbar`, `rounded-xl`) di atas diikuti statistik harian ringkas (`text-sm` / `font-mono tabular-nums`).
   - Rentang jam timeline hari terpilih dihitung dinamis dari `weekly_schedules` (diperluas otomatis jika ada jadwal aktif di luar jam rutin; menampilkan kartu status libur bila toko tutup tanpa jadwal aktif).
   - Skala tinggi per 60 menit adalah **`HOUR_ROW_HEIGHT_PX = 88`**, sehingga blok **Haircut (60 menit)** tampil ringkas (`~80px`) dan **Hair Chemicals (120 menit)** merentang proporsional **2 slot menyambung (`~168px`)**.
   - **Live Current-Time Line:** Saat `selectedDate === nowParts.dateStr` berada dalam rentang jam timeline, menampilkan garis horizontal **Burnt Terracotta (`#C25934`)** lengkap dengan badge waktu aktif `nowParts.timeStr` pada sumbu jam kiri secara presisi.
   - Slot jam kosong tampil lembut dengan kontainer garis putus (`border-dashed border-hairline bg-alabaster/50`) agar kapasitas kursi harian terbaca dalam sekali lirik.
   - Setiap blok booking (`BOOKED` / `COMPLETED`) di timeline berupa elemen interaktif bersih (`<button type="button">`) yang **HANYA menampilkan**: **Jam (`HH:MM–HH:MM`)**, **Nama Pelanggan**, **Layanan** (plus indikator `2 Blok · 120m` untuk 2 jam), dan **Tag `ONLINE` / `WALK-IN`** (plus badge `SELESAI` bila completed, atau petunjuk tap `Detail`). **Dilarang menaruh tombol aksi Selesai / Geser / Batal / Lihat Tiket di dalam kartu timeline.**
   - Booking berstatus **`CANCELLED`** dipisahkan dari timeline utama ke daftar ringkas **Riwayat Dibatalkan** di bagian bawah timeline; item riwayat juga dapat di-tap untuk membuka **Bottom Sheet Detail**.
2. **Bottom Sheet / Modal Detail Blok Jadwal:**
   - Menggunakan state `selectedBookingId: string | null` dengan `selectedBooking` diturunkan langsung dari array `bookings` agar selalu sinkron *live* dengan Realtime.
   - Saat blok jadwal di timeline (atau item Riwayat Dibatalkan) di-tap, membuka **Bottom Sheet / Modal Detail** (`fixed inset-0 z-50 flex items-end justify-center bg-ink/60 backdrop-blur-xs sm:items-center`, `rounded-t-2xl sm:rounded-2xl`, `pb-safe`) dengan:
     - **Header:** Badge `ONLINE`/`WALK-IN`, status (`BOOKED`/`COMPLETED`/`CANCELLED`), jam + layanan, dan tombol tutup `X` (`min-h-[44px] min-w-[44px]`).
     - **Detail:** Nama pelanggan (`text-lg font-display font-bold`), kode tiket `MDZ-XXXX`, durasi kursi (`60 Menit` / `120 Menit`), tanggal, dan sumber.
     - **Aksi `BOOKED` (`min-h-[48px] rounded-xl`):** **Tandai Selesai** (`complete`), **Geser Jadwal** (`reschedule` — menampilkan slot kosong dari `calculateAvailableSlots(..., { ignoreLeadTime: true, excludeBookingId })` langsung di dalam Bottom Sheet untuk alur 2-tap), dan **Batalkan Booking** (`cancel` — konfirmasi 2-tap di dalam Bottom Sheet).
     - **Lihat Smart Ticket:** Tautan `<Link href="/tiket/[code]">` (`min-h-[48px] rounded-xl`) selalu tersedia untuk seluruh status.
3. **Bar Aksi Instan (Thumb Zone Sticky Bottom):**
   - Dock `fixed inset-x-0 bottom-0 rounded-t-2xl border-t border-hairline bg-surface/95 pb-safe backdrop-blur-md`.
   - Tombol **`+ Walk-in Haircut`** (`bg-terracotta text-surface rounded-xl min-h-[52px]`, 1 blok / 60 menit via `findWalkinTargetSlot`) dan **`+ Walk-in Chemicals`** (`bg-ink text-surface rounded-xl min-h-[52px]`, 2 blok berurutan / 120 menit via `findWalkinTargetSlot`) dengan konfirmasi tap ke-2 tanpa mengetik nama (`<= 2 tap`).
4. **Manajemen Toko & Konten (Tab Operasional & CMS Ringan):**
   - Saklar **Buka / Tutup Darurat** (`is_force_closed`) di header dengan konfirmasi cepat 1 tap.
   - Editor jam operasional rutin (`weekly_schedules` 0..6), tambah/hapus tanggal libur (`closed_dates`), dan editor harga + varian `services` (`rounded-2xl` / `rounded-xl`, responsif di `360px+`).
   - Pengelola Galeri (`gallery_items`): Form URL TikTok / Instagram Reels tervalidasi `validateSocialEmbedUrl` serta upload foto dengan **kompresi client-side ke WebP** (`HTMLCanvasElement.toBlob('image/webp', 0.84)`, max 1200px, batas `<= 3 MB`) sebelum diunggah ke Supabase Storage bucket `gallery`.

## 5. Protokol Laporan & Pembaruan Skill
- Setiap perubahan alur interaksi admin, timeline kasir, atau konfigurasi manifest PWA wajib diperbarui di `SKILL.md` ini dan disetor ke `madzhair-coordinator`.
