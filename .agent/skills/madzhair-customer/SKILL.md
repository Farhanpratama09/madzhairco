---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), Split Hero Asimetris & Floating Horizontal Dock, Galeri 4 Foto + 2 Reels swipeable mobile, Area Reservasi Live Booking Preview (bebas overlap desktop), lazy-load embed sosmed, kalkulator slot real-time, redirect WhatsApp, dan Smart Ticket (/tiket/[code]).
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan bergaya **Soft-Editorial Editorial Minimalist (v1.4)** (palet 60–30–10 **Warm Alabaster `#EFE8DD`**, **Soft Ivory `#F7F3EC`**, **Deep Slate Charcoal `#303841`**, & **Burnt Terracotta `#C25934`**) yang instan, tanpa login, dan paritas penuh Android/iOS (`100dvh`, `env(safe-area-inset-*)`, touch target minimal `44x44px`, input `>= 16px` / `text-base`).
- Mengimplementasikan kalkulator slot real-time, sinkronisasi Supabase Realtime, dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (v1.5 — Travorra Full-Bleed Hero & Capsule Dock)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"` dengan fallback aman ke `DEFAULT_*` (`src/lib/seed.ts`) dan `defaultGalleryItems` (`src/config/media.ts`) ketika env Supabase belum aktif.
   - **Navbar Atas Transparan Menyatu (Desktop `lg:absolute`) & Ringkas (Mobile `< lg`):**
     - Kiri: `BrandMark` (`variant="compact"` di `< sm`, `variant="full"` di `sm:`, Sentence Case `Madzhair.co`) + tautan teks Sentence Case `Layanan`, `Galeri`, `Reservasi`, `Lokasi` (`hidden md:flex`) terkelompok di sisi Alabaster `#EFE8DD`.
     - Kanan: `LiveStatusTag` (`compact`, `surfaceTone="overlayDesktop"`) teks bersih tanpa kotak pembungkus dengan indikator lingkaran halus (`w-2 h-2 rounded-full`).
   - **Full-Bleed Top-Right Hero & Organic Curve Mask:**
     - Wrapper `relative w-full overflow-hidden`.
     - Kiri: eyebrow kecil bersih, `h1` `Instrument Serif` tegas (`text-4xl sm:text-5xl lg:text-[62px] leading-[1.06] tracking-tight`), baris kedua *italic* Terracotta, subjudul ringkas, dan tombol CTA kapsul penuh (`rounded-full px-7 py-3.5 bg-terracotta text-surface`) dengan ikon panah melingkar putih (tanpa grid metadata datar 3-kolom di bawah CTA).
     - Kanan (Desktop `lg:`): foto utama menempel penuh ke sisi kanan dan atas layar (`lg:w-[54%] lg:min-h-[620px]`) dengan lengkungan organik kiri (`lg:rounded-bl-[180px] lg:rounded-br-none`) menyatu di belakang navbar transparan + kartu mengambang `Jam operasional hari ini` menembus garis batas kiri foto (`lg:-left-10 lg:top-28 shadow-xl bg-[#F7F3EC] rounded-2xl`). Pada mobile (`< lg`): foto tampil di bawah CTA (`h-[280px] rounded-3xl rounded-b-[40px]`).
   - **Floating Horizontal Capsule Dock (`#layanan`, Above the Fold):**
     - Menjembatani dan menindih batas bawah foto hero (`-mt-8 mx-4 sm:mx-6 lg:-mt-12 lg:max-w-5xl lg:mx-auto`), berbentuk kapsul di desktop (`lg:rounded-full`) dan `rounded-3xl grid-cols-1 sm:grid-cols-2` di mobile (`bg-[#F7F3EC] shadow-[0_20px_50px_-12px_rgba(48,56,65,0.14)]`).
     - Berisi 4 segmen bersih: (1) Toggle `Haircut (Rp 30k–40k)` & `Hair Chemicals (Rp 250k)` yang sinkron ke `selectedServiceId` (plus baris rincian varian ringkas tepat di bawah dock), (2) `Jam buka` hari ini (`tabular-nums`), (3) `Location` (`Jalan Raya Sungai Kunyit, Gang Tani` klikabel Google Maps), dan (4) Tombol CTA kapsul Terracotta `Pilih Jadwal →`.
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
