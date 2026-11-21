---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), Floating Info & Pricelist Dock, Galeri 4 Foto + 2 Reels swipeable mobile, Area Reservasi Cinema Seat Map, Live Booking Preview, lazy-load embed sosmed, kalkulator slot real-time, redirect WhatsApp, dan Smart Ticket (/tiket/[code]).
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan bergaya **Soft-Editorial Mobile-Minimalist** (palet 60–30–10 **Warm Alabaster `#EFE8DD`**, **Soft Ivory `#F7F3EC`**, **Deep Slate Charcoal `#303841`**, & **Burnt Terracotta `#C25934`**) yang instan, tanpa login, dan paritas penuh Android/iOS (`100dvh`, `env(safe-area-inset-*)`, touch target minimal `44x44px`, input `>= 16px` / `text-base`).
- Mengimplementasikan kalkulator slot real-time, sinkronisasi Supabase Realtime, dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (v1.3 — Minimalist Mobile-First)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"` dengan fallback aman ke `DEFAULT_*` (`src/lib/seed.ts`) dan `defaultGalleryItems` (`src/config/media.ts`) ketika env Supabase belum aktif.
   - **Navbar Atas Minimalis + Mobile Sub-Nav:**
     - Kiri: `BrandMark` (`variant="compact"` di `< sm`, `variant="full"` di `sm:`).
     - Tengah (`hidden md:flex items-center gap-6`): 4 tautan navigasi ringkas `Layanan` (`#layanan`), `Galeri` (`#galeri`), `Reservasi` (`#reservasi`), `Lokasi` (`#lokasi`) berukuran `min-h-[44px]`.
     - Kanan: `LiveStatusTag` (`compact`).
     - Sub-nav mobile (`md:hidden grid grid-cols-4 border-t border-hairline/70`): strip 4 tautan (`min-h-[44px]`) langsung di bawah bar utama tanpa menumpuk.
   - **Hero Minimalis Soft-Editorial:** Kanvas `bg-alabaster text-ink` tanpa *pill badge* `rounded-full` (indeks `00 / STUDIO SATU KURSI · SUNGAI KUNYIT`, `h1` `text-[28px] leading-[1.15] font-extrabold sm:text-4xl lg:text-5xl` dengan `Syne` + `Instrument Serif italic`), intro ringkas `text-sm sm:text-base`, tombol CTA + Google Maps, metadata studio ringkas, foto hero WebP `aspect-[4/5] rounded-2xl` borderless di kanan dengan scrim bawah `from-[#1E2329]/90 via-[#303841]/55 to-transparent`, dan `HairSalonJsonLd`.
   - **Floating Info & Pricelist Dock (`#layanan`, `rounded-[28px]`):**
     - Menggantikan form booking ganda di batas bawah hero (`-mt-8 lg:-mt-12`) serta menghapus section katalog layanan ganda yang panjang.
     - Berisi 4 segmen terstruktur:
       (a) **Layanan & Pricelist Interaktif:** Tab `Haircut` (`Rp 30k – 40k`) & `Hair Chemicals` (`Rp 250k`) (`rounded-xl min-h-[48px]`) yang langsung menyinkronkan `selectedServiceId`, plus daftar varian & info durasi blok layanan aktif.
       (b) **Jadwal Operasional Hari Ini:** Menampilkan jam buka/tutup hari ini (`12:00 – 21:00 WIB` / info libur) dan status live ringkas.
       (c) **Location:** `Jalan Raya Sungai Kunyit, Gang Tani` klikabel menuju `settings.google_maps_url` (`min-h-[44px]`).
       (d) **CTA Terracotta `Pilih Jadwal`:** `bg-terracotta text-surface rounded-xl min-h-[48px]` untuk *smooth scroll* ke `#reservasi`.
   - **Urutan `<main>`:** Hero → `<BookingExperience ... gallerySection={<SocialGalleryFacade items={galleryItems} />} />` → Footer (`id="lokasi"` `scroll-mt-24`).
   - **Area Reservasi (`#reservasi` — Adaptasi Cinema Seat Map):**
     - Header Section `03` meneruskan `reason={liveStatus.reason}` ke `LiveStatusTag` (`compact`), tanpa bar progres kotak ganda di atas form.
     - **Strip Tanggal Horizontal:** Swipeable (`snap-x snap-mandatory no-scrollbar`), item `rounded-xl min-h-[58px] min-w-[74px]`, tanggal aktif `bg-terracotta text-surface`.
     - **Pilihan Layanan Ringkas:** Sinkron dua arah dengan tab layanan di Floating Dock (`Haircut` / `Hair Chemicals`, `rounded-xl`).
     - **Grid Slot Jam 1-Jam Minimalis:** Tombol `rounded-xl min-h-[52px]`, legenda status (`Tersedia`, `Terisi`, `Dipilih`), slot terpilih `bg-terracotta text-surface`.
     - **Live Booking Preview + Input Nama:** Panel sticky kanan `rounded-2xl` (di bawah slot pada mobile) menampilkan ringkasan `text-sm` (Layanan, Tanggal, Jam Kursi, Nama), input Nama (`text-base >= 16px`), *honeypot* tersembunyi `website` (`tabIndex={-1}`), aturan keterlambatan 15 menit, tombol `Review & Konfirmasi Booking`, modal pra-booking (`rounded-2xl`), kartu konfirmasi `MDZ-XXXX`, serta auto-redirect WhatsApp instan.
   - **Footer Arsitektural Gelap (`id="lokasi"`, `scroll-mt-24`, `bg-ink text-surface`):** Blok Deep Slate Charcoal `#303841` dengan lockup `BrandMark` di wadah `bg-surface`, alamat studio, Google Maps, jadwal operasional mingguan, dan tautan `/admin`.
   - Sinkronisasi **Supabase Realtime** (`madzhair-customer-realtime`) memantau `bookings`, `store_settings`, `weekly_schedules`, `closed_dates`, dan `services`.

