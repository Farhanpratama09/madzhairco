---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Soft-Editorial Madzhair Barber & Co (v1.6 Warm Alabaster, Deep S-Curve Edge Feathering, Floating Pill 3 Segmen + Dropdown Pricelist, Side-by-Side Media, Vertical Stepper, Plus Jakarta Sans tabular-nums), penegak standar Anti-AI-Slop, dan paritas tampilan Android serta iOS.
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co (v1.6 — Soft-Editorial Editorial Minimalist)
- **Karakter:** Hangat editorial, modern berkelas, bersih tanpa jargon/kode developer, lembut menyatu dengan kanvas terang hangat (`#EFE8DD`) melalui *S-curve* organik dan *gradient edge feathering*.
- **Palet Warna Baku (Aturan 60–30–10):**
  - **60% — Kanvas Utama (`--color-alabaster`):** `#EFE8DD` (Warm Alabaster).
  - **30% — Permukaan Kartu, Dock & Sheet (`--color-surface`):** `#F7F3EC` (Soft Ivory) dengan garis batas tipis `#DCD4C6` (`--color-hairline`) untuk kartu standar, atau tanpa border dengan soft shadow (`shadow-[0_20px_50px_-14px_rgba(48,56,65,0.13)]`) pada Floating Pill Dock (`rounded-3xl lg:rounded-full`).
  - **Sub-Surface Lembut (`--color-surface-elevated`):** `#E6DDD0` (Warm Sand Tint).
  - **Teks Utama / Heading / Blok Aksen Gelap (`--color-ink`):** `#303841` (Deep Slate Charcoal).
  - **Teks Sekunder (`--color-muted`):** `#5C646D` (Muted Slate).
  - **10% — Aksen Utama (`--color-terracotta`):** `#C25934` (Burnt Terracotta) dengan teks `#F7F3EC`.
  - **Status Semantik:**
    - `--color-emerald-live`: `#2E6F56` (Sedang buka / Tersedia / Selesai)
    - `--color-crimson-alert`: `#B83B3B` (Tutup darurat / Dibatalkan / Hari ini libur)
  - **Overlay Media Galeri Full-Bleed:** Gradasi scrim gelap bawah `from-[#1E2329]/90 via-[#303841]/45 to-transparent` dengan teks `#F7F3EC`.

## 2. Tipografi Seragam, Geometri Organik & Aturan Keras Anti-AI-Slop (v1.6)
1. **Pemetaan Font Ketat (Wajib):**
   - **Judul Besar / Editorial Heading (`h1`, `h2`, judul kartu media):** `Instrument Serif` (`--font-serif`) dengan aksen *italic* (`text-terracotta italic`), ukuran proporsional (`h1`: `text-4xl sm:text-5xl lg:text-[62px] leading-[1.06] tracking-tight`, `h2`: `text-2xl sm:text-3xl lg:text-[34px]`).
   - **Seluruh Teks UI, Jam, Harga, Tanggal & Kode Tiket di `/` & `/tiket/[code]`:** **HENTIKAN penggunaan `JetBrains Mono` (`font-mono`)** di seluruh halaman pelanggan (`/`) dan tiket (`/tiket/[code]`). Wajib gunakan `Plus Jakarta Sans` (`--font-sans`) dengan `tabular-nums` dalam **Sentence Case** untuk teks, jam (`10:00 – 20:00 WIB`), nominal harga (`Rp 30k`), tanggal, dan kode tiket (`MDZ-XXXX`).
   - **Wordmark Logo:** `Syne` (`--font-display`) pada `Madzhair.co` (Sentence Case).
2. **DILARANG — Prefix Angka Developer, Titik Kotak & Link Admin Publik:**
   - Nol prefiks kode (`00 /`, `01 //`, `02 //`, `03 /`), nol titik kotak `rounded-[2px]`, nol kapsul border pada status navbar kanan.
   - Navbar kanan HANYA menampilkan ikon kalender/jam kecil (`CalendarCheck`/`Clock`) + teks bersih **"Booking tersedia"** tanpa jam operasional.
   - Hapus tautan **"Akses Kasir"** dari footer Landing Page agar rute `/admin` terpisah sepenuhnya dari pengunjung publik.
