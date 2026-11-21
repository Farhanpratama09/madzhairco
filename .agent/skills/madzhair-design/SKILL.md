---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Soft-Editorial Madzhair Barber & Co (v1.3 Warm Alabaster Mobile-Minimalist), penegak standar Anti-AI-Slop, dan paritas tampilan Android serta iOS.
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co (v1.3 — Soft-Editorial Mobile-Minimalist)
- **Karakter:** Hangat editorial, maskulin berkelas, tajam secara tipografi namun ringkas di layar ponsel (`360px–430px`), taktil dan ramah disentuh, kontras tinggi di atas kanvas terang hangat—bukan tema template SaaS gelap generik.
- **Palet Warna Baku (Aturan 60–30–10):**
  - **60% — Kanvas Utama (`--color-alabaster`):** `#EFE8DD` (Warm Alabaster) — latar belakang utama halaman.
  - **30% — Permukaan Kartu, Dock & Sheet (`--color-surface`):** `#F7F3EC` (Soft Ivory) dengan garis batas tipis `1px solid #DCD4C6` (`--color-hairline`) untuk Elevated Card, Floating Info & Pricelist Dock, dan Bottom Sheet Detail.
  - **Sub-Surface Lembut (`--color-surface-elevated`):** `#E6DDD0` (Warm Sand Tint) untuk area sekunder, *hover tint*, dan blok informasi pendukung.
  - **Teks Utama / Heading / Blok Aksen Gelap (`--color-ink`):** `#303841` (Deep Slate Charcoal).
  - **Teks Sekunder (`--color-muted`):** `#5C646D` (Muted Slate).
  - **10% — Aksen Utama (`--color-terracotta`):** `#C25934` (Burnt Terracotta) dengan teks `#F7F3EC` — khusus untuk CTA utama, tanggal/slot terpilih (*Selected Date/Slot*), dan garis indikator waktu aktif (*Live Current-Time Line*).
  - **Status Semantik:**
    - `--color-emerald-live`: `#2E6F56` (Buka Live / Tersedia)
    - `--color-crimson-alert`: `#B83B3B` (Tutup Darurat / Dibatalkan / Hari Ini Libur)
  - **Overlay Media Lookbook & Reels Full-Bleed:** Gradasi scrim gelap bawah `from-[#1E2329]/90 via-[#303841]/55 to-transparent` dengan teks `#F7F3EC` agar keterbacaan teks di atas foto/video tetap tinggi tanpa menutupi bagian atas visual.

## 2. Geometri Soft-Editorial, Skala Tipografi & Aturan Keras Anti-AI-Slop (Wajib Dipatuhi)
1. **Geometri Dock Info & Hierarki Radius Soft-Editorial (v1.3):**
   - `rounded-[28px]`: Digunakan untuk **Floating Info & Pricelist Dock** di `/` agar terasa seperti *floating capsule dock* taktil yang memisahkan ringkasan info studio & akses pricelist dari kanvas hero.
   - `rounded-2xl`: Digunakan untuk **Lookbook / Preview / Modal** — mencakup panel *Live Booking Preview*, modal konfirmasi pra-booking, kartu utama, foto hero (`aspect-[4/5]`), kartu Lookbook & facade Reels full-bleed (`aspect-[4/5]` & `aspect-[9/16]`), serta **Bottom Sheet Detail** (`rounded-t-2xl` / `rounded-2xl`) di `/admin`.
   - `rounded-xl`: Digunakan untuk **Scrubber / Slot / Timeline block / Tombol** — mencakup Horizontal Date Scrubber (`snap-x`), tombol slot jam, blok timeline kasir (`>= 108px/jam`), `LiveStatusTag`, kotak monogram `BrandMark`, dan tombol aksi.
2. **Skala Tipografi Minimalis Mobile (v1.3 — Optimal Layar `360px–430px`):**
   - **`h1` (Hero Utama):** `text-[28px] leading-[1.15] sm:text-4xl lg:text-5xl` (`font-display`) — menjaga judul hero tetap tegas namun proporsional di ponsel sempit tanpa mendorong elemen utama terlalu jauh ke bawah.
   - **`h2` (Judul Section / `EditorialSectionHeader`):** `text-xl leading-[1.18] sm:text-2xl md:text-3xl` (`font-display`) dengan deskripsi `text-sm leading-relaxed text-muted` agar judul dan keterangan tidak menumpuk di layar HP `360px–430px`.
   - **Teks Kartu & Konten Pendukung:** `text-sm` untuk badan teks kartu layanan, info ringkas, dan item daftar agar kepadatan informasi tetap lega.
   - **Input Form & Kontrol Select:** Wajib minimal `16px` (`text-base` / `font-size: max(16px, 1rem)`) untuk mencegah auto-zoom paksa di Safari iOS.
