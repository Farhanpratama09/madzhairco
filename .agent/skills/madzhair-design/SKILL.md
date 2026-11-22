---
name: madzhair-design
description: Spesialis UI/UX, identitas visual Charcoal Noir Monochrome System Madzhair Barber & Co (v2.0: #F7F7F7, #FFFFFF, #E0E0E0, #B3B3B3, #848484, #565656, #2B2B2B / hover #1F1F1F, 100% Poppins UI + Instrument Serif khusus Hero, lokasi UI Sungai Kunyit, Kalimantan Barat (WIB), dukungan Android & Chrome lama >= 80, serta paritas Android & iOS 320px–430px).
---

# Skill: Divisi UI/UX & Design System (`madzhair-design`)

## 1. Identitas Visual Madzhair Barber & Co (v2.0 — Charcoal Noir Monochrome System)
- **Karakter:** Editorial monokrom tegas, bersih, lugas, bebas warna hangat/oranye lama (`#EFE8DD`, `#F7F3EC`, `#C25934`, `#303841`), tanpa titik bulat dekoratif maupun jargon/kode developer.
- **Identitas Brand & Lokasi:**
  - Header/hero publik, footer, poster QR, & template pesan WhatsApp menggunakan **`Madzhair Barber & Co`** (menghindari akhiran `.co` otomatis menjadi tautan mati di WhatsApp).
  - Navbar `/admin` ringkas menggunakan **`Madzhair · Kasir`** tanpa link kembali ke `/`.
  - Seluruh label wilayah di UI & dokumentasi menggunakan **`Sungai Kunyit, Kalimantan Barat (WIB)`** (kode kalkulasi waktu tetap IANA **`Asia/Pontianak`**).
- **Palet Warna Monokrom Baku (Hex Standar Kompatibel Chrome 80+):**
  - **Latar Halaman Utama (`--color-alabaster`):** `#F7F7F7`
  - **Permukaan Kartu / Kotak Jadwal (`--color-surface`):** `#FFFFFF`
  - **Permukaan Sekunder / Jam Istirahat / Slot Terkunci (`--color-surface-elevated` / `--color-cloud-veil`):** `#E0E0E0` (Cloud Veil)
  - **Garis Pembatas (Border) & Ikon Nonaktif (`--color-hairline` / `--color-moonlit-silver`):** `#B3B3B3` (Moonlit Silver)
  - **Teks Bantuan, Placeholder & Slot Lewat (`--color-subtle` / `--color-urban-fog`):** `#848484` (Urban Fog)
  - **Subjudul, Harga, Durasi & Label Lokasi (`--color-muted` / `--color-ironclad-grey`):** `#565656` (Ironclad Grey)
  - **Judul Utama, Header Gelap, Slot Terpilih & Tombol Aksi Utama (`--color-ink` / `--color-charcoal-noir`):** `#2B2B2B` (Charcoal Noir) dengan teks `#FFFFFF` (hover `#1F1F1F`).
  - **Status Destruktif:** `#9E2A2B` (`crimson-alert`) khusus konfirmasi pembatalan / error validasi. Nol aksen hijau `emerald-live`.

## 2. Tipografi Poppins + Hero Instrument Serif & Geometri Bersih
1. **Pemetaan Font Ketat (Wajib):**
   - **Judul Utama Hero (`h1` di `/`):** `Instrument Serif` (`--font-serif`) — **eksklusif untuk judul utama Hero**.
   - **Seluruh UI, Heading Seksi, Tombol, Deskripsi & Angka (`/`, `/tiket/[code]`, `/admin`, `/admin/login`):** Google Font **`Poppins`** (`--font-sans` via `--font-poppins`, weight `400/500/600/700`) dengan `tabular-nums` untuk jam, tanggal, harga, nomor WA, dan kode tiket `MDZ-XXXX`. Dilarang memakai `JetBrains Mono` (`font-mono`).
2. **Geometri Responsif `320px–430px`:**
   - **Area Reservasi (`#reservasi`):** Label `Pilih jam · Sungai Kunyit, Kalimantan Barat (WIB)`; saat `availableSlotCount === 0`, grid slot disembunyikan dan diganti satu kartu bersih + tombol `Pilih Jadwal Berikutnya ->`.
   - **Admin Kasir (`/admin`):** Blok `Istirahat` solid opaque `#E0E0E0` tanpa teks slot bertabrakan di belakangnya; dropdown `<select>` jam interval 15 menit (`grid-cols-1 min-[380px]:grid-cols-2`, `w-full min-w-0 max-w-full box-border`); form Tanggal Libur Khusus berlabel eksplisit `Pilih Tanggal Libur` & anti-overflow.

## 3. Kompatibilitas Browser Lama & Paritas Android/iOS
- Target `browserslist` di `package.json`: `chrome >= 80`, `safari >= 13`, `ios >= 13`, `edge >= 80`, `firefox >= 78`.
- Dilarang memakai API modern tanpa fallback di client bundle (`crypto.randomUUID`, `structuredClone`, `Array.prototype.at`, `Object.hasOwn`); Service Worker & Push API wajib memakai guard fitur lengkap.
- Touch target minimal `44px x 44px`; input/select minimal `16px` (`text-base`) dengan `box-sizing: border-box` dan `max-width: 100%`.

## 4. Protokol Laporan & Pembaruan Skill
- Audit seluruh komponen terhadap palet Charcoal Noir (0 token hex lama `#EFE8DD`/`#F7F3EC`/`#C25934`/`#303841`), `Poppins`, 0 `font-mono`, 0 `emerald-live`, serta verifikasi visual headless mobile pada `320x740`, `360x844`, dan `390x844` (`scrollWidth === innerWidth`).
