-- ============================================================================
-- Madzhair.co — Initial Database Schema, RPCs, RLS, Realtime, Storage & Seed
-- Version: 1.0
-- ============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Helper Trigger Function for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Tables

-- 3.1 store_settings
CREATE TABLE IF NOT EXISTS public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'Madzhair.co',
  brand_tagline text NOT NULL DEFAULT 'Madzhair Barber & Co',
  whatsapp_number text NOT NULL DEFAULT '62895701807228',
  short_address text NOT NULL DEFAULT 'Jalan Raya Sungai Kunyit, Gang Tani',
  google_maps_url text NOT NULL DEFAULT 'https://maps.app.goo.gl/sWp9PBaNSmE4zqYTA',
  timezone text NOT NULL DEFAULT 'Asia/Pontianak',
  lead_time_minutes int NOT NULL DEFAULT 30 CHECK (lead_time_minutes >= 0 AND lead_time_minutes <= 240),
  is_force_closed boolean NOT NULL DEFAULT false,
  logo_url text,
  hero_image_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER trg_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3.2 weekly_schedules (0 = Minggu .. 6 = Sabtu)
CREATE TABLE IF NOT EXISTS public.weekly_schedules (
  day_of_week int PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_open boolean NOT NULL DEFAULT true,
  open_time time NOT NULL,
  close_time time NOT NULL,
  CONSTRAINT chk_weekly_schedule_times CHECK ((NOT is_open) OR (close_time > open_time))
);

-- 3.3 closed_dates
CREATE TABLE IF NOT EXISTS public.closed_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closed_date date UNIQUE NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.4 services
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  subtitle text,
  price_display text NOT NULL,
  price_min int NOT NULL CHECK (price_min >= 0),
  price_max int NOT NULL CHECK (price_max >= price_min),
  price_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_duration_minutes int NOT NULL CHECK (display_duration_minutes > 0),
  slot_duration_minutes int NOT NULL CHECK (slot_duration_minutes > 0),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_services_updated_at ON public.services;
CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3.5 gallery_items
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'tiktok', 'instagram')),
  media_url text NOT NULL,
  thumbnail_url text,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.6 bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code text UNIQUE NOT NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  service_name text NOT NULL,
  customer_name text NOT NULL,
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'COMPLETED', 'CANCELLED')),
  source text NOT NULL DEFAULT 'ONLINE' CHECK (source IN ('ONLINE', 'WALKIN')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bookings_time_range CHECK (end_time > start_time)
);

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes on bookings
CREATE INDEX IF NOT EXISTS idx_bookings_date_status
  ON public.bookings (booking_date, status);

CREATE INDEX IF NOT EXISTS idx_bookings_ticket_code
  ON public.bookings (ticket_code);

-- 4. Ticket Code Generator (Non-ambiguous MDZ-XXXX, no O, I, 0, 1)
CREATE OR REPLACE FUNCTION public.generate_madzhair_ticket_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 32 non-ambiguous characters (256 % 32 == 0, zero modulo bias)
  v_chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := gen_random_bytes(4);
  v_code text := 'MDZ-';
  v_idx int;
