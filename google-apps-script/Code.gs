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

const ORE_LOSS_SHEET_NAME =
  'LAPORAN ORE LOSS';


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
  'Nama Pelapor'
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
  'Jumlah Sampel',
  'Timestamp Pengumpulan',
  'Nama Pelapor'
];

const ORE_LOSS_HEADERS = [
  'Unit Excavator',
  'Start Loading',
  'Stop Loading',
  'Jumlah Bucket',
  'Block Model',
  'Titik Bor',
  'Elevasi',
  'Ritase',
  'Status',
  'Timestamp Pengumpulan',
  'Nama Pelapor'
];

// ============================================================
// HEADER DAILY ABSENSI
// ============================================================

const ATTENDANCE_HEADERS = [
  'Tanggal',
  'Shift',
  'Lokasi Kerja',
  'Nama',
  'Penanggung Jawab',
  'Pembahasan',
  'Timestamp Pengumpulan',
  'Foto'
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
    var recordId =
      String(e && e.parameter ? e.parameter.recordId || '' : '').trim();


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
          ATTENDANCE_HEADERS.length,
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

      var oreGettingSpreadsheet =
        SpreadsheetApp.openById(SPREADSHEET_ID);
      var oreSheet =
        oreGettingSpreadsheet.getSheetByName(ORE_GETTING_SHEET_NAME);

      if (!oreSheet) {
        return respond_(
          { success: true, resource: 'oregetting', items: [], values: [], count: 0 },
          getCallback_(e)
        );
      }

      var oreLastRow =
        oreSheet.getLastRow();


      if (oreLastRow === 0) {

        return respond_(
          {
            success: true,
            resource: 'oregetting',
            items: [],
            values: [],
            count: 0
          },
          getCallback_(e)
        );
      }


      var oreReadColumnCount =
        Math.min(ORE_GETTING_HEADERS.length, oreSheet.getMaxColumns());

      var oreValues =
        oreSheet
          .getRange(
            1,
            1,
            oreLastRow,
            oreReadColumnCount
          )
          .getDisplayValues();

      var oreSampleCountIndex = oreValues[0].findIndex(function(header, index) {
        if (index >= ORE_GETTING_HEADERS.length) return false;
        return String(header || '').trim().toLowerCase() === 'jumlah sampel';
      });
      var oreTimestampIndex = oreValues[0].findIndex(function(header, index) {
        if (index >= ORE_GETTING_HEADERS.length) return false;
        return String(header || '').trim().toLowerCase() === 'timestamp pengumpulan';
      });
      var oreReporterNameIndex = oreValues[0].findIndex(function(header, index) {
        if (index >= ORE_GETTING_HEADERS.length) return false;
        return String(header || '').trim().toLowerCase() === 'nama pelapor';
      });
      if (oreTimestampIndex < 0) oreTimestampIndex = 9;


      var oreDataRows =
        oreValues
          .slice(1)
          .filter(function(row) {
            return row.slice(0, ORE_GETTING_HEADERS.length).some(
              function(value) {

                return String(
                  value
                ).trim() !== '';

              }
            );

          })
          .map(function(row) {
            return rowToOreGettingItem_(row, oreSampleCountIndex, oreTimestampIndex, oreReporterNameIndex);
          });


      return respond_(
        {
          success: true,
          resource: 'oregetting',
          items: oreDataRows,
          values: oreDataRows,
          count: oreDataRows.length
        },
        getCallback_(e)
      );
    }


    // ========================================================
    // ORE LOSS
    // ========================================================

    if (type === 'oreloss' || type === 'ore_loss') {
      var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      var oreLossSheet = spreadsheet.getSheetByName(ORE_LOSS_SHEET_NAME);
      if (!oreLossSheet) {
        return respond_({ success: true, resource: 'oreloss', items: [], values: [], count: 0 }, getCallback_(e));
      }

      var oreLossLastRow = oreLossSheet.getLastRow();
      if (oreLossLastRow === 0) {
        return respond_({ success: true, resource: 'oreloss', items: [], values: [], count: 0 }, getCallback_(e));
      }

      var oreLossReadColumnCount = Math.min(ORE_LOSS_HEADERS.length, oreLossSheet.getMaxColumns());
      var oreLossValues = oreLossSheet
        .getRange(1, 1, oreLossLastRow, oreLossReadColumnCount)
        .getDisplayValues()
        .filter(function(row) {
          return row.slice(0, ORE_LOSS_HEADERS.length).some(function(value) {
            return String(value || '').trim() !== '';
          });
        });
      var oreLossStartIndex = oreLossValues.length &&
        String(oreLossValues[0][0] || '').trim().toLowerCase() === ORE_LOSS_HEADERS[0].toLowerCase()
        ? 1
        : 0;
      var oreLossItems = oreLossValues
        .slice(oreLossStartIndex)
        .map(rowToOreLossItem_);

      return respond_(
        { success: true, resource: 'oreloss', items: oreLossItems, values: oreLossItems, count: oreLossItems.length },
        getCallback_(e)
      );
    }


    // ========================================================
    // DATA PRODUKSI
    // ========================================================

    if (recordId) {
      var idKey = productionIdempotencyKey_(recordId);
      var matchCount = PropertiesService.getScriptProperties().getProperty(idKey) ? 1 : 0;

      return respond_(
        {
          success: true,
          found: matchCount > 0,
          matchCount: matchCount,
          recordId: recordId
        },
        getCallback_(e)
      );
    }

    var sheet =
      getSheet_();

    var lastRow =
      sheet.getLastRow();

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
          HEADERS.length
        )
        .getDisplayValues();


    var startRow = 0;
    var acuanNiIndex = values[0].findIndex(function(header) {
      return ['acuan ni%', 'acuan ni'].indexOf(String(header || '').trim().toLowerCase()) !== -1;
    });
    if (acuanNiIndex < 0) acuanNiIndex = 16;


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
        .map(function(row) {
          return rowToItem_(row, acuanNiIndex);
        });


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


    if (type === 'oreloss' || type === 'ore_loss') {
      return saveOreLoss_(payload);
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
      'Jenis data tidak dikenali. Gunakan type "absensi", "produksi", "oregetting", atau "oreloss".'
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
            ATTENDANCE_HEADERS.length
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
          String(row[3] || '').trim().replace(/\s+/g, ' ').toUpperCase();


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

    var photoCount = 0;


    items.forEach(
      function(item) {

        var row;
        var photoDataUrl = '';


        // ----------------------------------------------------
        // FORMAT ARRAY
        // ----------------------------------------------------

        if (
          Array.isArray(item)
        ) {

          photoDataUrl = item[7] || '';

          if (!photoDataUrl && /^data:/i.test(String(item[6] || ''))) {
            photoDataUrl = item[6];
          }

          row = [
            item[0] || '',
            item[1] || '',
            item[2] || '',
            item[3] || '',
            item[4] || '',
            item[5] || '',
            '',
            photoDataUrl
          ];

        }


        // ----------------------------------------------------
        // FORMAT OBJECT
        // ----------------------------------------------------

        else {

          photoDataUrl =
            item.photoDataUrl ||
            item.photo ||
            '';

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
              '',

            item.penanggungJawab ||
              item.penanggungjawab ||
              item['Penanggung Jawab'] ||
              '',

            item.pembahasan ||
              item['Pembahasan'] ||
              item.topik ||
              '',

            '',

            photoDataUrl
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
          String(row[3] || '').trim().replace(/\s+/g, ' ').toUpperCase();

        var penanggungJawab =
          String(row[4] || '').trim().replace(/\s+/g, ' ');

        var pembahasan =
          String(row[5] || '').trim();


        if (
          !date ||
          !shift ||
          !name ||
          !penanggungJawab ||
          !pembahasan
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

        var photoUrl = '';

        if (photoDataUrl) {
          photoUrl = saveAttendancePhoto_(
            photoDataUrl,
            date,
            name
          );
          photoCount++;
        }

        incomingRows[key] = [
          normalizeAttendanceDate_(
            date
          ),

          row[1] || '',

          row[2] || '',

          String(
            name
          ).trim(),

          penanggungJawab,

          pembahasan,

          submittedAt,

          photoUrl
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
            invalidCount,
          photoCount:
            photoCount
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
        ATTENDANCE_HEADERS.length
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
        photoCount:
          photoCount,
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

function saveAttendancePhoto_(photoDataUrl, date, name) {
  var match = String(photoDataUrl || '').match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) {
    throw new Error('Foto Daily Absensi harus berformat JPEG base64.');
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(match[1]);
  } catch (error) {
    throw new Error('Data foto Daily Absensi tidak valid.');
  }

  if (!bytes || !bytes.length || bytes.length > 100 * 1024) {
    throw new Error('Ukuran foto Daily Absensi harus maksimal 100 KB.');
  }

  if ((bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8 || (bytes[2] & 0xff) !== 0xff) {
    throw new Error('Data foto Daily Absensi bukan file JPEG yang valid.');
  }

  var folders = DriveApp.getFoldersByName('MineTrack Attendance Photos');
  var folder = folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder('MineTrack Attendance Photos');
  var safeDate = String(date || '').replace(/[^A-Za-z0-9_-]/g, '-');
  var safeName = String(name || '').replace(/[^A-Za-z0-9_-]/g, '-');
  var blob = Utilities.newBlob(bytes, 'image/jpeg', safeDate + '-' + safeName + '.jpg');
  var file = folder.createFile(blob);

  return file.getUrl();
}


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
      // FIELD BARU DAILY ABSENSI
      // ----------------------------------------------------

      var penanggungJawab =
        String(row[4] || '').trim();

      var pembahasan =
        String(row[5] || '').trim();

      var timestamp =
        row[6] || '';

      var photoUrl =
        row[7] || '';


      // ----------------------------------------------------
      // SUPPORT SHEET LAMA 5 KOLOM / 6 KOLOM
      // ----------------------------------------------------

      if (
        row.length >= 5 &&
        row[4] &&
        !row[6]
      ) {

        timestamp =
          row[4];

        penanggungJawab =
          '';
      }

      if (
        row.length >= 6 &&
        row[5] &&
        !row[6]
      ) {

        timestamp =
          row[5];

        pembahasan =
          '';
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
            penanggungJawab
          ).trim(),

          String(
            pembahasan
          ).trim(),

          String(
            timestamp
          ).trim(),

          String(
            photoUrl
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

  var lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {

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


  var properties =
    PropertiesService.getScriptProperties();

  var processed =
    properties.getProperties();

  var rows = [];
  var keysToMark = {};
  var seenKeys = {};
  var duplicateCount = 0;

  items.forEach(function(item) {
    var recordId = item && !Array.isArray(item)
      ? String(item.recordId || item.id || '').trim()
      : '';

    if (!recordId) {
      throw new Error(
        'Setiap data Production harus memiliki recordId yang stabil.'
      );
    }

    var key = productionIdempotencyKey_(recordId);

    if (processed[key] || seenKeys[key]) {
      duplicateCount++;
      return;
    }

    seenKeys[key] = true;
    keysToMark[key] = '1';
    rows.push(itemToRow_(item));
  });

  if (rows.length) {
    var startRow = sheet.getLastRow() + 1;
    sheet
      .getRange(startRow, 1, rows.length, HEADERS.length)
      .setValues(rows);
    properties.setProperties(keysToMark);
  }


  return respond_(
    {
      success: true,
      message:
        'Data MineTrack berhasil disimpan.',
      sheet:
        SHEET_NAME,
      count:
        rows.length,
      duplicateCount:
        duplicateCount
    },
    ''
  );

  } finally {
    lock.releaseLock();
  }

}


function productionIdempotencyKey_(recordId) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    recordId
  );

  return 'production_record_' +
    Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
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

  var items = [];

  if (payload && payload.items && Array.isArray(payload.items)) {
    items = payload.items;
  } else if (payload && payload.values && Array.isArray(payload.values)) {
    items = payload.values;
  }

  var submittedAt =
    getSubmissionTimestamp_();

  if (!items.length) {

    return respond_(
      {
        success: true,
        message: 'Tidak ada data Ore Getting baru.',
        sheet: ORE_GETTING_SHEET_NAME,
        count: 0
      },
      ''
    );
  }

  if (!hasOreGettingHeaders_(sheet)) {
    throw new Error('Header Laporan Ore Getting harus: Tanggal, Area PIT, Shift, Metode, ID Metode, Acuan, Titik Bor, Block Model, Elevasi, Jumlah Sampel di kolom J dan Timestamp Pengumpulan di kolom K, serta Nama Pelapor di kolom L. Silakan sesuaikan header lembar kerja secara manual sebelum menulis ulang.');
  }

  var rows = items.map(function(item) {
    if (Array.isArray(item)) {
      var row = [
        item[0] || '',
        item[1] || '',
        item[2] || '',
        item[3] || '',
        item[4] || '',
        item[5] || '',
        item[6] || '',
        item[7] || '',
        item[8] || '',
        parseOreGettingSampleCount_(item[9]) ?? '',
        submittedAt,
        item[11] || ''
      ];
      return row;
    }

    return oreGettingToRow_(item, submittedAt);
  });

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, ORE_GETTING_HEADERS.length).setValues(rows);

  return respond_(
    {
      success: true,
      message: 'Data Ore Getting berhasil disimpan.',
      sheet: ORE_GETTING_SHEET_NAME,
      count: rows.length
    },
    ''
  );
}


function saveOreLoss_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var sheet = getOreLossSheet_();
    var items = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.values)
        ? payload.values
        : [];

    if (!items.length) {
      return respond_(
        {
          success: true,
          message: 'Tidak ada data Ore Loss baru.',
          sheet: ORE_LOSS_SHEET_NAME,
          count: 0
        },
        ''
      );
    }

    var submittedAt = getSubmissionTimestamp_();
    var rows = items.map(function(item) {
      return oreLossToRow_(item, submittedAt);
    });
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, ORE_LOSS_HEADERS.length).setValues(rows);

    return respond_(
      {
        success: true,
        message: 'Laporan Ore Loss berhasil disimpan.',
        sheet: ORE_LOSS_SHEET_NAME,
        count: rows.length
      },
      ''
    );
  } finally {
    lock.releaseLock();
  }
}


