// ============================================================
// GRADE CONTROL AKP - GOOGLE APPS SCRIPT API
// ============================================================
// SUPPORT:
// 1. Data Produksi
// 2. Data Daily Absensi
// 3. Data Ore Getting
// 4. Format payload lama dan baru
// 5. Anti duplicate Daily Absensi
// 6. Cleanup duplicate Daily Absensi
// 7. Perbaikan timestamp Daily Absensi
//
// ATURAN DAILY ABSENSI:
// - 1 nama hanya boleh 1 kali pada tanggal dan shift yang sama
// - Shift MENJADI pembeda
// - Lokasi/PIT TIDAK menjadi pembeda
// - Nama yang sama boleh absen pada tanggal atau shift berbeda
//
// TIMESTAMP DAILY ABSENSI:
// - Format HH:MM
// - Zona waktu Asia/Makassar / WITA
//
// PRODUKSI & ORE GETTING:
// - Struktur dipertahankan
// - Timestamp dibuat oleh server dalam zona Asia/Makassar / WITA
// - Format timestamp HH:mm
// ============================================================


const SPREADSHEET_ID =
  '18oh2WCDf5p6xSyE1_sDOxCSY6HtV87fpMoEfhDm9cRs';

const SHEET_NAME =
  'Laporan Produksi';

const ATTENDANCE_SHEET_NAME =
  'Daily Absensi';

const ORE_GETTING_SHEET_NAME =
  'Laporan Ore Getting';


// ============================================================
// HEADER PRODUKSI
// ============================================================

const HEADERS = [
  'Tanggal',
  'Blok',
  'Shift',
  'Pit',
  'Dumping',
  'Sublot',
  'Retase',
  'Status',
  'Block Model',
  'Acuan',
  'Titik Bor',
  'Elevasi',
  'Metode',
  'Material',
  'Alat Berat',
  'Tonase',
  'Acuan Ni%',
  'Nama Pelapor',
  'Timestamp Pengumpulan'
];


// ============================================================
// HEADER ORE GETTING
// ============================================================

const ORE_GETTING_HEADERS = [
  'Tanggal',
  'Area PIT',
  'Shift',
  'Metode',
  'ID Metode',
  'Acuan',
  'Titik Bor',
  'Block Model',
  'Elevasi',
  'Timestamp Pengumpulan'
];


// ============================================================
// HEADER DAILY ABSENSI
// ============================================================

const ATTENDANCE_HEADERS = [
  'Tanggal',
  'Shift',
  'Lokasi Kerja',
  'Nama',
  'Timestamp Pengumpulan'
];


// ============================================================
// GET API
// ============================================================

function doGet(e) {

  try {

    var type = '';

    if (e && e.parameter) {
      type = String(
        e.parameter.type || ''
      ).toLowerCase();
    }


    // ========================================================
    // DAILY ABSENSI
    // ========================================================

    if (
      type === 'absensi' ||
      type === 'attendance'
    ) {

      var attendanceSheet =
        getAttendanceSheet_();

      var attendanceLastRow =
        attendanceSheet.getLastRow();


      if (attendanceLastRow <= 1) {

        return respond_(
          {
            success: true,
            items: [],
            values: [],
            count: 0
          },
          getCallback_(e)
        );
      }


      var attendanceLastColumn =
        Math.max(
          5,
          attendanceSheet.getLastColumn()
        );


      var attendanceValues =
        attendanceSheet
          .getRange(
            1,
            1,
            attendanceLastRow,
            attendanceLastColumn
          )
          .getDisplayValues();


      var attendanceRows =
        attendanceValues.slice(1);


      var dataRows =
        dedupeAttendanceRowsForDisplay_(
          attendanceRows
        );


      return respond_(
        {
          success: true,
          items: dataRows,
          values: dataRows,
          count: dataRows.length
        },
        getCallback_(e)
      );
    }


    // ========================================================
    // ORE GETTING
    // ========================================================

    if (
      type === 'oregetting' ||
      type === 'ore_getting'
    ) {

      var oreSheet =
        getOreGettingSheet_();

      var oreLastRow =
        oreSheet.getLastRow();


      if (oreLastRow <= 1) {

        return respond_(
          {
            success: true,
            items: [],
            values: [],
            count: 0
          },
          getCallback_(e)
        );
      }


      var oreLastColumn =
        Math.max(
          10,
          oreSheet.getLastColumn()
        );


      var oreValues =
        oreSheet
          .getRange(
            1,
            1,
            oreLastRow,
            oreLastColumn
          )
          .getDisplayValues();


      var oreDataRows =
        oreValues
          .slice(1)
          .filter(function(row) {

            return row.some(
              function(value) {

                return String(
                  value
                ).trim() !== '';

              }
            );

          })
          .map(
            rowToOreGettingItem_
          );


      return respond_(
        {
          success: true,
          items: oreDataRows,
          values: oreDataRows,
          count: oreDataRows.length
        },
        getCallback_(e)
      );
    }


    // ========================================================
    // DATA PRODUKSI
    // ========================================================

    var sheet =
      getSheet_();

    var lastRow =
      sheet.getLastRow();

    var lastCol =
      Math.max(
        sheet.getLastColumn(),
        HEADERS.length
      );


    if (lastRow === 0) {

      return respond_(
        {
          success: true,
          items: [],
          count: 0
        },
        getCallback_(e)
      );
    }


    var values =
      sheet
        .getRange(
          1,
          1,
          lastRow,
          lastCol
        )
        .getDisplayValues();


    var startRow = 0;


    if (
      looksLikeHeader_(
        values[0]
      )
    ) {

      startRow = 1;
    }


    var items =
      values
        .slice(startRow)
        .filter(function(row) {

          return row
            .slice(
              0,
              HEADERS.length
            )
            .some(function(value) {

              return String(
                value
              ).trim() !== '';

            });

        })
        .map(
          rowToItem_
        );


    return respond_(
      {
        success: true,
        items: items,
        count: items.length
      },
      getCallback_(e)
    );

  } catch (error) {

    return respond_(
      {
        success: false,
        message: error.message,
        items: [],
        count: 0
      },
      getCallback_(e)
    );

  }

}


