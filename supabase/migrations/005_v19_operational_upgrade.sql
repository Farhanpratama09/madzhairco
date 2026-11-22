-- ============================================================================
-- Madzhair.co (Madzhair Barber & Co) — Migration 005 (v1.9 Operational Upgrade)
-- Lokasi UI : Sungai Kunyit, Kalimantan Barat (WIB)
-- IANA TZ   : Asia/Pontianak (UTC+7)
--
-- Mencakup:
--   1. Tabel privat `public.booking_contacts` (ZERO akses anon — proteksi WA)
--   2. Kolom audit reschedule (`rescheduled_at`, `previous_date`,
--      `previous_start_time`, `previous_end_time`) pada `public.bookings`
--   3. Kolom jam istirahat & pengingat (`break_enabled`, `break_start`,
--      `break_end`, `break_reminder_sent_date`) pada `public.store_settings`
--   4. Kolom `close_from_time` pada `public.closed_dates` (tutup mulai jam sekarang)
--   5. Tabel privat `public.push_subscriptions` (ZERO akses anon)
--   6. Drop + recreate `create_booking_safe` & `reschedule_booking_safe`
--      (bebas function overload trap PostgreSQL)
--   7. Fungsi idempoten `auto_complete_overdue_bookings()`
--
-- Aman & idempoten untuk dijalankan pada database Supabase yang sudah terisi.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel Privat Kontak Pelanggan (public.booking_contacts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_contacts (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  phone text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_booking_contacts_phone CHECK (phone ~ '^62[1-9][0-9]{7,12}$')
);

DROP TRIGGER IF EXISTS trg_booking_contacts_updated_at ON public.booking_contacts;
CREATE TRIGGER trg_booking_contacts_updated_at
  BEFORE UPDATE ON public.booking_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.booking_contacts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.booking_contacts FROM PUBLIC;
REVOKE ALL ON TABLE public.booking_contacts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_contacts TO authenticated;

DROP POLICY IF EXISTS "Authenticated manage booking_contacts" ON public.booking_contacts;
CREATE POLICY "Authenticated manage booking_contacts"
  ON public.booking_contacts FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 2. Kolom Audit Perubahan Jadwal pada public.bookings
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_date date,
  ADD COLUMN IF NOT EXISTS previous_start_time time,
  ADD COLUMN IF NOT EXISTS previous_end_time time;

-- ----------------------------------------------------------------------------
-- 3. Kolom Jam Istirahat & Pelacak Pengingat pada public.store_settings
-- ----------------------------------------------------------------------------
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS break_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_start time NOT NULL DEFAULT '17:15:00',
  ADD COLUMN IF NOT EXISTS break_end time NOT NULL DEFAULT '18:30:00',
  ADD COLUMN IF NOT EXISTS break_reminder_sent_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_store_settings_break_times'
      AND conrelid = 'public.store_settings'::regclass
  ) THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT chk_store_settings_break_times CHECK (break_end > break_start);
  END IF;
END;
$$;

-- Pastikan timezone tetap valid IANA Asia/Pontianak
UPDATE public.store_settings
SET timezone = 'Asia/Pontianak'
WHERE timezone IS NULL OR trim(timezone) = '';

