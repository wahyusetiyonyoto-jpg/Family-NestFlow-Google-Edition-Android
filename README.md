# SiRinci V1.0

SiRinci adalah aplikasi pencatatan keuangan sederhana dengan login Gmail.

## Arsitektur
- Login: Google OAuth melalui Supabase Auth
- Database: Supabase PostgreSQL + Row Level Security
- Bukti transaksi: private Supabase Storage
- Web: folder `docs/` untuk GitHub Pages
- Android: launcher ringan ke web SiRinci
- APK: GitHub Actions

## Login Gmail-only
Pengguna cukup menekan **Masuk dengan Gmail**. Saat Gmail pertama kali login:
1. Supabase memverifikasi akun Google.
2. `bootstrap_google_user()` membuat ruang keuangan otomatis.
3. Pengguna pertama menjadi Admin ruang keuangannya.
4. Rekening dan kategori awal dibuat otomatis.

Jika Gmail sudah diundang oleh Admin sebelum login pertama, akun otomatis masuk ke ruang keluarga tersebut.

## Setup backend
Buka Supabase SQL Editor dan jalankan seluruh isi:
`supabase/setup.sql`

Kemudian aktifkan Google Provider di Supabase Authentication dan masukkan OAuth Client ID + Client Secret Google.

Callback Supabase project:
`https://mggnfkarjjsejdrocfva.supabase.co/auth/v1/callback`

## GitHub Pages
Publikasikan folder `docs/` dari branch `main`.

URL yang digunakan APK:
`https://wahyusetiyonyoto-jpg.github.io/Family-NestFlow-Google-Edition-Android/`

## Build APK
GitHub > Actions > **Build SiRinci V1.0 APK**.

Artifact:
`SiRinci-V1.0-APK`

APK:
`SiRinci-v1.0.0.apk`

## Keamanan
Publishable key Supabase boleh berada di frontend. Jangan pernah memasukkan `service_role`, database password, Google Client Secret, OTP, PIN bank, atau password finansial ke repository.