// ============================================================
// POST API
// ============================================================

function doPost(e) {

  try {

    if (
      !e ||
      !e.postData ||
      !e.postData.contents
    ) {

      throw new Error(
        'Data POST kosong.'
      );
    }


    var payload =
      JSON.parse(
        e.postData.contents
      );


    var type =
      String(
        payload.type || ''
      ).toLowerCase();


    // ========================================================
    // DAILY ABSENSI
    // ========================================================

    if (
      type === 'absensi' ||
      type === 'attendance'
    ) {

      return saveAttendance_(
        payload
      );
    }


    // ========================================================
    // PRODUKSI
    // ========================================================

    if (
      type === 'produksi' ||
      type === 'production'
    ) {

      return saveProduction_(
        payload
      );
    }


    // ========================================================
    // ORE GETTING
    // ========================================================

    if (
      type === 'oregetting' ||
      type === 'ore_getting'
    ) {

      return saveOreGetting_(
        payload
      );
    }


    // ========================================================
    // FORMAT LAMA
    // ========================================================

    if (
      payload.values ||
      payload.items
    ) {

      return saveProduction_(
        payload
      );
    }


    throw new Error(
      'Jenis data tidak dikenali. Gunakan type "absensi", "produksi", atau "oregetting".'
    );

  } catch (error) {

    return respond_(
      {
        success: false,
        message: error.message,
        count: 0
      },
      ''
    );

  }

}


// ============================================================
// SAVE DAILY ABSENSI
// ============================================================
// ATURAN:
// UNIQUE = TANGGAL + SHIFT + NAMA
//
// Shift menjadi pembeda.
// Lokasi/PIT TIDAK menjadi pembeda.
//
// TIMESTAMP:
// - Dibuat oleh server Apps Script
// - Format HH:MM
// - Zona waktu Asia/Makassar / WITA
// - Timestamp dari frontend tidak digunakan
// ============================================================

