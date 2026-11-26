-- ============================================================================
-- Madzhair Barber & Co — Migration 008 (Comprehensive Security Hardening)
-- Lokasi UI : Sungai Kunyit, Kalimantan Barat (WIB)
-- IANA TZ   : Asia/Pontianak (UTC+7)
--
-- Mencakup:
--   1. [KRITIS-01] Cabut akses SELECT langsung role `anon` pada `public.bookings`
--      dan hapus policy publik agar PII (`customer_name`, `ticket_code`) tidak
--      bocor via PostgREST maupun frame WebSocket `supabase_realtime`.
--   2. [TINGGI-04] Tabel RBAC `public.admin_users` (auto-seed dari `auth.users`)
--      dan fungsi `public.is_admin()` untuk menggantikan `auth.uid() IS NOT NULL`
--      di seluruh RLS policy, storage policy, serta RPC admin.
--   3. [TINGGI-03] Perpanjang kode e-tiket `generate_madzhair_ticket_code()` dari
--      4 menjadi 8 karakter (`MDZ-XXXXXXXX`, ~1,1 triliun kombinasi bebas bias).
--   4. [TINGGI-01] Cabut `EXECUTE` pada `public.create_booking_safe` dari `anon`
--      (hanya `authenticated` admin & `service_role`), tambahkan batas maksimal
--      tanggal reservasi H+21 (`DATE_TOO_FAR_AHEAD`), dan batasi maks 2 booking
--      aktif per nomor WhatsApp (`MAX_ACTIVE_BOOKINGS_PER_PHONE`) secara atomik.
--   5. [SEDANG-01, 02, 04, 06 & RENDAH-01]
--      - Sanitasi karakter Unicode zero-width/bidi di `create_booking_safe` dan
--        `CHECK` panjang `customer_name` (2..80) & `notes` (<= 200) di `bookings`.
--      - `CHECK` allowlist IANA timezone Indonesia di `store_settings` dan
--        allowlist vendor resmi HTTPS Web Push di `push_subscriptions`.
--      - Cabut `EXECUTE` pada `auto_complete_overdue_bookings()` dari `anon` dan
--        saring sesi lewat `end_time + 15 minutes` secara read-only (`STABLE`) di
--        `get_public_bookings_for_date` & `get_booking_by_ticket_code`.
--      - Standarisasi `SET search_path = public, pg_temp` pada semua fungsi.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Kunci search_path pada fungsi trigger set_updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. [KRITIS-01] Cabut Akses Baca Langsung `anon` pada `public.bookings`
-- ----------------------------------------------------------------------------
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookings FROM anon;
DROP POLICY IF EXISTS "Public read bookings for slot sync" ON public.bookings;

-- ----------------------------------------------------------------------------
-- 2. [TINGGI-04] Tabel RBAC `public.admin_users` & Fungsi `public.is_admin()`
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-seed akun pemilik/admin yang sudah ada di auth.users secara idempoten
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_users FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.admin_users FROM authenticated;
GRANT SELECT ON TABLE public.admin_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_users TO service_role;

DROP POLICY IF EXISTS "Users read own admin membership" ON public.admin_users;
CREATE POLICY "Users read own admin membership"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Perbarui seluruh RLS policy tulis/admin agar wajib melewati public.is_admin()
DROP POLICY IF EXISTS "Authenticated write store_settings" ON public.store_settings;
CREATE POLICY "Authenticated write store_settings"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated write weekly_schedules" ON public.weekly_schedules;
CREATE POLICY "Authenticated write weekly_schedules"
  ON public.weekly_schedules FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated write closed_dates" ON public.closed_dates;
CREATE POLICY "Authenticated write closed_dates"
  ON public.closed_dates FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated write services" ON public.services;
CREATE POLICY "Authenticated write services"
  ON public.services FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated write gallery_items" ON public.gallery_items;
CREATE POLICY "Authenticated write gallery_items"
  ON public.gallery_items FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated full access bookings" ON public.bookings;
CREATE POLICY "Authenticated full access bookings"
  ON public.bookings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated manage booking_contacts" ON public.booking_contacts;
CREATE POLICY "Authenticated manage booking_contacts"
  ON public.booking_contacts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated manage push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Authenticated manage push_subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated upload gallery bucket" ON storage.objects;
CREATE POLICY "Authenticated upload gallery bucket"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND public.is_admin());

