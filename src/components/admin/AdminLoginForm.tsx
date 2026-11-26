"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, EyeOff, Lock, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface AdminLoginFormProps {
  isConfigured: boolean;
}

export function AdminLoginForm({ isConfigured }: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isConfigured) {
    return (
      <section
        aria-label="Konfigurasi Supabase diperlukan"
        className="rounded-2xl border border-hairline bg-surface p-5 sm:p-6"
      >
        <div className="mb-4 flex items-center gap-2.5 border-b border-hairline pb-3.5">
          <AlertTriangle
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-terracotta"
          />
          <h2 className="font-sans text-lg font-semibold text-ink">
            Supabase Belum Terhubung
          </h2>
        </div>

        <p className="font-sans text-sm leading-relaxed text-muted">
          Mode kasir admin mewajibkan autentikasi server Supabase Auth dan tidak
          memiliki mode bypass tanpa login. Lengkapi konfigurasi berikut untuk
          mengaktifkan login admin:
        </p>

        <ol className="mt-4 space-y-3 border-l-2 border-terracotta/70 pl-4 font-sans text-sm text-ink">
          <li>
            <span className="text-xs font-semibold text-terracotta">
              1. Environment (.env.local)
            </span>
            <pre className="mt-1.5 overflow-x-auto rounded-xl border border-hairline bg-surface-elevated p-3 font-sans text-xs text-ink">
              {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
            </pre>
          </li>
          <li>
            <span className="text-xs font-semibold text-terracotta">
              2. Skema &amp; RLS SQL
            </span>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Jalankan file{" "}
              <code className="font-sans font-semibold text-ink">
                supabase/migrations/001_initial_schema.sql
              </code>{" "}
              di SQL Editor proyek Supabase Anda.
            </p>
          </li>
          <li>
            <span className="text-xs font-semibold text-terracotta">
              3. Akun Admin
            </span>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Buat user email &amp; password pemilik barber di menu{" "}
              <span className="font-semibold text-ink">
                Authentication → Users
              </span>{" "}
              pada dashboard Supabase.
            </p>
          </li>
        </ol>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedIdentifier = email.trim();
    if (!trimmedIdentifier || !password) {
      setErrorMessage("Email/username dan kata sandi wajib diisi.");
      return;
    }

    const resolvedEmail = trimmedIdentifier.includes("@")
      ? trimmedIdentifier.toLowerCase()
      : `${trimmedIdentifier.toLowerCase()}@admin.madzhair.local`;

    const supabase = createClient();
    if (!supabase) {
      setErrorMessage(
        "Konfigurasi Supabase client tidak tersedia. Periksa .env.local."
      );
      return;
    }

    setSubmitting(true);
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          setErrorMessage(
            "Email/username atau kata sandi salah. Silakan periksa kembali."
          );
        } else {
          setErrorMessage(error.message || "Gagal masuk ke akun kasir.");
        }
        return;
      }

      const signedInUserId = signInData.user?.id ?? "";
      if (signedInUserId) {
        const { data: adminRow, error: adminErr } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", signedInUserId)
          .maybeSingle();

        if (adminErr || !adminRow) {
          await supabase.auth.signOut();
          setErrorMessage(
            "Akun ini tidak terdaftar sebagai admin kasir resmi."
          );
          return;
        }
      }

      router.replace("/admin");
    } catch {
      setErrorMessage("Terjadi gangguan jaringan saat mencoba masuk.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-hairline bg-surface p-5 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between border-b border-hairline pb-4">
        <div className="flex items-center gap-2.5">
          <Lock aria-hidden="true" className="h-4 w-4 text-terracotta" />
          <span className="font-sans text-xs font-medium text-ink">
            Otorisasi kasir
          </span>
        </div>
        <span className="font-sans text-xs text-muted">Supabase Auth</span>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-crimson-alert/45 bg-crimson-alert/10 px-3.5 py-3 font-sans text-sm text-ink"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-crimson-alert"
          />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="admin-email"
            className="mb-1.5 block font-sans text-xs font-medium text-muted"
          >
            Email atau username admin
          </label>
          <input
            id="admin-email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@madzhair.co atau username"
            className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3.5 py-2.5 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="mb-1.5 block font-sans text-xs font-medium text-muted"
          >
            Kata sandi
          </label>
          <div className="relative flex items-stretch">
            <input
              id="admin-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 py-2.5 pr-12 pl-3.5 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"
              }
              className="absolute top-0 right-0 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted transition-colors hover:text-ink"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Eye aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl bg-terracotta px-5 py-3 font-sans text-sm font-semibold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogIn aria-hidden="true" className="h-4 w-4" />
        <span>{submitting ? "Memverifikasi sesi..." : "Masuk Kasir"}</span>
      </button>
    </form>
  );
}
