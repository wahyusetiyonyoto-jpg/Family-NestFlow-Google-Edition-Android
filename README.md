# Family NestFlow Google Edition v4.0.1 — Android APK

Paket ini mempertahankan arsitektur **Google Edition**: Google Sheets sebagai database, Google Drive untuk bukti transaksi, Google Apps Script sebagai backend, dan identitas anggota berdasarkan akun Google.

## Cara kerja APK

APK adalah launcher Android untuk Web App Apps Script. Pada pemakaian pertama, paste URL deployment yang berakhiran `/exec`. URL disimpan hanya di perangkat melalui `SharedPreferences`. Saat dibuka, Family NestFlow dijalankan melalui browser sistem agar login/authorization Google tidak bergantung pada cookie WebView.

## 1. Deploy backend Google Edition v4.0.1

File sudah disediakan di folder `google-apps-script/`:

- `Code.gs`
- `Index.html`
- `appsscript.json`

Buat Google Sheet **Family NestFlow Database** → **Extensions → Apps Script**. Salin file di atas, jalankan `QUICK_SETUP_`, lalu deploy sebagai **Web app** dengan **Execute as: User accessing the web app**. Pilih akses yang mewajibkan akun Google bila opsi tersebut tersedia. Salin URL deployment yang berakhiran `/exec`.

> Backend pada HOTFIX asal masih bertanda `4.0.0`. Dalam paket Android ini deklarasinya sudah disejajarkan menjadi `4.0.1` supaya sama dengan frontend.

## 2. Build APK melalui GitHub

1. Buat repository GitHub baru, misalnya `Family-NestFlow-Google-Edition-Android`.
2. Ekstrak ZIP ini.
3. Upload **seluruh isi folder hasil ekstrak** ke root repository. Pastikan folder `.github/workflows/` ikut ter-upload.
4. Commit ke branch `main`.
5. Buka tab **Actions** → **Build Family NestFlow Google Edition APK**.
6. Jika belum berjalan otomatis, klik **Run workflow**.
7. Setelah job hijau, buka run → **Artifacts** → `Family-NestFlow-Google-Edition-v4.0.1-APK`.
8. Ekstrak artifact. File instalasi bernama `Family-NestFlow-Google-Edition-v4.0.1.apk`.

APK debug dari workflow sudah signed untuk testing. Android mungkin meminta izin **Install unknown apps**. Untuk Play Store, buat release AAB dengan upload key milik Anda, bukan debug key.

## 3. Pemakaian pertama di Android

1. Install APK.
2. Buka **Family NestFlow**.
3. Paste URL `/exec` dari deployment Apps Script.
4. Tekan **Simpan & Buka Family NestFlow**.
5. Pilih/login akun Google yang sudah didaftarkan pada Family NestFlow dan selesaikan authorization bila Google memintanya.

URL dapat diganti atau dihapus dari layar launcher tanpa reinstall APK.

## Catatan keamanan

- APK tidak menerima atau menyimpan password Google, OTP, PIN kartu, maupun kredensial bank.
- Koneksi hanya dibuka ke URL Apps Script yang Anda masukkan melalui browser sistem.
- Jangan mengubah deployment menjadi publik tanpa login jika data keluarga harus dibatasi berdasarkan akun Google.
