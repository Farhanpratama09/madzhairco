# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Nama Brand:** Madzhair.co  
**Deskripsi:** Madzhair Barber & Co  
**Versi:** 1.0 (MVP Demo & Production Ready)  
**Status:** Approved (Disetujui Atasan Tertinggi — 2026-11-20)  
**Penanggung Jawab Dokumen:** Ketua Koordinator (`madzhair-coordinator`)

---

## 1. Ringkasan Eksekutif & Tujuan
Madzhair.co adalah aplikasi web reservasi dan manajemen operasional kasir berbasis **zero-cost architecture** (Rp 0/bulan) yang dirancang khusus untuk barbershop berkapasitas **1 kursi (1 barber)**. Sistem ini memadukan *landing page* publik berestetika editorial dengan *Progressive Web App* (PWA) lintas platform (**Android & iOS**) untuk operasional harian pemilik barber.

### Target Lingkungan Rilis
- **Tahap Demo:** `https://madzhair.vercel.app` (Vercel Free Tier + Supabase Free Tier).
- **Tahap Produksi:** Migrasi ke custom domain `.my.id` (`madzhair.my.id` / `madzhairco.my.id`) tanpa perubahan logika backend.

---

## 2. Arsitektur Teknologi & Batasan Biaya
- **Frontend & SSR/Middleware:** Next.js (App Router, TypeScript, Tailwind CSS) di-deploy di **Vercel**.
- **Database, Auth & Realtime:** **Supabase** (PostgreSQL, Supabase Auth, Supabase Realtime, Storage).
- **Media Zero-Bandwidth:** Video sampel gaya rambut menggunakan **embed URL Instagram Reels** (0 MB storage & bandwidth server). Foto menggunakan kompresi otomatis format **WebP**.

---

## 3. Aturan Bisnis & Logika Penjadwalan (Core Engine)

### 3.1 Kapasitas & Grid Waktu
- **Kapasitas Kursi:** 1 kursi aktif.
- **Pola Slot:** Grid bulat per **1 jam** (`10:00`, `11:00`, `12:00`, ..., `20:00`). Tidak menggunakan kelipatan 15/30 menit agar tampilan UI bersih dan bebas jam nanggung.

### 3.2 Layanan & Pemisahan Durasi (Display vs System Block)
| Layanan | Cakupan | Durasi Tampil ke User | Blok Kunci di Sistem | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| **Haircut** | Fade, Taper, Longtrim, dll. *(konsultasi di lokasi)* | **~45 Menit** | **1 Blok (60 Menit)** | Sisa 15 menit otomatis menjadi jeda sanitasi & istirahat barber. |
| **Hair Chemicals** | Downperm, Wavyperm, Designperm *(konsultasi di lokasi)* | **~2 Jam** | **2 Blok Berurutan (120 Menit)** | Mengunci jam mulai + 1 jam berikutnya secara berurutan. |

### 3.3 Algoritma Penyaringan Slot Real-Time
1. **Anti-Irisan Waktu (*Time Overlap*):** Slot baru valid jika `new_start < existing_end AND new_end > existing_start` bernilai `FALSE` terhadap reservasi berstatus aktif **`BOOKED`** saja.
2. **Pembebasan Slot Saat `COMPLETED`:** Saat admin menandai jadwal sebagai **`COMPLETED`** (Selesai), slot kursi pada jam terkait langsung bebas kembali di halaman pelanggan maupun timeline kasir (jam yang sudah terlewati di hari ini tetap otomatis dinonaktifkan oleh aturan `lead_time_minutes`).
3. **Dinamika Durasi 2 Jam:** Jika pelanggan memilih **Hair Chemicals**, jam yang hanya menyisakan 1 blok kosong sebelum jadwal berikutnya atau sebelum jam tutup toko otomatis dinonaktifkan (*disabled*).
4. **Batas Waktu Real-Time (*Lead Time*):** Untuk pemesanan di **hari ini**, slot yang sudah lewat atau berada dalam rentang `lead_time_minutes` (default: **30 menit** sebelum jam mulai) otomatis terkunci.

### 3.4 Jadwal Operasional Default
- **Minggu – Kamis:** `12:00 – 21:00`
- **Jumat:** `13:00 – 21:00`
- **Sabtu:** `10:00 – 20:00`
*(Dapat diubah kapan saja oleh admin melalui dashboard).*

