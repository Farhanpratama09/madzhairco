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
- [x] Seluruh kriteria di `docs/PRD.md` v1.5 (`Approved`) terpenuhi tanpa penyimpangan logika slot (`Haircut` 45m/60m vs `Hair Chemicals` 120m/120m, `Asia/Pontianak`, lead time 30m, dan pembebasan slot saat status `COMPLETED`).
- [x] Semua divisi terkait (`design`, `backend`, `customer`, `admin`, `security`, `ops`) selaras dengan pembaruan `SKILL.md` v1.5 (`Warm Alabaster #EFE8DD`, `Soft Ivory #F7F3EC`, `Deep Slate Charcoal #303841`, `Burnt Terracotta #C25934`, serta Travorra Full-Bleed Hero & Capsule Dock).
- [x] Tidak ada *error* TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), atau *warning* build (`npm run build` Next.js 16.4.6 + `src/proxy.ts`).
- [x] Zero unintended edits pada backend (`slots.ts`, `supabase/`, `src/app/api/**`) maupun Smart Ticket `/tiket/[code]` pada revisi UI Hero & Floating Dock v1.5.
- [x] Audit Anti-AI-Slop & Travorra v1.5 (Hero wrapper `relative w-full overflow-hidden`, foto `lg:w-[54%] lg:min-h-[620px] lg:rounded-bl-[180px]`, kartu batas `lg:-left-10 lg:top-28`, `h1` `lg:text-[62px]` `Instrument Serif`, tombol kapsul `rounded-full`, **Floating Capsule Dock** `lg:rounded-full -mt-12` above-the-fold & mobile `h-[280px] rounded-3xl` -> `-mt-8 mx-4`, 0 kode `01 //`, `#reservasi` `lg:grid-cols-[minmax(0,1fr)_360px]`) lulus.
- [x] Simulasi E2E produksi (`/`, `/admin` fail-closed, `/tiket/MDZ-8K4P`, `POST /api/bookings`) berjalan mulus.

## 4. Protokol Pembaruan Skill Mandiri
Setiap kali terjadi perubahan alur kerja atau penambahan standar evaluasi baru, Ketua Koordinator wajib memperbarui bagian **Checklist Gerbang Persetujuan** di file ini sebelum menutup sesi.