function saveAttendance_(payload) {

  var lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {

    var sheet =
      getAttendanceSheet_();


    var items =
      Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.values)
          ? payload.values
          : [];


    // ========================================================
    // TIMESTAMP SERVER
    // ========================================================

    var submittedAt =
      getAttendanceTimestamp_();


    if (!items.length) {

      return respond_(
        {
          success: true,
          message:
            'Tidak ada data Daily Absensi baru.',
          sheet:
            ATTENDANCE_SHEET_NAME,
          count: 0
        },
        ''
      );
    }


    // ========================================================
    // AMBIL DATA YANG SUDAH ADA
    // ========================================================

    var existingRows = [];


    if (
      sheet.getLastRow() > 1
    ) {

      existingRows =
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            5
          )
          .getValues();
    }


    // ========================================================
    // INDEX DATA LAMA
    // UNIQUE = TANGGAL + SHIFT + NAMA
    // ========================================================

    var existingKeys = {};


    existingRows.forEach(
      function(row) {

        if (!Array.isArray(row)) {
          return;
        }


        var date =
          row[0];

        var shift =
          String(row[1] || '').trim().toLowerCase();

        var name =
          String(row[3] || '').trim().toLowerCase().replace(/\s+/g, ' ');


        var key =
          attendanceKey_(
            date,
            shift,
            name
          );


        if (key) {

          existingKeys[key] =
            true;

        }

      }
    );


    // ========================================================
    // INDEX DATA BARU
    // ========================================================

    var incomingRows = {};

    var duplicateCount = 0;

    var invalidCount = 0;


    items.forEach(
      function(item) {

        var row;


        // ----------------------------------------------------
        // FORMAT ARRAY
        // ----------------------------------------------------

        if (
          Array.isArray(item)
        ) {

          row = [
            item[0] || '',
            item[1] || '',
            item[2] || '',
            item[3] || ''
          ];

        }


        // ----------------------------------------------------
        // FORMAT OBJECT
        // ----------------------------------------------------

        else {

          row = [
            item.date ||
              item.tanggal ||
              '',

            item.shift ||
              '',

            item.location ||
              item.lokasi ||
              item.lokasiKerja ||
              '',

            item.name ||
              item.nama ||
              ''
          ];

        }


        // ----------------------------------------------------
        // VALIDASI
        // ----------------------------------------------------

        var date =
          row[0];

        var shift =
          String(row[1] || '').trim().toLowerCase();

        var name =
          String(row[3] || '').trim().toLowerCase().replace(/\s+/g, ' ');


        if (
          !date ||
          !shift ||
          !name
        ) {

          invalidCount++;

          return;
        }


        var key =
          attendanceKey_(
            date,
            shift,
            name
          );


        if (!key) {

          invalidCount++;

          return;
        }


        // ----------------------------------------------------
        // SUDAH ADA DI DATABASE
        // ----------------------------------------------------

        if (
          existingKeys[key]
        ) {

          duplicateCount++;

          return;
        }


        // ----------------------------------------------------
        // DUPLIKAT DALAM SUBMIT YANG SAMA
        // ----------------------------------------------------

        if (
          incomingRows[key]
        ) {

          duplicateCount++;

          return;
        }


        // ----------------------------------------------------
        // DATA BARU
        // ----------------------------------------------------
        // Timestamp selalu dibuat oleh server.

        incomingRows[key] = [
          normalizeAttendanceDate_(
            date
          ),

          row[1] || '',

          row[2] || '',

          String(
            name
          ).trim(),

          submittedAt
        ];

      }
    );


    // ========================================================
    // UBAH OBJECT MENJADI ARRAY
    // ========================================================

    var newRows =
      Object.keys(
        incomingRows
      ).map(
        function(key) {

          return incomingRows[key];

        }
      );


    // ========================================================
    // TIDAK ADA DATA BARU
    // ========================================================

    if (!newRows.length) {

      return respond_(
        {
          success: true,
          message:
            'Absensi tidak ditambahkan. Nama tersebut sudah melakukan absensi pada tanggal yang sama.',
          sheet:
            ATTENDANCE_SHEET_NAME,
          count: 0,
          duplicateCount:
            duplicateCount,
          invalidCount:
            invalidCount
        },
        ''
      );
    }


    // ========================================================
    // SIMPAN DATA BARU
    // ========================================================

    var startRow =
      sheet.getLastRow() + 1;


    sheet
      .getRange(
        startRow,
        1,
        newRows.length,
        5
      )
      .setValues(
        newRows
      );


    // ========================================================
    // RESPONSE
    // ========================================================

    return respond_(
      {
        success: true,
        message:
          'Data Daily Absensi berhasil disimpan.',
        sheet:
          ATTENDANCE_SHEET_NAME,
        count:
          newRows.length,
        duplicateCount:
          duplicateCount,
        invalidCount:
          invalidCount,
        timestamp:
          submittedAt
      },
      ''
    );

  } finally {

    lock.releaseLock();

  }

}


// ============================================================
// ATTENDANCE KEY
// ============================================================
// UNIQUE:
// TANGGAL + SHIFT + NAMA
//
// LOKASI/PIT DIABAIKAN
// ============================================================

function attendanceKey_(
  date,
  shift,
  name
) {

  var normalizedDate =
    normalizeAttendanceDate_(
      date
    );

  var normalizedShift =
    String(
      shift || ''
    )
      .trim()
      .toLowerCase();

  var normalizedName =
    String(
      name || ''
    )
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        ' '
      );


  if (
    !normalizedDate ||
    !normalizedShift ||
    !normalizedName
  ) {

    return '';

  }


  return (
    normalizedDate +
    '|' +
    normalizedShift +
    '|' +
    normalizedName
  );

}


// ============================================================
// NORMALIZE ATTENDANCE DATE
// ============================================================

function normalizeAttendanceDate_(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return '';

  }


  // ========================================================
  // GOOGLE SHEETS DATE OBJECT
  // ========================================================

  if (
    Object.prototype.toString.call(
      value
    ) === '[object Date]'
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {

      return '';

    }


    return Utilities.formatDate(
      value,
      'Asia/Makassar',
      'yyyy-MM-dd'
    );

  }


  var text =
    String(
      value
    ).trim();


  if (!text) {
    return '';
  }


  // ========================================================
  // FORMAT YYYY-MM-DD
  // ========================================================

  var isoMatch =
    text.match(
      /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/
    );


  if (isoMatch) {

    var isoYear =
      isoMatch[1];

    var isoMonth =
      String(
        isoMatch[2]
      ).padStart(
        2,
        '0'
      );

    var isoDay =
      String(
        isoMatch[3]
      ).padStart(
        2,
        '0'
      );


    return (
      isoYear +
      '-' +
      isoMonth +
      '-' +
      isoDay
    );

  }


  // ========================================================
  // FORMAT DD/MM/YYYY
  // FORMAT DD-MM-YYYY
  // ========================================================

  var dmyMatch =
    text.match(
      /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/
    );


  if (dmyMatch) {

    var day =
      String(
        dmyMatch[1]
      ).padStart(
        2,
        '0'
      );

    var month =
      String(
        dmyMatch[2]
      ).padStart(
        2,
        '0'
      );

    var year =
      dmyMatch[3];


    return (
      year +
      '-' +
      month +
      '-' +
      day
    );

  }


  // ========================================================
  // COBA PARSE DATE
  // ========================================================

  var parsed =
    new Date(text);


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return Utilities.formatDate(
      parsed,
      'Asia/Makassar',
      'yyyy-MM-dd'
    );

  }


  // ========================================================
  // FALLBACK
  // ========================================================

  return text
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );

}


