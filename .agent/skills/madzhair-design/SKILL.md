---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Soft-Editorial Madzhair Barber & Co (v1.2 Warm Alabaster), penegak standar Anti-AI-Slop, dan paritas tampilan Android serta iOS.
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co (v1.2 — Soft-Editorial)
- **Karakter:** Hangat editorial, maskulin berkelas, tajam secara tipografi namun taktil dan ramah disentuh, kontras tinggi di atas kanvas terang hangat—bukan tema template SaaS gelap generik.
- **Palet Warna Baku (Aturan 60–30–10):**
  - **60% — Kanvas Utama (`--color-alabaster`):** `#EFE8DD` (Warm Alabaster) — latar belakang utama halaman.
  - **30% — Permukaan Kartu & Dock (`--color-surface`):** `#F7F3EC` (Soft Ivory) dengan garis batas tipis `1px solid #DCD4C6` (`--color-hairline`) untuk Elevated Card & Floating Segmented Booking Bar.
  - **Sub-Surface Lembut (`--color-surface-elevated`):** `#E6DDD0` (Warm Sand Tint) untuk area sekunder, *hover tint*, dan blok informasi pendukung.
  - **Teks Utama / Heading / Blok Aksen Gelap (`--color-ink`):** `#303841` (Deep Slate Charcoal).
  - **Teks Sekunder (`--color-muted`):** `#5C646D` (Muted Slate).
  - **10% — Aksen Utama (`--color-terracotta`):** `#C25934` (Burnt Terracotta) dengan teks `#F7F3EC` — khusus untuk CTA utama, tanggal/slot terpilih (*Selected Date/Slot*), dan garis indikator waktu aktif (*Live Current-Time Line*).
  - **Status Semantik:**
    - `--color-emerald-live`: `#2E6F56` (Buka Live / Tersedia)
    - `--color-crimson-alert`: `#B83B3B` (Tutup Darurat / Dibatalkan / Hari Ini Libur)
  - **Overlay Media Lookbook & Reels Full-Bleed:** Gradasi scrim gelap bawah `from-[#1E2329]/90 via-[#303841]/55 to-transparent` dengan teks `#F7F3EC` agar keterbacaan teks di atas foto/video tetap tinggi tanpa menutupi bagian atas visual.

## 2. Geometri Soft-Editorial & Aturan Keras Anti-AI-Slop (Wajib Dipatuhi)
1. **Geometri Soft-Editorial (Terstruktur & Taktil):**
   - `rounded-2xl`: Digunakan untuk Floating Segmented Booking Bar (dock booking), panel Live Booking Preview, kartu utama, foto hero (`aspect-[4/5]`), serta kartu Lookbook & facade Reels full-bleed (`aspect-[4/5]` & `aspect-[9/16]`).
   - `rounded-xl`: Digunakan untuk Horizontal Date Scrubber (`snap-x`), tombol slot jam, blok timeline kasir (`108px/jam`), `LiveStatusTag`, kotak monogram `BrandMark`, dan tombol aksi.
2. **BANNED — Pill Badge Dekoratif (`rounded-full`):** Dilarang menggunakan elemen pil bulat (`rounded-full`) dekoratif berisi teks klise di atas judul (contoh terlarang: *"✨ Premium Barbershop Experience"*). Gunakan indeks bernomor (`01 / LAYANAN`) dan garis *hairline* `#DCD4C6`.
3. **BANNED — Tipografi Klise AI:** Dilarang menggunakan `Inter`, `Roboto`, atau `Space Grotesk` sebagai font utama. Wajib menggunakan pasangan:
   - **Display / Judul:** `Syne` (`--font-display`)
   - **Aksen Editorial Italic:** `Instrument Serif` (`--font-serif`)
   - **Body / UI:** `Plus Jakarta Sans` (`--font-sans`)
   - **Angka Jam, Harga & Kode Tiket:** `JetBrains Mono` (`--font-mono`, `tabular-nums` wajib aktif agar deretan jam sejajar presisi).
4. **BANNED — Layout Simetris Membosankan:** Hindari grid 3 kolom identik dengan ikon di atas teks. Gunakan komposisi hero asimetris, pembagian baris editorial (*hairline dividers* `#DCD4C6`), dan fokus visual pada foto/video hasil cukur.
5. **Placeholder Media Mudah Ganti:** Seluruh logo, foto hero, dan kartu galeri wajib terpusat pada `src/config/media.ts` dengan rasio aspek terkunci (`aspect-[4/5]` atau `aspect-[9/16]`).