function oreLossToRow_(item, submittedAt) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Format data Ore Loss tidak valid.');
  }

  var unitExcavator = String(item.unitExcavator || '').trim();
  var startLoading = String(item.startLoading || '').trim();
  var stopLoading = String(item.stopLoading || '').trim();
  var jumlahBucket = Number(item.jumlahBucket);
  var blockModel = String(item.blockModel || '').trim();
  var titikBor = String(item.titikBor || '').trim();
  var elevasi = String(item.elevasi || '').trim();
  var ritase = Number(item.ritase);
  var status = String(item.status || '').trim();
  var reporterName = String(item.reporterName || '').trim();

  if (
    !unitExcavator ||
    !/^\d{2}:\d{2}$/.test(startLoading) ||
    !/^\d{2}:\d{2}$/.test(stopLoading) ||
    !Number.isSafeInteger(jumlahBucket) || jumlahBucket < 0 ||
    !blockModel || !titikBor || !elevasi ||
    !Number.isSafeInteger(ritase) || ritase < 0 ||
    ['Close', 'Continue'].indexOf(status) === -1 ||
    !reporterName
  ) {
    throw new Error('Data Ore Loss tidak lengkap atau tidak valid.');
  }

  return [
    unitExcavator,
    startLoading,
    stopLoading,
    jumlahBucket,
    blockModel,
    titikBor,
    elevasi,
    ritase,
    status,
    submittedAt,
    reporterName
  ];
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


  ensureProductionHeaders_(sheet);


  return sheet;

}

function ensureProductionHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS]);
    return;
  }

  var current = sheet
    .getRange(1, 1, 1, HEADERS.length)
    .getDisplayValues()[0];
  var matches = HEADERS.every(function(header, index) {
    return String(current[index] || '').trim().toLowerCase() === header.toLowerCase();
  });
  if (!matches) {
    throw new Error('Header Production tidak sesuai; data lama tidak diubah.');
  }
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
    sheet = ss.insertSheet(ORE_GETTING_SHEET_NAME, 2);
    sheet.getRange(1, 1, 1, ORE_GETTING_HEADERS.length).setValues([ORE_GETTING_HEADERS]);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ORE_GETTING_HEADERS.length).setValues([ORE_GETTING_HEADERS]);
  }

  ensureOreGettingReporterHeader_(sheet);


  return sheet;

}


function getOreLossSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(ORE_LOSS_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(ORE_LOSS_SHEET_NAME, spreadsheet.getNumSheets());
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ORE_LOSS_HEADERS.length).setValues([ORE_LOSS_HEADERS]);
    return sheet;
  }

  if (!hasOreLossHeaders_(sheet)) {
    throw new Error('Header LAPORAN ORE LOSS tidak sesuai; header dan data lama tidak diubah.');
  }

  return sheet;
}


function hasOreLossHeaders_(sheet) {
  if (!sheet || sheet.getMaxColumns() < ORE_LOSS_HEADERS.length || sheet.getLastRow() === 0) {
    return false;
  }

  var actual = sheet.getRange(1, 1, 1, ORE_LOSS_HEADERS.length).getDisplayValues()[0];
  return ORE_LOSS_HEADERS.every(function(header, index) {
    return String(actual[index] || '').trim().toLowerCase() === header.toLowerCase();
  });
}


