export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PriceVariant = {
  label: string;
  price: number;
  display: string;
};

export type StoreSettings = {
  id: string;
  store_name: string;
  brand_tagline: string;
  whatsapp_number: string;
  short_address: string;
  google_maps_url: string;
  timezone: string;
  lead_time_minutes: number;
  is_force_closed: boolean;
  break_enabled: boolean;
  /** Format HH:MM:SS or HH:MM */
  break_start: string;
  /** Format HH:MM:SS or HH:MM */
  break_end: string;
  /** Format YYYY-MM-DD (idempotency tracker for break-reminder push) */
  break_reminder_sent_date: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  updated_at: string;
};

export type WeeklySchedule = {
  /** 0 = Minggu, 1 = Senin, ..., 6 = Sabtu */
  day_of_week: number;
  is_open: boolean;
  /** Format HH:MM:SS or HH:MM */
  open_time: string;
  /** Format HH:MM:SS or HH:MM */
  close_time: string;
};

export type ClosedDate = {
  id: string;
  /** Format YYYY-MM-DD */
  closed_date: string;
  reason: string | null;
  /** NULL = tutup seharian, non-NULL = tutup mulai jam ini (HH:MM:SS) khusus tanggal ini */
  close_from_time: string | null;
  created_at: string;
};

export type Service = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  price_display: string;
  price_min: number;
  price_max: number;
  price_variants: PriceVariant[];
  display_duration_minutes: number;
  slot_duration_minutes: number;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type GalleryMediaType = "photo" | "tiktok" | "instagram";

