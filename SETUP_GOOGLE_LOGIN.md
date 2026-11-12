# Setup Login Google SiRinci Tanpa Termux

Semua build dilakukan lewat GitHub Actions.

## 1. Build awal untuk mendapatkan SHA-1

GitHub repository SiRinci > Actions > **Build SiRinci V1.0 Google Only APK** > Run workflow.

Build awal boleh dilakukan walaupun `GOOGLE_WEB_CLIENT_ID` belum ada.

Download artifact dan buka:
`google-oauth-signing.txt`

Catat nilai **SHA1**.

GitHub Actions menggunakan debug keystore yang disimpan melalui cache `sirinci-debug-keystore-v1` agar fingerprint stabil untuk build pengujian berikutnya.

## 2. Buat Google OAuth Android Client

Google Cloud Console > Google Auth Platform > Clients > Create Client.

Application type: **Android**

Package name:
`com.sirinci.app`

SHA-1:
gunakan nilai dari `google-oauth-signing.txt`.

## 3. Buat Google OAuth Web Client

Masih pada project Google Cloud yang sama:

Create Client > **Web application**

Name:
`SiRinci Android Web Client`

Copy Client ID:
`xxxxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com`

Client Secret tidak dimasukkan ke APK dan tidak diperlukan untuk local-only V1.0.

## 4. Simpan Client ID di GitHub

Repository > Settings > Secrets and variables > Actions > tab **Variables** > New repository variable.

Name:
`GOOGLE_WEB_CLIENT_ID`

Value:
paste Web Client ID tadi.

## 5. Build final

Actions > **Build SiRinci V1.0 Google Only APK** > Run workflow.

Download artifact:
`SiRinci-V1.0-Google-Only-APK`

Pastikan `google-login-config-status.txt` berisi:
`GOOGLE_WEB_CLIENT_ID injected: YES`

Install:
`SiRinci-v1.0.0-google-only.apk`

## Hasil

Saat pertama dibuka:
- splash SiRinci muncul,
- pemilih akun Google muncul otomatis,
- pilih Gmail,
- dashboard terbuka,
- tidak ada halaman Supabase,
- tidak ada browser login,
- tidak ada Firebase login.

Untuk rilis Play Store, gunakan signing key release dan daftarkan SHA-1 Play App Signing secara terpisah.
