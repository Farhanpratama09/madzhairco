---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Soft-Editorial Madzhair Barber & Co (v1.4 Warm Alabaster, Travorra-inspired Split Hero & Dock, Sentence Case UI), penegak standar Anti-AI-Slop, dan paritas tampilan Android serta iOS.
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co (v1.4 — Soft-Editorial Editorial Minimalist)
- **Karakter:** Hangat editorial, modern berkelas, bersih tanpa jargon/kode developer, tajam secara kontras di atas kanvas terang hangat (`#EFE8DD`) — diadaptasi dari estetika studio privat (*Travorra-inspired Split Hero + Floating Dock*).
- **Palet Warna Baku (Aturan 60–30–10):**
  - **60% — Kanvas Utama (`--color-alabaster`):** `#EFE8DD` (Warm Alabaster).
  - **30% — Permukaan Kartu, Dock & Sheet (`--color-surface`):** `#F7F3EC` (Soft Ivory) dengan garis batas tipis `#DCD4C6` (`--color-hairline`) untuk kartu standar, atau tanpa border dengan soft shadow (`shadow-xl`) pada Floating Horizontal Dock (`rounded-3xl`).
  - **Sub-Surface Lembut (`--color-surface-elevated`):** `#E6DDD0` (Warm Sand Tint).
  - **Teks Utama / Heading / Blok Aksen Gelap (`--color-ink`):** `#303841` (Deep Slate Charcoal).
  - **Teks Sekunder (`--color-muted`):** `#5C646D` (Muted Slate).
  - **10% — Aksen Utama (`--color-terracotta`):** `#C25934` (Burnt Terracotta) dengan teks `#F7F3EC`.
  - **Status Semantik:**
    - `--color-emerald-live`: `#2E6F56` (Sedang buka / Tersedia / Selesai)
    - `--color-crimson-alert`: `#B83B3B` (Tutup darurat / Dibatalkan / Hari ini libur)
  - **Overlay Media Lookbook & Reels Full-Bleed:** Gradasi scrim gelap bawah `from-[#1E2329]/90 via-[#303841]/55 to-transparent` dengan teks `#F7F3EC`.

## 2. Tipografi Sentence Case, Geometri Organik & Aturan Keras Anti-AI-Slop (v1.4)
1. **Pemetaan Font Ketat (Wajib):**
   - **Judul Besar / Editorial Heading (`h1`, `h2`, judul kartu lookbook):** `Instrument Serif` (`--font-serif`) dengan aksen *italic* (`text-terracotta italic`), ukuran proporsional (`h1`: `text-4xl sm:text-5xl lg:text-[62px] leading-[1.06] tracking-tight`, `h2`: `text-2xl sm:text-3xl lg:text-[34px]`).
   - **Teks UI, Label Seksi, Subjudul, Status, Tombol & Deskripsi:** `Plus Jakarta Sans` (`--font-sans`) dalam **Sentence Case** (dilarang memakai `ALL CAPS` / `uppercase` pada label, tombol, tab, atau subjudul UI).
   - **Wordmark Logo:** `Syne` (`--font-display`) pada `Madzhair.co` (Sentence Case).
   - **Angka Jam, Harga & Kode Tiket SAJA (`--font-mono`, `tabular-nums`):** `JetBrains Mono` **HANYA** diizinkan untuk angka jam (`14:00`, `12:00 – 21:00 WIB`), nominal harga (`Rp 35k`, `Rp 30k–40k`), dan kode tiket (`MDZ-XXXX`) / tanggal angka pendek (`YYYY-MM-DD`). Dilarang menggunakan `font-mono` pada label teks, judul kartu, tombol, atau status.
2. **DILARANG — Prefix Angka Developer & Titik Kotak:**
   - Hapus total prefiks kode (`00 /`, `01 //`, `02 //`, `03 /`, `ADMIN /`) dari seluruh UI publik maupun admin.
   - Hapus elemen kapsul/pill ber-border dengan garis kiri terpotong atau titik kotak `rounded-[2px]`. Gunakan indikator lingkaran halus (`w-2 h-2 rounded-full`) + teks Sentence Case bersih tanpa kotak pembungkus pada `LiveStatusTag` (mendukung `surfaceTone="overlayDesktop"` agar terbaca jelas di atas foto top-right).
3. **Geometri v1.5 (Travorra Full-Bleed Curve & Floating Capsule Dock):**
   - **Full-Bleed Top-Right Hero Foto & Masking Organik:** Wrapper hero `relative w-full overflow-hidden`; di `lg:` foto menempel penuh ke tepi atas & kanan layar (`lg:absolute lg:top-0 lg:right-0 lg:w-[54%] lg:min-h-[620px]`) dengan lengkungan organik kiri (`lg:rounded-bl-[180px] lg:rounded-br-none`) menyatu di belakang navbar transparan; di mobile (`< lg`) foto bertumpuk rapi (`h-[280px] rounded-3xl rounded-b-[40px]`).
   - **Kartu Mengambang Batas Foto (Desktop):** `lg:absolute lg:-left-10 lg:top-28 shadow-xl bg-[#F7F3EC] rounded-2xl` ditempatkan di luar container `overflow-hidden` foto agar menembus garis batas kiri foto.
   - **Tombol CTA Hero Kapsul:** `rounded-full px-7 py-3.5 bg-terracotta text-surface` dengan ikon panah melingkar putih di dalamnya; tanpa kolom metadata datar 3-kolom di bawah CTA agar Dock langsung terlihat *above the fold*.
   - **Floating Horizontal Capsule Dock (`#layanan`):** Menjembatani dan menindih bagian bawah foto hero (`-mt-8 mx-4 lg:-mt-12 lg:max-w-5xl lg:mx-auto rounded-3xl lg:rounded-full bg-[#F7F3EC] shadow-[0_20px_50px_-12px_rgba(48,56,65,0.14)]`), berisi 4 segmen bersih (`Layanan & tarif` toggle, `Jam buka`, `Location`, dan tombol kapsul `Pilih Jadwal`).
   - **Grid Area Reservasi (`#reservasi`):** Desktop wajib memakai `lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8` dengan `min-w-0` pada kolom kiri dan tiap `<fieldset>`.
   - **Bottom Sheet & Timeline (`/admin`):** `HOUR_ROW_HEIGHT_PX = 88`, garis waktu aktif `#C25934` berujung lingkaran `rounded-full`, timeline menampilkan booking aktif `BOOKED` sementara `COMPLETED` dipisah ke kartu *Riwayat selesai*.
4. **Placeholder Media Terpusat:** Seluruh aset dikelola via `src/config/media.ts`.

## 3. Standar Paritas Android & iOS
- `color-scheme: light`, `#EFE8DD`, `min-h-[100dvh]`, `overscroll-behavior-y: contain`.
- `pt-safe`, `pb-safe`, `pb-safe-flush`, `px-safe` berbasis `env(safe-area-inset-*)`.
- Touch target minimal `44px x 44px`; input `<input>`/`<select>` minimal `16px` (`text-base`) agar Safari iOS tidak auto-zoom.
- Scroll horizontal Date Scrubber & Galeri mobile menggunakan `snap-x snap-mandatory no-scrollbar`.

## 4. Protokol Laporan & Pembaruan Skill
- Audit seluruh komponen terhadap aturan Sentence Case (`font-sans`), batasan ketat `font-mono` (hanya jam/harga/tiket), nol prefiks `01 //`, dan grid overlap sebelum diserahkan ke `madzhair-coordinator`.