---

## 4. Fitur & Alur Pengguna

### 4.1 Pengalaman Pelanggan (`/`)
- **Navbar Atas 3-Kolom:** Logo `Madzhair.co` di kiri, tautan bersih (`Layanan`, `Galeri`, `Reservasi`, `Lokasi`) di tengah, dan di kanan ikon kalender + status dinamis Asia/Pontianak (**`Sedang buka`** / **`Booking tersedia`** / **`Tutup hari ini`**) di atas latar lembut transparan (`bg-[#F7F3EC]/90 backdrop-blur-sm px-3.5 py-1.5 rounded-full`).
- **Hero Kiri & Kanan (Opsi B Mobile + Crisp S-Curve Desktop):** Kiri langsung memuat judul `Instrument Serif` (`Atur Jadwal Cukur, Datang Tanpa Antre.`) tanpa eyebrow duplikat, subjudul lugas `Pilih layanan dan jam yang tersedia, kunci jadwalmu, lalu konfirmasi lewat WhatsApp.`, serta 1 tombol CTA Terracotta `Pilih Jadwal`. Foto S-curve solid `#EFE8DD` disembunyikan di layar mobile (`hidden lg:block`) agar tampilan HP ringkas langsung menampilkan Hero → Floating Info Dock (`mt-8 lg:-mt-12`), sementara desktop (`lg:`) tetap mempertahankan foto S-curve tajam tanpa kabut silau maupun kotak putih mengambang.
- **Floating Pill Dock 3 Segmen + Dropdown Pricelist (`#layanan`):** (1) Dropdown `Layanan & tarif` (`Haircut`: Kids `Rp 30k`, Longtrim & Regular `Rp 35k`, Fade & Taper `Rp 40k`; `Hair Chemicals`: `Rp 250k`, memilih sub-layanan Haircut mana pun tetap sinkron sebagai `Haircut` di `#reservasi`), (2) `Jam operasional`, dan (3) `Location` (`Jl. Raya Sungai Kunyit, Gg. Tani` ke Google Maps).
- **Galeri & Reels Murni Visual (`#galeri`):** Judul `Galeri & Reels` tanpa teks pengantar dan tanpa teks overlay di atas media. Dua panel proporsional `aspect-[4/5]`: Kiri khusus **Instagram Reels** (`< >` + dot pagination + lazy iframe), Kanan **Carousel 4 Foto** dengan transisi CSS `translate3d` mulus (`< >` + touch swipe + dot pagination).
- **Area Reservasi & Live Booking Preview (`#reservasi`):** Judul `Pilih Jadwal` dengan `LiveStatusTag` berikon kalender dinamis (`Sedang buka` / `Booking tersedia` / `Tutup hari ini` tanpa titik bulat), label pilihan jam **`Pilih jam · Sungai Kunyit, Kalimantan Barat (WIB)`**, strip tanggal 21 hari (`< >`) + tanggal lengkap, kartu layanan berdurasi ringkas (`~45 menit` / `~2 jam`), kartu bersih saat 0 slot tersedia (`Jadwal hari ini sudah penuh` / `Jam operasional hari ini sudah selesai` / `Slot 2 jam hari ini tidak tersisa`) + tombol pintas **`Pilih Jadwal Berikutnya ->`**, input **Nomor WhatsApp** wajib (normalisasi `08xx` -> `628xx`, dijaga privat di `public.booking_contacts`), serta **Live Booking Preview** Vertical Stepper.
- **Footer Minimalis 3 Kolom (`#lokasi`, `rounded-t-[32px] bg-[#303841] text-[#F7F3EC]`):** Kiri hanya logo `Madzhair.co`, Tengah `Jam operasional` + `Sungai Kunyit, Kalimantan Barat (WIB)` + jam buka live (termasuk status tutup lebih awal), Kanan alamat + 3 tautan (`Google Maps`, `WhatsApp`, `Instagram`) tanpa tautan `/admin`.
- **Konfirmasi Pra-Booking & Penguncian Instan (`BOOKED`):** Dialog konfirmasi akhir sebelum mengunci slot (`create_booking_safe`), memicu Web Push best-effort ke HP kasir, dan mengarahkan langsung ke WhatsApp dengan kode **`MDZ-XXXX`**.