// ============================================================
// DASHBOARD DAILY ABSENSI
// ============================================================
// Dashboard juga menggunakan:
// TANGGAL + SHIFT + NAMA
//
// Data duplikat tetap hanya ditampilkan satu.
// Timestamp dashboard juga dinormalisasi menjadi HH:MM.
// ============================================================

function dedupeAttendanceRowsForDisplay_(
  rows
) {

  var result = {};

  var output = [];


  rows.forEach(
    function(row) {

      if (
        !Array.isArray(row)
      ) {

        return;

      }


      var date =
        row[0] || '';

      var shift =
        String(row[1] || '').trim().toLowerCase();

      var location =
        row[2] || '';

      var name =
        String(row[3] || '').trim().toLowerCase().replace(/\s+/g, ' ');


      if (
        !date ||
        !shift ||
        !name
      ) {

        return;

      }


      var key =
        attendanceKey_(
          date,
          shift,
          name
        );


      if (
        !key ||
        result[key]
      ) {

        return;

      }


      // ----------------------------------------------------
      // TIMESTAMP
      // ----------------------------------------------------

      var timestamp =
        row[4] || '';


      // ----------------------------------------------------
      // SUPPORT SHEET LAMA 6 KOLOM
      // ----------------------------------------------------

      if (
        row.length >= 6 &&
        row[5]
      ) {

        timestamp =
          row[5];

      }


      // ----------------------------------------------------
      // NORMALISASI TIMESTAMP
      // ----------------------------------------------------

      timestamp =
        normalizeAttendanceTimestamp_(
          timestamp
        );


      output.push(
        [
          String(
            normalizeAttendanceDate_(
              date
            )
          ).trim(),

          String(
            shift
          ).trim(),

          String(
            location
          ).trim(),

          String(
            name
          ).trim(),

          String(
            timestamp
          ).trim()
        ]
      );


      result[key] = true;

    }
  );


  return output;

}


// ============================================================
// CLEANUP DUPLICATE DAILY ABSENSI
// ============================================================
// FUNGSI PUBLIC.
//
// Pilih di dropdown Apps Script:
// cleanupDuplicateAttendanceRows
//
// Fungsi ini:
// - menghapus duplikat berdasarkan tanggal + shift + nama
// - mempertahankan BARIS PERTAMA
// - shift menjadi pembeda
// - lokasi tidak menjadi pembeda
// ============================================================

function cleanupDuplicateAttendanceRows() {

  var lock =
    LockService.getScriptLock();


  lock.waitLock(30000);


  try {

    var sheet =
      getAttendanceSheet_();


    var lastRow =
      sheet.getLastRow();


    if (
      lastRow <= 1
    ) {

      Logger.log(
        'Tidak ada data Daily Absensi yang perlu dibersihkan.'
      );

      return 0;
    }


    var lastColumn =
      Math.max(
        5,
        sheet.getLastColumn()
      );


    var rows =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          lastColumn
        )
        .getValues();


    var beforeCount =
      rows.length;


    var cleaned =
      dedupeAttendanceRowsForCleanup_(
        rows
      );


    var afterCount =
      cleaned.length;


    var deletedCount =
      beforeCount -
      afterCount;


    // ========================================================
    // BERSIHKAN DATA LAMA
    // ========================================================

    sheet
      .getRange(
        1,
        1,
        lastRow,
        Math.max(
          5,
          lastColumn
        )
      )
      .clearContent();


    // ========================================================
    // HEADER
    // ========================================================

    sheet
      .getRange(
        1,
        1,
        1,
        5
      )
      .setValues(
        [
          ATTENDANCE_HEADERS
        ]
      );


    // ========================================================
    // DATA BERSIH
    // ========================================================

    if (
      cleaned.length > 0
    ) {

      sheet
        .getRange(
          2,
          1,
          cleaned.length,
          5
        )
        .setValues(
          cleaned
        );

    }


    Logger.log(
      '===================================='
    );

    Logger.log(
      'CLEANUP DAILY ABSENSI SELESAI'
    );

    Logger.log(
      'Data sebelum : ' +
      beforeCount
    );

    Logger.log(
      'Data sesudah : ' +
      afterCount
    );

    Logger.log(
      'Duplikat dihapus : ' +
      deletedCount
    );

    Logger.log(
      '===================================='
    );


    return afterCount;

  } finally {

    lock.releaseLock();

  }

}