BEGIN
  FOR i IN 0..3 LOOP
    v_idx := (get_byte(v_bytes, i) % 32) + 1;
    v_code := v_code || substr(v_chars, v_idx, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

-- 5. RPC Functions (Atomic Booking, Smart Ticket & Admin Operations)

-- 5.1 create_booking_safe
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_service_id uuid,
  p_customer_name text,
  p_booking_date date,
  p_start_time time,
  p_source text DEFAULT 'ONLINE'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_name text;
  v_service public.services%ROWTYPE;
  v_settings public.store_settings%ROWTYPE;
  v_schedule public.weekly_schedules%ROWTYPE;
  v_end_time time;
  v_start_minutes int;
  v_dow int;
  v_now_local timestamp;
  v_today_local date;
  v_slot_start_local timestamp;
  v_ticket_code text;
  v_attempt int;
  v_booking public.bookings%ROWTYPE;
BEGIN
  -- Validate source & auth for WALKIN
  IF p_source IS NULL OR p_source NOT IN ('ONLINE', 'WALKIN') THEN
    RAISE EXCEPTION 'INVALID_SOURCE';
  END IF;

  IF p_source = 'WALKIN' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Sanitize customer_name (strip control chars & HTML angle brackets, trim, 2..40 chars)
  v_customer_name := regexp_replace(coalesce(p_customer_name, ''), '[[:cntrl:]<>]+', ' ', 'g');
  v_customer_name := trim(regexp_replace(v_customer_name, '\s+', ' ', 'g'));

  IF char_length(v_customer_name) < 2 OR char_length(v_customer_name) > 40 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_NAME';
  END IF;

  IF p_booking_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME';
  END IF;

  -- Online bookings must align with the 1-hour grid
  IF p_source = 'ONLINE' AND (EXTRACT(MINUTE FROM p_start_time) <> 0 OR EXTRACT(SECOND FROM p_start_time) <> 0) THEN
    RAISE EXCEPTION 'INVALID_SLOT_GRID';
  END IF;

  -- Acquire transaction-scoped advisory lock per booking_date to prevent double-booking
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_' || p_booking_date::text));

  -- Load active service
  SELECT * INTO v_service
  FROM public.services
  WHERE id = p_service_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  v_start_minutes := (EXTRACT(HOUR FROM p_start_time)::int * 60) + EXTRACT(MINUTE FROM p_start_time)::int;
  IF v_start_minutes + v_service.slot_duration_minutes > 1439 THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  v_end_time := p_start_time + make_interval(mins => v_service.slot_duration_minutes);
  IF v_end_time <= p_start_time THEN
    RAISE EXCEPTION 'INVALID_TIME_RANGE';
  END IF;

  -- Load store settings
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

  -- Check holiday / closed_dates
  IF EXISTS (
    SELECT 1 FROM public.closed_dates
    WHERE closed_date = p_booking_date
  ) THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  -- Check weekly schedule
  v_dow := EXTRACT(DOW FROM p_booking_date)::int;
  SELECT * INTO v_schedule
  FROM public.weekly_schedules
  WHERE day_of_week = v_dow;

  IF NOT FOUND OR NOT v_schedule.is_open THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  IF p_start_time < v_schedule.open_time OR v_end_time > v_schedule.close_time THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  -- Timezone-aware date & lead-time validation
  v_now_local := now() AT TIME ZONE COALESCE(v_settings.timezone, 'Asia/Pontianak');
  v_today_local := v_now_local::date;
  v_slot_start_local := p_booking_date::timestamp + p_start_time;

  IF p_booking_date < v_today_local THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;

  IF p_source = 'ONLINE' THEN
    IF v_slot_start_local <= (v_now_local + make_interval(mins => v_settings.lead_time_minutes)) THEN
      RAISE EXCEPTION 'SLOT_LEAD_TIME_EXPIRED';
    END IF;
  END IF;

  -- Overlap detection (single chair)
  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE booking_date = p_booking_date
      AND status IN ('BOOKED', 'COMPLETED')
      AND start_time < v_end_time
      AND end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  -- Generate unique MDZ-XXXX ticket code
  FOR v_attempt IN 1..25 LOOP
    v_ticket_code := public.generate_madzhair_ticket_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.bookings WHERE ticket_code = v_ticket_code
    );
    IF v_attempt = 25 THEN
      RAISE EXCEPTION 'TICKET_GENERATION_FAILED';
    END IF;
  END LOOP;

  -- Insert booking
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

  RETURN v_booking;
END;
$$;

-- 5.2 reschedule_booking_safe (Admin only)
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
  v_schedule public.weekly_schedules%ROWTYPE;
  v_slot_duration int;
  v_new_end_time time;
  v_start_minutes int;
  v_dow int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_booking_id IS NULL OR p_new_start_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  -- Lock date atomically and re-read booking
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

  IF NOT FOUND THEN
    v_slot_duration := (EXTRACT(EPOCH FROM (v_booking.end_time - v_booking.start_time))::int) / 60;
  END IF;

  v_start_minutes := (EXTRACT(HOUR FROM p_new_start_time)::int * 60) + EXTRACT(MINUTE FROM p_new_start_time)::int;
  IF v_start_minutes + v_slot_duration > 1439 THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  v_new_end_time := p_new_start_time + make_interval(mins => v_slot_duration);
  IF v_new_end_time <= p_new_start_time THEN
    RAISE EXCEPTION 'INVALID_TIME_RANGE';
  END IF;

  -- Ensure date is open and new slot is within weekly schedule
  IF EXISTS (
    SELECT 1 FROM public.closed_dates WHERE closed_date = v_booking.booking_date
  ) THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  v_dow := EXTRACT(DOW FROM v_booking.booking_date)::int;
  SELECT * INTO v_schedule
  FROM public.weekly_schedules
  WHERE day_of_week = v_dow;

  IF NOT FOUND OR NOT v_schedule.is_open THEN
    RAISE EXCEPTION 'DATE_CLOSED';
  END IF;

  IF p_new_start_time < v_schedule.open_time OR v_new_end_time > v_schedule.close_time THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  -- Overlap check excluding current booking
  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE booking_date = v_booking.booking_date
      AND id <> p_booking_id
      AND status IN ('BOOKED', 'COMPLETED')
      AND start_time < v_new_end_time
      AND end_time > p_new_start_time
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  UPDATE public.bookings
  SET
    start_time = p_new_start_time,
    end_time = v_new_end_time,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

