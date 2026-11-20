-- ============================================================================
-- Madzhair.co (Madzhair Barber & Co) — Patch Migration 002
-- Fix PostgreSQL table privileges (GRANT) for Admin CMS & Public Read tables
-- Safe & idempotent to execute on an already-seeded Supabase project.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Public read-only access for non-sensitive catalog, schedule, and slot tables
GRANT SELECT ON
  public.store_settings,
  public.weekly_schedules,
  public.closed_dates,
  public.services,
  public.gallery_items,
  public.bookings
TO anon;

-- Ensure public anon cannot write directly to bookings (all public bookings go through create_booking_safe RPC)
REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM anon;

-- Authenticated Admin (Barber) full DML privileges (still guarded by RLS auth.uid() IS NOT NULL)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.store_settings,
  public.weekly_schedules,
  public.closed_dates,
  public.services,
  public.gallery_items,
  public.bookings
TO authenticated;
