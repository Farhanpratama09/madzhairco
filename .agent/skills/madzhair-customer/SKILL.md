---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), Poppins UI + Hero Instrument Serif, Crisp S-Curve tanpa kabut, Floating Pill 3 Segmen + Dropdown Pricelist, Galeri & Reels murni visual (Instagram Reels + smooth translateX 4-Foto Carousel), Kalender Slide 21 Hari + Legenda Ikon Kursi + Vertical Stepper, Footer 3 Kolom, kalkulator slot real-time, redirect WhatsApp, dan Smart Ticket (/tiket/[code]).
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan bergaya **Soft-Editorial Editorial Minimalist (v1.7)** (palet 60–30–10 **Warm Alabaster `#EFE8DD`**, **Soft Ivory `#F7F3EC`**, **Deep Slate Charcoal `#303841`**, & **Burnt Terracotta `#C25934`**) dengan Google Font **`Poppins`** (`tabular-nums`) untuk seluruh teks UI, tombol, deskripsi, dan angka serta `Instrument Serif` (+ *italic*) khusus judul utama Hero.
- Mengimplementasikan kalkulator slot real-time, sinkronisasi Supabase Realtime, dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (v1.7 — Finalisasi UI/UX & Copywriting)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"` dengan fallback aman ke `DEFAULT_*` (`src/lib/seed.ts`) dan `defaultGalleryItems` (`src/config/media.ts`).
   - **Navbar Atas 3-Kolom (`md:grid-cols-[1fr_auto_1fr]`):**
     - Kiri: `BrandMark` (`Madzhair.co`).
     - Tengah (`hidden md:flex`): tautan `Layanan`, `Galeri`, `Reservasi`, `Lokasi`.
     - Kanan: ikon kalender/jam + **"Booking tersedia"** berlatar lembut transparan (`bg-[#F7F3EC]/90 backdrop-blur-sm px-3.5 py-1.5 rounded-full`) agar selalu tajam di atas foto gelap.
   - **Hero Kiri & Kanan (Crisp S-Curve Tanpa Kabut Silau):**
     - Copywriting lugas: Eyebrow `Madzhair Barber & Co`, Judul `Atur Jadwal Cukur, Datang Tanpa Antre.` (`Instrument Serif` + *italic* Terracotta), Subjudul `Pilih layanan dan jam yang tersedia, kunci jadwalmu, lalu konfirmasi lewat WhatsApp.`, dan 1 tombol CTA Terracotta `Pilih Jadwal`.
     - Kanan: lengkungan S-curve solid `#EFE8DD` yang tajam dan bersih tanpa kabut putih silau dan tanpa kotak putih mengambang.
   - **Floating Pill Dock 3 Segmen + Dropdown Pricelist (`#layanan`):**
     - Padding lega (`px-6 py-4 sm:px-8 sm:py-5`), `bg-[#F7F3EC]`, `rounded-3xl lg:rounded-full`.
     - (1) **Layanan & tarif** dropdown interaktif lengkap (`Haircut`: Kids `Rp 30k`, Longtrim & Regular `Rp 35k`, Fade & Taper `Rp 40k`; `Hair Chemicals`: `Rp 250k`) — memilih sub-layanan Haircut mana pun menyinkronkan pilihan layanan sebagai `Haircut` di `#reservasi`; (2) **Jam operasional**; (3) **Location** (`Jl. Raya Sungai Kunyit, Gg. Tani` ke Google Maps).
   - **Area Reservasi (`#reservasi`):**
     - Judul `Pilih Jadwal` dengan subjudul `Pilih tanggal, layanan, dan jam yang tersedia.`
     - Strip tanggal 21 hari + tanggal aktif lengkap di kanan atas + tombol panah `< >`.
     - Kartu layanan menampilkan durasi saja (`~45 menit` untuk Haircut, `~2 jam` untuk Hair Chemicals).
     - Legenda status memakai **ikon kursi (`Armchair`)** untuk `Tersedia`, `Terisi`, dan `Dipilih`.
     - **Live Booking Preview (Vertical Stepper):** Jam kursi terpilih menggunakan warna `#303841` (`text-ink`), catatan keterlambatan `Toleransi keterlambatan maksimal 15 menit. Konfirmasi dikirim langsung ke WhatsApp.`, tanpa tombol lokasi.
   - **Footer Minimalis 3 Kolom (`rounded-t-[32px] bg-[#303841] text-[#F7F3EC]`):**
     - Kiri: HANYA Logo `Madzhair.co` (`tone="onDark"`).
     - Tengah: `Jam operasional`, `Sungai Kunyit, Kalimantan Barat`, dan jam buka live.
     - Kanan: `Jl. Raya Sungai Kunyit, Gang Tani` + 3 tautan bersih (`Google Maps`, `WhatsApp`, `Instagram`), tanpa tautan `/admin`.

2. **Galeri & Reels Murni Visual (`src/components/customer/SocialGalleryFacade.tsx`):**
   - Judul `Galeri & Reels` tanpa teks pengantar dan tanpa teks overlay di atas foto/video.
   - 2 panel seimbang `aspect-[4/5]` (`md:grid-cols-2`):
     - **Panel Kiri (Khusus Instagram Reels):** Fokus Instagram Reels (tanpa TikTok), tombol Play di tengah (lazy iframe), panah `< >`, swipe sentuh, dan dot pagination.
     - **Panel Kanan (Carousel 4 Foto):** Transisi CSS `translate3d` (`duration-500 ease-out`) mulus tanpa bug patah/jitter, panah `< >`, swipe sentuh, dan dot pagination.

3. **Route Handler Booking & Redirect WhatsApp:**
   - Tidak diubah: Rate limiter, *honeypot*, sanitasi nama, RPC `create_booking_safe`, serta redirect WhatsApp instan.

4. **Smart Ticket (`/tiket/[code]` — `src/app/tiket/[code]/page.tsx` & `src/components/ticket/SmartTicketView.tsx`):**
   - Logika & keamanan server-verified admin tetap utuh; seluruh teks, heading, tanggal, jam, dan kode `MDZ-XXXX` menggunakan Google Font `Poppins` (`tabular-nums`) tanpa `JetBrains Mono`.

## 3. Protokol Laporan & Pembaruan Skill
- Setiap perubahan pada UI pelanggan, copywriting, galeri, atau tipografi Smart Ticket wajib dicatat ke `SKILL.md` ini sebelum disetor ke `madzhair-coordinator`.