// ============================================================
// DEDUPE UNTUK CLEANUP
// ============================================================
// Mempertahankan BARIS PERTAMA.
//
// Ini penting supaya timestamp/data absensi pertama
// tidak tertimpa oleh data duplikat berikutnya.
// ============================================================

function dedupeAttendanceRowsForCleanup_(
  rows
) {

  var result = {};

  var output = [];


  rows.forEach(
    function(row) {

      if (
        !Array.isArray(row)
      ) {

        return;

      }


      var date =
        row[0] || '';

      var shift =
        String(row[1] || '').trim().toLowerCase();

      var location =
        row[2] || '';

      var name =
        String(row[3] || '').trim().toLowerCase().replace(/\s+/g, ' ');

      var timestamp =
        row[4] || '';


      if (
        !date ||
        !shift ||
        !name
      ) {

        return;

      }


      var key =
        attendanceKey_(
          date,
          shift,
          name
        );


      if (
        !key ||
        result[key]
      ) {

        return;

      }


      output.push(
        [
          normalizeAttendanceDate_(
            date
          ),

          String(
            shift
          ).trim(),

          String(
            location
          ).trim(),

          String(
            name
          ).trim(),

          normalizeAttendanceTimestamp_(
            timestamp
          )
        ]
      );


      result[key] = true;

    }
  );


  return output;

}


// ============================================================
// FIX TIMESTAMP DAILY ABSENSI LAMA
// ============================================================
// Mengubah timestamp lama:
//
// 2026-09-18T06:37:47.196Z
//
// menjadi:
//
// 14:37
//
// Zona waktu:
// Asia/Makassar / WITA
//
// Fungsi PUBLIC sehingga muncul di dropdown Apps Script.
// ============================================================

function fixAttendanceTimestamps() {

  var lock =
    LockService.getScriptLock();


  lock.waitLock(30000);


  try {

    var sheet =
      getAttendanceSheet_();


    var lastRow =
      sheet.getLastRow();


    if (
      lastRow <= 1
    ) {

      Logger.log(
        'Tidak ada data Daily Absensi.'
      );

      return 0;
    }


    var rows =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          5
        )
        .getValues();


    var changedCount = 0;


    rows.forEach(
      function(row) {

        if (
          !Array.isArray(row)
        ) {

          return;

        }


        var timestamp =
          row[4];


        if (
          !timestamp
        ) {

          return;

        }


        var normalized =
          normalizeAttendanceTimestamp_(
            timestamp
          );


        if (
          normalized &&
          String(timestamp) !==
            normalized
        ) {

          row[4] =
            normalized;

          changedCount++;

        }

      }
    );


    // ========================================================
    // TULIS KEMBALI KOLOM TIMESTAMP
    // ========================================================

    sheet
      .getRange(
        2,
        5,
        rows.length,
        1
      )
      .setValues(
        rows.map(
          function(row) {

            return [
              row[4]
            ];

          }
        )
      );


    Logger.log(
      '===================================='
    );

    Logger.log(
      'PERBAIKAN TIMESTAMP ABSENSI SELESAI'
    );

    Logger.log(
      'Jumlah timestamp diperbaiki : ' +
      changedCount
    );

    Logger.log(
      'Format : HH:MM'
    );

    Logger.log(
      'Zona waktu : Asia/Makassar'
    );

    Logger.log(
      '===================================='
    );


    return changedCount;

  } finally {

    lock.releaseLock();

  }

}


// ============================================================
// NORMALIZE TIMESTAMP DAILY ABSENSI
// ============================================================
// Format akhir:
// HH:MM
//
// Zona waktu:
// Asia/Makassar
// ============================================================

function normalizeAttendanceTimestamp_(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return '';

  }


  // ========================================================
  // JIKA SUDAH HH:MM
  // ========================================================

  var text =
    String(
      value
    ).trim();


  if (
    /^\d{1,2}:\d{2}$/.test(
      text
    )
  ) {

    var parts =
      text.split(':');


    var hour =
      String(
        parts[0]
      ).padStart(
        2,
        '0'
      );


    var minute =
      String(
        parts[1]
      ).padStart(
        2,
        '0'
      );


    return (
      hour +
      ':' +
      minute
    );

  }


  // ========================================================
  // GOOGLE SHEETS DATE OBJECT
  // ========================================================

  if (
    Object.prototype.toString.call(
      value
    ) === '[object Date]'
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {

      return '';

    }


    return Utilities.formatDate(
      value,
      'Asia/Makassar',
      'HH:mm'
    );

  }


  // ========================================================
  // ISO TIMESTAMP
  //
  // Contoh:
  // 2026-09-18T06:37:47.196Z
  //
  // Hasil:
  // 14:37
  // ========================================================

  var parsed =
    new Date(text);


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return Utilities.formatDate(
      parsed,
      'Asia/Makassar',
      'HH:mm'
    );

  }


  // ========================================================
  // FALLBACK
  // ========================================================

  return text;

}


