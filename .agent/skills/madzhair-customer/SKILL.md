---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), kalkulator slot real-time, redirect WhatsApp, lazy-load embed sosmed, dan halaman Smart Ticket (/tiket/[code]).
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan yang instan, tanpa login, dan ringan di koneksi seluler Android/iOS (`100dvh`, `env(safe-area-inset-*)`, touch target minimal `44x44px`, input `>= 16px`).
- Mengimplementasikan logika kalkulator slot real-time, sinkronisasi Supabase Realtime, dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (Wave 3B)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"` dengan fallback aman ke `DEFAULT_*` (`src/lib/seed.ts`) dan `defaultGalleryItems` (`src/config/media.ts`) ketika env Supabase belum aktif.
   - Hero editorial maskulin tanpa *pill badge* `rounded-full` (indeks `00 / STUDIO`, `Syne` + `Instrument Serif italic`, foto WebP `aspect-[4/5]`), `HairSalonJsonLd`, `LiveStatusTag` live, dan footer lokasi (`Jalan Raya Sungai Kunyit, Gang Tani`, link Google Maps, serta tautan halus `/admin`).
   - Katalog layanan editorial asimetris:
     - **Haircut** (`~45 Menit · 1 Blok`): `Kids` 30k · `Longtrim & Regular` 35k · `Fade & Taper` 40k.
     - **Hair Chemicals** (`~2 Jam · 2 Blok`): `Downperm / Wavyperm / Designperm` 250k.
   - Alur booking 4 langkah: `01 Layanan` → `02 Tanggal` (`getTodayAndUpcomingDates`) → `03 Jam` (`calculateAvailableSlots` grid 1 jam) → `04 Nama Pelanggan` + *honeypot* tersembunyi `website` (`tabIndex={-1}`).
   - Sinkronisasi **Supabase Realtime** (`madzhair-customer-realtime`) memantau `bookings`, `store_settings`, `weekly_schedules`, `closed_dates`, dan `services` agar slot dan status Buka/Tutup Live langsung terbarui tanpa refresh.

2. **Route Handler Booking Publik (`src/app/api/bookings/route.ts`):**
   - Rate limiter via `extractClientIp(request.headers)` + `checkBookingRateLimit(ip)` (mengembalikan `429` + `{ error, retryAfterSeconds }` + header `Retry-After`).
   - Cek `checkHoneypot(body.website)` (mengembalikan `200` *silent fake success* tanpa menulis ke database).
   - Validasi & sanitasi `customerName` via `sanitizeCustomerName` (`2–40` karakter), validasi tanggal `YYYY-MM-DD`, serta `validateServiceTimeFormat` (grid bulat 1 jam).
   - Mode Supabase: memanggil `supabase.rpc('create_booking_safe', { p_service_id, p_customer_name, p_booking_date, p_start_time, p_source: 'ONLINE' })` dan memetakan error (`SLOT_UNAVAILABLE` → `409`, `OUTSIDE_OPERATING_HOURS`/`STORE_CLOSED`/`DATE_CLOSED`/`PAST_DATE`/`SLOT_LEAD_TIME_EXPIRED` → `400`).
   - Mode Demo Lokal (env belum terpasang): memvalidasi slot dengan `DEFAULT_*` + `calculateAvailableSlots`, menghasilkan kode `MDZ-XXXX` via `generateDemoTicketCode()`, dan mengembalikan `201 { booking, mode: 'demo' }`.

3. **Alur Redirect WhatsApp & Penyimpanan Demo:**
   - Setelah `POST /api/bookings` berhasil, tiket disimpan ke `sessionStorage` (`madzhair_ticket_<CODE>` & `madzhair_demo_bookings`) agar mode demo lokal tetap lengkap di `/tiket/[code]`.
   - Mengarahkan otomatis (beserta tombol fallback manual) ke `https://wa.me/<whatsapp_number>?text=<encoded_text>` dengan format baku:
     ```text
     Halo Madzhair Barber & Co, saya konfirmasi booking:
     • Kode: MDZ-XXXX
     • Nama: [Nama]
     • Layanan: [Layanan]
     • Jadwal: [Hari, Tanggal] pukul [Jam]

     Detail tiket: https://[domain]/tiket/MDZ-XXXX
     ```

4. **Zero-Bandwidth Social Media Embed (`src/components/customer/SocialGalleryFacade.tsx`):**
   - Foto studio WebP (`aspect-[4/5]`) dalam komposisi grid editorial asimetris.
   - Kartu video TikTok & Instagram Reels (`aspect-[9/16]`) memakai **Facade / Lazy-Load** klik-untuk-memuat dengan nol script pihak ketiga saat render awal, serta wajib lolos `validateSocialEmbedUrl` (`https://` pada domain whitelist `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`, `www.instagram.com`) sebelum merender `<iframe>` sandbox atau tautan eksternal.

5. **Smart Ticket (`/tiket/[code]` — `src/app/tiket/[code]/page.tsx` & `src/components/ticket/SmartTicketView.tsx`):**
   - `generateMetadata` dinamis untuk Open Graph preview WhatsApp (`Tiket Reservasi ${code} — Madzhair Barber & Co`).
   - Verifikasi sesi admin di Server Component via `await supabase.auth.getUser()` (`isAdminAuthenticated`), lookup tiket via `get_booking_by_ticket_code`, serta fallback `sessionStorage` pada mode demo lokal.
   - **Mode Publik:** Kartu bukti resmi (`MDZ-XXXX` `tabular-nums`, nama, layanan, tanggal & jam, status `BOOKED`/`COMPLETED`/`CANCELLED`), kotak aturan keterlambatan 15 menit, dan tombol Google Maps.
   - **Mode Admin Terautentikasi:** Panel Kontrol Cepat di bawah kartu tiket untuk **Reschedule 2-Tap** (`PATCH /api/admin/bookings/${id}` dengan `{ action: 'reschedule', newStartTime }`), **Tandai Selesai** (`{ action: 'complete' }`), dan **Batalkan Booking** (`{ action: 'cancel' }`).

## 3. Protokol Laporan & Pembaruan Skill
- Setiap perubahan pada format pesan WA, logika kalkulator slot, atau struktur komponen *embed* wajib dicatat ke `SKILL.md` ini sebelum disetor ke `madzhair-coordinator`.
