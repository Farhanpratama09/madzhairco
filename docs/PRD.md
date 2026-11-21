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
- **Media Zero-Bandwidth:** Video sampel gaya rambut menggunakan **embed URL TikTok & Instagram Reels** (0 MB storage & bandwidth server). Foto menggunakan kompresi otomatis format **WebP**.

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
- **Navbar Atas 3-Kolom:** Logo `Madzhair.co` di kiri, tautan bersih (`Layanan`, `Galeri`, `Reservasi`, `Lokasi`) di tengah, dan di kanan ikon kalender + **"Booking tersedia"** di atas latar lembut transparan (`bg-[#F7F3EC]/90 backdrop-blur-sm px-3.5 py-1.5 rounded-full`).
- **Hero Kiri & Kanan (Crisp S-Curve Tanpa Kabut Silau):** Kiri memuat eyebrow `Madzhair Barber & Co`, judul `Instrument Serif` (`Atur Jadwal Cukur, Datang Tanpa Antre.`), subjudul lugas `Pilih layanan dan jam yang tersedia, kunci jadwalmu, lalu konfirmasi lewat WhatsApp.`, serta 1 tombol CTA Terracotta `Pilih Jadwal`. Kanan menampilkan foto barbershop dengan lengkungan S-curve solid `#EFE8DD` yang tajam dan bersih tanpa kabut silau maupun kotak putih mengambang.
- **Floating Pill Dock 3 Segmen + Dropdown Pricelist (`#layanan`):** (1) Dropdown `Layanan & tarif` (`Haircut`: Kids `Rp 30k`, Longtrim & Regular `Rp 35k`, Fade & Taper `Rp 40k`; `Hair Chemicals`: `Rp 250k`, memilih sub-layanan Haircut mana pun tetap sinkron sebagai `Haircut` di `#reservasi`), (2) `Jam operasional`, dan (3) `Location` (`Jl. Raya Sungai Kunyit, Gg. Tani` ke Google Maps).
- **Galeri & Reels Murni Visual (`#galeri`):** Judul `Galeri & Reels` tanpa teks pengantar dan tanpa teks overlay di atas media. Dua panel proporsional `aspect-[4/5]`: Kiri khusus **Instagram Reels** (`< >` + dot pagination + lazy iframe), Kanan **Carousel 4 Foto** dengan transisi CSS `translate3d` mulus (`< >` + touch swipe + dot pagination).
- **Area Reservasi & Live Booking Preview (`#reservasi`):** Judul `Pilih Jadwal` dengan subjudul `Pilih tanggal, layanan, dan jam yang tersedia.`, strip tanggal 21 hari (`< >`) + tanggal lengkap, kartu layanan berdurasi ringkas (`~45 menit` / `~2 jam`), legenda status memakai **ikon kursi**, serta **Live Booking Preview** Vertical Stepper dengan jam terpilih `#303841`, catatan keterlambatan tanpa kata *"kasir"*, dan tanpa tombol lokasi.
- **Footer Minimalis 3 Kolom (`#lokasi`, `rounded-t-[32px] bg-[#303841] text-[#F7F3EC]`):** Kiri hanya logo `Madzhair.co`, Tengah `Jam operasional` + `Sungai Kunyit, Kalimantan Barat` + jam buka live, Kanan alamat + 3 tautan (`Google Maps`, `WhatsApp`, `Instagram`) tanpa tautan `/admin`.
- **Konfirmasi Pra-Booking & Penguncian Instan (`BOOKED`):** Dialog konfirmasi akhir sebelum mengunci slot (`create_booking_safe`) dan mengarahkan langsung ke WhatsApp dengan kode **`MDZ-XXXX`**.