-- ----------------------------------------------------------------------------
-- 4. Kolom Tutup Mulai Jam Sekarang pada public.closed_dates
-- ----------------------------------------------------------------------------
ALTER TABLE public.closed_dates
  ADD COLUMN IF NOT EXISTS close_from_time time DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 5. Tabel Privat Web Push Subscriptions (public.push_subscriptions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text UNIQUE NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS "Authenticated manage push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Authenticated manage push_subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 6. Drop Signature Lama Sebelum Recreate (Anti Function Overload Trap)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_booking_safe(uuid, text, date, time, text);
DROP FUNCTION IF EXISTS public.create_booking_safe(uuid, text, date, time, text, text);
DROP FUNCTION IF EXISTS public.reschedule_booking_safe(uuid, time);

-- ----------------------------------------------------------------------------
-- 6.1 create_booking_safe (v1.9: WA ke booking_contacts + break + close_from_time)
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
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_phone text;
  v_service public.services%ROWTYPE;
  v_settings public.store_settings%ROWTYPE;
  v_schedule public.weekly_schedules%ROWTYPE;
  v_closed_entry public.closed_dates%ROWTYPE;
  v_effective_close_time time;
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

  -- Normalize & validate customer WhatsApp phone
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

  -- Check holiday / closed_dates (NULL close_from_time = full-day close, non-NULL = early close cutoff)
  SELECT * INTO v_closed_entry
  FROM public.closed_dates
  WHERE closed_date = p_booking_date
  LIMIT 1;

  IF FOUND AND v_closed_entry.close_from_time IS NULL THEN
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

  v_effective_close_time := v_schedule.close_time;
  IF v_closed_entry.id IS NOT NULL AND v_closed_entry.close_from_time IS NOT NULL THEN
    v_effective_close_time := LEAST(v_schedule.close_time, v_closed_entry.close_from_time);
  END IF;

  IF p_start_time < v_schedule.open_time OR v_end_time > v_effective_close_time THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  -- Break time interval overlap check (full service duration: slot_start < break_end AND slot_end > break_start)
  IF v_settings.break_enabled
     AND p_start_time < v_settings.break_end
     AND v_end_time > v_settings.break_start THEN
    RAISE EXCEPTION 'BREAK_TIME_CONFLICT';
  END IF;

  -- Timezone-aware date & lead-time validation (Asia/Pontianak)
  v_now_local := now() AT TIME ZONE COALESCE(NULLIF(trim(v_settings.timezone), ''), 'Asia/Pontianak');
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

  -- Overlap detection (single chair, only active BOOKED slots block the chair)
  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE booking_date = p_booking_date
      AND status = 'BOOKED'
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

  -- Atomically store customer WhatsApp in private booking_contacts table
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
-- 6.2 reschedule_booking_safe (v1.9: audit kolom previous_* + break + close_from_time)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_booking_safe(
  p_booking_id uuid,
  p_new_start_time time
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_settings public.store_settings%ROWTYPE;
  v_schedule public.weekly_schedules%ROWTYPE;
  v_closed_entry public.closed_dates%ROWTYPE;
  v_effective_close_time time;
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

  -- Load store settings
  SELECT * INTO v_settings
  FROM public.store_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Check closed_dates (NULL close_from_time = full-day close, non-NULL = early close cutoff)
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

  -- Break time interval overlap check (full service duration)
  IF v_settings.id IS NOT NULL
     AND v_settings.break_enabled
     AND p_new_start_time < v_settings.break_end
     AND v_new_end_time > v_settings.break_start THEN
    RAISE EXCEPTION 'BREAK_TIME_CONFLICT';
  END IF;

  -- Overlap check excluding current booking (only active BOOKED slots occupy the chair)
  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE booking_date = v_booking.booking_date
      AND id <> p_booking_id
      AND status = 'BOOKED'
      AND start_time < v_new_end_time
      AND end_time > p_new_start_time
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  -- Save previous schedule audit columns & update to new time
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

-- ----------------------------------------------------------------------------
-- 7. Fungsi Idempoten Auto-Complete Overdue Bookings (end_time + 15 menit WIB)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_complete_overdue_bookings()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
  v_now_local timestamp;
  v_updated_count int := 0;
BEGIN
  SELECT COALESCE(NULLIF(trim(timezone), ''), 'Asia/Pontianak')
  INTO v_timezone
  FROM public.store_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_timezone IS NULL THEN
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

-- ----------------------------------------------------------------------------
-- 8. Reset Function Grants (Zero-Trust Least Privilege)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_booking_safe(uuid, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_complete_overdue_bookings() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_safe(uuid, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_complete_overdue_bookings() TO anon, authenticated;
