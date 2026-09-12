# MineTrack Nickel Dashboard - V3 + Google Sheets Integration

Versi ini menggunakan **versi 3 sebagai dasar data dan tampilan**, lalu ditambahkan koneksi Google Sheets yang lebih siap dipakai.

## 1. Google Spreadsheet yang dipakai

Spreadsheet ID sudah dikunci di:

`18oh2WCDf5p6xSyE1_sDOxCSY6HtV87fpMoEfhDm9cRs`

Jadi pengguna **tidak perlu mengganti Spreadsheet ID** di source code.

Yang perlu diisi hanya URL **Google Apps Script Web App** yang berakhiran `/exec`.

## 2. Cara mengaktifkan Google Sheets

1. Buka Google Spreadsheet.
2. Pilih **Extensions > Apps Script**.
3. Buka file `google-apps-script/Code.gs` dari ZIP ini.
4. Salin seluruh isi `Code.gs` ke Apps Script. (Script yang sama juga tersedia di halaman Integrasi MineTrack.)
5. Simpan.
6. Pilih **Deploy > New deployment**.
7. Pilih **Web app**.
8. Execute as: **Me**.
9. Who has access: **Anyone** (sesuaikan dengan kebijakan akun Anda).
10. Copy URL Web App yang berakhiran `/exec`.
11. Masukkan URL tersebut di halaman **Google Sheets & Excel**.
12. Klik **Simpan URL**, lalu **Sync Data Sekarang**.

> Jika muncul `SyntaxError: Unexpected token 'export'`, file Apps Script berisi file frontend yang salah. Hapus seluruh isi `Kode.gs`, lalu salin hanya isi file `google-apps-script/Code.gs` atau script yang ditampilkan tombol **Buka Script** di MineTrack. Jangan menyalin isi `src/services/googleSheetsService.js`, karena file tersebut menggunakan `export` dan hanya dijalankan oleh frontend Vite.

Google Apps Script mendukung akses spreadsheet melalui `SpreadsheetApp.openById()`/`openByUrl()`, dan web app memakai fungsi endpoint seperti `doGet`/`doPost`.

## 3. Cara kerja sinkronisasi

- MineTrack menyimpan data sementara di browser.
- Tombol Sync mengirim seluruh data log ke Apps Script.
- Apps Script mengganti isi Sheet dengan data MineTrack agar tidak terjadi duplikasi saat Sync ditekan berulang kali.
- Setelah POST, MineTrack membaca kembali data dari Sheet untuk memverifikasi hasil sinkronisasi.

## 4. File penting

- `src/App.jsx` - state utama, CRUD data, navigasi, dan event sinkronisasi.
- `src/components/Layout.jsx` - sidebar, header, dan 4 tombol aksi.
- `src/components/Modals.jsx` - form Input Hasil Shift dan Job Pending.
- `src/pages/Dashboard.jsx` - kartu KPI dan grafik.
- `src/pages/Daily.jsx` - tabel data harian.
- `src/pages/Excel.jsx` - kartu integrasi Google Sheets, copy Excel, dan export CSV.
- `src/services/googleSheetsService.js` - seluruh koneksi Google Sheets + script Apps Script.
- `src/data/initialData.js` - data awal versi 3.
- `src/styles.css` - seluruh styling kartu, tombol, tabel, modal, dan responsive.

## 5. Catatan maintenance

Jika ingin menambah/mengurangi kolom data, ubah secara bersamaan:

1. `src/data/initialData.js`
2. `src/services/googleSheetsService.js` pada `HEADERS`
3. `itemToRow_()`
4. `rowToItem_()`
5. `src/services/exportService.js`

Jangan mengubah urutan 21 kolom secara sembarangan karena Apps Script dan export menggunakan urutan tersebut.

## 6. Catatan keamanan

URL Web App dapat disimpan di localStorage browser. Jangan menaruh API key, password, atau credential rahasia di source code frontend.

## Perbaikan sinkronisasi Google Sheets
- Saat URL `/exec` tersedia, aplikasi otomatis membaca Google Sheets saat dibuka.
- Jika Google Sheets memiliki lebih banyak baris daripada data lokal browser, data Google Sheets menjadi sumber utama dan **tidak ditimpa** oleh data lokal.
- Halaman Integrasi sekarang menampilkan status koneksi dan jumlah baris yang terbaca dari Google Sheets.
- Tombol **Muat Ulang dari Google Sheets** tersedia untuk mengambil data terbaru secara manual.
- Tombol **Sync / Samakan Data** memeriksa Google Sheets lebih dahulu sehingga kasus Sheet 5 baris vs web 3 baris tidak lagi menyebabkan 5 baris terhapus.
- Jika Google Sheets tidak dapat dibaca, aplikasi menampilkan pesan error yang jelas, bukan diam-diam kembali ke 3 data lokal.


## Jika muncul: Gagal • Web App tidak bisa diakses
1. Buka Extensions > Apps Script dari Spreadsheet yang sama.
2. Tempel SCRIPT Google Apps Script dari halaman Integrasi.
3. Klik Deploy > New deployment > Web app.
4. Execute as: Me.
5. Who has access: Anyone.
6. Salin URL Web app yang berakhiran `/exec` ke MineTrack.
7. Klik Simpan & Tes Koneksi.

Jangan memasukkan URL `docs.google.com/spreadsheets/.../edit`. URL tersebut adalah alamat tampilan spreadsheet, bukan API Web App.


## Perbaikan versi ini
- Spreadsheet ID frontend diperbarui ke Spreadsheet aktif: `18oh2WCDf5p6xSyE1_sDOxCSY6HtV87fpMoEfhDm9cRs`.
- Default Web App URL sudah diisi dengan deployment Apps Script yang digunakan MineTrack.
- Apps Script membaca Google Sheet memakai `getDisplayValues()` agar nilai `Sublot` seperti `3-2` tidak berubah menjadi tanggal dan jam `7:00`/`17:00` tidak bergeser karena timezone.
- Mapping 21 kolom A:U dipertahankan.
- File `google-apps-script/Code.gs` disertakan terpisah agar mudah ditempel ke Extensions > Apps Script.

> Setelah mengganti `Code.gs`, lakukan **Deploy > Manage deployments > Edit > New version > Deploy** pada Web App yang sama. Jika membuat deployment baru, gunakan URL `/exec` dari deployment tersebut.