DROP POLICY IF EXISTS "Authenticated update gallery bucket" ON storage.objects;
CREATE POLICY "Authenticated update gallery bucket"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'gallery' AND public.is_admin())
  WITH CHECK (bucket_id = 'gallery' AND public.is_admin());

DROP POLICY IF EXISTS "Authenticated delete gallery bucket" ON storage.objects;
CREATE POLICY "Authenticated delete gallery bucket"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'gallery' AND public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. [SEDANG-01, 04, 06] CHECK Constraints & Indeks Anti-Spam
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_booking_contacts_phone
  ON public.booking_contacts (phone);

-- Normalisasi defensif baris historis sebelum memasang CHECK constraint
UPDATE public.bookings
SET customer_name = left(
  CASE
    WHEN char_length(btrim(customer_name)) < 2 THEN 'Pelanggan'
    ELSE btrim(customer_name)
  END,
  80
)
WHERE char_length(customer_name) < 2 OR char_length(customer_name) > 80;

UPDATE public.bookings
SET notes = left(notes, 200)
WHERE notes IS NOT NULL AND char_length(notes) > 200;

UPDATE public.store_settings
SET timezone = 'Asia/Pontianak'
WHERE timezone IS NULL
   OR timezone NOT IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura');

DELETE FROM public.push_subscriptions
WHERE char_length(endpoint) > 2048
   OR endpoint !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)+push\.services\.mozilla\.com|([a-z0-9-]+\.)+push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)/';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_bookings_customer_name_len'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT chk_bookings_customer_name_len
      CHECK (char_length(customer_name) BETWEEN 2 AND 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_bookings_notes_len'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT chk_bookings_notes_len
      CHECK (notes IS NULL OR char_length(notes) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_store_settings_timezone'
      AND conrelid = 'public.store_settings'::regclass
  ) THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT chk_store_settings_timezone
      CHECK (timezone IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_push_subscriptions_vendor_endpoint'
      AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT chk_push_subscriptions_vendor_endpoint
      CHECK (
        char_length(endpoint) <= 2048
        AND endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)+push\.services\.mozilla\.com|([a-z0-9-]+\.)+push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)/'
      );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. [TINGGI-03] Generator Kode Tiket 8 Karakter CSPRNG (MDZ-XXXXXXXX)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_madzhair_ticket_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 32 karakter non-ambigu (tanpa O, I, 0, 1); 256 % 32 == 0 (bebas modulo bias)
  v_chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_uuid_hex text := replace(gen_random_uuid()::text, '-', '');
  -- Ambil 12 byte murni CSPRNG dari gen_random_uuid() dengan melewati nibble versi/varian UUIDv4
  v_bytes bytea := decode(substr(v_uuid_hex, 1, 12) || substr(v_uuid_hex, 21, 12), 'hex');
  v_code text := 'MDZ-';
  v_idx int;