// ============================================================
// SAVE PRODUKSI
// ============================================================
// BAGIAN INI DIPERTAHANKAN.
// TIMESTAMP PRODUKSI TETAP ISO STRING.
// ============================================================

function saveProduction_(
  payload
) {

  var sheet =
    getSheet_();


  var items =
    Array.isArray(
      payload.items
    )
      ? payload.items
      : Array.isArray(
          payload.values
        )
        ? payload.values
        : [];


  var submittedAt =
    getSubmissionTimestamp_();


  if (!items.length) {

    return respond_(
      {
        success: true,
        message:
          'Tidak ada data produksi baru.',
        sheet:
          SHEET_NAME,
        count: 0
      },
      ''
    );

  }


  var rows =
    items.map(
      function(item) {

        if (
          Array.isArray(item)
        ) {

          var row =
            item.slice(
              0,
              HEADERS.length - 1
            );


          while (
            row.length <
            HEADERS.length - 1
          ) {

            row.push('');

          }


          row.push(
            item.length >=
              HEADERS.length
              ? item[
                  HEADERS.length - 1
                ] ||
                submittedAt
              : submittedAt
          );


          return row;

        }


        return itemToRow_(
          item,
          submittedAt
        );

      }
    );


  var startRow =
    sheet.getLastRow() + 1;


  sheet
    .getRange(
      startRow,
      1,
      rows.length,
      HEADERS.length
    )
    .setValues(
      rows
    );


  return respond_(
    {
      success: true,
      message:
        'Data MineTrack berhasil disimpan.',
      sheet:
        SHEET_NAME,
      count:
        items.length
    },
    ''
  );

}


// ============================================================
// SAVE ORE GETTING
// ============================================================
// BAGIAN INI DIPERTAHANKAN.
// TIMESTAMP ORE GETTING DIBUAT OLEH SERVER
// DALAM ZONA ASIA/MAKASSAR / WITA.
// FORMAT: HH:mm
// ============================================================

function saveOreGetting_(
  payload
) {

  var sheet =
    getOreGettingSheet_();


  var items =
    Array.isArray(
      payload.items
    )
      ? payload.items
      : Array.isArray(
          payload.values
        )
        ? payload.values
        : [];


  var submittedAt =
    getSubmissionTimestamp_();


  if (!items.length) {

    return respond_(
      {
        success: true,
        message:
          'Tidak ada data Ore Getting baru.',
        sheet:
          ORE_GETTING_SHEET_NAME,
        count: 0
      },
      ''
    );

  }


  var rows =
    items.map(
      function(item) {

        if (
          Array.isArray(item)
        ) {

          var row =
            item.slice(
              0,
              ORE_GETTING_HEADERS.length - 1
            );


          while (
            row.length <
            ORE_GETTING_HEADERS.length - 1
          ) {

            row.push('');

          }


          row.push(
            submittedAt
          );


          return row;

        }


        return oreGettingToRow_(
          item,
          submittedAt
        );

      }
    );


  var startRow =
    sheet.getLastRow() + 1;


  sheet
    .getRange(
      startRow,
      1,
      rows.length,
      ORE_GETTING_HEADERS.length
    )
    .setValues(
      rows
    );


  return respond_(
    {
      success: true,
      message:
        'Data Ore Getting berhasil disimpan.',
      sheet:
        ORE_GETTING_SHEET_NAME,
      count:
        items.length
    },
    ''
  );

}


// ============================================================
// GET SHEET PRODUKSI
// ============================================================

function getSheet_() {

  var ss =
    SpreadsheetApp.openById(
      SPREADSHEET_ID
    );


  var sheet =
    ss.getSheetByName(
      SHEET_NAME
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        SHEET_NAME,
        0
      );

  }


  ensureHeaders_(
    sheet,
    HEADERS
  );


  return sheet;

}


// ============================================================
// GET SHEET ABSENSI
// ============================================================

function getAttendanceSheet_() {

  var ss =
    SpreadsheetApp.openById(
      SPREADSHEET_ID
    );


  var sheet =
    ss.getSheetByName(
      ATTENDANCE_SHEET_NAME
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        ATTENDANCE_SHEET_NAME,
        1
      );

  }


  ensureAttendanceHeaders_(
    sheet
  );


  return sheet;

}


// ============================================================
// GET SHEET ORE GETTING
// ============================================================

function getOreGettingSheet_() {

  var ss =
    SpreadsheetApp.openById(
      SPREADSHEET_ID
    );


  var sheet =
    ss.getSheetByName(
      ORE_GETTING_SHEET_NAME
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        ORE_GETTING_SHEET_NAME,
        2
      );

  }


  ensureHeaders_(
    sheet,
    ORE_GETTING_HEADERS
  );


  return sheet;

}


// ============================================================
// ENSURE ATTENDANCE HEADER
// ============================================================