3. **Geometri v1.6 (Deep S-Curve Feathering, 3-Segmen Pill Dropdown, Media Kiri-Kanan & Vertical Stepper):**
   - **Navbar Tengah & Hero Kiri:** Logo di kiri, 4 tautan navigasi bersih (`Layanan`, `Galeri`, `Reservasi`, `Lokasi`) di tengah (`md:grid-cols-[1fr_auto_1fr]`), status `"Booking tersedia"` di kanan. Hero kiri hanya memiliki eyebrow singkat (`Studio cukur satu kursi`), judul besar `Instrument Serif`, subjudul ringkas, dan **1 CTA utama** (`Pilih Jadwal` kapsul Terracotta) tanpa tautan `Lihat Lokasi`.
   - **Hero Kanan & Edge Feathering:** Tanpa kotak putih mengambang di atas foto. Foto hero menggunakan lengkungan organik **S-curve** mendalam di tepi kiri (`lg:`) ditambah **gradient mask / edge feathering** halus di sisi kiri dan bawah agar visual memudar menyatu dengan `#EFE8DD`.
   - **Floating Pill Dock 3 Segmen (`#layanan`):** Padding lega (`px-6 py-4 sm:px-8 sm:py-5`, `bg-[#F7F3EC]`, tanpa tombol `Pilih Jadwal` dan tanpa teks pricelist di luar pill) berisi tepat 3 segmen sejajar: (1) **Layanan & Tarif** dengan dropdown pricelist interaktif lengkap, (2) **Jam Operasional** (satu-satunya tempat menampilkan jam operasional hari ini), dan (3) **Location** klikabel ke Google Maps.
   - **Sesi Media Kiri-Kanan (`#galeri`):** 2 kolom berdampingan di desktop (`lg:grid-cols-12`: kiri `lg:col-span-5` Video Embed lazy-load facade, kanan `lg:col-span-7` Carousel 4 Foto dengan tombol `< >`, swipe mobile, dan dot pagination) dengan tinggi seragam (`h-[430px] sm:h-[490px] lg:h-[520px]`), bertumpuk rapi di mobile.
   - **Area Reservasi (`#reservasi`):** Grid desktop `lg:grid-cols-[minmax(0,1fr)_360px]`; header tanggal lengkap (*Hari, Tanggal Bulan Tahun*) di kanan atas + strip 21 hari dengan tombol geser `< >`; kartu layanan (`Haircut` & `Hair Chemicals`) ber-padding presisi (`p-4 sm:p-5`); **Live Booking Preview** memakai **Vertical Stepper** (4 titik bulat bercentang `✓` terhubung garis vertikal) tanpa tombol Lokasi.
   - **Admin Kasir Minimalis (`/admin`):** Agenda timeline ringkas dengan aksi `Selesai`, `Geser`, `Batal`, `Lihat Tiket` di dalam **Bottom Sheet** saat blok jadwal di-tap.
4. **Placeholder Media Terpusat:** Seluruh aset dikelola via `src/config/media.ts`.

## 3. Standar Paritas Android & iOS
- `color-scheme: light`, `#EFE8DD`, `min-h-[100dvh]`, `overscroll-behavior-y: contain`.
- `pt-safe`, `pb-safe`, `pb-safe-flush`, `px-safe` berbasis `env(safe-area-inset-*)`.
- Touch target minimal `44px x 44px`; input `<input>`/`<select>` minimal `16px` (`text-base`) agar Safari iOS tidak auto-zoom.
- Carousel foto & strip tanggal menggunakan `snap-x snap-mandatory scroll-smooth no-scrollbar` ditambah tombol panah `< >`.

## 4. Protokol Laporan & Pembaruan Skill
- Audit seluruh komponen terhadap aturan nol `font-mono` di `/` & `/tiket/[code]`, nol tautan admin di footer, nol kotak mengambang hero, dan verifikasi viewport desktop + mobile sebelum diserahkan ke `madzhair-coordinator`.
