---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), Split Hero Asimetris & Floating Horizontal Dock, Galeri 4 Foto + 2 Reels swipeable mobile, Area Reservasi Live Booking Preview (bebas overlap desktop), lazy-load embed sosmed, kalkulator slot real-time, redirect WhatsApp, dan Smart Ticket (/tiket/[code]).
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan bergaya **Soft-Editorial Editorial Minimalist (v1.4)** (palet 60–30–10 **Warm Alabaster `#EFE8DD`**, **Soft Ivory `#F7F3EC`**, **Deep Slate Charcoal `#303841`**, & **Burnt Terracotta `#C25934`**) yang instan, tanpa login, dan paritas penuh Android/iOS (`100dvh`, `env(safe-area-inset-*)`, touch target minimal `44x44px`, input `>= 16px` / `text-base`).
- Mengimplementasikan kalkulator slot real-time, sinkronisasi Supabase Realtime, dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (v1.4 — Soft-Editorial Travorra Minimalist)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"` dengan fallback aman ke `DEFAULT_*` (`src/lib/seed.ts`) dan `defaultGalleryItems` (`src/config/media.ts`) ketika env Supabase belum aktif.
   - **Navbar Atas Minimalis Satu Baris (Tanpa Kotak Pembungkus):**
     - Kiri: `BrandMark` (`variant="compact"` di `< sm`, `variant="full"` di `sm:`, wordmark Sentence Case `Madzhair.co`).
     - Tengah (`hidden md:flex items-center gap-7`): 4 tautan teks bersih Sentence Case `Layanan` (`#layanan`), `Galeri` (`#galeri`), `Reservasi` (`#reservasi`), `Lokasi` (`#lokasi`) (`font-sans font-medium min-h-[44px]`).
     - Kanan: `LiveStatusTag` (`compact`) teks bersih tanpa kotak pembungkus dengan indikator lingkaran halus (`w-2 h-2 rounded-full`) + teks Sentence Case (`Booking besok aktif · 05:00 – 20:00 WIB`).
   - **Split Hero Asimetris (Travorra-Inspired):** Kanvas `bg-alabaster text-ink` tanpa *pill badge* maupun prefiks kode `00 /`. Kiri: eyebrow kecil bersih (`Studio cukur satu kursi · Jalan Raya Sungai Kunyit, Gang Tani`), judul `Instrument Serif` dengan aksen *italic* (`text-3xl sm:text-4xl lg:text-5xl`), subjudul `Plus Jakarta Sans`, CTA Terracotta **Pilih Jadwal** (`#reservasi`), tautan lokasi, dan ringkasan studio Sentence Case. Kanan: foto potongan rambut utama berbingkai asimetris organik (`rounded-tl-[72px] rounded-br-[72px] rounded-tr-3xl rounded-bl-3xl`, tanpa border kaku) + **1 kartu mengambang kecil** di sudut kanan atas berisi jam operasional hari ini & kapasitas 1 kursi.
   - **Floating Horizontal Dock (`#layanan`, `rounded-3xl bg-surface shadow-xl` tanpa border kaku):**
     - Menggantikan form booking ganda di batas bawah hero (`-mt-8 lg:-mt-12`).
     - Berisi 4 segmen horizontal bersih (`lg:grid-cols-[minmax(0,1.45fr)_0.85fr_0.95fr_auto]`):
       (a) **Layanan & Pricelist Interaktif:** Tab `Haircut` (`Rp 30k – 40k`) & `Hair Chemicals` (`Rp 250k`) (`rounded-2xl min-h-[48px]`) yang sinkron ke `selectedServiceId`, plus rincian varian.
       (b) **Jam Operasional Hari Ini:** Jam buka/tutup (`tabular-nums`) dan status lingkaran semantik Sentence Case.
       (c) **Location:** `Jalan Raya Sungai Kunyit, Gang Tani` klikabel menuju `settings.google_maps_url` (`min-h-[44px]`).
       (d) **Tombol Aksi `Pilih Jadwal`:** `bg-terracotta text-surface rounded-2xl min-h-[48px]` untuk *smooth scroll* ke `#reservasi`.
   - **Urutan `<main>`:** Hero → `<BookingExperience ... gallerySection={<SocialGalleryFacade items={galleryItems} />} />` → Footer (`id="lokasi"` `scroll-mt-24`).
   - **Area Reservasi (`#reservasi` — Bebas Tabrakan Desktop):**
     - Grid desktop menggunakan `lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8` dengan `min-w-0` pada kolom kiri dan tiap `<fieldset>` agar Horizontal Date Scrubber tidak pernah bertabrakan dengan kartu sticky `Live booking preview`.
     - Seluruh label seksi (`Pilih tanggal`, `Pilih layanan`, `Pilih jam`, `Live booking preview`), status slot (`Tersedia`, `Terisi`, `Lewat`, `< 2 jam`, `Dipilih`), tombol, dan modal pra-booking menggunakan `Plus Jakarta Sans` dalam **Sentence Case** (0 kode `01 //`, 0 ALL-CAPS monospace). `JetBrains Mono` hanya untuk jam bulat, nominal harga, dan kode tiket `MDZ-XXXX`.
     - **Strip Tanggal Horizontal & Grid Slot:** Swipeable (`snap-x snap-mandatory no-scrollbar`), slot terpilih `bg-terracotta text-surface`, legenda indikator lingkaran (`rounded-full`), input Nama (`text-base >= 16px`), *honeypot* `website`, aturan 15 menit, tombol `Review & Konfirmasi Booking`, modal pra-booking, kartu konfirmasi `MDZ-XXXX`, dan auto-redirect WhatsApp instan.
   - **Footer Arsitektural Gelap (`id="lokasi"`, `scroll-mt-24`, `bg-ink text-surface`):** Sentence Case UI dengan `tabular-nums` khusus jam operasional mingguan.
   - Sinkronisasi **Supabase Realtime** (`madzhair-customer-realtime`) memantau `bookings`, `store_settings`, `weekly_schedules`, `closed_dates`, dan `services`.