### 4.2 Link Tiket Pintar (`/tiket/[code]`)
Satu URL netral yang menyesuaikan tampilan berdasarkan status autentikasi perangkat:
- **Mode Pelanggan (Unauthenticated):** Menampilkan kartu bukti reservasi resmi (Kode `MDZ-XXXX`, Nama, Layanan, Tanggal & Jam, Status, tombol Google Maps) dalam tipografi `Poppins` (`tabular-nums`).
- **Mode Admin (Authenticated Session Terdeteksi):** Menampilkan kartu tiket yang sama ditambah **Panel Kontrol Cepat** di bagian bawah (pilihan jam pengganti untuk **Geser Jadwal** dalam 2 tap, **Tandai Selesai**, serta tombol **Batalkan** untuk membebaskan slot).

### 4.3 Dashboard Kasir & Manajemen (`/admin`)
- **Cross-Platform PWA:** Dapat di-install ke *Home Screen* di **Android (Chrome)** dan **iOS (Safari Add to Home Screen)** dengan tampilan *full-screen* selaras tema `#EFE8DD`.
- **1-Tap Walk-in:** Dua tombol ringkas di zona jempol bawah (maks 2 tap tanpa ketik nama):
  - `+ Walk-in Haircut` (mengunci 1 blok jam aktif saat ini).
  - `+ Walk-in Chemicals` (mengunci 2 blok jam berurutan).
- **Visual Time-Block Timeline Minimalis & Bottom Sheet Aksi:** Strip pemilih hari horizontal diikuti timeline per jam yang menampilkan blok aktif **`BOOKED`** (Jam, Nama, Layanan, durasi proporsional 1x/2x menyambung, tag `Online`/`Walk-in`, garis waktu aktif `#C25934`). Tombol aksi (**Tandai Selesai**, **Geser Jadwal**, **Batalkan Booking**, **Lihat Smart Ticket**) berada di dalam **Bottom Sheet Detail** saat blok di-tap; status `COMPLETED` dan `CANCELLED` dipisah ke kartu riwayat ringkas di bawah timeline agar slot yang kembali kosong dapat terisi ulang tanpa tumpang tindih visual.
- **Kontrol Operasional & CMS:** Saklar **Tutup Darurat** (*force close*), blokir tanggal libur tertentu, editor jam buka harian, editor harga layanan, serta pengelola media (input link video & upload foto WebP).

---

## 5. Standar Kualitas Wajib (Non-Negotiable)
1. **Palet Resmi Warm Alabaster 60–30–10 & Tipografi `Poppins` + Hero `Instrument Serif` (v1.7):** Kanvas `#EFE8DD` (Warm Alabaster), permukaan kartu `#F7F3EC` (Soft Ivory) + hairline `#DCD4C6`, teks utama `#303841` (Deep Slate Charcoal), sekunder `#5C646D` (Muted Slate), aksen `#C25934` (Burnt Terracotta, teks `#F7F3EC`), semantik `#2E6F56` & `#B83B3B`. Gunakan **`Poppins`** (`tabular-nums`) untuk seluruh UI, tombol, deskripsi, dan angka di `/` & `/tiket/[code]`, serta **`Instrument Serif`** (+ *italic*) khusus untuk judul utama Hero.
2. **Paritas Android & iOS:** Wajib mendukung `100dvh`, `env(safe-area-inset-*)`, area sentuh minimal `44x44px` (`gap >= 8px`), input `>= 16px`, dan ikon PWA adaptif Android + Apple Touch Icon.
3. **Zero-Trust Security:** Publik dilarang menulis langsung ke tabel `bookings` (wajib via RPC dengan *rate-limit* & *honeypot*). Aksi di Smart Ticket wajib divalidasi sesi adminnya di sisi server. Rute `/admin` dipisahkan dari footer publik.
4. **Zero-Error Deployment & SEO:** Wajib lulus strict `next build`, dilengkapi Open Graph preview untuk WhatsApp, JSON-LD `HairSalon`, dan skor performa mobile optimal.

---

