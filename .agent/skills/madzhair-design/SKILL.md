---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Madzhair Barber & Co, penegak standar Anti-AI-Slop, dan paritas tampilan Android serta iOS.
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co
- **Karakter:** Maskulin editorial, tajam, kontras tinggi, bersih, dan autentik—bukan tema template SaaS generik.
- **Palet Warna Baku:**
  - Background Utama: `#0B0B0C` (Obsidian Matte)
  - Surface / Kartu: `#141416` dengan garis batas tipis tajam `1px solid #26262A`
  - Teks Utama: `#F4F3EF` (Warm Off-White)
  - Teks Sekunder: `#9A9891` (Muted Stone)
  - Aksen Utama: `#D49B4B` (Warm Brass / Amber) — khusus untuk CTA utama dan indikator slot aktif.
  - Status Semantik: `#34D399` (Buka / Tersedia), `#EF4444` (Tutup Darurat / Terisi).

## 2. Aturan Keras Anti-AI-Slop (Wajib Dipatuhi)
1. **BANNED — Pill Badge Dekoratif:** Dilarang menaruh elemen pil bulat (`rounded-full`) berisi teks klise di atas hero title (contoh terlarang: *"✨ Premium Barbershop Experience"*). Gunakan tipografi indeks bernomor atau garis pembatas arsitektural.
2. **BANNED — Tipografi Klise AI:** Dilarang menggunakan `Inter`, `Roboto`, atau `Space Grotesk` sebagai font utama. Wajib menggunakan pasangan:
   - **Display / Judul:** `Syne` atau `Instrument Serif` (tegas & berkarakter).
   - **Body / UI:** `Plus Jakarta Sans` (keterbacaan tinggi di layar kecil).
   - **Angka Jam, Harga & Kode Tiket:** `JetBrains Mono` (`tabular-nums` wajib aktif agar deretan jam sejajar presisi).
3. **BANNED — Layout Simetris Membosankan:** Hindari grid 3 kolom identik dengan ikon di atas teks. Gunakan komposisi asimetris, pembagian baris editorial (*hairline dividers*), dan fokus visual pada foto/video hasil cukur.
4. **Placeholder Media Mudah Ganti:** Seluruh logo, foto hero, dan kartu galeri wajib terpusat pada komponen/konfigurasi aset yang rapi dengan rasio aspek terkunci (`aspect-[4/5]` atau `aspect-[9/16]`) agar mudah diganti tanpa merusak tata letak.

## 3. Standar Paritas Android & iOS
- **Viewport Dinamis:** Gunakan `min-h-[100dvh]` (bukan `100vh`) agar layout tidak terpotong oleh *address bar* dinamis Chrome Android maupun Safari iOS.
- **Safe Area Insets:** Elemen yang menempel di atas/bawah layar wajib memakai `pt-[env(safe-area-inset-top)]` dan `pb-[calc(1rem+env(safe-area-inset-bottom))]` agar aman dari *Notch/Dynamic Island* dan *Home Indicator* iOS serta tombol navigasi gestur Android.
- **Touch Target:** Setiap tombol interaktif (pilihan jam, tombol Walk-in, tombol Geser Jadwal) wajib berukuran minimal `44px x 44px` dengan jarak antar tombol minimal `8px`.
- **Anti-Zoom Input iOS:** Ukuran font pada seluruh `<input>` dan `<select>` wajib minimal `16px` (`text-base`) agar Safari iOS tidak melakukan auto-zoom paksa saat admin/pelanggan mengetik.

## 4. Implementasi Design System & Komponen Baku (Wave 2)
- **`src/app/globals.css` (Tailwind CSS v4 `@theme inline`):**
  - Token warna: `--color-obsidian` (`#0B0B0C`), `--color-surface` (`#141416`), `--color-surface-elevated` (`#1A1A1D`), `--color-hairline` (`#26262A`), `--color-ivory` (`#F4F3EF`), `--color-stone` (`#9A9891`), `--color-brass` (`#D49B4B`), `--color-emerald-live` (`#34D399`), `--color-crimson-alert` (`#EF4444`).
  - Token tipografi: `--font-display` (`--font-syne`), `--font-serif` (`--font-instrument-serif`), `--font-sans` (`--font-plus-jakarta`), `--font-mono` (`--font-jetbrains-mono`).
  - Base & paritas iOS/Android: `min-height: 100dvh`, `overscroll-behavior-y: contain`, `input/select/textarea` dipaksa `font-size: max(16px, 1rem)` anti-zoom Safari iOS.
  - Utilitas khusus: `pt-safe`, `pb-safe`, `pb-safe-flush`, `px-safe`, `tabular-nums`, `hairline-border`, `hairline-t`, `hairline-b`, `hairline-l`, `hairline-r`, dan `touch-target` (`min-width: 44px; min-height: 44px`).
- **`src/config/media.ts`:**
  - Konfigurasi terpusat `brand`, `defaultGalleryItems`, `ALLOWED_EMBED_HOSTS`, dan `isWhitelistedEmbedUrl()`.
  - Mendukung rasio aspek terkunci `aspect-[4/5]` (foto lokal WebP) dan `aspect-[9/16]` (placeholder embed TikTok & Instagram Reels).
- **Komponen UI Editorial (`src/components/ui/`):**
  - `BrandMark`: Monogram persegi arsitektural + wordmark `MADZHAIR.CO / BARBER & CO` (tanpa pill `rounded-full`, touch target `>= 44x44px` saat menjadi tautan).
  - `EditorialSectionHeader`: Header bernomor indeks (`01 / LAYANAN`), kombinasi `Syne` + `Instrument Serif italic`, dan pembatas `1px solid #26262A`.
  - `LiveStatusTag`: Indikator status Buka/Tutup Live persegi tajam dengan aksen garis kiri 2px, titik persegi `#34D399` / `#EF4444`, dan jam `tabular-nums`.

## 5. Protokol Laporan & Pembaruan Skill
- Setiap komponen UI baru wajib diaudit terhadap checklist Anti-AI-Slop sebelum disetor ke `madzhair-coordinator`.
- Jika ditemukan token warna, pola komponen, atau penyesuaian *viewport* baru, agent ini wajib langsung memperbarui `SKILL.md` ini dan mencatatnya di laporan ke Koordinator.

