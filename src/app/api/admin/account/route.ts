import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
const INTERNAL_USERNAME_EMAIL_SUFFIX = "@admin.madzhair.local";

interface UpdateAdminAccountBody {
  emailOrUsername?: unknown;
  username?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateAdminAccountBody;
  try {
    body = (await request.json()) as UpdateAdminAccountBody;
  } catch {
    return NextResponse.json(
      { error: "Format payload JSON tidak valid." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Data pembaruan akun wajib diisi." },
      { status: 400 }
    );
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword) {
    return NextResponse.json(
      { error: "Password lama wajib diisi untuk verifikasi keamanan." },
      { status: 400 }
    );
  }

  const rawIdentifier =
    typeof body.emailOrUsername === "string"
      ? body.emailOrUsername.trim()
      : "";
  const rawExplicitUsername =
    typeof body.username === "string" ? body.username.trim() : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (newPassword.length > 0) {
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password baru minimal 8 karakter." },
        { status: 400 }
      );
    }
    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: "Password baru maksimal 128 karakter." },
        { status: 400 }
      );
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "Konfirmasi password baru tidak cocok." },
        { status: 400 }
      );
    }
  }

  let targetEmail = user.email;
  const existingUsername =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : "";
  let targetUsername = rawExplicitUsername || existingUsername;

  if (rawIdentifier) {
    if (rawIdentifier.includes("@")) {
      if (!EMAIL_REGEX.test(rawIdentifier)) {
        return NextResponse.json(
          { error: "Format email login tidak valid." },
          { status: 400 }
        );
      }
      targetEmail = rawIdentifier.toLowerCase();
      if (!rawExplicitUsername) {
        targetUsername =
          existingUsername || rawIdentifier.split("@")[0] || "admin";
      }
    } else {
      if (!USERNAME_REGEX.test(rawIdentifier)) {
        return NextResponse.json(
          {
            error:
              "Username wajib 3–32 karakter (huruf, angka, titik, garis bawah, atau strip) atau gunakan alamat email lengkap.",
          },
          { status: 400 }
        );
      }
      targetUsername = rawIdentifier;
      targetEmail = `${rawIdentifier.toLowerCase()}${INTERNAL_USERNAME_EMAIL_SUFFIX}`;
    }
  }

  const emailChanged = targetEmail.toLowerCase() !== user.email.toLowerCase();
  const usernameChanged = targetUsername !== existingUsername;
  const passwordChanged = newPassword.length >= 8;

  if (!emailChanged && !usernameChanged && !passwordChanged) {
    return NextResponse.json(
      {
        error:
          "Tidak ada perubahan. Isi email/username baru atau password baru minimal 8 karakter.",
      },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Konfigurasi Supabase belum tersedia di server." },
      { status: 503 }
    );
  }
  const publicEnv = getSupabaseConfig();

  const serviceSupabase = createServiceRoleClient();
  if (!serviceSupabase) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server untuk pembaruan akun.",
      },
      { status: 503 }
    );
  }

  // Verifikasi currentPassword terlebih dahulu menggunakan client stateless (tanpa mencatat password ke log)
  const verifierClient = createSupabaseJsClient(
    publicEnv.url,
    publicEnv.anonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );

  const { error: verifyError } = await verifierClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return NextResponse.json(
      { error: "Password lama tidak sesuai. Periksa kembali password Anda." },
      { status: 403 }
    );
  }

  // Perbarui email/username dan/atau password langsung dengan email_confirm: true via service_role
  const { data: updatedData, error: updateError } =
    await serviceSupabase.auth.admin.updateUserById(user.id, {
      email: targetEmail,
      email_confirm: true,
      ...(passwordChanged ? { password: newPassword } : {}),
      user_metadata: {
        ...(user.user_metadata ?? {}),
        username: targetUsername,
      },
    });

  if (updateError || !updatedData?.user) {
    return NextResponse.json(
      {
        error:
          "Gagal memperbarui akun admin. Pastikan email/username belum dipakai akun lain.",
      },
      { status: 400 }
    );
  }

  // Segarkan sesi cookie aktif agar kasir tidak ter-logout setelah mengganti email/password
  try {
    await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: passwordChanged ? newPassword : currentPassword,
    });
  } catch {
    // Abaikan jika refresh cookie ditangani ulang di client
  }

  const displayIdentifier = targetEmail.endsWith(INTERNAL_USERNAME_EMAIL_SUFFIX)
    ? targetUsername || targetEmail
    : targetEmail;

  return NextResponse.json(
    {
      ok: true,
      email: updatedData.user.email ?? targetEmail,
      username: targetUsername,
      displayIdentifier,
      message: "Kredensial akun & keamanan admin berhasil diperbarui.",
    },
    { status: 200 }
  );
}
