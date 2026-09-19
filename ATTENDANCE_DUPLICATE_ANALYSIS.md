# Analisis Duplikasi Input Data Daily Absensi

Tanggal analisis: 2026-09-18

## Status

Dokumen ini berisi hasil analisis investigasi penyebab duplikasi input data Daily Absensi. Belum ada penghapusan atau perubahan kode yang dilakukan. Setelah Anda menyetujui langkah eksekusi, barulah patch atau perbaikan kode akan dilakukan.

---

## Ringkasan temuan utama

Duplikasi terjadi pada alur berikut:

1. Frontend mengumpulkan data absensi lokal dan data remote dari Google Sheets.
2. Saat user men-submit absensi baru, frontend mengirimkan bukan satu data baru saja, melainkan kumpulan data historis yang sudah ada.
3. API sinkronisasi kemudian mengirim payload yang berisi data lama dan data baru ke server / Apps Script.
4. Di server, ada logika dedupe yang sudah dibuat, tetapi karena frontend mengirim data lama berulang-ulang, server menerima item yang sama lagi dan menambahkannya kembali ke sheet.
5. Selain itu, state browser dan localStorage dapat menahan data lama yang sudah tersimpan sebelumnya, sehingga data lama dapat ikut dibawa lagi saat submit baru.

Dengan kata lain, duplikasi bukan semata-mata masalah hanya di database, tetapi kombinasi dari:

- state lokal yang menyimpan data lama,
- payload sinkronisasi yang mengandung data lama,
- dan dedupe server yang belum sepenuhnya menjadi satu-satunya jalur validasi.

---

## Alur data yang ditelusuri

### 1. Frontend `App.jsx`

File utama yang memegang flow data adalah:

- [src/App.jsx](src/App.jsx)

Bagian yang penting:

- state `attendance` disimpan di local state
- pada saat load, aplikasi membaca data remote dari Google Sheets
- saat submit baru, data candidate digabung dengan `attendance` dan `remoteAttendance`

Pola yang ditemukan:

```js
const allExisting = mergeAttendanceItems([...attendance, ...remoteAttendance]);
const nextAttendance = mergeAttendanceItems([candidate, ...attendance, ...remoteAttendance]);
```

Masalahnya:

- `attendance` sudah berisi data lama
- `remoteAttendance` juga berisi data lama
- lalu semua itu digabung ke payload yang akan dikirim
- akibatnya server menerima data lama + data baru, bukan hanya item baru

Hal ini menyebabkan duplikasi ketika data lama sudah ada di sheet dan dikirim lagi.

### 2. Fungsi sinkronisasi `syncAttendanceToGoogleSheets`

File yang relevan:

- [src/services/googleSheetsService.js](src/services/googleSheetsService.js)

Fungsi sinkronisasi absensi mengirim seluruh payload absensi ke endpoint Google Apps Script:

```js
body: JSON.stringify({
  type: 'attendance',
  items: payloadItems,
  values: payloadItems
})
```

Jika `payloadItems` sudah mencakup data lama, maka backend tetap menerima data lama dan data baru sekaligus.

### 3. Server / Apps Script `Code.gs`

File yang relevan:

- [google-apps-script/Code.gs](google-apps-script/Code.gs)

Server memang memiliki dedupe rules seperti:

- `saveAttendance_()`
- `attendanceKey_()`
- `cleanupDuplicateAttendanceRows()`
- `dedupeAttendanceRowsForCleanup_()`

Namun dedupe tersebut hanya efektif jika frontend menghantarkan payload yang benar dan hanya item valid baru. Jika frontend terus mengirim data historis, server akan terus membandingkan dan menambahkan item yang sama ke sheet.

Arti pentingnya:

- server dedupe bekerja sebagai pengaman terakhir
- bukan sebagai satu-satunya mekanisme pencegahan
- kalau payload sudah berisi duplikat dari awal, server dapat tetap menerima dan memproses lebih dari satu item yang mirip

---

## Titik duplikasi yang benar-benar teridentifikasi

### Titik 1: Frontend memaggabungkan semua absensi lama sebelum submit

Pada [src/App.jsx](src/App.jsx), saat submit absensi baru, kode menggabungkan:

- candidate baru
- `attendance` lokal lama
- `remoteAttendance` dari server

Sehingga payload yang dikirim bukan item baru saja.

### Titik 2: Fungsi sync mengirim seluruh `attendance` yang sudah ada

Pada proses auto sync dan manual sync, aplikasi memanggil fungsi sinkronisasi dengan daftar yang telah berisi data lama. Itu berarti data lama ikut dibawa setiap kali save dilakukan.

### Titik 3: Data stale di localStorage/browser

State browser dapat menahan data absensi lama yang sudah tidak valid lagi. Jika data stale ini ikut dibaca kembali saat aplikasi reload atau submit, maka frontend dapat menganggap item lama sebagai bagian dari data aktif dan mengirimnya lagi.

### Titik 4: Dedupe server belum menjadi satu-satunya mekanisme

Server punya dedupe, tapi pada praktiknya, jika payload dibuat salah sejak dari frontend, maka data duplikat masuk berulang-ulang dan menumpuk. Ini membuat data seolah-olah "dipotong" dan terkirim lagi dari sisi aplikasi.

---

## Kesimpulan analisis

Duplikasi bukan terjadi karena satu file saja. Ini adalah kombinasi dari beberapa akar masalah:

1. Frontend mengirim payload yang terlalu besar dan mencakup data lama.
2. Data lama masih aktif di state aplikasi dan localStorage.
3. Sinkronisasi absensi menaruh semua data historis ke payload.
4. Dedupe di server ada, tetapi tidak bisa mengatasi input berulang yang masuk dari frontend yang terlalu agresif.
5. Ada kemungkinan juga ada code lama yang masih tersimpan di beberapa path, tetapi analisis utama saat ini menunjukkan titik duplikat yang aktif adalah pada alur `App.jsx` ke `googleSheetsService.js` ke `Code.gs`.

---

## Langkah yang akan dilakukan setelah persetujuan

Setelah Anda menyetujui, patch yang akan diterapkan adalah:

1. membatasi payload hanya untuk item baru yang valid,
2. mengecek duplikat terhadap state lokal dan data remote sebelum submit,
3. memblokir submit jika data sudah ada,
4. menjalankan sync hanya untuk absensi yang belum ada,
5. memastikan server tetap melakukan dedupe sebagai pengaman akhir,
6. tanpa menghapus kode yang Anda sebutkan dalam prompt tanpa persetujuan.

---

## Catatan penting

- Pada tahap ini belum ada perubahan kode yang dilakukan.
- Dokumen ini hanya berfungsi sebagai ringkasan investigasi.
- Jika Anda setuju, saya akan lanjutkan ke patch yang benar sesuai hasil analisis ini.
