import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { InstallPwaBanner } from "@/components/admin/InstallPwaBanner";
import { BrandMark } from "@/components/ui/BrandMark";
import { EditorialSectionHeader } from "@/components/ui/EditorialSectionHeader";
import { requireAdminSession } from "@/lib/supabase/admin-auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const configured = isSupabaseConfigured();

  if (configured) {
    const adminSession = await requireAdminSession();
    if (adminSession.ok) {
      redirect("/admin");
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-alabaster text-ink pt-safe pb-safe">
      <header className="border-b border-hairline bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="shrink-0">
            <BrandMark variant="full" size="sm" href="/" />
          </div>
          <Link
            href="/"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 font-sans text-[11px] font-medium leading-tight text-muted transition-colors hover:border-terracotta hover:text-terracotta sm:min-h-[44px] sm:px-3 sm:text-xs"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span>Kembali ke Halaman Booking</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <InstallPwaBanner className="mb-6" />

        <EditorialSectionHeader
          label="Kasir PWA"
          title="Masuk Panel"
          accentTitle="Operasional"
          description="Akses khusus pemilik Madzhair Barber & Co untuk mencatat walk-in instan, mengelola antrean, dan mengatur jadwal toko."
          as="h1"
          className="mb-6"
        />

        <AdminLoginForm isConfigured={configured} />

        <p className="mt-6 text-center font-sans text-xs text-muted">
          Madzhair Barber &amp; Co · Perlindungan sesi terverifikasi
        </p>
      </main>
    </div>
  );
}
