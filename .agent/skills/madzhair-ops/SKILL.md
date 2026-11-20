---
name: madzhair-ops
description: Penjamin kelancaran deploy Vercel tanpa error berulang, optimasi Local SEO & Open Graph WhatsApp, serta performa Core Web Vitals di Android dan iOS.
---

# Skill: Divisi DevOps, SEO & Performance (`madzhair-ops`)

## 1. Tanggung Jawab Utama
- Memastikan seluruh kode siap produksi (*zero-error build*), teroptimasi untuk mesin pencari lokal, tampil rapi saat dibagikan di WhatsApp/sosmed, dan memuat cepat di perangkat mobile.

## 2. SOP Pre-Deploy Vercel (Anti-Deploy Berulang)
Sebelum melaporkan kesiapan rilis ke `madzhair-coordinator`, divisi ini wajib memverifikasi:
1. **Strict Type & Lint Check:** `tsc --noEmit` dan `next lint` lulus dengan `0 errors`.
2. **Production Build Simulation:** `npm run build` berjalan sukses tanpa error *Server/Client Component boundary* atau *dynamic route prerendering*.
3. **Verifikasi Environment Variables:** Memastikan seluruh variabel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`) terdokumentasi di `.env.example` dan terpasang di dashboard Vercel.
4. **Konfigurasi `vercel.json`:** Sinkronisasi aturan cache aset statis dan *security headers* dari `madzhair-security`.

## 3. Standar SEO Lokal & Rich Social Preview
1. **Metadata API & Open Graph:**
   - Title: `Madzhair.co — Madzhair Barber & Co | Reservasi & Jadwal`
   - Open Graph (`og:image`, `og:title`, `og:description`) dikonfigurasi pada halaman utama maupun halaman `/tiket/[code]` agar saat tautan dibagikan di WhatsApp muncul kartu *preview* yang rapi.
2. **Structured Data (JSON-LD):**
   - Menyematkan skema `HairSalon` / `LocalBusiness` pada halaman utama berisi nama bisnis (`Madzhair Barber & Co`), jam operasional dinamis, kisaran harga, dan koordinat/tautan lokasi.
3. **Indexing Files:**
   - `app/sitemap.ts` (mengindeks halaman utama) dan `app/robots.ts` (mengizinkan crawler di `/`, memblokir `/admin` dan `/tiket/` dari indeks publik).

## 4. Anggaran Performa Mobile (Performance Budget)
- Font dimuat eksklusif melalui `next/font/google` dengan `display: 'swap'` untuk mencegah *Cumulative Layout Shift* (CLS = `0`).
- Seluruh gambar statis maupun galeri menggunakan `next/image` dengan format WebP/AVIF (`images.formats: ['image/avif', 'image/webp']`) dan atribut `sizes` yang tepat.
- Embed TikTok/Instagram Reels tidak boleh menambah beban awal JavaScript lebih dari batas wajar sebelum pengguna berinteraksi atau menggulir ke bagian galeri.

## 5. Implementasi Wave 3A & Temuan Teknis (Next.js 16.4.6)
- **`src/app/layout.tsx`**:
  - Keempat font editorial (`Syne`, `Instrument_Serif`, `Plus_Jakarta_Sans`, `JetBrains_Mono`) dimuat dengan `display: 'swap'` dan dipasang sebagai CSS variables di `<html lang="id" className="... dark">`.
  - `Metadata` API lengkap (`metadataBase`, `manifest: '/manifest.json'`, `icons`, `appleWebApp`, `openGraph` WhatsApp `1200x630`, `twitter`) dan `export const viewport: Viewport` (`width: 'device-width'`, `initialScale: 1`, `viewportFit: 'cover'`, `themeColor: '#0B0B0C'`).
- **`src/components/seo/HairSalonJsonLd.tsx`**:
  - Komponen Server/Pure untuk schema.org `HairSalon` / `LocalBusiness` (`Madzhair Barber & Co`, alamat `Jalan Raya Sungai Kunyit, Gang Tani`, kisaran harga `Rp 30.000 - Rp 250.000`, `hasMap`, `openingHoursSpecification` dinamis dari `WeeklySchedule[]` dengan fallback `DEFAULT_WEEKLY_SCHEDULES`) dan sanitasi `</script>` (`replace(/</g, "\\u003c")`).
- **`src/app/sitemap.ts` & `src/app/robots.ts`**:
  - `sitemap.ts` mengindeks `/` (`changeFrequency: 'daily'`, `priority: 1.0`).
  - `robots.ts` mengizinkan `/` dan memblokir `/admin`, `/admin/`, `/tiket`, `/tiket/`, `/api/`.
- **`next.config.ts` & `vercel.json`**:
  - `cacheComponents: true` dan `partialPrefetching: true` **wajib dinonaktifkan** pada Next.js `16.4.6` agar rute dinamis (`cookies()`, `force-dynamic`) tidak gagal saat prerender.
  - `images.remotePatterns` mengizinkan `https://**.supabase.co` dengan output `image/avif` & `image/webp`.
  - Security headers (`SECURITY_HEADERS` dari `src/lib/security/headers.ts`) dan `Cache-Control: public, max-age=31536000, immutable` (`/icons/(.*)`, `/images/(.*)`) disinkronkan di `next.config.ts` dan `vercel.json`.
- **`.env.example`**: Mendokumentasikan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `NEXT_PUBLIC_SITE_URL`.

## 6. Protokol Laporan & Pembaruan Skill
- Hasil audit build, skor estimasi performa mobile, dan status kesiapan domain wajib dilampirkan pada setiap laporan ke `madzhair-coordinator`.
- Setiap temuan optimasi baru wajib ditambahkan ke `SKILL.md` ini.

