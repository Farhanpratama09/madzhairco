---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), Split Hero S-Curve Feathering, Floating Pill 3 Segmen + Dropdown Pricelist, Galeri Kiri-Kanan (Video Embed + Carousel 4 Foto Dot Slider), Kalender Slide 21 Hari + Vertical Stepper Live Booking Preview, kalkulator slot real-time, redirect WhatsApp, dan Smart Ticket (/tiket/[code]).
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan bergaya **Soft-Editorial Editorial Minimalist (v1.6)** (palet 60–30–10 **Warm Alabaster `#EFE8DD`**, **Soft Ivory `#F7F3EC`**, **Deep Slate Charcoal `#303841`**, & **Burnt Terracotta `#C25934`**) yang instan, tanpa login, seragam menggunakan `Plus Jakarta Sans` (`tabular-nums`) tanpa `JetBrains Mono`, dan paritas penuh Android/iOS (`100dvh`, `env(safe-area-inset-*)`, touch target minimal `44x44px`, input `>= 16px` / `text-base`).
- Mengimplementasikan kalkulator slot real-time, sinkronisasi Supabase Realtime, dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (v1.6 — Finalisasi UI/UX)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"` dengan fallback aman ke `DEFAULT_*` (`src/lib/seed.ts`) dan `defaultGalleryItems` (`src/config/media.ts`) ketika env Supabase belum aktif.
   - **Navbar Atas 3-Kolom (`md:grid-cols-[1fr_auto_1fr]`):**
     - Kiri: `BrandMark` (`variant="compact"` di `< sm`, `variant="full"` di `sm:`, Sentence Case `Madzhair.co`).
     - Tengah (`hidden md:flex`): tautan bersih `Layanan`, `Galeri`, `Reservasi`, `Lokasi`.
     - Kanan: HANYA ikon kalender/jam kecil (`CalendarCheck` / `Clock`) + teks bersih **"Booking tersedia"** (atau `"Tutup sementara"` saat mode darurat) — tanpa titik kotak, tanpa kapsul border, dan tanpa jam operasional.
   - **Hero Kiri & Kanan (S-Curve + Gradient Edge Feathering):**
     - Kiri: eyebrow singkat (`Studio cukur satu kursi`), `h1` `Instrument Serif` tegas (`text-4xl sm:text-5xl lg:text-[62px] leading-[1.06] tracking-tight`) dengan baris kedua *italic* Terracotta, subjudul ringkas, dan **1 tombol CTA utama** (`Pilih Jadwal` kapsul Terracotta, tanpa tautan `Lihat Lokasi`).
     - Kanan: foto utama tanpa kotak putih mengambang, dibentuk lengkungan organik **S-curve** mendalam di tepi kiri (`lg:`) ditambah **gradient mask / edge feathering** halus di tepi kiri dan bawah agar memudar menyatu dengan `#EFE8DD`.
   - **Floating Pill Dock 3 Segmen + Dropdown Pricelist (`#layanan`):**
     - Padding lega (`px-6 py-4 sm:px-8 sm:py-5`), `bg-[#F7F3EC]`, shadow lembut, `rounded-3xl lg:rounded-full`, tanpa tombol `Pilih Jadwal` dan tanpa teks pricelist kecil di luar pill.
     - 3 segmen sejajar:
       1. **Layanan & Tarif (Dropdown Interaktif):** membuka kartu daftar harga lengkap (**Haircut:** Kids `Rp 30k`, Longtrim & Regular `Rp 35k`, Fade & Taper `Rp 40k`; **Hair Chemicals:** `Rp 250k`). Memilih item langsung menyinkronkan layanan ke `#reservasi`.
       2. **Jam Operasional:** satu-satunya tempat menampilkan jam operasional hari ini (`tabular-nums`).
       3. **Location:** `Jl. Raya Sungai Kunyit, Gg. Tani` dengan ikon `MapPin` langsung menuju Google Maps.
   - **Urutan `<main>`:** Hero → `<BookingExperience ... gallerySection={<SocialGalleryFacade items={galleryItems} />} />` → Footer (`id="lokasi"` `scroll-mt-24`, **tanpa** tautan `"Akses Kasir"`).
   - **Area Reservasi (`#reservasi`):**
     - Grid desktop `lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8` dengan `min-w-0`.
     - **Kalender Slide (21 Hari — batas aman 14–30 hari):** Header menampilkan detail lengkap *Hari, Tanggal Bulan Tahun* aktif di kanan atas (`formatIndonesianDateFull`), diikuti strip tanggal horizontal dengan tombol panah `< >` yang lancar di desktop & mobile.
     - **Kartu Layanan Presisi:** Padding internal lega (`p-4 sm:p-5`) untuk `Haircut` dan `Hair Chemicals` agar nama, tarif, dan durasi presisi di dalam bingkai.
     - **Live Booking Preview (Vertical Stepper):** Alur 4 titik bulat bercentang (`✓`) terhubung garis vertikal (`1. Layanan & tarif`, `2. Tanggal`, `3. Jam kursi`, `4. Nama pemesan`), input Nama (`>= 16px`), *honeypot* `website`, aturan 15 menit, tombol `Review & Konfirmasi Booking`, **tanpa tombol Lokasi** di dalam kartu preview.
   - **Seragam Tipografi (`Plus Jakarta Sans` `tabular-nums`):** Seluruh halaman `/` bebas dari `font-mono` / `JetBrains Mono`.
   - Sinkronisasi **Supabase Realtime** (`madzhair-customer-realtime`) memantau `bookings`, `store_settings`, `weekly_schedules`, `closed_dates`, dan `services`.

2. **Route Handler Booking Publik (`src/app/api/bookings/route.ts`):**
   - Tidak diubah: Rate limiter, *honeypot*, sanitasi nama, validasi format, serta RPC `create_booking_safe` (dengan status `COMPLETED` bebas bentrok) + fallback Demo Lokal.

3. **Alur Redirect WhatsApp & Penyimpanan Demo:**
   - Setelah `POST /api/bookings` berhasil, tiket disimpan ke `sessionStorage` dan langsung diarahkan ke `https://wa.me/<whatsapp_number>?text=<encoded_text>` tanpa delay buatan.

4. **Sesi Media Kiri-Kanan (`src/components/customer/SocialGalleryFacade.tsx`):**
   - 2 sesi berdampingan di desktop (`lg:grid-cols-12`) / bertumpuk rapi di mobile dengan tinggi proporsional identik (`h-[430px] sm:h-[490px] lg:h-[520px]`):
     - **Kiri (`lg:col-span-5`):** Wadah **Video Embed** (`lazy-load facade` TikTok/Instagram Reels) tervalidasi whitelist keamanan + pemilih reel jika > 1 video.
     - **Kanan (`lg:col-span-7`):** **Carousel 4 Foto** dengan tombol geser `< >` (klik desktop & swipe sentuh mobile `snap-x snap-mandatory`) serta **indikator titik (dot pagination)** di bagian bawah.

5. **Smart Ticket (`/tiket/[code]` — `src/app/tiket/[code]/page.tsx` & `src/components/ticket/SmartTicketView.tsx`):**
   - Logika & keamanan server-verified admin tetap utuh; seluruh angka, jam, tanggal, dan kode `MDZ-XXXX` menggunakan `Plus Jakarta Sans` (`tabular-nums`) tanpa `JetBrains Mono`.

## 3. Protokol Laporan & Pembaruan Skill
- Setiap perubahan pada UI pelanggan, media facade, atau tipografi Smart Ticket wajib dicatat ke `SKILL.md` ini sebelum disetor ke `madzhair-coordinator`.