BEGIN
  FOR i IN 0..7 LOOP
    v_idx := (get_byte(v_bytes, i) % 32) + 1;
    v_code := v_code || substr(v_chars, v_idx, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_madzhair_ticket_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_madzhair_ticket_code() FROM anon;

-- ----------------------------------------------------------------------------
-- 5. [TINGGI-01, TINGGI-04, SEDANG-01, RENDAH-01] Recreate create_booking_safe
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_service_id uuid,
  p_customer_name text,
  p_booking_date date,
  p_start_time time,
  p_source text DEFAULT 'ONLINE',
  p_customer_phone text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text := COALESCE(auth.role(), '');
  v_customer_name text;
  v_phone text;
  v_service public.services%ROWTYPE;
  v_settings public.store_settings%ROWTYPE;
  v_schedule public.weekly_schedules%ROWTYPE;
  v_closed_entry public.closed_dates%ROWTYPE;
  v_effective_close_time time;
  v_timezone text;
  v_duration_minutes int;
  v_end_time time;
  v_start_minutes int;
  v_dow int;
  v_now_local timestamp;
  v_today_local date;
  v_slot_start_local timestamp;
  v_active_phone_bookings int := 0;
  v_ticket_code text;
  v_attempt int;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('ONLINE', 'WALKIN') THEN
    RAISE EXCEPTION 'INVALID_SOURCE';
  END IF;

  IF p_source = 'WALKIN' THEN
    IF v_caller_role <> 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  ELSE
    -- ONLINE wajib dipanggil melalui server service_role (POST /api/bookings) atau admin resmi
    IF v_caller_role NOT IN ('service_role', '') AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  -- Sanitasi Unicode zero-width / bidirectional override + karakter kontrol & kurung sudut HTML
  v_customer_name := translate(
    coalesce(p_customer_name, ''),
    chr(8203) || chr(8204) || chr(8205) ||
    chr(8234) || chr(8235) || chr(8236) || chr(8237) || chr(8238) ||
    chr(8294) || chr(8295) || chr(8296) || chr(8297) || chr(65279),
    ''
  );
  v_customer_name := regexp_replace(v_customer_name, '[[:cntrl:]<>]+', ' ', 'g');
  v_customer_name := trim(regexp_replace(v_customer_name, '\s+', ' ', 'g'));

  IF char_length(v_customer_name) < 2 OR char_length(v_customer_name) > 80 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_NAME';
  END IF;

  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]+', '', 'g');
  IF v_phone <> '' THEN
    IF left(v_phone, 3) = '620' THEN
      v_phone := '62' || substr(v_phone, 4);
    ELSIF left(v_phone, 1) = '0' THEN
      v_phone := '62' || substr(v_phone, 2);
    ELSIF left(v_phone, 1) = '8' THEN
      v_phone := '62' || v_phone;
    END IF;
  END IF;

  IF p_source = 'ONLINE' THEN
    IF v_phone = '' OR v_phone !~ '^62[1-9][0-9]{7,12}$' THEN
      RAISE EXCEPTION 'INVALID_CUSTOMER_PHONE';
    END IF;
  ELSE
    IF v_phone = '' THEN
      v_phone := NULL;
    ELSIF v_phone !~ '^62[1-9][0-9]{7,12}$' THEN
      RAISE EXCEPTION 'INVALID_CUSTOMER_PHONE';
    END IF;
  END IF;

  IF p_booking_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME';
  END IF;

  -- Waktu mulai wajib kelipatan 15 menit (:00, :15, :30, :45) tanpa detik
  IF (EXTRACT(MINUTE FROM p_start_time)::int % 15) <> 0
     OR EXTRACT(SECOND FROM p_start_time) <> 0 THEN
    RAISE EXCEPTION 'INVALID_SLOT_GRID';
  END IF;

  -- Kunci eksklusif nomor WhatsApp (anti race-condition lintas tanggal) + kursi & tanggal reservasi
  IF v_phone IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('madzhair_phone'), hashtext(v_phone));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_chair_1'), hashtext(p_booking_date::text));
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_' || p_booking_date::text));

  SELECT * INTO v_service
  FROM public.services
  WHERE id = p_service_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  v_duration_minutes := GREATEST(15, v_service.slot_duration_minutes);
  v_start_minutes := (EXTRACT(HOUR FROM p_start_time)::int * 60) + EXTRACT(MINUTE FROM p_start_time)::int;

  IF v_start_minutes + v_duration_minutes > 1439 THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  v_end_time := p_start_time + make_interval(mins => v_duration_minutes);
  IF v_end_time <= p_start_time THEN
    RAISE EXCEPTION 'INVALID_TIME_RANGE';
  END IF;

  SELECT * INTO v_settings
  FROM public.store_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_SETTINGS_MISSING';
  END IF;

  IF v_settings.is_force_closed THEN
    RAISE EXCEPTION 'STORE_CLOSED';
  END IF;

  v_timezone := COALESCE(NULLIF(trim(v_settings.timezone), ''), 'Asia/Pontianak');
  IF v_timezone NOT IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura') THEN
    v_timezone := 'Asia/Pontianak';
  END IF;

  v_now_local := now() AT TIME ZONE v_timezone;
  v_today_local := v_now_local::date;
  v_slot_start_local := p_booking_date::timestamp + p_start_time;

  IF p_booking_date < v_today_local THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;

  IF p_booking_date > (v_today_local + 21) THEN
    RAISE EXCEPTION 'DATE_TOO_FAR_AHEAD';
  END IF;

  SELECT * INTO v_closed_entry
  FROM public.closed_dates
  WHERE closed_date = p_booking_date
  LIMIT 1;

  IF FOUND AND v_closed_entry.close_from_time IS NULL THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  v_dow := EXTRACT(DOW FROM p_booking_date)::int;
  SELECT * INTO v_schedule
  FROM public.weekly_schedules
  WHERE day_of_week = v_dow;

  IF NOT FOUND OR NOT v_schedule.is_open THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  v_effective_close_time := v_schedule.close_time;
  IF v_closed_entry.id IS NOT NULL AND v_closed_entry.close_from_time IS NOT NULL THEN
    v_effective_close_time := LEAST(v_schedule.close_time, v_closed_entry.close_from_time);
  END IF;

  IF p_start_time < v_schedule.open_time OR v_end_time > v_effective_close_time THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  IF v_settings.break_enabled
     AND p_start_time < v_settings.break_end
     AND v_end_time > v_settings.break_start THEN
    RAISE EXCEPTION 'BREAK_TIME_CONFLICT';
  END IF;

  IF p_source = 'ONLINE' THEN
    IF v_slot_start_local <= (v_now_local + make_interval(mins => v_settings.lead_time_minutes)) THEN
      RAISE EXCEPTION 'SLOT_LEAD_TIME_EXPIRED';
    END IF;
  END IF;

  -- Bebaskan slot overdue (> end_time + 15 menit WIB) secara atomik sebelum cek kuota & overlap
  UPDATE public.bookings
  SET
    status = 'COMPLETED',
    updated_at = now()
  WHERE status = 'BOOKED'
    AND booking_date <= v_today_local
    AND (booking_date::timestamp + end_time + interval '15 minutes') <= v_now_local;

  -- Batasi maksimal 2 booking aktif (status = 'BOOKED' & booking_date >= v_today_local) per nomor WA
  IF p_source = 'ONLINE' AND v_phone IS NOT NULL THEN
    SELECT COUNT(*)::int
    INTO v_active_phone_bookings
    FROM public.bookings b
    INNER JOIN public.booking_contacts bc ON bc.booking_id = b.id
    WHERE bc.phone = v_phone
      AND b.status = 'BOOKED'
      AND b.booking_date >= v_today_local;

    IF v_active_phone_bookings >= 2 THEN
      RAISE EXCEPTION 'MAX_ACTIVE_BOOKINGS_PER_PHONE';
    END IF;
  END IF;

  -- Deteksi konflik interval kursi tunggal (new_start < existing_end AND new_end > existing_start)
  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE booking_date = p_booking_date
      AND status = 'BOOKED'
      AND p_start_time < end_time
      AND v_end_time > start_time
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  FOR v_attempt IN 1..25 LOOP
    v_ticket_code := public.generate_madzhair_ticket_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.bookings WHERE ticket_code = v_ticket_code
    );
    IF v_attempt = 25 THEN
      RAISE EXCEPTION 'TICKET_GENERATION_FAILED';
    END IF;
  END LOOP;

  INSERT INTO public.bookings (
    ticket_code,
    service_id,
    service_name,
    customer_name,
    booking_date,
    start_time,
    end_time,
    status,
    source
  ) VALUES (
    v_ticket_code,
    v_service.id,
    v_service.name,
    v_customer_name,
    p_booking_date,
    p_start_time,
    v_end_time,
    'BOOKED',
    p_source
  )
  RETURNING * INTO v_booking;

  IF v_phone IS NOT NULL THEN
    INSERT INTO public.booking_contacts (booking_id, phone)
    VALUES (v_booking.id, v_phone)
    ON CONFLICT (booking_id) DO UPDATE
      SET phone = EXCLUDED.phone,
          updated_at = now();
  END IF;

  RETURN v_booking;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. [TINGGI-04 & RENDAH-01] Recreate Admin RPCs dengan public.is_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_booking_safe(
  p_booking_id uuid,
  p_new_start_time time
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_settings public.store_settings%ROWTYPE;
  v_schedule public.weekly_schedules%ROWTYPE;
  v_closed_entry public.closed_dates%ROWTYPE;
  v_effective_close_time time;
  v_timezone text;
  v_slot_duration int;
  v_new_end_time time;
  v_start_minutes int;
  v_dow int;
  v_now_local timestamp;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_booking_id IS NULL OR p_new_start_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME';
  END IF;

  IF (EXTRACT(MINUTE FROM p_new_start_time)::int % 15) <> 0
     OR EXTRACT(SECOND FROM p_new_start_time) <> 0 THEN
    RAISE EXCEPTION 'INVALID_SLOT_GRID';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('madzhair_chair_1'), hashtext(v_booking.booking_date::text));
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_' || v_booking.booking_date::text));

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_booking.status <> 'BOOKED' THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE';
  END IF;

  SELECT slot_duration_minutes INTO v_slot_duration
  FROM public.services
  WHERE id = v_booking.service_id;

  IF NOT FOUND OR v_slot_duration IS NULL OR v_slot_duration <= 0 THEN
    v_slot_duration := (EXTRACT(EPOCH FROM (v_booking.end_time - v_booking.start_time))::int) / 60;
  END IF;

  v_slot_duration := GREATEST(15, v_slot_duration);
  v_start_minutes := (EXTRACT(HOUR FROM p_new_start_time)::int * 60) + EXTRACT(MINUTE FROM p_new_start_time)::int;

  IF v_start_minutes + v_slot_duration > 1439 THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  v_new_end_time := p_new_start_time + make_interval(mins => v_slot_duration);
  IF v_new_end_time <= p_new_start_time THEN
    RAISE EXCEPTION 'INVALID_TIME_RANGE';
  END IF;

  SELECT * INTO v_settings
  FROM public.store_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT * INTO v_closed_entry
  FROM public.closed_dates
  WHERE closed_date = v_booking.booking_date
  LIMIT 1;

  IF FOUND AND v_closed_entry.close_from_time IS NULL THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  v_dow := EXTRACT(DOW FROM v_booking.booking_date)::int;
  SELECT * INTO v_schedule
  FROM public.weekly_schedules
  WHERE day_of_week = v_dow;

  IF NOT FOUND OR NOT v_schedule.is_open THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  v_effective_close_time := v_schedule.close_time;
  IF v_closed_entry.id IS NOT NULL AND v_closed_entry.close_from_time IS NOT NULL THEN
    v_effective_close_time := LEAST(v_schedule.close_time, v_closed_entry.close_from_time);
  END IF;

  IF p_new_start_time < v_schedule.open_time OR v_new_end_time > v_effective_close_time THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  IF v_settings.id IS NOT NULL
     AND v_settings.break_enabled
     AND p_new_start_time < v_settings.break_end
     AND v_new_end_time > v_settings.break_start THEN
    RAISE EXCEPTION 'BREAK_TIME_CONFLICT';
  END IF;

  v_timezone := COALESCE(NULLIF(trim(v_settings.timezone), ''), 'Asia/Pontianak');
  IF v_timezone NOT IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura') THEN
    v_timezone := 'Asia/Pontianak';
  END IF;

  v_now_local := now() AT TIME ZONE v_timezone;
  UPDATE public.bookings
  SET
    status = 'COMPLETED',
    updated_at = now()
  WHERE booking_date = v_booking.booking_date
    AND id <> p_booking_id
    AND status = 'BOOKED'
    AND (booking_date::timestamp + end_time + interval '15 minutes') <= v_now_local;

  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE booking_date = v_booking.booking_date
      AND id <> p_booking_id
      AND status = 'BOOKED'
      AND p_new_start_time < end_time
      AND v_new_end_time > start_time
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  UPDATE public.bookings
  SET
    previous_date = v_booking.booking_date,
    previous_start_time = v_booking.start_time,
    previous_end_time = v_booking.end_time,
    rescheduled_at = now(),
    start_time = p_new_start_time,
    end_time = v_new_end_time,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking_safe(
  p_booking_id uuid
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('madzhair_chair_1'), hashtext(v_booking.booking_date::text));
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_' || v_booking.booking_date::text));

  UPDATE public.bookings
  SET
    status = 'CANCELLED',
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_booking_safe(
  p_booking_id uuid
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('madzhair_chair_1'), hashtext(v_booking.booking_date::text));
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_' || v_booking.booking_date::text));

  UPDATE public.bookings
  SET
    status = 'COMPLETED',
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. [SEDANG-02 & RENDAH-01] Maintenance RPCs & Read-Only Public Slot/Ticket RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_complete_overdue_bookings()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_now_local timestamp;
  v_updated_count int := 0;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', '') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'Asia/Pontianak')
  INTO v_timezone
  FROM public.store_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_timezone IS NULL OR v_timezone NOT IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura') THEN
    v_timezone := 'Asia/Pontianak';
  END IF;

  v_now_local := now() AT TIME ZONE v_timezone;

  UPDATE public.bookings
  SET
    status = 'COMPLETED',
    updated_at = now()
  WHERE status = 'BOOKED'
    AND (booking_date::timestamp + end_time + interval '15 minutes') <= v_now_local;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_operational_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_today_local date;
  v_bookings_cutoff date;
  v_closed_dates_cutoff date;
  v_deleted_contacts int := 0;
  v_deleted_bookings int := 0;
  v_deleted_closed_dates int := 0;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', '') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'Asia/Pontianak')
  INTO v_timezone
  FROM public.store_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_timezone IS NULL OR v_timezone NOT IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura') THEN
    v_timezone := 'Asia/Pontianak';
  END IF;

  v_today_local := (now() AT TIME ZONE v_timezone)::date;
  v_bookings_cutoff := v_today_local - 1;
  v_closed_dates_cutoff := v_today_local - 7;

  DELETE FROM public.booking_contacts
  WHERE booking_id IN (
    SELECT id
    FROM public.bookings
    WHERE booking_date < v_bookings_cutoff
  );
  GET DIAGNOSTICS v_deleted_contacts = ROW_COUNT;

  DELETE FROM public.bookings
  WHERE booking_date < v_bookings_cutoff;
  GET DIAGNOSTICS v_deleted_bookings = ROW_COUNT;

  DELETE FROM public.closed_dates
  WHERE closed_date < v_closed_dates_cutoff;
  GET DIAGNOSTICS v_deleted_closed_dates = ROW_COUNT;

  RETURN jsonb_build_object(
    'todayWib', v_today_local::text,
    'bookingsCutoffDate', v_bookings_cutoff::text,
    'closedDatesCutoffDate', v_closed_dates_cutoff::text,
    'deletedBookingContacts', v_deleted_contacts,
    'deletedBookings', v_deleted_bookings,
    'deletedClosedDates', v_deleted_closed_dates
  );