## 3. Standar Paritas Android & iOS
- **Color Scheme & PWA Theme:** `color-scheme: light` dengan kanvas `#EFE8DD` (Warm Alabaster) dan teks `#303841` (Deep Slate Charcoal).
- **Viewport Dinamis:** Gunakan `min-h-[100dvh]` (bukan `100vh`) agar layout tidak terpotong oleh *address bar* dinamis Chrome Android maupun Safari iOS, serta `overscroll-behavior-y: contain`.
- **Safe Area Insets:** Elemen yang menempel di tepi layar wajib memakai `pt-safe`, `pb-safe`, `pb-safe-flush`, dan `px-safe` berbasis `env(safe-area-inset-*)` agar aman dari *Notch/Dynamic Island*, *Home Indicator* iOS, dan gestur navigasi Android.
- **Touch Target:** Setiap tombol interaktif (slot jam, date scrubber, tombol Walk-in, Geser Jadwal) wajib berukuran minimal `44px x 44px` (`touch-target`) dengan jarak antar tombol minimal `8px`.
- **Anti-Zoom Input iOS:** Ukuran font pada seluruh `<input>`, `<select>`, dan `<textarea>` wajib minimal `16px` (`font-size: max(16px, 1rem)`) agar Safari iOS tidak melakukan auto-zoom paksa.
- **Horizontal Scroll Halus:** Gunakan utilitas `@utility no-scrollbar` untuk strip kalender horizontal (`snap-x`) agar scrollbar tersembunyi rapi di iOS Safari, Android Chrome, dan desktop sambil tetap *scrollable*.

## 4. Implementasi Design System & Komponen Baku (Wave 1 — v1.2)
- **`src/app/globals.css` (Tailwind CSS v4 `@theme inline`):**
  - Token warna: `--color-alabaster` (`#EFE8DD`), `--color-surface` (`#F7F3EC`), `--color-surface-elevated` (`#E6DDD0`), `--color-hairline` (`#DCD4C6`), `--color-ink` (`#303841`), `--color-muted` (`#5C646D`), `--color-terracotta` (`#C25934`), `--color-emerald-live` (`#2E6F56`), `--color-crimson-alert` (`#B83B3B`).
  - Token tipografi: `--font-display` (`--font-syne`), `--font-serif` (`--font-instrument-serif`), `--font-sans` (`--font-plus-jakarta`), `--font-mono` (`--font-jetbrains-mono`).
  - Base rules: `color-scheme: light`, background `#EFE8DD`, teks `#303841`, `min-height: 100dvh`, `overscroll-behavior-y: contain`, anti-zoom input `>= 16px`, `::selection` `rgba(194, 89, 52, 0.18)` dengan teks `#303841`, `:focus-visible` `2px solid #C25934`.
  - Utilitas khusus: `no-scrollbar`, `pt-safe`, `pb-safe`, `pb-safe-flush`, `px-safe`, `tabular-nums`, `hairline-border`, `hairline-t`, `hairline-b`, `hairline-l`, `hairline-r` (`1px solid #DCD4C6`), dan `touch-target` (`min-width: 44px; min-height: 44px`).
- **`src/config/media.ts`:**
  - Konfigurasi terpusat `brand`, `defaultGalleryItems`, `ALLOWED_EMBED_HOSTS`, dan `isWhitelistedEmbedUrl()`.
  - Mendukung rasio aspek terkunci `aspect-[4/5]` (foto lokal WebP) dan `aspect-[9/16]` (placeholder embed TikTok & Instagram Reels).
- **Komponen UI Editorial (`src/components/ui/`):**
  - `BrandMark`: Kotak monogram `rounded-xl bg-ink` (`#303841`) dengan huruf `M` `#F7F3EC` + garis presisi `#C25934`, wordmark `MADZHAIR` (`text-ink`) + `.CO` (`text-terracotta`) + `BARBER & CO` (`text-muted`), touch target `>= 44x44px` saat menjadi tautan.
  - `EditorialSectionHeader`: Indeks bernomor `text-terracotta`, garis *hairline* `#DCD4C6`, judul `Syne` `text-ink`, `accentTitle` `Instrument Serif italic` `text-terracotta`, dan deskripsi `text-muted` (tanpa pill `rounded-full`).
  - `LiveStatusTag`: Kartu status `rounded-xl bg-surface border border-hairline` dengan aksen garis vertikal kiri (3px) dan status semantik `#2E6F56` (*Buka Live*), `#C25934` (*Booking Aktif* / *Booking Besok Aktif*), atau `#B83B3B` (*Tutup Darurat* / *Hari Ini Libur*) beserta jam `tabular-nums`.

## 5. Protokol Laporan & Pembaruan Skill
- Setiap komponen UI baru wajib diaudit terhadap checklist Soft-Editorial & Anti-AI-Slop sebelum disetor ke `madzhair-coordinator`.
- Jika ditemukan token warna, pola komponen, atau penyesuaian *viewport* baru, agent ini wajib langsung memperbarui `SKILL.md` ini dan mencatatnya di laporan ke Koordinator.
