# SiRinci V1.0 — Google Only Edition

SiRinci adalah aplikasi pencatatan keuangan Android yang login langsung menggunakan akun Google/Gmail melalui Android Credential Manager.

## Arsitektur

- Login: native **Sign in with Google**
- Supabase Auth: **dihapus**
- Firebase Auth: **tidak digunakan**
- Google Apps Script: **tidak digunakan**
- Runtime web hosting: **tidak digunakan**
- UI keuangan: HTML lokal di dalam APK melalui WebView
- Data: local-first, dipisahkan berdasarkan Google unique ID
- Backup: JSON manual dari menu Pengaturan
- Build: GitHub Actions

## Alur pengguna

1. Buka SiRinci.
2. Credential Manager otomatis menampilkan akun Google.
3. Pilih Gmail.
4. Dashboard SiRinci langsung terbuka.
5. Sesi lokal dipertahankan sampai pengguna memilih Keluar.

## Konfigurasi Google OAuth

Login Google memerlukan OAuth Client ID dari Google Cloud.

Ikuti `SETUP_GOOGLE_LOGIN.md`.

Setelah `GOOGLE_WEB_CLIENT_ID` disimpan sebagai GitHub Repository Variable, jalankan workflow:

**Build SiRinci V1.0 Google Only APK**

Artifact:
`SiRinci-V1.0-Google-Only-APK`

APK:
`SiRinci-v1.0.0-google-only.apk`

## Data

V1.0 sengaja tidak memakai Supabase agar autentikasi benar-benar Google-only. Data disimpan lokal pada perangkat untuk masing-masing Gmail. Gunakan Backup/Restore JSON sebelum pindah HP atau instal ulang.

Sinkronisasi otomatis lintas perangkat dapat ditambahkan berikutnya memakai Google Drive Authorization API tanpa menghidupkan kembali Supabase Auth.
