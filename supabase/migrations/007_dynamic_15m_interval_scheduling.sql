-- ============================================================================
-- Madzhair Barber & Co — Migration 007 (Dynamic 15-Minute Interval Scheduling)
-- Lokasi UI : Sungai Kunyit, Kalimantan Barat (WIB)
-- IANA TZ   : Asia/Pontianak (UTC+7)
--
-- Mencakup:
--   1. Penyelarasan durasi layanan aktual:
--      - Haircut        : 45 menit (display_duration_minutes = 45, slot_duration_minutes = 45)
--      - Hair Chemicals : 120 menit (display_duration_minutes = 120, slot_duration_minutes = 120)
--   2. Pembaruan transaksi atomik `create_booking_safe` & `reschedule_booking_safe`:
--      - Validasi grid waktu mulai kelipatan 15 menit (:00, :15, :30, :45; detik = 00)
--        untuk booking ONLINE, WALKIN, maupun RESCHEDULE.
--      - Dual `pg_advisory_xact_lock` berbasis kursi & tanggal untuk mencegah race condition.
--      - Validasi batas jam operasional (`new_start >= open_time` & `new_end <= close_time`),
--        irisan jam istirahat, dan anti-overlap interval
--        (`new_start < existing_end AND new_end > existing_start`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Selaraskan Durasi Layanan pada public.services
-- ----------------------------------------------------------------------------
UPDATE public.services
SET
  display_duration_minutes = 45,
  slot_duration_minutes = 45,
  updated_at = now()
WHERE slug = 'haircut';

UPDATE public.services
SET
  display_duration_minutes = 120,
  slot_duration_minutes = 120,
  updated_at = now()
WHERE slug = 'hair-chemicals';

-- ----------------------------------------------------------------------------
-- 2. Recreate create_booking_safe dengan Validasi Grid 15 Menit & Interval Overlap
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
  v_duration_minutes int;
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

  -- Transaksi atomik: kunci eksklusif berdasarkan kursi & tanggal reservasi
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

  -- Pastikan waktu mulai >= jam buka dan waktu selesai <= batas jam tutup efektif
  IF p_start_time < v_schedule.open_time OR v_end_time > v_effective_close_time THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  -- Validasi overlap penuh dengan jam istirahat harian
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
-- 3. Recreate reschedule_booking_safe dengan Validasi Grid 15 Menit & Interval Overlap
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
  v_now_local timestamp;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_booking_id IS NULL OR p_new_start_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME';
  END IF;

  -- Waktu mulai pengganti wajib kelipatan 15 menit (:00, :15, :30, :45) tanpa detik
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

  -- Bebaskan booking overdue lain di tanggal yang sama secara atomik
  v_now_local := now() AT TIME ZONE COALESCE(NULLIF(trim(v_settings.timezone), ''), 'Asia/Pontianak');
  UPDATE public.bookings
  SET
    status = 'COMPLETED',
    updated_at = now()
  WHERE booking_date = v_booking.booking_date
    AND id <> p_booking_id
    AND status = 'BOOKED'
    AND (booking_date::timestamp + end_time + interval '15 minutes') <= v_now_local;

  -- Validasi anti-overlap interval terhadap booking aktif lainnya
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

-- ----------------------------------------------------------------------------
-- 4. Reset Function Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_booking_safe(uuid, time) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking_safe(uuid, text, date, time, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_safe(uuid, time) TO authenticated;