2. **Route Handler Booking Publik (`src/app/api/bookings/route.ts`):**
   - Rate limiter via `extractClientIp(request.headers)` + `checkBookingRateLimit(ip)` (`429` + `Retry-After`), cek `checkHoneypot(body.website)`, validasi `sanitizeCustomerName` (`2–40` karakter), `YYYY-MM-DD`, dan `validateServiceTimeFormat`.
   - Memanggil `supabase.rpc('create_booking_safe', ...)` pada mode Supabase (di mana status `COMPLETED` tidak memblokir kursi) atau fallback `DEFAULT_*` + `generateDemoTicketCode()` pada mode Demo Lokal.

3. **Alur Redirect WhatsApp & Penyimpanan Demo:**
   - Setelah `POST /api/bookings` berhasil, tiket disimpan ke `sessionStorage` dan langsung diarahkan ke `https://wa.me/<whatsapp_number>?text=<encoded_text>` tanpa delay buatan.

4. **Lookbook Full-Bleed & Zero-Bandwidth Social Media Embed (`src/components/customer/SocialGalleryFacade.tsx`):**
   - Merender **4 Sample Foto (`aspect-[4/5]`, `rounded-2xl`)** dan **2 Sample Video Embed TikTok/Instagram Reels (`aspect-[9/16]`, `rounded-2xl`)** dengan judul `Instrument Serif` di atas scrim gelap (`from-[#1E2329]/90 via-[#303841]/55 to-transparent`), bebas kode nomor `01 //`, serta *horizontal swipe* (`snap-x`) di mobile.

5. **Smart Ticket (`/tiket/[code]` — `src/app/tiket/[code]/page.tsx` & `src/components/ticket/SmartTicketView.tsx`):**
   - `generateMetadata` Open Graph untuk WhatsApp, verifikasi sesi admin server-side, lookup `get_booking_by_ticket_code`, Realtime update `bookings`, dan tipografi Sentence Case bersih (`JetBrains Mono` khusus `MDZ-XXXX` dan jam).

## 3. Protokol Laporan & Pembaruan Skill
- Setiap perubahan pada format pesan WA, logika kalkulator slot, struktur komponen *embed*, atau pola UI pelanggan wajib dicatat ke `SKILL.md` ini sebelum disetor ke `madzhair-coordinator`.