-- 5.3 cancel_booking_safe (Admin only)
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

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

-- 5.4 complete_booking_safe (Admin only)
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

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

-- 5.5 get_public_bookings_for_date (Public slot-engine safe view without PII)
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    b.id,
    b.booking_date,
    b.start_time,
    b.end_time,
    b.status
  FROM public.bookings b
  WHERE b.booking_date = p_date
    AND b.status IN ('BOOKED', 'COMPLETED')
  ORDER BY b.start_time ASC;
$$;

-- 5.6 get_booking_by_ticket_code (Smart Ticket lookup by exact ticket code)
CREATE OR REPLACE FUNCTION public.get_booking_by_ticket_code(
  p_ticket_code text
)
RETURNS SETOF public.bookings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.*
  FROM public.bookings b
  WHERE b.ticket_code = upper(trim(coalesce(p_ticket_code, '')))
  LIMIT 1;
$$;

-- 6. Function Permissions
REVOKE ALL ON FUNCTION public.generate_madzhair_ticket_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_safe(uuid, text, date, time, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_booking_safe(uuid, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_booking_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_bookings_for_date(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_by_ticket_code(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking_safe(uuid, text, date, time, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_bookings_for_date(date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_by_ticket_code(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reschedule_booking_safe(uuid, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_booking_safe(uuid) TO authenticated;

-- 7. Row Level Security (RLS)
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closed_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Enforce zero direct writes to bookings by anon at privilege level as well as RLS
REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM anon;
GRANT SELECT ON public.bookings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;

-- store_settings policies
DROP POLICY IF EXISTS "Public read store_settings" ON public.store_settings;
CREATE POLICY "Public read store_settings"
  ON public.store_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated write store_settings" ON public.store_settings;
CREATE POLICY "Authenticated write store_settings"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- weekly_schedules policies
DROP POLICY IF EXISTS "Public read weekly_schedules" ON public.weekly_schedules;
CREATE POLICY "Public read weekly_schedules"
  ON public.weekly_schedules FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated write weekly_schedules" ON public.weekly_schedules;
CREATE POLICY "Authenticated write weekly_schedules"
  ON public.weekly_schedules FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- closed_dates policies
DROP POLICY IF EXISTS "Public read closed_dates" ON public.closed_dates;
CREATE POLICY "Public read closed_dates"
  ON public.closed_dates FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated write closed_dates" ON public.closed_dates;
CREATE POLICY "Authenticated write closed_dates"
  ON public.closed_dates FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- services policies
DROP POLICY IF EXISTS "Public read services" ON public.services;
CREATE POLICY "Public read services"
  ON public.services FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated write services" ON public.services;
CREATE POLICY "Authenticated write services"
  ON public.services FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- gallery_items policies
DROP POLICY IF EXISTS "Public read gallery_items" ON public.gallery_items;
CREATE POLICY "Public read gallery_items"
  ON public.gallery_items FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated write gallery_items" ON public.gallery_items;
CREATE POLICY "Authenticated write gallery_items"
  ON public.gallery_items FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- bookings policies (Public SELECT only for realtime/slot engine; NO public INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Public read bookings for slot sync" ON public.bookings;
CREATE POLICY "Public read bookings for slot sync"
  ON public.bookings FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Authenticated full access bookings" ON public.bookings;
CREATE POLICY "Authenticated full access bookings"
  ON public.bookings FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 8. Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.bookings,
  public.store_settings,
  public.weekly_schedules,
  public.closed_dates;

-- 9. Storage Bucket 'gallery'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gallery',
  'gallery',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read gallery bucket" ON storage.objects;
CREATE POLICY "Public read gallery bucket"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Authenticated upload gallery bucket" ON storage.objects;
CREATE POLICY "Authenticated upload gallery bucket"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated update gallery bucket" ON storage.objects;
CREATE POLICY "Authenticated update gallery bucket"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'gallery' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'gallery' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated delete gallery bucket" ON storage.objects;
CREATE POLICY "Authenticated delete gallery bucket"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'gallery' AND auth.uid() IS NOT NULL);

-- 10. Initial Seed Data (PRD Section 6)

-- 10.1 store_settings
INSERT INTO public.store_settings (
  store_name,
  brand_tagline,
  whatsapp_number,
  short_address,
  google_maps_url,
  timezone,
  lead_time_minutes,
  is_force_closed,
  logo_url,
  hero_image_url
)
SELECT
  'Madzhair.co',
  'Madzhair Barber & Co',
  '62895701807228',
  'Jalan Raya Sungai Kunyit, Gang Tani',
  'https://maps.app.goo.gl/sWp9PBaNSmE4zqYTA',
  'Asia/Pontianak',
  30,
  false,
  '/icons/icon-192.png',
  '/images/hero-barber.webp'
WHERE NOT EXISTS (SELECT 1 FROM public.store_settings);

-- 10.2 weekly_schedules (Minggu 0 .. Kamis 4: 12:00-21:00, Jumat 5: 13:00-21:00, Sabtu 6: 10:00-20:00)
INSERT INTO public.weekly_schedules (day_of_week, is_open, open_time, close_time)
VALUES
  (0, true, '12:00:00', '21:00:00'),
  (1, true, '12:00:00', '21:00:00'),
  (2, true, '12:00:00', '21:00:00'),
  (3, true, '12:00:00', '21:00:00'),
  (4, true, '12:00:00', '21:00:00'),
  (5, true, '13:00:00', '21:00:00'),
  (6, true, '10:00:00', '20:00:00')
ON CONFLICT (day_of_week) DO NOTHING;

-- 10.3 services
INSERT INTO public.services (
  slug,
  name,
  subtitle,
  price_display,
  price_min,
  price_max,
  price_variants,
  display_duration_minutes,
  slot_duration_minutes,
  sort_order,
  is_active
)
VALUES
  (
    'haircut',
    'Haircut',
    'Fade, Taper, Longtrim, Kids (konsultasi di lokasi)',
    'Rp 30k – 40k',
    30000,
    40000,
    '[{"label":"Kids","price":30000,"display":"30k"},{"label":"Longtrim & Regular","price":35000,"display":"35k"},{"label":"Fade & Taper","price":40000,"display":"40k"}]'::jsonb,
    45,
    60,
    1,
    true
  ),
  (
    'hair-chemicals',
    'Hair Chemicals',
    'Downperm, Wavyperm, Designperm (konsultasi di lokasi)',
    'Rp 250k',
    250000,
    250000,
    '[{"label":"Downperm / Wavyperm / Designperm","price":250000,"display":"250k"}]'::jsonb,
    120,
    120,
    2,
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- 10.4 gallery_items (Sample placeholders, replaceable via Admin CMS)
INSERT INTO public.gallery_items (
  title,
  media_type,
  media_url,
  thumbnail_url,
  caption,
  sort_order,
  is_active
)
SELECT * FROM (
  VALUES
    (
      'Fade & Taper Signature',
      'photo',
      '/images/style-fade.webp',
      '/images/style-fade.webp',
      'Gradasi halus dan garis tepi presisi sesuai bentuk kepala.',
      1,
      true
    ),
    (
      'Wavy Perm & Downperm',
      'photo',
      '/images/style-perm.webp',
      '/images/style-perm.webp',
      'Tekstur ikal natural dengan sisi samping rapi tahan lama.',
      2,
      true
    ),
    (
      'Madzhair Chair — Sungai Kunyit',
      'photo',
      '/images/hero-barber.webp',
      '/images/hero-barber.webp',
      'Satu kursi privat, fokus penuh untuk satu pelanggan tiap sesi.',
      3,
      true
    ),
    (
      'Reel Proses Fade & Styling',
      'tiktok',
      'https://www.tiktok.com/@madzhair.co/video/7000000000000000001',
      '/images/style-fade.webp',
      'Cuplikan detail fade dan finishing sebelum sesi selesai.',
      4,
      true
    ),
    (
      'Reels Transformasi Perm',
      'instagram',
      'https://www.instagram.com/reel/C0000000001/',
      '/images/style-perm.webp',
      'Hasil konsultasi dan proses wavyperm ~2 jam di Madzhair.co.',
      5,
      true
    )
) AS seed_gallery(title, media_type, media_url, thumbnail_url, caption, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.gallery_items);
