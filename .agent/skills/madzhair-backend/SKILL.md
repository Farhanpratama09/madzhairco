---
name: madzhair-backend
description: Pengelola skema PostgreSQL Supabase, fungsi RPC atomic booking lock, kebijakan RLS, dan sinkronisasi Realtime untuk Madzhair.co.
---

# Skill: Divisi Backend & Database (`madzhair-backend`)

## 1. Tanggung Jawab Utama
- Menjaga integritas data di Supabase (`store_settings`, `weekly_schedules`, `closed_dates`, `services`, `gallery_items`, `bookings`).
- Menjamin **0% kemungkinan double-booking** pada kapasitas 1 kursi menggunakan transaksi atomik PostgreSQL.
- Menyediakan kontrak tipe data terpusat di `src/types/database.ts`, data fallback PRD di `src/lib/seed.ts`, client SSR Supabase di `src/lib/supabase/*`, dan pure slot engine di `src/lib/slots.ts`.

## 2. Kontrak Skema Database (`supabase/migrations/001_initial_schema.sql`)
1. **Tabel Inti:**
   - `store_settings`: `id`, `store_name`, `brand_tagline`, `whatsapp_number`, `short_address`, `google_maps_url`, `timezone` (`Asia/Pontianak`), `lead_time_minutes` (`30`), `is_force_closed`, `logo_url`, `hero_image_url`, `updated_at`.
   - `weekly_schedules`: `day_of_week` (`0..6` PK), `is_open`, `open_time`, `close_time` (Default PRD: Min–Kam `12:00–21:00`, Jum `13:00–21:00`, Sab `10:00–20:00`).
   - `closed_dates`: `id`, `closed_date` (unique), `reason`, `created_at`.
   - `services`: `id`, `slug` (unique), `name`, `subtitle`, `price_display`, `price_min`, `price_max`, `price_variants` (jsonb), `display_duration_minutes` (`45` / `120`), `slot_duration_minutes` (`60` / `120`), `sort_order`, `is_active`, `updated_at`.
   - `gallery_items`: `id`, `title`, `media_type` (`photo | tiktok | instagram`), `media_url`, `thumbnail_url`, `caption`, `sort_order`, `is_active`, `created_at`.
   - `bookings`: `id`, `ticket_code` (unique `MDZ-XXXX`), `service_id`, `service_name`, `customer_name`, `booking_date`, `start_time`, `end_time`, `status` (`BOOKED | COMPLETED | CANCELLED`), `source` (`ONLINE | WALKIN`), `notes`, `created_at`, `updated_at`.
   - Index di `bookings`: `idx_bookings_date_status (booking_date, status)` dan `idx_bookings_ticket_code (ticket_code)`.

2. **Fungsi & RPC (`SECURITY DEFINER`, `SET search_path = public, extensions, pg_temp`):**
   - `generate_madzhair_ticket_code()`: menghasilkan `MDZ-` + 4 karakter acak dari alfabet 32-karakter non-ambigu `'23456789ABCDEFGHJKLMNPQRSTUVWXYZ'` (tanpa `O`, `I`, `0`, `1`).
   - `create_booking_safe(p_service_id, p_customer_name, p_booking_date, p_start_time, p_source='ONLINE') -> public.bookings`:
     - Memvalidasi `p_source IN ('ONLINE', 'WALKIN')`; `WALKIN` wajib `auth.uid() IS NOT NULL`.
     - Sanitasi `p_customer_name` (hapus karakter kontrol & `<>`, trim, panjang `2..40`).
     - Mengunci tanggal via `pg_advisory_xact_lock(hashtext('madzhair_' || p_booking_date::text))`.
     - Memeriksa `is_force_closed`, `closed_dates`, `weekly_schedules`, lead time di zona waktu toko (`ONLINE`), dan overlap `(start_time < v_end_time AND end_time > p_start_time)` **HANYA** untuk `status = 'BOOKED'` (`004_free_completed_slots.sql` — booking berstatus `'COMPLETED'` langsung membebaskan slot kursi, sedangkan jam lewat hari ini tetap dijaga `lead_time_minutes`).
     - Menghasilkan `ticket_code` unik dan menyimpan booking dengan status `'BOOKED'`.
   - RPC Admin (wajib `auth.uid() IS NOT NULL`, melempar `'UNAUTHORIZED'` jika null):
     - `reschedule_booking_safe(p_booking_id, p_new_start_time) -> public.bookings` (dengan advisory lock + validasi jadwal & overlap khusus `status = 'BOOKED'`).
     - `cancel_booking_safe(p_booking_id) -> public.bookings`.
     - `complete_booking_safe(p_booking_id) -> public.bookings`.
   - RPC Publik Read-Only:
     - `get_public_bookings_for_date(p_date) -> TABLE (id, booking_date, start_time, end_time, status)` (hanya mengembalikan baris `status = 'BOOKED'`, tanpa PII pelanggan).
     - `get_booking_by_ticket_code(p_ticket_code) -> SETOF public.bookings` (lookup tepat 1 tiket by `ticket_code`).