2. **Route Handler Booking Publik (`src/app/api/bookings/route.ts`):**
   - Rate limiter via `extractClientIp(request.headers)` + `checkBookingRateLimit(ip)` (`429` + `Retry-After`), cek `checkHoneypot(body.website)`, validasi `sanitizeCustomerName` (`2–40` karakter), `YYYY-MM-DD`, dan `validateServiceTimeFormat`.
   - Memanggil `supabase.rpc('create_booking_safe', ...)` pada mode Supabase atau fallback `DEFAULT_*` + `generateDemoTicketCode()` pada mode Demo Lokal.

3. **Alur Redirect WhatsApp & Penyimpanan Demo:**
   - Setelah `POST /api/bookings` berhasil, tiket disimpan ke `sessionStorage` (`madzhair_ticket_<CODE>` & `madzhair_demo_bookings`) dan langsung diarahkan ke `https://wa.me/<whatsapp_number>?text=<encoded_text>` tanpa delay buatan:
     ```text
     Halo Madzhair Barber & Co, saya konfirmasi booking:
     • Kode: MDZ-XXXX
     • Nama: [Nama]
     • Layanan: [Layanan]
     • Jadwal: [Hari, Tanggal] pukul [Jam]

     Detail tiket: https://[domain]/tiket/MDZ-XXXX
     ```

4. **Lookbook Full-Bleed & Zero-Bandwidth Social Media Embed (`src/components/customer/SocialGalleryFacade.tsx`):**
   - Merender **4 Sample Foto (`aspect-[4/5]`, `rounded-2xl`)** dan **2 Sample Video Embed TikTok/Instagram Reels (`aspect-[9/16]`, `rounded-2xl`)**; otomatis melengkapi dari `defaultGalleryItems` (skip duplikat `media_url`) jika data DB aktif memiliki kurang dari 4 foto atau 2 reels.
   - Pada mobile (`< md`), foto (`w-[66vw] max-w-[260px] shrink-0 snap-start`) dan reels (`w-[62vw] max-w-[240px] shrink-0 snap-start`) memakai *horizontal swipe* (`flex gap-3.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2`); pada `md:`/`lg:` menggunakan grid 4 kolom foto (`md:grid-cols-2 lg:grid-cols-4`) dan 2 kolom reels (`md:grid-cols-2 max-w-4xl`).
   - Teks kartu `text-sm` & judul `text-base sm:text-lg` diletakkan di atas scrim gelap bawah (`from-[#1E2329]/90 via-[#303841]/55 to-transparent`) dengan tombol **Putar Video** `#C25934` (`bg-terracotta`) berteks `#F7F3EC`.
   - Lazy-load klik-untuk-memuat tetap memvalidasi `validateSocialEmbedUrl` sebelum merender `<iframe>` sandbox atau tautan eksternal.

5. **Smart Ticket (`/tiket/[code]` — `src/app/tiket/[code]/page.tsx` & `src/components/ticket/SmartTicketView.tsx`):**
   - `generateMetadata` dinamis untuk Open Graph preview WhatsApp, verifikasi sesi admin server-side (`supabase.auth.getUser()`), lookup RPC `get_booking_by_ticket_code`, Realtime update `bookings`, serta fallback `sessionStorage`.
   - Tampilan kartu `rounded-2xl` dan kontrol `rounded-xl` berpalet Warm Alabaster / Soft Ivory / Burnt Terracotta / `#2E6F56` / `#B83B3B` untuk mode publik (`MDZ-XXXX`, aturan 15 menit, Google Maps) maupun Panel Kontrol Cepat Kasir (**Reschedule 2-Tap**, **Tandai Selesai**, **Batalkan Booking**).

## 3. Protokol Laporan & Pembaruan Skill
- Setiap perubahan pada format pesan WA, logika kalkulator slot, struktur komponen *embed*, atau pola UI pelanggan wajib dicatat ke `SKILL.md` ini sebelum disetor ke `madzhair-coordinator`.