### 4.2 Link Tiket Pintar (`/tiket/[code]`)
Satu URL netral yang menyesuaikan tampilan berdasarkan status autentikasi perangkat dan menjalankan `auto_complete_overdue_bookings()` sebelum memuat status:
- **Mode Pelanggan (Unauthenticated — Zero WA Leak):** Menampilkan kartu bukti reservasi resmi (Kode `MDZ-XXXX`, Nama, Layanan, Tanggal & Jam, tombol Google Maps) dalam tipografi `Poppins` (`tabular-nums`), **100% tanpa nomor WA di respons/RSC publik**, serta deteksi otomatis badge **`Jadwal Diperbarui`** (beserta perbandingan jadwal lama vs baru), **`Jadwal Dibatalkan`**, **`Sesi Selesai`**, atau **`Terjadwal`**.
- **Mode Admin (Authenticated Session Terdeteksi):** Menampilkan kartu tiket yang sama ditambah **Panel Kontrol Cepat** (pilihan jam pengganti untuk **Geser Jadwal** 2 tap, **Tandai Selesai**, **Batalkan**, serta tombol 1-Tap **`Kirim Info ke WA Pelanggan`** untuk jadwal yang digeser/dibatalkan).

### 4.3 Dashboard Kasir & Manajemen (`/admin` & `/admin/login`)
- **Cross-Platform PWA & Minimalis 100% `Poppins`:** Dapat di-install ke *Home Screen* di **Android (Chrome 1-tap)** dan **iOS (modal panduan visual 2 langkah `Cara Pasang di iPhone`)**, didukung `public/sw.js` untuk Web Push tanpa caching route dinamis.
- **Navbar `/admin` Steril & Status Bar 1 Baris (Anti Salah Klik PWA):** Kiri menampilkan tombol **`Madzhair.co · Kasir`** (tap → reset ke tab `Jadwal & Kasir` hari ini, tanpa link `Beranda`/`/`); kanan **hanya** tombol **`Keluar`**. Tepat di bawahnya terdapat 1 baris status operasional hari ini (state-machine `Asia/Pontianak`) + tombol `Refresh`. Link `← Kembali ke Halaman Booking` khusus tersedia di `/admin/login`.
- **1-Tap Walk-in:** `+ Walk-in Haircut` (1 blok) dan `+ Walk-in Chemicals` (2 blok berurutan), nomor WA opsional/nullable.
- **Tab `Jadwal & Kasir` (Fokus Penuh Antrean Harian):** Auto-complete otomatis saat melewati `end_time + 15 menit` (`Asia/Pontianak`), date scrubber horizontal + ringkasan 1 baris `Menunggu · Selesai · Batal`, Visual Time-Block Timeline ringkas (`76px/jam`) dengan blok `Istirahat` (`z-[5]`) di bawah blok `BOOKED` (`z-10`), `Riwayat selesai` & `Riwayat dibatalkan` dalam accordion collapsible, **Bottom Sheet Detail** (`>= 48px`), serta banner & tombol 1-Tap **`Kirim Info ke WA Pelanggan`** setelah Geser Jadwal / Batalkan.
- **Tab `Operasional & CMS` (3 Sub-Tab Pill + Collapsible Accordion Anti-Scroll Panjang):**
  - **Sub-tab `Operasional`:**
    - **Status Studio Hari Ini (State-Machine 5 Kondisi `Asia/Pontianak`):** (a) `Ditutup Mendadak mulai {jam} WIB` + `Buka Kembali Studio`, (b) `Studio Tutup Hari Ini` + `Buka Kembali Studio` (bila override/force-close), (c) `Operasional Hari Ini Selesai (Tutup {jam} WIB)` tanpa tombol tutup mendadak/seharian, (d) `Belum Buka · Buka {jam} WIB` dengan hanya `Tutup Seharian Ini`, (e) `Sedang Buka · Tutup {jam} WIB` dengan `Tutup Mulai Jam Sekarang` & `Tutup Seharian Ini` + daftar peringatan booking aktif ber-tombol `Info WA`.
    - **Accordion Ringkas:** `Jam Istirahat Harian` (`17:15–18:30 WIB`, irisan penuh 1 jam vs 2 jam), `Jadwal Operasional Mingguan`, dan `Tanggal Libur Khusus` — masing-masing menampilkan ringkasan status 1 baris sebelum dibuka.
  - **Sub-tab `Layanan & Galeri`:** Accordion per layanan (`Tarif Layanan` 3 elemen 1 baris dengan auto-kalkulasi range) dan accordion `Galeri Foto & Instagram Reels` dengan baris daftar padat.
  - **Sub-tab `Notifikasi & QR`:**
    - **Notifikasi HP Kasir (Web Push):** Accordion ringkas berstatus 1 baris, deteksi iOS Home Screen, tombol `Aktifkan Notifikasi HP` & `Tes Kirim Notif`, pemicu instan booking baru + `/api/cron/break-reminder` (fail-closed `CRON_SECRET`, jendela `[break_end - 15m, break_end + 5m]` `Asia/Pontianak`, scheduler `.github/workflows/break-reminder.yml`).
    - **QR Code Studio Siap Cetak:** Baris ringkas dengan tombol **`Preview & Unduh QR PNG`** yang membuka modal pratinjau `<canvas>` QR, **`Download PNG Siap Cetak`**, **`Salin Link Booking`**, dan **`Buka Halaman Pelanggan`** (tab baru ke `/#reservasi`).

