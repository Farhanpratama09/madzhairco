---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Soft-Editorial Madzhair Barber & Co (v1.8 Warm Alabaster, 100% Poppins UI + Instrument Serif khusus Hero, Option B Mobile Hero + Crisp S-Curve Desktop, Calendar-icon LiveStatusTag dinamis, Floating Pill 3 Segmen Dropdown, Galeri & Reels murni visual, Vertical Stepper, Footer 3 Kolom rounded-t-[32px], dan Admin Kasir minimalis tanpa titik bulat), penegak standar Anti-AI-Slop, dan paritas tampilan Android serta iOS.
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co (v1.8 — Soft-Editorial Minimalist)
- **Karakter:** Hangat editorial, lugas, modern berisi, bersih tanpa kabut silau, tanpa titik bulat dekoratif, maupun jargon/kode developer di atas kanvas terang hangat (`#EFE8DD`).
- **Palet Warna Baku (Aturan 60–30–10):**
  - **60% — Kanvas Utama (`--color-alabaster`):** `#EFE8DD` (Warm Alabaster).
  - **30% — Permukaan Kartu, Dock & Sheet (`--color-surface`):** `#F7F3EC` (Soft Ivory) dengan hairline `#DCD4C6` (`--color-hairline`) pada kartu standar, atau soft shadow (`shadow-[0_20px_50px_-14px_rgba(48,56,65,0.13)]`) pada Floating Pill Dock (`rounded-3xl lg:rounded-full`).
  - **Sub-Surface Lembut (`--color-surface-elevated`):** `#E6DDD0` (Warm Sand Tint).
  - **Teks Utama / Heading / Footer Gelap (`--color-ink`):** `#303841` (Deep Slate Charcoal).
  - **Teks Sekunder (`--color-muted`):** `#5C646D` (Muted Slate).
  - **10% — Aksen Utama (`--color-terracotta`):** `#C25934` (Burnt Terracotta) dengan teks `#F7F3EC`.
  - **Status Semantik:**
    - `--color-crimson-alert`: `#B83B3B` (Tutup hari ini / Tutup darurat / Terisi / Dibatalkan)
    - Pada `/admin` dan `LiveStatusTag`, warna status diselaraskan ke `#303841` (`ink`), `#C25934` (`terracotta`), dan `#B83B3B` (`crimson-alert`) tanpa aksen hijau `emerald-live`.

## 2. Tipografi Poppins + Hero Instrument Serif & Geometri Bersih (v1.8)
1. **Pemetaan Font Ketat (Wajib):**
   - **Judul Utama Hero (`h1` di `/`):** `Instrument Serif` (`--font-serif`, `text-4xl sm:text-5xl lg:text-[62px] leading-[1.06] tracking-tight`) dengan baris kedua *italic* Terracotta — **eksklusif untuk judul utama Hero**.
   - **Seluruh UI, Heading Seksi, Tombol, Deskripsi & Angka (`/`, `/tiket/[code]`, `/admin`, `/admin/login`):** Google Font **`Poppins`** (`--font-sans` via `--font-poppins`, weight `400/500/600/700`) dengan `tabular-nums` untuk jam, tanggal, harga, dan kode tiket `MDZ-XXXX`. Dilarang memakai `JetBrains Mono` (`font-mono`) di seluruh halaman publik maupun admin.
   - **Wordmark Logo:** `Syne` (`--font-display`) pada `Madzhair.co` (mendukung `tone="default"` & `tone="onDark"` untuk footer gelap).
