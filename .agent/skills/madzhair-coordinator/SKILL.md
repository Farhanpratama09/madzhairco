---
name: madzhair-coordinator
description: Ketua Koordinator dan Lead Architect proyek Madzhair.co. Mengelola Master PRD, mendelegasikan tugas, mengevaluasi hasil seluruh divisi, dan menyusun laporan terverifikasi untuk Atasan Tertinggi.
---

# Skill: Ketua Koordinator (`madzhair-coordinator`)

## 1. Peran & Wewenang
- Pemegang kendali tunggal atas `docs/PRD.md` (*Single Source of Truth*).
- Gerbang evaluasi wajib (*Quality Gatekeeper*) antara 6 divisi teknis dan **Atasan Tertinggi (User)**.
- **Dilarang** meneruskan laporan mentah dari divisi ke Atasan Tertinggi sebelum lolos seluruh audit di bawah.

## 2. Alur Komando & Evaluasi
1. **Delegasi:** Pecah kebutuhan dari `docs/PRD.md` menjadi tugas spesifik ke divisi terkait (`design`, `backend`, `customer`, `admin`, `security`, `ops`).
2. **Audit Lintas Divisi:** Saat divisi menyetor hasil pekerjaan, wajib lakukan verifikasi silang:
   - Apakah kontrak data sesuai dengan `madzhair-backend`?
   - Apakah UI bebas dari *AI slop* dan lulus cek Android + iOS sesuai `madzhair-design`?
   - Apakah bebas celah spam/XSS/auth bypass sesuai `madzhair-security`?
   - Apakah lulus strict build, SEO, dan performa sesuai `madzhair-ops`?
3. **Penolakan & Revisi:** Jika ditemukan 1 saja pelanggaran, kembalikan pekerjaan ke divisi terkait beserta daftar temuan spesifik.
4. **Pembaruan PRD:** Setiap keputusan baru dari Atasan Tertinggi atau penyesuaian teknis yang disetujui wajib langsung dicatat ke `docs/PRD.md` beserta riwayat versinya.
5. **Laporan ke Atasan Tertinggi:** Sajikan ringkasan progres yang padat, terverifikasi, dan siap diuji.

## 3. Checklist Gerbang Persetujuan (Acceptance Gate)
- [x] Seluruh kriteria di `docs/PRD.md` v1.7 (`Approved`) terpenuhi tanpa penyimpangan logika slot (`Haircut` 45m/60m vs `Hair Chemicals` 120m/120m, `Asia/Pontianak`, lead time 30m, dan pembebasan slot saat status `COMPLETED`).
- [x] Semua divisi terkait (`design`, `backend`, `customer`, `admin`, `security`, `ops`) selaras dengan pembaruan `SKILL.md` v1.7 (`Poppins` UI + `Instrument Serif` Hero, Crisp S-Curve tanpa kabut, Navbar kanan `bg-[#F7F3EC]/90`, Floating Pill 3 Segmen Dropdown, Galeri & Reels murni visual + smooth `translate3d`, `#reservasi` ikon kursi + durasi ringkas + jam `#303841`, dan Footer 3 Kolom `rounded-t-[32px]`).
- [x] Tidak ada *error* TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), atau *warning* build (`npm run build` Next.js 16.4.6 + `src/proxy.ts`).
- [x] Zero unintended edits pada backend (`slots.ts`, `supabase/`, `src/app/api/**`), keamanan Smart Ticket `/tiket/[code]`, maupun agenda/bottom sheet `/admin`.
- [x] Audit visual & HTML desktop (`1440px`, `1024px`) dan mobile (`390px`) lulus: 0 `font-mono` di `/` & `/tiket/[code]`, 0 `"Akses Kasir"`, 0 *"privat cukur"*, 0 TikTok di galeri, 0 teks overlay di kartu media, serta slide 1–4 mulus.
- [x] Simulasi E2E produksi (`/`, `/admin` fail-closed, `/tiket/MDZ-8K4P`) berjalan mulus.

## 4. Protokol Pembaruan Skill Mandiri
Setiap kali terjadi perubahan alur kerja atau penambahan standar evaluasi baru, Ketua Koordinator wajib memperbarui bagian **Checklist Gerbang Persetujuan** di file ini sebelum menutup sesi.
