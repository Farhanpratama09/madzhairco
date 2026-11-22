---
name: madzhair-customer
description: Pengembang halaman publik Madzhair.co (/), Poppins UI + Hero Instrument Serif, Option B Mobile Hero + Crisp S-Curve Desktop, Floating Pill 3 Segmen + Dropdown Pricelist, Galeri & Reels murni visual, Kalender Slide 21 Hari + Status 0-Slot + Input WA Privat + Vertical Stepper, Footer 3 Kolom, kalkulator slot real-time (break time & early close), redirect WhatsApp, dan Smart Ticket (/tiket/[code]) dengan deteksi perubahan jadwal otomatis.
---

# Skill: Divisi Customer & Smart Ticket (`madzhair-customer`)

## 1. Tanggung Jawab Utama
- Membangun pengalaman pelanggan bergaya **Soft-Editorial Minimalist (v1.9)** (palet 60–30–10 **Warm Alabaster `#EFE8DD`**, **Soft Ivory `#F7F3EC`**, **Deep Slate Charcoal `#303841`**, & **Burnt Terracotta `#C25934`**) dengan Google Font **`Poppins`** (`tabular-nums`) untuk seluruh teks UI, tombol, deskripsi, dan angka serta `Instrument Serif` (+ *italic*) khusus judul utama Hero.
- Menggunakan label lokasi UI **`Sungai Kunyit, Kalimantan Barat (WIB)`** sambil mempertahankan IANA timezone **`Asia/Pontianak`** untuk seluruh kalkulasi waktu backend/frontend/SQL.
- Mengimplementasikan kalkulator slot real-time (termasuk jam istirahat & tutup lebih awal), auto-complete sebelum render, input WA pelanggan privat (tanpa akun/login), dan halaman **Link Tiket Pintar (`/tiket/[code]`)**.

## 2. Spesifikasi Fitur & Implementasi (v1.9)
1. **Halaman Utama (`src/app/page.tsx` & `src/components/customer/BookingExperience.tsx`):**
   - `export const dynamic = "force-dynamic"`; menjalankan `auto_complete_overdue_bookings()` secara berurutan **sebelum** membaca `get_public_bookings_for_date` agar slot selesai langsung bebas.
   - **Navbar Atas 3-Kolom:** Logo `Madzhair.co`, tautan `Layanan`, `Galeri`, `Reservasi`, `Lokasi`, dan status dinamis Asia/Pontianak (`Sedang buka` / `Booking tersedia` / `Tutup hari ini`) berikon kalender.
   - **Hero (Opsi B Mobile + Crisp S-Curve Desktop):** Foto disembunyikan di mobile (`hidden lg:block`), tanpa eyebrow duplikat, Floating Pill Dock 3 Segmen `mt-8 lg:-mt-12`.
   - **Area Reservasi (`#reservasi`):**
     - Label pilihan jam: **`Pilih jam · Sungai Kunyit, Kalimantan Barat (WIB)`**.
     - **Status 0 Slot Tersedia:** Bila `availableSlotCount === 0`, sembunyikan grid kotak jam abu-abu/terisi/lewat + legenda dan tampilkan 1 kartu bersih (`Jadwal hari ini sudah penuh` / `Jam operasional hari ini sudah selesai` / `Slot 2 jam hari ini tidak tersisa`) + tombol pintas **`Pilih Jadwal Berikutnya ->`** yang melompat ke hari buka terdekat yang masih tersedia.
     - **Jam Istirahat & Tutup Lebih Awal:** Mendukung status slot `BREAK` (`Istirahat`) dan `INSUFFICIENT_TIME` (termasuk layanan 2 jam yang menabrak `break_start` atau `close_from_time`).
     - **Input Nomor WhatsApp Wajib (Zero-Registration):** Input `type="tel"`, `inputMode="tel"`, `text-base` (>= 16px) di bawah Nama Anda; normalisasi otomatis `+62`/`62`/`08`/`6208`/`8xx` -> `628xx` dan validasi `^62[1-9][0-9]{7,12}$`. Disimpan atomik ke tabel privat `public.booking_contacts` via `create_booking_safe` (nol akses `anon`).
   - **Footer Minimalis 3 Kolom:** Memuat `Sungai Kunyit, Kalimantan Barat (WIB)`, jam buka live (termasuk status tutup lebih awal), alamat, dan 3 tautan (`Google Maps`, `WhatsApp`, `Instagram`) tanpa tautan `/admin`.

2. **Galeri & Reels Murni Visual (`src/components/customer/SocialGalleryFacade.tsx`):**
   - Panel kiri khusus **Instagram Reels** (lazy iframe), panel kanan **Carousel 4 Foto** dengan transisi `translate3d` mulus.

3. **Route Handler Booking & Best-Effort Push (`src/app/api/bookings/route.ts`):**
   - Rate limiter, *honeypot*, sanitasi nama, validasi `normalizeWhatsappPhone`, RPC `create_booking_safe(..., p_customer_phone)`, dan pemicu Web Push instan *best-effort* (`try/catch`, tidak pernah menggagalkan `201 Created`).

4. **Smart Ticket (`/tiket/[code]` — `src/app/tiket/[code]/page.tsx` & `src/components/ticket/SmartTicketView.tsx`):**
   - Menjalankan `auto_complete_overdue_bookings()` sebelum memuat tiket.
   - Mode publik **100% bebas `customer_phone`** (tidak ada di HTML maupun RSC payload), menampilkan badge otomatis tanpa login: **`Jadwal Diperbarui`** (beserta perbandingan **Jadwal Sebelumnya** vs **Jadwal Baru**), **`Jadwal Dibatalkan`**, **`Sesi Selesai`**, atau **`Terjadwal`** tanpa titik bulat dekoratif.
   - Mode admin terautentikasi menampilkan tombol 1-Tap **`Kirim Info ke WA Pelanggan`** setelah menggeser/membatalkan jadwal yang memiliki kontak di `booking_contacts`.

## 3. Protokol Laporan & Pembaruan Skill
- Setiap perubahan pada UI pelanggan, copywriting, galeri, atau Smart Ticket wajib dicatat ke `SKILL.md` ini sebelum disetor ke `madzhair-coordinator`.