2. **DILARANG — Kabut Silau, Eyebrow Duplikat, Titik Bulat Status, Teks Overlay Media & Link Admin Publik:**
   - Hapus teks eyebrow `Madzhair Barber & Co` di atas judul Hero (tidak duplikat dengan logo Navbar).
   - **Hero Mobile (Opsi B):** Sembunyikan foto Hero di mobile (`hidden lg:block`) agar layar ponsel ringkas menampilkan Navbar → Judul Hero & Tombol `Pilih Jadwal` → Floating Info Dock (`mt-8 lg:-mt-12`), sedangkan layar desktop (`lg:`) tetap menampilkan foto S-curve vektor tajam solid `#EFE8DD` tanpa kabut silau maupun kotak putih mengambang.
   - **Status Dinamis Berikon Kalender (Navbar Kanan & `LiveStatusTag`):** Hapus semua titik bulat (`●` / `animate-ping`); ganti dengan ikon kalender (`CalendarCheck` / `Calendar`) dan teks dinamis Asia/Pontianak: **`Sedang buka`** (dalam jam operasional), **`Booking tersedia`** (di luar jam buka), dan **`Tutup hari ini`** (libur / tutup darurat).
   - Hapus total embel-embel teks (*"privat cukur"*, *"Arsip galeri"*, *"Hemat kuota"*, *"1 blok (60 menit)"*, kata *"kasir"*, serta seluruh teks overlay di atas kartu foto/video galeri).
   - Hapus tautan `/admin` (`"Akses Kasir"`) dari footer Landing Page.
3. **Geometri v1.8:**
   - **Floating Pill Dock 3 Segmen (`#layanan`, `mt-8 lg:-mt-12`):** Padding lega (`px-6 py-4 sm:px-8 sm:py-5`) berisi (1) Dropdown `Layanan & tarif` (sinkron sub-layanan Haircut ke `Haircut` di `#reservasi`), (2) `Jam operasional`, dan (3) `Location` ke Google Maps.
   - **Galeri & Reels (`#galeri`):** Grid 2 panel seimbang (`md:grid-cols-2`, keduanya `aspect-[4/5] rounded-3xl`) murni visual tanpa teks overlay — Kiri **Instagram Reels** (lazy facade Play button + `< >` + dot pagination), Kanan **Carousel 4 Foto** dengan transisi CSS `translate3d` mulus + touch swipe + `< >` + dot pagination.
   - **Area Reservasi (`#reservasi`):** Kartu layanan menampilkan durasi saja (`~45 menit` / `~2 jam`); legenda status memakai **ikon kursi (`Armchair`)** untuk `Tersedia`, `Terisi`, `Dipilih`; **Live Booking Preview** memakai **Vertical Stepper** dengan teks jam terpilih `#303841` (`text-ink`), catatan keterlambatan lugas tanpa kata *"kasir"*, dan tanpa tombol lokasi.
   - **Footer Minimalis 3 Kolom (`#lokasi`):** `rounded-t-[32px] bg-[#303841] text-[#F7F3EC]` — Kiri hanya logo `Madzhair.co`, Tengah `Jam operasional` + `Sungai Kunyit, Kalimantan Barat` + jam buka, Kanan alamat + 3 tautan bersih (`Google Maps`, `WhatsApp`, `Instagram`).
   - **Admin Kasir Minimalis (`/admin` & `/admin/login`):** 100% `Poppins`, 0 titik bulat di depan judul/status, 0 hijau `emerald-live`, header 1 baris tanpa email, statistik 1 baris `Menunggu · Selesai · Batal` di atas date scrubber, dan Tab `Operasional & CMS` khusus Instagram Reels + kartu media 1 baris ringkas.
4. **Placeholder Media Terpusat:** Seluruh aset & URL Instagram dikelola via `src/config/media.ts`.

## 3. Standar Paritas Android & iOS
- `color-scheme: light`, `#EFE8DD`, `min-h-[100dvh]`, `overscroll-behavior-y: contain`.
- `pt-safe`, `pb-safe`, `pb-safe-flush`, `px-safe` berbasis `env(safe-area-inset-*)`.
- Touch target minimal `44px x 44px` (aksi Bottom Sheet Admin `>= 48px`); input `<input>`/`<select>` minimal `16px` (`text-base`) agar Safari iOS tidak auto-zoom.
- Carousel foto & Instagram Reels mendukung klik `< >`, dot pagination, serta swipe sentuh mobile (`touchstart`/`touchend`).

## 4. Protokol Laporan & Pembaruan Skill
- Audit seluruh komponen terhadap tipografi `Poppins` + `Instrument Serif` (Hero), nol `font-mono` di seluruh halaman, nol titik bulat dekoratif, Option B Mobile Hero (`hidden lg:block` + `mt-8 lg:-mt-12`), `LiveStatusTag` berikon kalender dinamis, nol hijau `emerald-live` & nol TikTok di `/admin`, serta verifikasi desktop & mobile sebelum diserahkan ke `madzhair-coordinator`.