## 6. Data Operasional & Seed Awal (Disetujui)
- **Nama Toko:** Madzhair.co (`Madzhair Barber & Co`)
- **Zona Waktu Toko:** `Asia/Pontianak` (WIB)
- **Nomor WhatsApp Admin:** `62895701807228`
- **Alamat Singkat:** `Jalan Raya Sungai Kunyit, Gang Tani`
- **URL Google Maps:** `https://maps.app.goo.gl/sWp9PBaNSmE4zqYTA`
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
| `v1.2` | 2026-11-21 | `Approved` | Redesain UI/UX **Soft-Editorial** dengan palet resmi **Warm Alabaster (`#EFE8DD`)**, **Soft Ivory (`#F7F3EC`)**, **Deep Slate Charcoal (`#303841`)**, & **Burnt Terracotta (`#C25934`)**; Floating Segmented Booking Bar, Horizontal Date Scrubber, Live Booking Preview, Lookbook full-bleed `rounded-2xl`, serta Visual Time-Block Timeline (`108px/jam`) di `/admin`. |
| `v1.3` | 2026-11-21 | `Approved` | Penyederhanaan mobile-first: penghapusan form booking ganda di hero menjadi **Floating Info & Pricelist Dock (`rounded-[28px]`)**, galeri 4 Foto + 2 Video Reels dengan *horizontal swipe* (`snap-x`) di mobile, skala tipografi ringkas (`h1` `28px`, `h2` `20px`), serta pemindahan tombol aksi timeline `/admin` ke **Bottom Sheet Detail** saat blok di-tap. |
| `v1.4` | 2026-11-21 | `Approved` | Perbaikan bug slot `COMPLETED` di `slots.ts` & RPC SQL (`004_free_completed_slots.sql`) agar kursi langsung bebas setelah selesai; perbaikan tabrakan grid `#reservasi` (`lg:grid-cols-[minmax(0,1fr)_360px]` + `min-w-0`); penghapusan total prefiks kode (`01 //`), pill kotak `LiveStatusTag`, serta label `font-mono` ALL-CAPS ke `Plus Jakarta Sans` Sentence Case + `Instrument Serif`. |
| `v1.5` | 2026-11-21 | `Approved` | Perombakan Hero & Floating Dock mengikuti arsitektur Travorra: foto hero *full-bleed top-right* (`lg:w-[54%] lg:min-h-[620px] lg:rounded-bl-[180px]`) menyatu di belakang navbar transparan, kartu mengambang `Jam operasional` menembus batas kiri foto (`lg:-left-10 lg:top-28`), judul `lg:text-[62px]`, tombol kapsul `rounded-full` berikon panah melingkar, serta **Floating Horizontal Capsule Dock** (`lg:rounded-full -mt-12`) menindih batas bawah foto *above the fold*. |
| `v1.6` | 2026-11-21 | `Approved` | Finalisasi UI/UX menyeluruh: Navbar tengah + status bersih `"Booking tersedia"` (ikon saja), Hero kiri 1 CTA + kanan S-curve *edge feathering* tanpa kotak putih mengambang, **Floating Pill 3 Segmen** dengan dropdown pricelist interaktif, seragam `Plus Jakarta Sans tabular-nums` (0 `JetBrains Mono` di `/` & `/tiket/[code]`), hapus tautan `"Akses Kasir"` di footer, **Media Kiri-Kanan** (Video Embed + Carousel 4 Foto dot pagination), Kalender Slide 21 hari + tanggal lengkap, padding kartu layanan presisi, serta **Vertical Stepper** Live Booking Preview tanpa tombol Lokasi. |
| `v1.7` | 2026-11-21 | `Approved` | Finalisasi UI/UX & copywriting: migrasi font UI ke **`Poppins`** (`tabular-nums`) dengan `Instrument Serif` khusus judul Hero, badge navbar `bg-[#F7F3EC]/90`, penghapusan kabut putih silau hero menjadi S-curve tajam, copywriting hero lugas tanpa *"privat cukur"*, **Galeri & Reels** murni visual (panel kiri khusus Instagram Reels + panel kanan Carousel 4 Foto `translate3d` mulus), `#reservasi` durasi ringkas (`~45 menit` / `~2 jam`) + legenda **ikon kursi** + jam preview `#303841` tanpa kata *"kasir"*, serta **Footer 3 Kolom** `rounded-t-[32px]` (`Google Maps`, `WhatsApp`, `Instagram`). |