3. **Keamanan RLS, Privileges (`GRANT`), Realtime, & Storage:**
   - Wajib menyertakan `GRANT USAGE ON SCHEMA public TO anon, authenticated`, `GRANT SELECT` untuk `anon`, serta `GRANT SELECT, INSERT, UPDATE, DELETE` untuk `authenticated` pada seluruh tabel CMS/katalog (`store_settings`, `weekly_schedules`, `closed_dates`, `services`, `gallery_items`, `bookings`) — lihat `supabase/migrations/002_fix_table_grants.sql` — serta `SET search_path = public, extensions, pg_temp` pada `generate_madzhair_ticket_code`, `create_booking_safe`, dan `reschedule_booking_safe` (`003` & `004`).
   - Publik (`anon`) **DILARANG** `INSERT`, `UPDATE`, `DELETE` langsung ke `bookings` (`REVOKE INSERT, UPDATE, DELETE` + tanpa policy tulis).
   - Publik (`anon`) hanya memiliki `SELECT` untuk sinkronisasi slot/Realtime.
   - Mutasi pada `store_settings`, `weekly_schedules`, `closed_dates`, `services`, `gallery_items`, dan `bookings` hanya untuk role `authenticated` (`auth.uid() IS NOT NULL`).
   - `supabase_realtime` publication aktif untuk: `bookings`, `store_settings`, `weekly_schedules`, `closed_dates`.
   - Storage bucket `gallery` (`public = true`, `file_size_limit = 3145728` / 3 MB, `allowed_mime_types = ['image/jpeg', 'image/png', 'image/webp']`, upload/update/delete khusus `authenticated`).

## 3. Kontrak Helper TypeScript (`src/types/*` & `src/lib/*`)
- **`src/types/database.ts`**: Ekspor `type` alias lengkap untuk tabel (`StoreSettings`, `WeeklySchedule`, `ClosedDate`, `Service`, `GalleryItem`, `Booking`, `PublicBookingSlot`), parameter RPC (`CreateBookingSafeParams`, `RescheduleBookingSafeParams`, dll.), tipe slot engine (`SlotItem`, `SlotStatus`, `StoreNowParts`, `StoreLiveStatus`, `UpcomingDateItem`), serta kontrak `Database` (`__InternalSupabase: { PostgrestVersion: "12" }`, `Views/Enums/CompositeTypes: { [_ in never]: never }`). Seluruh tipe wajib memakai `type` alias (bukan `interface`) untuk kompatibilitas `@supabase/supabase-js` v2.119.2+.
- **`src/lib/seed.ts`**: Data fallback PRD Bagian 6 (`DEFAULT_STORE_SETTINGS`, `DEFAULT_WEEKLY_SCHEDULES`, `DEFAULT_CLOSED_DATES`, `DEFAULT_SERVICES`, `DEFAULT_GALLERY_ITEMS`) dan `generateDemoTicketCode()`.
- **`src/lib/supabase/config.ts`**: `getSupabaseConfig()`, `isSupabaseConfigured()`.
- **`src/lib/supabase/client.ts`**: `createClient()` berbasis `createBrowserClient<Database>`.
- **`src/lib/supabase/server.ts`**: `async createClient()` berbasis `createServerClient<Database>` dengan `await cookies()` (Next.js 16).
- **`src/lib/slots.ts`**: Pure TypeScript slot engine; `calculateAvailableSlots` memfilter bentrok kursi khusus `status === "BOOKED"` sehingga slot `COMPLETED` langsung bebas kembali (sementara jam lewat di hari ini tetap diblok oleh aturan `lead_time_minutes`).

## 4. Protokol Laporan & Pembaruan Skill
- Setiap perubahan skema tabel, penambahan kolom, atau revisi fungsi RPC wajib didokumentasikan di `SKILL.md` ini dan diserahkan bersama file migrasi SQL ke `madzhair-coordinator` serta diinformasikan ke `madzhair-security`.