function ensureAttendanceHeaders_(
  sheet
) {

  if (!sheet) {
    return;
  }


  if (
    sheet.getLastRow() === 0
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        5
      )
      .setValues(
        [
          ATTENDANCE_HEADERS
        ]
      );

    return;
  }


  var firstFive =
    sheet
      .getRange(
        1,
        1,
        1,
        5
      )
      .getValues()[0];


  var expected =
    ATTENDANCE_HEADERS.map(
      function(header) {

        return String(
          header
        )
          .trim()
          .toLowerCase();

      }
    );


  var current =
    firstFive.map(
      function(value) {

        return String(
          value || ''
        )
          .trim()
          .toLowerCase();

      }
    );


  var needsHeader =
    false;


  for (
    var i = 0;
    i < expected.length;
    i++
  ) {

    if (
      current[i] !==
      expected[i]
    ) {

      needsHeader = true;

      break;

    }

  }


  if (
    needsHeader &&
    sheet.getLastRow() <= 1
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        5
      )
      .setValues(
        [
          ATTENDANCE_HEADERS
        ]
      );

  }

}


// ============================================================
// ENSURE HEADERS UMUM
// ============================================================

function ensureHeaders_(
  sheet,
  headers
) {

  if (!sheet) {
    return;
  }


  if (
    sheet.getLastRow() === 0
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues(
        [
          headers
        ]
      );

    return;
  }


  var currentLastColumn =
    Math.max(
      headers.length,
      sheet.getLastColumn()
    );


  var row =
    sheet
      .getRange(
        1,
        1,
        1,
        currentLastColumn
      )
      .getValues()[0];


  var normalized =
    row
      .slice(
        0,
        headers.length
      )
      .map(
        function(value) {

          return String(
            value || ''
          )
            .trim()
            .toLowerCase();

        }
      );


  var expected =
    headers.map(
      function(header) {

        return String(
          header || ''
        )
          .trim()
          .toLowerCase();

      }
    );


  var needsHeader =
    false;


  if (
    normalized.length !==
    expected.length
  ) {

    needsHeader = true;

  } else {

    for (
      var i = 0;
      i < expected.length;
      i++
    ) {

      if (
        normalized[i] !==
        expected[i]
      ) {

        needsHeader = true;

        break;

      }

    }

  }


  // ----------------------------------------------------------
  // HANYA PERBAIKI HEADER JIKA BELUM ADA DATA
  // ----------------------------------------------------------

  if (
    needsHeader &&
    sheet.getLastRow() <= 1
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues(
        [
          headers
        ]
      );

  }

}


// ============================================================
// TIMESTAMP PRODUKSI & ORE GETTING
// ============================================================
// Format : HH:MM
// Zona   : Asia/Makassar / WITA
// Timestamp dibuat oleh server Apps Script.
// ============================================================

function getSubmissionTimestamp_() {

  return Utilities.formatDate(
    new Date(),
    'Asia/Makassar',
    'HH:mm'
  );

}


// ============================================================
// TIMESTAMP DAILY ABSENSI
// ============================================================
// Format : HH:MM
// Zona   : Asia/Makassar / WITA
//
// Contoh:
// 14:37
// 22:15
// 06:05
// ============================================================

function getAttendanceTimestamp_() {

  return Utilities.formatDate(
    new Date(),
    'Asia/Makassar',
    'HH:mm'
  );

}


// ============================================================
// ATTENDANCE TO ROW
// ============================================================
// Timestamp selalu dibuat oleh server.
// Format HH:MM WITA.
// ============================================================

function attendanceToRow_(
  item
) {

  return [
    item.date ||
      item.tanggal ||
      '',

    item.shift ||
      '',

    item.location ||
      item.lokasi ||
      item.lokasiKerja ||
      '',

    item.name ||
      item.nama ||
      '',

    getAttendanceTimestamp_()
  ];

}


// ============================================================
// CHECK HEADER
// ============================================================

function looksLikeHeader_(
  row
) {

  if (!row) {
    return false;
  }


  var first =
    String(
      row[0] || ''
    )
      .toLowerCase()
      .trim();


  var second =
    String(
      row[1] || ''
    )
      .toLowerCase()
      .trim();


  return (
    first === 'tanggal' ||
    first === 'date' ||
    second === 'shift'
  );

}


// ============================================================
// PRODUCTION ITEM TO ROW
// ============================================================

function itemToRow_(
  item,
  submittedAt
) {

  var ritToday =
    Number(
      item.ritToday
    ) || 0;


  return [

    item.date || '',

    item.block ||
      item.blockModel ||
      '',

    item.shift || '',

    item.pit || '',

    item.dumpingArea || '',

    item.sublot || '',

    ritToday,

    item.status || '',

    item.blockModel || '',

    item.sampleRef || '',

    item.drillHole || '',

    item.elevation || '',

    item.loadingMethod || '',

    normalizeMaterial_(
      item.material ||
      'Saprolit'
    ),

    Array.isArray(
      item.equipment
    )
      ? item.equipment.join(', ')
      : (
          item.equipment ||
          ''
        ),

    Number(
      item.tonnage
    ) || 0,

    Number(
      item.niGrade
    ) || 0,

    item.reporterName ||
      item.reporter ||
      '',

    submittedAt

  ];

}


