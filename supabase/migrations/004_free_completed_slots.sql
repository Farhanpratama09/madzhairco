-- ============================================================================
-- Madzhair.co (Madzhair Barber & Co) — Patch Migration 004
-- Release chair slots immediately when a booking is marked COMPLETED.
-- Only status = 'BOOKED' counts as blocking a chair slot in:
--   1. create_booking_safe
--   2. reschedule_booking_safe
--   3. get_public_bookings_for_date
-- Note: Past hours on today's schedule remain guarded by lead_time_minutes
-- inside create_booking_safe & calculateAvailableSlots.
-- Safe & idempotent to run on an existing Supabase database.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_public_bookings_for_date(date);
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
SET search_path = public, extensions, pg_temp
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
SET search_path = public, extensions, pg_temp
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
    AND b.status = 'BOOKED'
  ORDER BY b.start_time ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_bookings_for_date(date) TO anon, authenticated;
