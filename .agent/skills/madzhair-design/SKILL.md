---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Soft-Editorial Madzhair Barber & Co (v1.9 Warm Alabaster, 100% Poppins UI + Instrument Serif khusus Hero, lokasi UI Sungai Kunyit, Kalimantan Barat (WIB), Option B Mobile Hero + Crisp S-Curve Desktop, Calendar-icon LiveStatusTag dinamis, Kartu 0-Slot bersih, E-Tiket deteksi perubahan jadwal, Admin Kasir minimalis + iOS PWA modal + QR Siap Cetak + Web Push), penegak standar Anti-AI-Slop, dan paritas tampilan Android serta iOS.
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co (v1.9 — Soft-Editorial Minimalist)
- **Karakter:** Hangat editorial, lugas, modern berisi, bersih tanpa kabut silau, tanpa titik bulat dekoratif, maupun jargon/kode developer di atas kanvas terang hangat (`#EFE8DD`).
- **Identitas Lokasi UI:** Seluruh label wilayah di UI & dokumentasi menggunakan **`Sungai Kunyit, Kalimantan Barat (WIB)`** (sementara kode kalkulasi waktu tetap memakai IANA **`Asia/Pontianak`**).
- **Palet Warna Baku (Aturan 60–30–10):**
  - **60% — Kanvas Utama (`--color-alabaster`):** `#EFE8DD` (Warm Alabaster).
  - **30% — Permukaan Kartu, Dock & Sheet (`--color-surface`):** `#F7F3EC` (Soft Ivory) dengan hairline `#DCD4C6` (`--color-hairline`), atau soft shadow pada Floating Pill Dock (`rounded-3xl lg:rounded-full`).
  - **Sub-Surface Lembut (`--color-surface-elevated`):** `#E6DDD0` (Warm Sand Tint).
  - **Teks Utama / Heading / Footer Gelap (`--color-ink`):** `#303841` (Deep Slate Charcoal).
  - **Teks Sekunder (`--color-muted`):** `#5C646D` (Muted Slate).
  - **10% — Aksen Utama (`--color-terracotta`):** `#C25934` (Burnt Terracotta) dengan teks `#F7F3EC`.
  - **Status Semantik:** `#B83B3B` (`crimson-alert`) untuk pembatalan / tutup hari ini / terisi. Di `/admin`, `/tiket/[code]`, dan `LiveStatusTag`, warna diselaraskan ke `#303841` (`ink`), `#C25934` (`terracotta`), dan `#B83B3B` (`crimson-alert`) tanpa aksen hijau `emerald-live`.

## 2. Tipografi Poppins + Hero Instrument Serif & Geometri Bersih (v1.9)
1. **Pemetaan Font Ketat (Wajib):**
   - **Judul Utama Hero (`h1` di `/`):** `Instrument Serif` (`--font-serif`) — **eksklusif untuk judul utama Hero**.
   - **Seluruh UI, Heading Seksi, Tombol, Deskripsi & Angka (`/`, `/tiket/[code]`, `/admin`, `/admin/login`):** Google Font **`Poppins`** (`--font-sans` via `--font-poppins`, weight `400/500/600/700`) dengan `tabular-nums` untuk jam, tanggal, harga, nomor WA, dan kode tiket `MDZ-XXXX`. Dilarang memakai `JetBrains Mono` (`font-mono`).
   - **Wordmark Logo:** `Syne` (`--font-display`) pada `Madzhair.co`.
2. **Geometri v1.9:**
   - **Area Reservasi (`#reservasi`):** Label `Pilih jam · Sungai Kunyit, Kalimantan Barat (WIB)`; saat `availableSlotCount === 0`, grid kotak jam abu-abu disembunyikan dan diganti satu kartu bersih + tombol `Pilih Jadwal Berikutnya ->`; form menambahkan input `Nomor WhatsApp` (`inputMode="tel"`, `text-base`).
   - **Smart Ticket (`/tiket/[code]`):** Badge tanpa titik bulat (`Terjadwal`, `Jadwal Diperbarui`, `Jadwal Dibatalkan`, `Sesi Selesai`) + kartu perbandingan jadwal lama vs baru saat di-reschedule.
   - **Admin Kasir (`/admin`):** 100% `Poppins`, 0 titik bulat, 0 `emerald-live`, modal panduan visual 2 langkah iOS Safari, blok `Istirahat` pada timeline di layer bawah booking aktif, kartu `Notifikasi HP Kasir`, kartu `QR Code Studio Siap Cetak`, serta form tarif 1 baris 3 elemen.

## 3. Standar Paritas Android & iOS
- `color-scheme: light`, `#EFE8DD`, `min-h-[100dvh]`, `overscroll-behavior-y: contain`, `pt-safe`, `pb-safe`, `px-safe`.
- Touch target minimal `44px x 44px` (aksi Bottom Sheet Admin `>= 48px`); input `<input>` minimal `16px` (`text-base`) agar Safari iOS tidak auto-zoom.

## 4. Protokol Laporan & Pembaruan Skill
- Audit seluruh komponen terhadap `Poppins` + `Instrument Serif` (Hero), nol `font-mono`, nol `emerald-live` & titik bulat di `/admin` & `/tiket/[code]`, label `Sungai Kunyit, Kalimantan Barat (WIB)`, serta verifikasi mobile `390x844` & `360x844` sebelum diserahkan ke `madzhair-coordinator`.