// ============================================================
// ORE GETTING TO ROW
// ============================================================

function oreGettingToRow_(
  item,
  submittedAt
) {

  var today =
    item.date ||
    Utilities.formatDate(
      new Date(),
      'Asia/Makassar',
      'yyyy-MM-dd'
    );


  return [

    today,

    item.areaPit ||
      item.area ||
      '',

    item.shift ||
      '',

    item.metode ||
      '',

    item.idMetode ||
      '',

    item.acuan ||
      '',

    item.titikBor ||
      '',

    item.blockModel ||
      '',

    item.elevasi ||
      '',

    submittedAt

  ];

}


// ============================================================
// ROW TO ITEM
// ============================================================

function rowToItem_(
  row
) {

  var ritToday =
    Number(
      row[6]
    ) || 0;


  return {

    id:
      'gs-' +
      Utilities.getUuid(),

    date:
      formatDate_(
        row[0]
      ),

    block:
      String(
        row[1] || ''
      ),

    shift:
      String(
        row[2] || ''
      ),

    pit:
      String(
        row[3] || ''
      ),

    dumpingArea:
      String(
        row[4] || ''
      ),

    sublot:
      String(
        row[5] || ''
      ).trim(),

    ritPrevious:
      0,

    ritToday:
      ritToday,

    ritTotal:
      ritToday,

    status:
      String(
        row[7] || ''
      ),

    blockModel:
      String(
        row[8] || ''
      ),

    sampleRef:
      String(
        row[9] || ''
      ),

    drillHole:
      String(
        row[10] || ''
      ),

    elevation:
      String(
        row[11] || ''
      ),

    loadingMethod:
      String(
        row[12] || ''
      ),

    material:
      normalizeMaterial_(
        String(
          row[13] ||
          'Saprolit'
        ).trim()
      ) ||
      'Saprolit',

    equipment:
      row[14]
        ? String(
            row[14]
          )
          .split(',')
          .map(
            function(v) {

              return v.trim();

            }
          )
          .filter(
            Boolean
          )
        : [],

    tonnage:
      Number(
        row[15]
      ) || 0,

    niGrade:
      Number(
        row[16]
      ) || 0,

    reporterName:
      String(
        row[17] || ''
      ).trim(),

    submissionTimestamp:
      String(
        row[18] || ''
      ).trim()

  };

}


// ============================================================
// NORMALIZE MATERIAL
// ============================================================

function normalizeMaterial_(
  value
) {

  var normalized =
    String(
      value || ''
    ).trim();


  if (!normalized) {

    return 'Saprolit';

  }


  if (
    normalized.toLowerCase() ===
      'saprolite' ||
    normalized.toLowerCase() ===
      'saprolit'
  ) {

    return 'Saprolit';

  }


  if (
    normalized.toLowerCase() ===
      'limonite' ||
    normalized.toLowerCase() ===
      'limonit'
  ) {

    return 'Limonit';

  }


  return normalized;

}


// ============================================================
// ROW TO ORE GETTING ITEM
// ============================================================

function rowToOreGettingItem_(
  row
) {

  return {

    date:
      formatDate_(
        row[0]
      ),

    areaPit:
      String(
        row[1] || ''
      ).trim(),

    shift:
      String(
        row[2] || ''
      ).trim(),

    metode:
      String(
        row[3] || ''
      ).trim(),

    idMetode:
      String(
        row[4] || ''
      ).trim(),

    acuan:
      String(
        row[5] || ''
      ).trim(),

    titikBor:
      String(
        row[6] || ''
      ).trim(),

    blockModel:
      String(
        row[7] || ''
      ).trim(),

    elevasi:
      String(
        row[8] || ''
      ).trim(),

    submissionTimestamp:
      String(
        row[9] || ''
      ).trim()

  };

}


// ============================================================
// FORMAT DATE
// ============================================================

function formatDate_(
  value
) {

  return String(
    value || ''
  ).trim();

}


// ============================================================
// FORMAT TIME
// ============================================================

function formatTime_(
  value
) {

  return String(
    value || ''
  ).trim();

}


// ============================================================
// CALLBACK
// ============================================================

function getCallback_(
  e
) {

  return e && e.parameter
    ? e.parameter.callback
    : '';

}


// ============================================================
// RESPONSE
// ============================================================

function respond_(
  data,
  callback
) {

  var json =
    JSON.stringify(
      data
    );


  if (
    callback &&
    /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(
      callback
    )
  ) {

    return ContentService
      .createTextOutput(
        callback +
        '(' +
        json +
        ')'
      )
      .setMimeType(
        ContentService.MimeType.JAVASCRIPT
      );

  }


  return ContentService
    .createTextOutput(
      json
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}