END;
$$;

-- Read-only public slot query: otomatis menyaring sesi yang sudah lewat end_time + 15 menit
CREATE OR REPLACE FUNCTION public.get_public_bookings_for_date(
  p_date date
)
RETURNS TABLE (
  id uuid,
  booking_date date,
  start_time time,
  end_time time,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_now_local timestamp;
BEGIN
  SELECT COALESCE(NULLIF(trim(s.timezone), ''), 'Asia/Pontianak')
  INTO v_timezone
  FROM public.store_settings s
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_timezone IS NULL OR v_timezone NOT IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura') THEN
    v_timezone := 'Asia/Pontianak';
  END IF;

  v_now_local := now() AT TIME ZONE v_timezone;

  RETURN QUERY
  SELECT
    b.id,
    b.booking_date,
    b.start_time,
    b.end_time,
    b.status
  FROM public.bookings b
  WHERE b.booking_date = p_date
    AND b.status = 'BOOKED'
    AND (b.booking_date::timestamp + b.end_time + interval '15 minutes') > v_now_local
  ORDER BY b.start_time ASC;
END;
$$;

-- Read-only Smart Ticket lookup: proyeksikan status COMPLETED jika sesi sudah lewat end_time + 15 menit
CREATE OR REPLACE FUNCTION public.get_booking_by_ticket_code(
  p_ticket_code text
)
RETURNS SETOF public.bookings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized text := upper(trim(coalesce(p_ticket_code, '')));
  v_timezone text;
  v_now_local timestamp;
  v_row public.bookings%ROWTYPE;
BEGIN
  IF v_normalized = '' OR char_length(v_normalized) > 16 THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_row
  FROM public.bookings b
  WHERE b.ticket_code = v_normalized
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.status = 'BOOKED' THEN
    SELECT COALESCE(NULLIF(trim(s.timezone), ''), 'Asia/Pontianak')
    INTO v_timezone
    FROM public.store_settings s
    ORDER BY s.updated_at DESC
    LIMIT 1;

    IF v_timezone IS NULL OR v_timezone NOT IN ('Asia/Pontianak', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura') THEN
      v_timezone := 'Asia/Pontianak';
    END IF;

    v_now_local := now() AT TIME ZONE v_timezone;
    IF (v_row.booking_date::timestamp + v_row.end_time + interval '15 minutes') <= v_now_local THEN
      v_row.status := 'COMPLETED';
    END IF;
  END IF;

  RETURN NEXT v_row;
  RETURN;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Reset Function Grants (Zero-Trust Least Privilege)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reschedule_booking_safe(uuid, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_booking_safe(uuid, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_safe(uuid, time) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_booking_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking_safe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_booking_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_booking_safe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_booking_safe(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auto_complete_overdue_bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_complete_overdue_bookings() FROM anon;
GRANT EXECUTE ON FUNCTION public.auto_complete_overdue_bookings() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_operational_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_operational_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_operational_data() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_bookings_for_date(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_bookings_for_date(date) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_booking_by_ticket_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_by_ticket_code(text) TO anon, authenticated, service_role;