function ensureOreGettingReporterHeader_(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return;

  var currentHeaders = sheet.getRange(1, 1, 1, 11).getDisplayValues()[0];
  var existingHeadersMatch = ORE_GETTING_HEADERS.slice(0, 11).every(function(header, index) {
    return String(currentHeaders[index] || '').trim().toLowerCase() === header.toLowerCase();
  });
  if (!existingHeadersMatch) {
    throw new Error('Header Ore Getting A-K tidak sesuai; header dan data lama tidak diubah.');
  }

  if (sheet.getMaxColumns() < 12) sheet.insertColumnAfter(sheet.getMaxColumns());

  var reporterHeader = String(sheet.getRange(1, 12).getDisplayValue() || '').trim();
  if (reporterHeader.toLowerCase() === ORE_GETTING_HEADERS[11].toLowerCase()) return;
  if (reporterHeader) {
    throw new Error('Kolom L Ore Getting sudah memiliki header lain; header dan data lama tidak diubah.');
  }

  sheet.getRange(1, 12).setValue(ORE_GETTING_HEADERS[11]);
}


// ============================================================
// ENSURE ATTENDANCE HEADER
// ============================================================

function ensureAttendanceHeaders_(
  sheet
) {
  if (!sheet) return;

  var currentHeaders = sheet.getRange(1, 1, 1, ATTENDANCE_HEADERS.length).getValues()[0];


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
    currentHeaders.map(
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

  var hasExistingAttendanceHeaders =
    current.slice(0, ATTENDANCE_HEADERS.length - 1).join('|') ===
    expected.slice(0, ATTENDANCE_HEADERS.length - 1).join('|');

  if (
    sheet.getLastRow() > 1 &&
    hasExistingAttendanceHeaders &&
    current[ATTENDANCE_HEADERS.length - 1] !== expected[ATTENDANCE_HEADERS.length - 1]
  ) {
    sheet
      .getRange(1, ATTENDANCE_HEADERS.length, 1, 1)
      .setValues([[ATTENDANCE_HEADERS[ATTENDANCE_HEADERS.length - 1]]]);
    return;
  }


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
        ATTENDANCE_HEADERS.length
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
  item
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

    parseAcuanNiValue_(item.niGrade) ?? '',

    item.reporterName ||
      item.reporter ||
      ''

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

    parseOreGettingSampleCount_(item.jumlahSampel) ?? '',

    submittedAt,

    item.reporterName || ''

  ];

}