---

## 5. Standar Kualitas Wajib (Non-Negotiable)
1. **Palet Resmi Charcoal Noir Monochrome System & Tipografi `Poppins` + Hero `Instrument Serif` (v2.0):** Latar utama `#F7F7F7`, permukaan kartu `#FFFFFF`, sekunder / jam istirahat `#E0E0E0` (Cloud Veil), border `#B3B3B3` (Moonlit Silver), teks bantuan `#848484` (Urban Fog), subjudul / harga / durasi / lokasi `#565656` (Ironclad Grey), judul utama / header gelap / tombol aksi utama `#2B2B2B` (Charcoal Noir, teks `#FFFFFF`, hover `#1F1F1F`), peringatan destruktif `#9E2A2B`. Gunakan **`Poppins`** (`tabular-nums`, 0 `font-mono`) untuk seluruh UI, dan **`Instrument Serif`** (+ *italic*) khusus judul Hero.
2. **Paritas Android & iOS serta Browser Lama (`320px–430px`):** Target `browserslist` di `package.json` (`chrome >= 80`, `safari >= 13`, `ios >= 13`, `edge >= 80`, `firefox >= 78`), tanpa API modern tanpa fallback, `min-h-[100dvh]`, `env(safe-area-inset-*)`, area sentuh minimal `44x44px`, input/select `>= 16px` dengan `box-border max-w-full`, guard `'serviceWorker' in navigator && 'PushManager' in window` + `typeof Notification !== "undefined"`, dropdown `<select>` jam interval 15 menit pada form jadwal & istirahat, serta label eksplisit `Pilih Tanggal Libur`.
3. **Identitas Brand & Pesan WhatsApp (`Madzhair Barber & Co`):** Publik, poster QR, & seluruh pesan `wa.me` memakai **`Madzhair Barber & Co`** (menghindari tautan mati `.co` di WhatsApp) dengan link e-tiket pada baris terakhir terpisah; navbar `/admin` ringkas **`Madzhair · Kasir`** tanpa link `/`.
4. **Zero-Trust Security & Privasi WA:** Publik dilarang menulis langsung ke `bookings` dan **dilarang membaca `booking_contacts` maupun `push_subscriptions`** (`REVOKE ALL ... FROM anon`). Rute `/api/cron/break-reminder` wajib fail-closed (`503`/`401` + `timingSafeEqual`). CSP mengizinkan `worker-src 'self'` dan `img-src 'self' data: blob:`.
5. **Zero-Error Deployment & SEO:** Wajib lulus strict `tsc --noEmit`, `eslint`, dan `next build` (Next.js 16 `await context.params`), tanpa cron `< 1 hari` di `vercel.json`.

---

