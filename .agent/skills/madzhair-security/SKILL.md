---
name: madzhair-security
description: Penjaga keamanan aplikasi Madzhair.co dari spam booking, bypass autentikasi Smart Ticket, injeksi XSS embed sosmed, dan kebocoran data.
---

# Skill: Divisi Keamanan & Integritas Sistem (`madzhair-security`)

## 1. Tanggung Jawab Utama
- Melakukan audit keamanan pada seluruh alur database, API/RPC, rute admin, dan input pengguna/admin sebelum kode diloloskan oleh `madzhair-coordinator`.

## 2. Aturan Keamanan Wajib (Zero-Trust Policy)
1. **Proteksi Booking Publik Tanpa Login:**
   - Publik **DILARANG** memiliki akses `INSERT`, `UPDATE`, atau `DELETE` langsung ke tabel `bookings` pada kebijakan Supabase RLS.
   - Seluruh pembuatan booking publik wajib melewati RPC `create_booking_safe` atau Route Handler yang menerapkan:
     - **Rate Limiting:** Maksimal 3 percobaan booking per IP/sesi dalam 15 menit.
     - **Honeypot Field:** Input tersembunyi pada form booking untuk memblokir bot otomatis secara senyap.
     - **Sanitasi Input:** Panjang `customer_name` dibatasi `2–40 karakter`, bersih dari karakter kontrol atau tag HTML.
2. **Integritas Smart Ticket (`/tiket/[code]`):**
   - Kode tiket wajib acak dan tidak boleh berurutan (*anti-enumeration*).
   - Penyembunyian tombol admin di UI **tidak dianggap pengamanan**. Setiap mutasi jadwal (*reschedule* atau *cancel*) wajib memverifikasi token sesi `auth.uid()` admin yang valid di sisi server / RLS Supabase.
3. **Anti-XSS pada Embed Media Sosial:**
   - Input URL galeri wajib divalidasi menggunakan **Strict Domain Whitelist**: hanya mengizinkan protokol `https://` dari `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`, dan `www.instagram.com`.
   - Dilarang merender raw HTML/script sembarangan dari input database tanpa sanitasi.
4. **Proteksi Admin & Storage:**
   - Rute `/admin/*` (kecuali `/admin/login`) wajib diproteksi oleh Next.js 16 Proxy (`src/proxy.ts`, menggantikan konvensi lama `middleware.ts`) yang memverifikasi sesi Supabase Auth melalui `createServerClient(...).auth.getUser()`. Jika env Supabase belum terpasang atau sesi tidak valid, alihkan ke `/admin/login`; jika sesi valid mengakses `/admin/login`, alihkan ke `/admin`.
   - Bucket Supabase Storage `gallery` hanya mengizinkan upload oleh pengguna terautentikasi dengan batas ukuran file maksimal `3 MB` dan MIME type `image/jpeg`, `image/png`, `image/webp`.
5. **HTTP Security Headers:**
   - Wajib menerapkan `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, serta `Content-Security-Policy` yang hanya mengizinkan frame/connect ke `'self'`, `*.supabase.co`, `wss://*.supabase.co`, TikTok (`www.tiktok.com`, `*.tiktok.com`), Instagram (`www.instagram.com`), dan Google Maps (`www.google.com`, `maps.google.com`, `maps.app.goo.gl`), serta `img-src 'self' data: blob: https:`.

## 3. Implementasi Utilitas Keamanan (`src/lib/security/` & `src/proxy.ts`)
- **`src/lib/security/rate-limit.ts`**:
  - `checkBookingRateLimit(key: string)` — Sliding-window in-memory rate limiter (maksimal `3` percobaan per `900_000` ms / 15 menit per IP). Mengembalikan `{ allowed, remaining, retryAfterSeconds }`.
  - `extractClientIp(headers: Headers)` — Ekstraksi IP klien dari `x-vercel-forwarded-for`, `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`.
- **`src/lib/security/sanitize.ts`**:
  - `checkHoneypot(value: unknown)` — Deteksi isian field tersembunyi oleh bot (`true` jika terisi).
  - `sanitizeCustomerName(raw: unknown)` — Strip tag HTML (iteratif), karakter kontrol/zero-width, rapikan spasi, wajib `2–40` karakter.
  - `validateSocialEmbedUrl(raw: unknown)` — Strict `https://` whitelist hanya untuk `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`, dan `www.instagram.com` (menolak `javascript:`, `data:`, `http:`, kredensial/port, dan domain lain).
  - `validateTicketCode(raw: string)` — Validasi format `^MDZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$` (serta `^MDZ-[A-Z0-9]{4}$` untuk kompatibilitas demo).
  - `validateServiceTimeFormat(time: string)` — Validasi format waktu `^([01]\d|2[0-3]):[0-5]\d(:00)?$`.
- **`src/lib/security/headers.ts`**:
  - `buildCspHeader()`, `SECURITY_HEADERS`, dan `applySecurityHeaders(headers)`.
- **`src/proxy.ts`**:
  - Konvensi Next.js 16 (`export async function proxy(request: NextRequest)` + `export const config`) yang menginjeksi `SECURITY_HEADERS` pada respons dan memproteksi rute `/admin/*` secara fail-closed.

## 4. Protokol Audit & Pembaruan Skill
- Divisi Security berhak memberikan status **BLOCKED** pada laporan divisi lain jika ditemukan celah di atas.
- Setiap pola ancaman baru atau pembaruan aturan validasi wajib langsung dicatat ke `SKILL.md` ini.
