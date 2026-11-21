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
        className="border border-hairline bg-surface p-5 sm:p-6"
      >
        <div className="mb-4 flex items-center gap-2.5 border-b border-hairline pb-3.5">
          <AlertTriangle
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-brass"
          />
          <h2 className="font-display text-base font-bold tracking-wide uppercase text-ivory">
            Supabase Belum Terhubung
          </h2>
        </div>

        <p className="text-sm leading-relaxed text-stone">
          Mode kasir admin mewajibkan autentikasi server Supabase Auth dan tidak
          memiliki mode bypass tanpa login. Lengkapi konfigurasi berikut untuk
          mengaktifkan login admin:
        </p>

        <ol className="mt-4 space-y-3 border-l-2 border-brass/70 pl-4 text-sm text-ivory">
          <li>
            <span className="font-mono text-xs uppercase tracking-wider text-brass">
              01. Environment (.env.local)
            </span>
            <pre className="mt-1.5 overflow-x-auto border border-hairline bg-obsidian p-2.5 font-mono text-xs text-stone">
              {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
            </pre>
          </li>
          <li>
            <span className="font-mono text-xs uppercase tracking-wider text-brass">
              02. Skema &amp; RLS SQL
            </span>
            <p className="mt-1 text-xs leading-relaxed text-stone">
              Jalankan file{" "}
              <code className="font-mono text-ivory">
                supabase/migrations/001_initial_schema.sql
              </code>{" "}
              di SQL Editor proyek Supabase Anda.
            </p>
          </li>
          <li>
            <span className="font-mono text-xs uppercase tracking-wider text-brass">
              03. Akun Admin
            </span>
            <p className="mt-1 text-xs leading-relaxed text-stone">
              Buat user email &amp; password pemilik barber di menu{" "}
              <span className="text-ivory">Authentication → Users</span> pada
              dashboard Supabase.
            </p>
          </li>
        </ol>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Email dan kata sandi wajib diisi.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setErrorMessage(
        "Konfigurasi Supabase client tidak tersedia. Periksa .env.local."
      );
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          setErrorMessage("Email atau kata sandi salah. Silakan periksa kembali.");
        } else {
          setErrorMessage(error.message || "Gagal masuk ke akun kasir.");
        }
        return;
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
      className="border border-hairline bg-surface p-5 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between border-b border-hairline pb-4">
        <div className="flex items-center gap-2.5">
          <Lock aria-hidden="true" className="h-4 w-4 text-brass" />
          <span className="font-mono text-xs tracking-[0.18em] uppercase text-stone">
            Otorisasi Kasir
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-wider uppercase text-stone">
          Supabase Auth
        </span>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 border border-crimson-alert/50 bg-crimson-alert/10 px-3.5 py-3 text-sm text-ivory"
        >
          <span
            aria-hidden="true"
            className="mt-1.5 h-2 w-2 shrink-0 bg-crimson-alert"
          />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="admin-email"
            className="mb-1.5 block font-mono text-xs tracking-[0.14em] uppercase text-stone"
          >
            Email Admin
          </label>
          <input
            id="admin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@madzhair.co"
            className="min-h-[44px] w-full border border-hairline bg-obsidian px-3.5 py-2.5 text-base text-ivory placeholder:text-stone/50 focus:border-brass focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="mb-1.5 block font-mono text-xs tracking-[0.14em] uppercase text-stone"
          >
            Kata Sandi
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
              className="min-h-[44px] w-full border border-hairline bg-obsidian py-2.5 pr-12 pl-3.5 text-base text-ivory placeholder:text-stone/50 focus:border-brass focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"
              }
              className="absolute top-0 right-0 flex min-h-[44px] min-w-[44px] items-center justify-center text-stone transition-colors hover:text-ivory"
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
        className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2.5 bg-brass px-5 py-3 font-display text-sm font-bold tracking-[0.14em] uppercase text-obsidian transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogIn aria-hidden="true" className="h-4 w-4" />
        <span>{submitting ? "Memverifikasi Sesi..." : "Masuk Kasir"}</span>
      </button>
    </form>
  );
}