## 6. Data Operasional & Seed Awal (Disetujui)
- **Nama Toko:** `Madzhair Barber & Co`
- **Lokasi Tampil UI:** `Sungai Kunyit, Kalimantan Barat (WIB)`
- **Zona Waktu Teknis (IANA):** `Asia/Pontianak` (UTC+7)
- **Nomor WhatsApp Admin:** `62895701807228`
- **Alamat Singkat:** `Jalan Raya Sungai Kunyit, Gang Tani`
- **URL Google Maps:** `https://maps.app.goo.gl/sWp9PBaNSmE4zqYTA`
- **Jam Istirahat Default:** `17:15 – 18:30 WIB` (`break_enabled = false` default, dapat diaktifkan dari tab Operasional & CMS)
- **Rincian Tarif Layanan:**
  - **Haircut** (`~45 Menit` tampil, `1 Blok / 60 Menit` sistem):
    - `Kids`: Rp 30.000 (`30k`)
    - `Longtrim & Regular`: Rp 35.000 (`35k`)
    - `Fade & Taper`: Rp 40.000 (`40k`)
  - **Hair Chemicals** (`~2 Jam` tampil, `2 Blok / 120 Menit` sistem):
    - `Downperm / Wavyperm / Designperm`: Rp 250.000 (`250k`)
- **Aset Media:** Placeholder terpusat di konfigurasi media agar mudah diganti setelah sesi demo.

---

