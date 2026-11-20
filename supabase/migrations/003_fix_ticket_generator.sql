-- ============================================================================
-- Madzhair.co (Madzhair Barber & Co) — Patch Migration 003
-- Fix generate_madzhair_ticket_code() failing on Supabase when pgcrypto lives
-- in the `extensions` schema instead of `public`.
-- Uses built-in pg_catalog functions + `extensions` in search_path.
-- Safe & idempotent to run on an existing Supabase database.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_madzhair_ticket_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  -- 32 non-ambiguous characters (256 % 32 == 0, zero modulo bias)
  v_chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := decode(
    md5(
      clock_timestamp()::text ||
      random()::text ||
      txid_current()::text ||
      random()::text
    ),
    'hex'
  );
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

-- Ensure RPC functions also include `extensions` in search_path
ALTER FUNCTION public.create_booking_safe(uuid, text, date, time, text)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.reschedule_booking_safe(uuid, time)
  SET search_path = public, extensions, pg_temp;