3. **BANNED — Pill Badge Dekoratif (`rounded-full`):** Dilarang menggunakan elemen pil bulat (`rounded-full`) dekoratif berisi teks klise di atas judul (contoh terlarang: *"✨ Premium Barbershop Experience"*). Gunakan indeks bernomor (`01 / LAYANAN`) dan garis *hairline* `#DCD4C6`.
4. **BANNED — Tipografi Klise AI:** Dilarang menggunakan `Inter`, `Roboto`, atau `Space Grotesk` sebagai font utama. Wajib menggunakan pasangan:
   - **Display / Judul:** `Syne` (`--font-display`)
   - **Aksen Editorial Italic:** `Instrument Serif` (`--font-serif`)
   - **Body / UI:** `Plus Jakarta Sans` (`--font-sans`)
   - **Angka Jam, Harga & Kode Tiket:** `JetBrains Mono` (`--font-mono`, `tabular-nums` wajib aktif agar deretan jam sejajar presisi).
5. **BANNED — Layout Simetris Membosankan:** Hindari grid 3 kolom identik dengan ikon di atas teks. Gunakan komposisi hero asimetris, pembagian baris editorial (*hairline dividers* `#DCD4C6`), dan fokus visual pada foto/video hasil cukur.
6. **Placeholder Media Mudah Ganti:** Seluruh logo, foto hero, dan kartu galeri wajib terpusat pada `src/config/media.ts` dengan rasio aspek terkunci (`aspect-[4/5]` atau `aspect-[9/16]`).

## 3. Standar Paritas Android & iOS
- **Color Scheme & PWA Theme:** `color-scheme: light` dengan kanvas `#EFE8DD` (Warm Alabaster) dan teks `#303841` (Deep Slate Charcoal).
- **Viewport Dinamis:** Gunakan `min-h-[100dvh]` (bukan `100vh`) agar layout tidak terpotong oleh *address bar* dinamis Chrome Android maupun Safari iOS, serta `overscroll-behavior-y: contain`.
- **Safe Area Insets:** Elemen yang menempel di tepi layar (termasuk Bottom Sheet Detail & bar aksi sticky bawah) wajib memakai `pt-safe`, `pb-safe`, `pb-safe-flush`, dan `px-safe` berbasis `env(safe-area-inset-*)` agar aman dari *Notch/Dynamic Island*, *Home Indicator* iOS, dan gestur navigasi Android.
- **Touch Target:** Setiap tombol interaktif (slot jam, date scrubber, tombol Walk-in, aksi di Bottom Sheet Detail seperti Selesai/Geser/Batal) wajib berukuran minimal `44px x 44px` (`touch-target`) dengan jarak antar tombol minimal `8px`.
- **Anti-Zoom Input iOS:** Ukuran font pada seluruh `<input>`, `<select>`, dan `<textarea>` wajib minimal `16px` (`font-size: max(16px, 1rem)`) agar Safari iOS tidak melakukan auto-zoom paksa.
- **Horizontal Scroll Halus:** Gunakan utilitas `@utility no-scrollbar` untuk strip kalender horizontal (`snap-x`) agar scrollbar tersembunyi rapi di iOS Safari, Android Chrome, dan desktop sambil tetap *scrollable*.

## 4. Implementasi Design System & Komponen Baku (v1.3)
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
  - `EditorialSectionHeader`: Indeks bernomor `text-terracotta`, garis *hairline* `#DCD4C6`, judul `Syne` `text-ink` berskala v1.3 (`text-xl leading-[1.18] sm:text-2xl md:text-3xl`), `accentTitle` `Instrument Serif italic` `text-terracotta`, dan deskripsi `text-sm leading-relaxed text-muted` (tanpa pill `rounded-full`).
  - `LiveStatusTag`: Kartu status `rounded-xl bg-surface border border-hairline` dengan aksen garis vertikal kiri (3px) dan status semantik `#2E6F56` (*Buka Live*), `#C25934` (*Booking Aktif* / *Booking Besok Aktif*), atau `#B83B3B` (*Tutup Darurat* / *Hari Ini Libur*) beserta jam `tabular-nums`.
- **Pola Komponen Khusus Halaman (v1.3):**
  - **Floating Info & Pricelist Dock (`/`):** Kontainer melayang `rounded-[28px] border border-hairline bg-surface` yang menyajikan ringkasan status/info operasional, akses cepat pricelist, dan CTA menuju alur reservasi secara ringkas di mobile maupun desktop.
  - **Bottom Sheet Detail (`/admin`):** Pola *thumb-zone bottom sheet* (`rounded-t-2xl` / `rounded-2xl` dengan `pb-safe`) untuk inspeksi detail booking dan aksi jadwal (**Selesai**, **Geser**, **Batal**) saat kartu jadwal pada timeline diketuk, sehingga blok timeline tetap bersih, terbaca jelas (`text-sm`), dan tidak sesak di layar ponsel `360px–430px`.

## 5. Protokol Laporan & Pembaruan Skill
- Setiap komponen UI baru wajib diaudit terhadap checklist Soft-Editorial, Skala Tipografi Minimalis Mobile (v1.3), & Anti-AI-Slop sebelum disetor ke `madzhair-coordinator`.
- Jika ditemukan token warna, pola komponen, atau penyesuaian *viewport* baru, agent ini wajib langsung memperbarui `SKILL.md` ini dan mencatatnya di laporan ke Koordinator.