export type GalleryItem = {
  id: string;
  title: string;
  media_type: GalleryMediaType;
  media_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type BookingStatus = "BOOKED" | "COMPLETED" | "CANCELLED";
export type BookingSource = "ONLINE" | "WALKIN";

export type Booking = {
  id: string;
  ticket_code: string;
  service_id: string | null;
  service_name: string;
  customer_name: string;
  /** Format YYYY-MM-DD */
  booking_date: string;
  /** Format HH:MM:SS or HH:MM */
  start_time: string;
  /** Format HH:MM:SS or HH:MM */
  end_time: string;
  status: BookingStatus;
  source: BookingSource;
  notes: string | null;
  /** Timestamp terakhir kali jadwal digeser admin */
  rescheduled_at: string | null;
  /** Tanggal sebelumnya sebelum geser jadwal (YYYY-MM-DD) */
  previous_date: string | null;
  /** Jam mulai sebelumnya (HH:MM:SS) */
  previous_start_time: string | null;
  /** Jam selesai sebelumnya (HH:MM:SS) */
  previous_end_time: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingContact = {
  booking_id: string;
  phone: string;
  updated_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminUser = {
  user_id: string;
  created_at: string;
};

export type PublicBookingSlot = Pick<
  Booking,
  "id" | "booking_date" | "start_time" | "end_time" | "status"
>;

// ============================================================================
// RPC Parameter Types (must be type aliases for GenericFunction compatibility)
// ============================================================================

export type CreateBookingSafeParams = {
  p_service_id: string;
  p_customer_name: string;
  /** YYYY-MM-DD */
  p_booking_date: string;
  /** HH:MM or HH:MM:SS */
  p_start_time: string;
  p_source?: BookingSource;
  /** Normalized 628xx WhatsApp number (required for ONLINE, optional for WALKIN) */
  p_customer_phone?: string | null;
};

export type RescheduleBookingSafeParams = {
  p_booking_id: string;
  /** HH:MM or HH:MM:SS */
  p_new_start_time: string;
};

export type CancelBookingSafeParams = {
  p_booking_id: string;
};

export type CompleteBookingSafeParams = {
  p_booking_id: string;
};

export type GetPublicBookingsForDateParams = {
  /** YYYY-MM-DD */
  p_date: string;
};

export type GetBookingByTicketCodeParams = {
  p_ticket_code: string;
};

// ============================================================================
// Slot Engine Types
// ============================================================================

export type SlotStatus =
  | "AVAILABLE"
  | "BOOKED"
  | "EXPIRED"
  | "INSUFFICIENT_TIME"
  | "BREAK"
  | "CLOSED";

export type SlotItem = {
  /** Display start time HH:MM */
  time: string;
  /** Calculated end time HH:MM */
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  available: boolean;
  status: SlotStatus;
  reason?: string;
};

export type StoreNowParts = {
  /** YYYY-MM-DD in store timezone */
  dateStr: string;
  /** 0 (Sun) .. 6 (Sat) in store timezone */
  dayOfWeek: number;
  minutesFromMidnight: number;
  /** HH:MM in store timezone */
  timeStr: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type StoreLiveClosedReason =
  | "OPEN"
  | "FORCE_CLOSED"
  | "CLOSED_DATE"
  | "DAY_OFF"
  | "BEFORE_OPEN"
  | "AFTER_CLOSE";

export type StoreLiveStatus = {
  isOpen: boolean;
  reason: StoreLiveClosedReason;
  openTime: string | null;
  closeTime: string | null;
  closedReason: string | null;
};

export type UpcomingDateItem = {
  dateStr: string;
  dayOfWeek: number;
  dayNumber: number;
  month: number;
  year: number;
  isToday: boolean;
  labelShort: string;
  dayNameShort: string;
  dayNameFull: string;
};

// ============================================================================
// Supabase Database Type Contract (@supabase/supabase-js v2.119+ / postgrest-js)
// Must use `type` aliases (not `interface`) so Row/Insert/Update/Args
// preserve implicit index signatures satisfying Record<string, unknown>.
// ============================================================================

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      store_settings: {
        Row: StoreSettings;
        Insert: Partial<Omit<StoreSettings, "id" | "updated_at">> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<StoreSettings, "id">>;
        Relationships: [];
      };
      weekly_schedules: {
        Row: WeeklySchedule;
        Insert: WeeklySchedule;
        Update: Partial<WeeklySchedule>;
        Relationships: [];
      };
      closed_dates: {
        Row: ClosedDate;
        Insert: {
          id?: string;
          closed_date: string;
          reason?: string | null;
          close_from_time?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<ClosedDate, "id" | "created_at">>;
        Relationships: [];
      };
      services: {
        Row: Service;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          subtitle?: string | null;
          price_display: string;
          price_min: number;
          price_max: number;
          price_variants?: PriceVariant[];
          display_duration_minutes: number;
          slot_duration_minutes: number;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Update: Partial<Omit<Service, "id">>;
        Relationships: [];
      };
      gallery_items: {
        Row: GalleryItem;
        Insert: {
          id?: string;
          title: string;
          media_type: GalleryMediaType;
          media_url: string;
          thumbnail_url?: string | null;
          caption?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Omit<GalleryItem, "id" | "created_at">>;
        Relationships: [];
      };
      bookings: {
        Row: Booking;
        Insert: {
          id?: string;
          ticket_code: string;
          service_id?: string | null;
          service_name: string;
          customer_name: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          status?: BookingStatus;
          source?: BookingSource;
          notes?: string | null;
          rescheduled_at?: string | null;
          previous_date?: string | null;
          previous_start_time?: string | null;
          previous_end_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Booking, "id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_contacts: {
        Row: BookingContact;
        Insert: {
          booking_id: string;
          phone: string;
          updated_at?: string;
        };
        Update: Partial<Omit<BookingContact, "booking_id">>;
        Relationships: [
          {
            foreignKeyName: "booking_contacts_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: {
          id?: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PushSubscriptionRow, "id" | "created_at">>;
        Relationships: [];
      };
      admin_users: {
        Row: AdminUser;
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      generate_madzhair_ticket_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      create_booking_safe: {
        Args: CreateBookingSafeParams;
        Returns: Booking;
      };
      reschedule_booking_safe: {
        Args: RescheduleBookingSafeParams;
        Returns: Booking;
      };
      cancel_booking_safe: {
        Args: CancelBookingSafeParams;
        Returns: Booking;
      };
      complete_booking_safe: {
        Args: CompleteBookingSafeParams;
        Returns: Booking;
      };
      get_public_bookings_for_date: {
        Args: GetPublicBookingsForDateParams;
        Returns: PublicBookingSlot[];
      };
      get_booking_by_ticket_code: {
        Args: GetBookingByTicketCodeParams;
        Returns: Booking[];
      };
      auto_complete_overdue_bookings: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      cleanup_expired_operational_data: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