function rowToOreLossItem_(row) {
  return {
    unitExcavator: String(row[0] || '').trim(),
    startLoading: String(row[1] || '').trim(),
    stopLoading: String(row[2] || '').trim(),
    jumlahBucket: Number(row[3]),
    blockModel: String(row[4] || '').trim(),
    titikBor: String(row[5] || '').trim(),
    elevasi: String(row[6] || '').trim(),
    ritase: Number(row[7]),
    status: String(row[8] || '').trim(),
    submissionTimestamp: String(row[9] || '').trim(),
    reporterName: String(row[10] || '').trim()
  };
}

function parseOreGettingSampleCount_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isFinite(value) && value >= 0 ? value : null;

  var text = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (!text || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;

  var count = Number(text);
  return isFinite(count) && count >= 0 ? count : null;
}

function hasOreGettingHeaders_(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return false;

  var actual = sheet.getRange(1, 1, 1, ORE_GETTING_HEADERS.length).getDisplayValues()[0];
  return ORE_GETTING_HEADERS.every(function(header, index) {
    return String(actual[index] || '').trim().toLowerCase() === header.toLowerCase();
  });
}


// ============================================================
// ROW TO ITEM
// ============================================================

function rowToItem_(
  row,
  acuanNiIndex
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
      parseAcuanNiValue_(
        row[acuanNiIndex]
      ),

    reporterName:
      String(
        row[17] || ''
      ).trim(),

  };

}

function parseAcuanNiValue_(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isFinite(value) && value >= 0 ? value : null;

  var text = String(value).trim().replace(/%/g, '').replace(/\s+/g, '');
  if (!text) return null;

  var normalized = text.replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;

  var numeric = Number(normalized);
  return isFinite(numeric) && numeric >= 0 ? numeric : null;
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
  row,
  sampleCountIndex,
  timestampIndex,
  reporterNameIndex
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

    jumlahSampel:
      sampleCountIndex >= 0
        ? parseOreGettingSampleCount_(row[sampleCountIndex])
        : null,

    submissionTimestamp:
      String(
        row[timestampIndex] || ''
      ).trim(),

    reporterName:
      reporterNameIndex >= 0
        ? String(row[reporterNameIndex] || '').trim()
        : '',

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
