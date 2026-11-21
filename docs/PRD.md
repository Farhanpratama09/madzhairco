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
1. **Anti-Irisan Waktu (*Time Overlap*):** Slot baru valid jika `new_start < existing_end AND new_end > existing_start` bernilai `FALSE`.
2. **Dinamika Durasi 2 Jam:** Jika pelanggan memilih **Hair Chemicals**, jam yang hanya menyisakan 1 blok kosong sebelum jadwal berikutnya atau sebelum jam tutup toko otomatis dinonaktifkan (*disabled*).
3. **Batas Waktu Real-Time (*Lead Time*):** Untuk pemesanan di **hari ini**, slot yang sudah lewat atau berada dalam rentang `lead_time_minutes` (default: **30 menit** sebelum jam mulai) otomatis terkunci.

### 3.4 Jadwal Operasional Default
- **Minggu – Kamis:** `12:00 – 21:00`
- **Jumat:** `13:00 – 21:00`
- **Sabtu:** `10:00 – 20:00`
*(Dapat diubah kapan saja oleh admin melalui dashboard).*

---

## 4. Fitur & Alur Pengguna

### 4.1 Pengalaman Pelanggan (`/`)
- **Tanpa Login & Tanpa Input No. HP:** Pelanggan cukup memilih **Layanan → Tanggal → Jam → Nama**.
- **Konfirmasi Pra-Booking (Sebelum Kunci Slot):** Saat menekan tombol review booking, muncul ringkasan jadwal untuk konfirmasi akhir (**Batal / Ubah Jadwal** tidak menulis ke database; **Ya, Kunci Slot & Buka WA** baru mengunci slot dan membuka WhatsApp tanpa jeda).
- **Penguncian Instan (`BOOKED`):** Saat konfirmasi akhir ditekan, transaksi memanggil fungsi RPC `create_booking_safe` (*advisory lock* per tanggal) untuk mencegah *double-booking* di milidetik yang sama. Slot langsung terkunci permanen tanpa timer hangus.
- **Redirect WhatsApp Otomatis:** Sistem menghasilkan kode tiket unik acak **`MDZ-XXXX`** (non-sequential) dan mengarahkan pelanggan ke `https://wa.me/<nomor_admin>` dengan format pesan terisi otomatis beserta tautan tiket.
- **Informasi Lokasi & Katalog:** Menampilkan status **Buka/Tutup Live** (dan indikator **Booking Aktif** sebelum jam buka), rincian harga, tombol arah Google Maps, serta galeri foto dan *lazy-loaded* video TikTok/IG Reels.

### 4.2 Link Tiket Pintar (`/tiket/[code]`)
Satu URL netral yang menyesuaikan tampilan berdasarkan status autentikasi perangkat:
- **Mode Pelanggan (Unauthenticated):** Menampilkan kartu bukti reservasi resmi (Kode `MDZ-XXXX`, Nama, Layanan, Tanggal & Jam, Status, tombol Google Maps).
- **Mode Admin (Authenticated Session Terdeteksi):** Menampilkan kartu tiket yang sama ditambah **Panel Kontrol Cepat** di bagian bawah (pilihan jam pengganti untuk **Geser Jadwal** dalam 2 tap, serta tombol **Batalkan** untuk membebaskan slot).

### 4.3 Dashboard Kasir & Manajemen (`/admin`)
- **Cross-Platform PWA:** Dapat di-install ke *Home Screen* di **Android (Chrome)** dan **iOS (Safari Add to Home Screen)** dengan tampilan *full-screen*.
- **1-Tap Walk-in:** Dua tombol instan di bagian atas layar tanpa form ketik nama:
  - `+ Walk-in Haircut` (mengunci 1 blok jam aktif saat ini).
  - `+ Walk-in Chemicals` (mengunci 2 blok jam berurutan).
- **Manajemen Antrean Harian:** Daftar booking hari ini dengan aksi cepat **Selesai**, **Geser Jadwal**, dan **Batalkan**.
- **Kontrol Operasional & CMS:** Saklar **Tutup Darurat** (*force close*), blokir tanggal libur tertentu, editor jam buka harian, editor harga layanan, serta pengelola media (input link video TikTok/IG & upload foto/logo).

---

## 5. Standar Kualitas Wajib (Non-Negotiable)
1. **Anti-AI-Slop UI:** Dilarang menggunakan *pill badge* dekoratif generik, font klise template AI (*Inter/Roboto/Space Grotesk* polos), atau grid kartu simetris membosankan.
2. **Paritas Android & iOS:** Wajib mendukung `100dvh`, `env(safe-area-inset-*)`, area sentuh minimal `44x44px`, dan ikon PWA adaptif Android + Apple Touch Icon.
3. **Zero-Trust Security:** Publik dilarang menulis langsung ke tabel `bookings` (wajib via RPC dengan *rate-limit* & *honeypot*). Aksi di Smart Ticket wajib divalidasi sesi adminnya di sisi server.
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

