---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), Floating Segmented Booking Bar, Horizontal Date Scrubber, Live Booking Preview, lazy-load embed sosmed full-bleed, kalkulator slot real-time, redirect WhatsApp, dan Smart Ticket (/tiket/[code]).
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan bergaya **Soft-Editorial** (palet 60–30–10 **Warm Alabaster `#EFE8DD`**, **Soft Ivory `#F7F3EC`**, **Deep Slate Charcoal `#303841`**, & **Burnt Terracotta `#C25934`**) yang instan, tanpa login, dan paritas penuh Android/iOS (`100dvh`, `env(safe-area-inset-*)`, touch target minimal `44x44px`, input `>= 16px` / `text-base`).
- Mengimplementasikan kalkulator slot real-time, sinkronisasi Supabase Realtime, dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (v1.2 — Soft-Editorial Warm Alabaster)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"` dengan fallback aman ke `DEFAULT_*` (`src/lib/seed.ts`) dan `defaultGalleryItems` (`src/config/media.ts`) ketika env Supabase belum aktif.
   - **Hero Asimetris Soft-Editorial:** Kanvas `bg-alabaster text-ink` tanpa *pill badge* `rounded-full` (indeks `00 / STUDIO SATU KURSI · SUNGAI KUNYIT`, `Syne` + `Instrument Serif italic`), foto hero WebP `aspect-[4/5] rounded-2xl overflow-hidden shadow-lg` tanpa bingkai kotak/corner-bracket kaku dengan scrim bawah `from-[#1E2329]/90 via-[#303841]/55 to-transparent` dan teks `#F7F3EC`, `HairSalonJsonLd`, dan `LiveStatusTag` (`reason={liveStatus.reason}`).
   - **Floating Segmented Booking Bar (`rounded-2xl`):** Melayang di batas bawah hero (`-mt-8 lg:-mt-12`) dengan baris tab pilihan cepat layanan (`Haircut ~45m` | `Hair Chemicals ~2j`, `rounded-xl`), segmen adaptif desktop horizontal (`lg:grid-cols-12`) dan mobile maksimal 2 kolom/baris (`grid-cols-2 gap-2.5`) berkontrol `min-h-[48px]` + input `text-base`, terhubung real-time ke state booking (membuka modal pra-booking langsung jika 4 langkah lengkap atau scroll ke `#reservasi`).
   - **Katalog Layanan Editorial (`#layanan`):** Kartu `rounded-2xl border border-hairline bg-surface` asimetris (`Haircut ~45 Menit · 1 Blok` 30k/35k/40k dan `Hair Chemicals ~2 Jam · 2 Blok` 250k).
   - **Alur Booking 4 Langkah (`#reservasi`):**
     - Header Section 02 meneruskan `reason={liveStatus.reason}` ke `LiveStatusTag`.
     - **Horizontal Date Scrubber (`Langkah 02`):** Strip kalender swipeable (`snap-x snap-mandatory no-scrollbar`), item `rounded-xl min-h-[60px] min-w-[78px]`, tanggal aktif `bg-terracotta text-surface`.
     - **Grid Jam 1-Jam (`Langkah 03`):** Tombol `rounded-xl min-h-[54px]`, slot terpilih `bg-terracotta text-surface`.
     - **Live Booking Preview (`Langkah 04`):** Panel sticky kanan `rounded-2xl` dengan checklist progres vertikal 4 titik real-time (Layanan + blok sistem + harga, Tanggal, Jam Kursi, Nama Pelanggan), input nama (`text-base`), *honeypot* tersembunyi `website` (`tabIndex={-1}`), aturan keterlambatan 15 menit, dan modal konfirmasi pra-booking (`rounded-2xl`) sebelum penguncian slot DB & kartu tiket `MDZ-XXXX`.
   - **Footer Arsitektural Gelap (`bg-ink text-surface`):** Blok Deep Slate Charcoal `#303841` dengan lockup `BrandMark` di wadah `bg-surface`, teks `#F7F3EC`, aksen `#C25934`, jadwal operasional, Google Maps, dan tautan `/admin`.
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
   - Kartu foto WebP (`aspect-[4/5]`) dan facade video TikTok/Instagram Reels (`aspect-[9/16]`) tampil sebagai **media cards full-bleed `rounded-2xl overflow-hidden`** tanpa kompartemen header/footer ber-border kotak.
   - Indeks/kategori, judul, dan caption diletakkan di atas gradasi scrim gelap bawah (`from-[#1E2329]/90 via-[#303841]/55 to-transparent`) dengan teks `#F7F3EC`, serta tombol **Putar Video** `#C25934` (`bg-terracotta`) berteks `#F7F3EC`.
   - Lazy-load klik-untuk-memuat tetap memvalidasi `validateSocialEmbedUrl` sebelum merender `<iframe>` sandbox atau tautan eksternal.

5. **Smart Ticket (`/tiket/[code]` — `src/app/tiket/[code]/page.tsx` & `src/components/ticket/SmartTicketView.tsx`):**
   - `generateMetadata` dinamis untuk Open Graph preview WhatsApp, verifikasi sesi admin server-side (`supabase.auth.getUser()`), lookup RPC `get_booking_by_ticket_code`, Realtime update `bookings`, serta fallback `sessionStorage`.
   - Tampilan kartu `rounded-2xl` dan kontrol `rounded-xl` berpalet Warm Alabaster / Soft Ivory / Burnt Terracotta / `#2E6F56` / `#B83B3B` untuk mode publik (`MDZ-XXXX`, aturan 15 menit, Google Maps) maupun Panel Kontrol Cepat Kasir (**Reschedule 2-Tap**, **Tandai Selesai**, **Batalkan Booking**).

## 3. Protokol Laporan & Pembaruan Skill
- Setiap perubahan pada format pesan WA, logika kalkulator slot, struktur komponen *embed*, atau pola UI pelanggan wajib dicatat ke `SKILL.md` ini sebelum disetor ke `madzhair-coordinator`.
