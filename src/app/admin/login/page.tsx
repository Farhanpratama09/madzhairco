import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { InstallPwaBanner } from "@/components/admin/InstallPwaBanner";
import { BrandMark } from "@/components/ui/BrandMark";
import { EditorialSectionHeader } from "@/components/ui/EditorialSectionHeader";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const configured = isSupabaseConfigured();

  if (configured) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        redirect("/admin");
      }
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-obsidian text-ivory pt-safe pb-safe">
      <header className="border-b border-hairline">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark variant="compact" size="sm" href="/" />
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 border border-hairline bg-surface px-3.5 font-mono text-xs tracking-[0.14em] uppercase text-stone transition-colors hover:border-brass hover:text-ivory"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Beranda</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <InstallPwaBanner className="mb-6" />

        <EditorialSectionHeader
          index="ADMIN"
          label="KASIR PWA"
          title="Masuk Panel"
          accentTitle="Operasional"
          description="Akses khusus pemilik Madzhair Barber & Co untuk mencatat walk-in instan, mengelola antrean, dan mengatur jadwal toko."
          as="h1"
          className="mb-6"
        />

        <AdminLoginForm isConfigured={configured} />

        <p className="mt-6 text-center font-mono text-[11px] tracking-[0.16em] uppercase text-stone">
          MADZHAIR.CO • ZERO-TRUST SESSION GUARD
        </p>
      </main>
    </div>
  );
}
