-- ============================================================================
-- Madzhair Barber & Co — Migration 006 (v2.0 Operational Safeguards)
-- Lokasi UI : Sungai Kunyit, Kalimantan Barat (WIB)
-- IANA TZ   : Asia/Pontianak (UTC+7)
--
-- Mencakup:
--   1. Penguatan transaksi atomik `create_booking_safe` & `reschedule_booking_safe`
--      dengan `pg_advisory_xact_lock` berbasis kursi + tanggal (`madzhair_chair_1`,
--      `p_booking_date`) serta auto-complete slot overdue di dalam lock yang sama.
--   2. Fungsi SQL `cleanup_expired_operational_data()` berbasis tanggal lokal
--      `Asia/Pontianak` (hapus `booking_contacts` & `bookings` < hari ini WIB - 1 hari,
--      serta `closed_dates` < hari ini WIB - 7 hari).
--   3. Idempotent publication check `supabase_realtime` untuk live slot sync
--      (`bookings`, `closed_dates`, `store_settings`, `weekly_schedules`, `services`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Recreate create_booking_safe & reschedule_booking_safe dengan Dual Advisory Lock
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
  IF p_source IS NULL OR p_source NOT IN ('ONLINE', 'WALKIN') THEN
    RAISE EXCEPTION 'INVALID_SOURCE';
  END IF;

  IF p_source = 'WALKIN' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_customer_name := regexp_replace(coalesce(p_customer_name, ''), '[[:cntrl:]<>]+', ' ', 'g');
  v_customer_name := trim(regexp_replace(v_customer_name, '\s+', ' ', 'g'));

  IF char_length(v_customer_name) < 2 OR char_length(v_customer_name) > 40 THEN
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

  IF p_source = 'ONLINE' AND (EXTRACT(MINUTE FROM p_start_time) <> 0 OR EXTRACT(SECOND FROM p_start_time) <> 0) THEN
    RAISE EXCEPTION 'INVALID_SLOT_GRID';
  END IF;

  -- Transaksi atomik: kunci eksklusif berdasarkan kursi & tanggal reservasi
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_chair_1'), hashtext(p_booking_date::text));
  PERFORM pg_advisory_xact_lock(hashtext('madzhair_' || p_booking_date::text));

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

  -- Bebaskan slot overdue (> end_time + 15 menit WIB) di tanggal yang sama secara atomik
  UPDATE public.bookings
  SET
    status = 'COMPLETED',
    updated_at = now()
  WHERE booking_date = p_booking_date
    AND status = 'BOOKED'
    AND (booking_date::timestamp + end_time + interval '15 minutes') <= v_now_local;

  -- Deteksi konflik kursi tunggal pada tanggal yang sama
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

  -- Kunci eksklusif kursi & tanggal sebelum memvalidasi slot pengganti
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
-- 2. Fungsi Auto-Cleanup Data Historis Berbasis Tanggal Lokal (Asia/Pontianak)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_operational_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  SELECT COALESCE(NULLIF(trim(timezone), ''), 'Asia/Pontianak')
  INTO v_timezone
  FROM public.store_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_timezone IS NULL THEN
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

-- ----------------------------------------------------------------------------
-- 3. Pastikan Tabel Operasional Terdaftar di Publication supabase_realtime
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY['bookings', 'store_settings', 'weekly_schedules', 'closed_dates', 'services']
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Reset Function Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_booking_safe(uuid, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_operational_data() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_safe(uuid, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_operational_data() TO authenticated, service_role;