## 7. Riwayat Versi
| Versi | Tanggal | Status | Ringkasan Perubahan |
| :--- | :--- | :--- | :--- |
| `v1.0` | 2026-11-20 | `Approved` | Persetujuan resmi Atasan Tertinggi beserta penetapan data seed operasional (`Asia/Pontianak`, WA `62895701807228`, alamat Sungai Kunyit, tarif Haircut 30k–40k & Chemicals 250k). |
| `v1.1` | 2026-11-20 | `Approved` | Penambahan dialog konfirmasi pra-booking sebelum mengunci slot DB & redirect WA instan tanpa delay, optimasi auth/query paralel (`/admin`, `/tiket`, `/`), Realtime status di `/tiket/[code]`, serta region Vercel `sin1`. |
| `v1.2` | 2026-11-21 | `Approved` | Redesain UI/UX **Soft-Editorial** dengan palet Warm Alabaster; Floating Segmented Booking Bar, Horizontal Date Scrubber, Live Booking Preview, Lookbook full-bleed `rounded-2xl`, serta Visual Time-Block Timeline (`108px/jam`) di `/admin`. |
| `v1.3` | 2026-11-21 | `Approved` | Penyederhanaan mobile-first: penghapusan form booking ganda di hero menjadi **Floating Info & Pricelist Dock (`rounded-[28px]`)**, galeri 4 Foto + 2 Video Reels dengan *horizontal swipe* (`snap-x`) di mobile, skala tipografi ringkas (`h1` `28px`, `h2` `20px`), serta pemindahan tombol aksi timeline `/admin` ke **Bottom Sheet Detail** saat blok di-tap. |
| `v1.4` | 2026-11-21 | `Approved` | Perbaikan bug slot `COMPLETED` di `slots.ts` & RPC SQL (`004_free_completed_slots.sql`) agar kursi langsung bebas setelah selesai; perbaikan tabrakan grid `#reservasi` (`lg:grid-cols-[minmax(0,1fr)_360px]` + `min-w-0`); penghapusan total prefiks kode (`01 //`), pill kotak `LiveStatusTag`, serta label `font-mono` ALL-CAPS ke `Plus Jakarta Sans` Sentence Case + `Instrument Serif`. |
| `v1.5` | 2026-11-21 | `Approved` | Perombakan Hero & Floating Dock mengikuti arsitektur Travorra: foto hero *full-bleed top-right* (`lg:w-[54%] lg:min-h-[620px] lg:rounded-bl-[180px]`) menyatu di belakang navbar transparan, kartu mengambang `Jam operasional` menembus batas kiri foto (`lg:-left-10 lg:top-28`), judul `lg:text-[62px]`, tombol kapsul `rounded-full` berikon panah melingkar, serta **Floating Horizontal Capsule Dock** (`lg:rounded-full -mt-12`) menindih batas bawah foto *above the fold*. |
| `v1.6` | 2026-11-21 | `Approved` | Finalisasi UI/UX menyeluruh: Navbar tengah + status bersih `"Booking tersedia"` (ikon saja), Hero kiri 1 CTA + kanan S-curve *edge feathering* tanpa kotak putih mengambang, **Floating Pill 3 Segmen** dengan dropdown pricelist interaktif, seragam `Plus Jakarta Sans tabular-nums` (0 `JetBrains Mono` di `/` & `/tiket/[code]`), hapus tautan `"Akses Kasir"` di footer, **Media Kiri-Kanan** (Video Embed + Carousel 4 Foto dot pagination), Kalender Slide 21 hari + tanggal lengkap, padding kartu layanan presisi, serta **Vertical Stepper** Live Booking Preview tanpa tombol Lokasi. |
| `v1.7` | 2026-11-21 | `Approved` | Finalisasi UI/UX & copywriting: migrasi font UI ke **`Poppins`** (`tabular-nums`) dengan `Instrument Serif` khusus judul Hero, penghapusan kabut putih silau hero menjadi S-curve tajam, copywriting hero lugas tanpa *"privat cukur"*, **Galeri & Reels** murni visual (panel kiri khusus Instagram Reels + panel kanan Carousel 4 Foto `translate3d` mulus), `#reservasi` durasi ringkas (`~45 menit` / `~2 jam`) + legenda **ikon kursi** + jam preview tanpa kata *"kasir"*, serta **Footer 3 Kolom** `rounded-t-[32px]` (`Google Maps`, `WhatsApp`, `Instagram`). |
| `v1.8` | 2026-11-21 | `Approved` | Finalisasi Hero Mobile (Opsi B: foto disembunyikan di mobile `hidden lg:block`, eyebrow duplikat dihapus, dock `mt-8 lg:-mt-12`), `LiveStatusTag` & Navbar berikon kalender dinamis Asia/Pontianak (`Sedang buka` / `Booking tersedia` / `Tutup hari ini`), serta perombakan total `/admin` & `/admin/login` menjadi minimalis 100% `Poppins` tanpa titik bulat, tanpa hijau `emerald-live`, header 1 baris tanpa email, statistik 1 baris di atas date scrubber, `Tutup Darurat` di puncak Tab `Operasional & CMS`, CMS khusus Instagram Reels dengan form Judul+Link/File, kartu daftar media 1 baris ringkas, serta penyederhanaan form tarif 3 elemen dengan auto-kalkulasi range. |
| `v1.9` | 2026-11-22 | `Approved` | Paket peningkatan operasional menyeluruh (`005_v19_operational_upgrade.sql`): tabel privat `booking_contacts` (nol kebocoran WA ke `anon`/`/tiket/[code]`), normalisasi WA `628xx`, deteksi perubahan jadwal otomatis di `/tiket/[code]` + tombol 1-Tap `Kirim Info ke WA Pelanggan` di `/admin`, panduan visual 2 langkah iOS PWA, QR Code Studio siap cetak lokal via `<canvas>`, jam istirahat harian (`17:15–18:30 WIB`) dengan irisan penuh 1 jam vs 2 jam, tutup studio mendadak (`Tutup Mulai Jam Sekarang` vs `Tutup Seharian Ini` khusus hari ini), kartu bersih status 0-slot + tombol `Pilih Jadwal Berikutnya ->`, `auto_complete_overdue_bookings()` (`end_time + 15 menit` `Asia/Pontianak`), serta Web Push Notification (`public/sw.js`, booking baru instan & `/api/cron/break-reminder` fail-closed `CRON_SECRET` kompatibel Vercel Hobby). |
| `v2.0` | 2026-11-22 | `Approved` | Migrasi penuh ke **Charcoal Noir Monochrome System** (`#F7F7F7`, `#FFFFFF`, `#E0E0E0`, `#B3B3B3`, `#848484`, `#565656`, `#2B2B2B` hover `#1F1F1F`), sterilisasi navbar `/admin` (`Madzhair · Kasir` tanpa link `/`), state-machine 5 kondisi tutup studio (`Asia/Pontianak`), layout `/admin` sub-pill + accordion anti-scroll panjang, perbaikan bug mobile `320px–430px` (blok istirahat solid opaque `#E0E0E0` anti-overlap, dropdown `<select>` jam interval 15 menit, label eksplisit `Pilih Tanggal Libur`), `browserslist` (`chrome >= 80`, `safari >= 13`, `ios >= 13`, `edge >= 80`, `firefox >= 78`), serta pembaruan brand & pesan WhatsApp menjadi **`Madzhair Barber & Co`** dengan link e-tiket pada baris terakhir terpisah. |



