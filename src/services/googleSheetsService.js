// ============================================================
// INTEGRASI GOOGLE SHEETS
// ------------------------------------------------------------
// File ini adalah tempat komunikasi MineTrack dengan Google
// Apps Script. Jangan mengubah format kolom di sini tanpa ikut
// mengubah SCRIPT di bawah ini.
//
// ALUR DATA:
//   MineTrack -> POST -> Apps Script -> Google Sheet
//   MineTrack <- JSONP <- Apps Script <- Google Sheet
//
// Spreadsheet dan endpoint Web App sudah dikunci ke deployment resmi.
//
// PERBAIKAN (dedup Daily Absensi):
// saveAttendance_() di GOOGLE_APPS_SCRIPT sekarang benar-benar
// menolak item yang key-nya (Tanggal + Shift + Nama) sudah ada
// di Sheet, sebelumnya fungsi attendanceKey_() didefinisikan
// tapi TIDAK PERNAH dipakai -> itulah sebabnya submit ganda
// (klik dobel / retry jaringan) selalu lolos jadi baris duplikat.
// ============================================================

// ID Google Spreadsheet pengguna.
export const GOOGLE_SPREADSHEET_ID = '18oh2WCDf5p6xSyE1_sDOxCSY6HtV87fpMoEfhDm9cRs';

// URL Apps Script Web App utama yang dipakai untuk sinkronisasi Excel.
// Ditetapkan tetap ke URL ini agar tidak perlu menempelkan URL setiap kali update data.
export const DEFAULT_GOOGLE_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwcIzzDJoBMyywQkbnZW8zXnAZhebAZF2Kw8RWzdB0M2GQ-6Bfu_BXa7Q5fNENOiwVr/exec';

// Nama sheet/tab yang dipakai oleh Apps Script.
export const GOOGLE_SHEET_NAME = 'Laporan Produksi';
export const GOOGLE_ATTENDANCE_SHEET_NAME = 'Daily Absensi';
export const GOOGLE_ORE_GETTING_SHEET_NAME = 'Laporan Ore Getting';

export function normalizeAttendanceValue(value = '') {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function attendanceKey(item = {}) {
  const date = normalizeAttendanceValue(item.date || item.tanggal || '').toLowerCase();
  const shift = normalizeAttendanceValue(item.shift || '').toLowerCase();
  const name = normalizeAttendanceValue(item.name || item.nama || '').toLowerCase();

  if (!date || !shift || !name) {
    return '';
  }

  return `${date}|${shift}|${name}`;
}

export function mergeAttendanceItems(items = []) {
  const merged = [];
  const indexes = {};

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== 'object') return;

    const normalizedItem = {
      ...item,
      date: normalizeAttendanceValue(item.date || item.tanggal || ''),
      shift: normalizeAttendanceValue(item.shift || ''),
      name: normalizeAttendanceValue(item.name || item.nama || ''),
    };

    const key = attendanceKey(normalizedItem);
    if (!key || !normalizedItem.date || !normalizedItem.shift || !normalizedItem.name) return;

    if (indexes[key] === undefined) {
      indexes[key] = merged.length;
      merged.push(normalizedItem);
      return;
    }

    merged[indexes[key]] = {
      ...merged[indexes[key]],
      ...normalizedItem,
      id: merged[indexes[key]].id || normalizedItem.id || Date.now(),
    };
  });

  return merged;
}

export function getUnsyncedAttendanceItems(items = [], remoteItems = []) {
  const mergedItems = mergeAttendanceItems(items);
  const remoteKeys = new Set(
    mergeAttendanceItems(remoteItems).map((item) => attendanceKey(item))
  );

  return mergedItems.filter((item) => {
    const key = attendanceKey(item);
    return Boolean(key) && !remoteKeys.has(key);
  });
}

// ------------------------------------------------------------
// SCRIPT GOOGLE APPS SCRIPT
// ------------------------------------------------------------
// Salin script ini ke Extensions > Apps Script pada spreadsheet,
// lalu Deploy > Manage deployments > New version > Deploy.
export const GOOGLE_APPS_SCRIPT = `// ============================================================
// GRADE CONTROL AKP - GOOGLE APPS SCRIPT API
// SESUAI TEMPLATE SHEET:
// - Laporan Produksi
// - Daily Absensi (DEDUP: Tanggal + Shift + Nama)
// - Ore Getting
// ============================================================

const SPREADSHEET_ID = '${GOOGLE_SPREADSHEET_ID}';
const SHEET_NAME = '${GOOGLE_SHEET_NAME}';
const ATTENDANCE_SHEET_NAME = '${GOOGLE_ATTENDANCE_SHEET_NAME}';
const ORE_GETTING_SHEET_NAME = '${GOOGLE_ORE_GETTING_SHEET_NAME}';

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

function doGet(e) {
  try {
    const type = e && e.parameter ? String(e.parameter.type || '').toLowerCase() : '';

    if (type === 'absensi' || type === 'attendance') {
      const attendanceSheet = getAttendanceSheet_();
      const lastRow = attendanceSheet.getLastRow();
      if (lastRow <= 1) {
        return respond_({ success: true, items: [], values: [], count: 0 }, getCallback_(e));
      }

      const values = attendanceSheet.getRange(1, 1, lastRow, Math.max(5, attendanceSheet.getLastColumn())).getDisplayValues();
      const dataRows = values.slice(1)
        .filter(row => row.some(value => String(value).trim() !== ''))
        .map(function(row) { return row.length >= 6 ? [row[0], row[1], row[2], row[3], row[5]] : row.slice(0, 5); });
      return respond_({ success: true, items: dataRows, values: dataRows, count: dataRows.length }, getCallback_(e));
    }

    if (type === 'oregetting' || type === 'ore_getting') {
      const oreSheet = getOreGettingSheet_();
      const lastRow = oreSheet.getLastRow();
      if (lastRow <= 1) {
        return respond_({ success: true, items: [], values: [], count: 0 }, getCallback_(e));
      }

      const values = oreSheet.getRange(1, 1, lastRow, Math.max(10, oreSheet.getLastColumn())).getDisplayValues();
      const dataRows = values.slice(1)
        .filter(row => row.some(value => String(value).trim() !== ''))
        .map(rowToOreGettingItem_);
      return respond_({ success: true, items: dataRows, values: dataRows, count: dataRows.length }, getCallback_(e));
    }

    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);

    if (lastRow === 0) {
      return respond_({ success: true, items: [], count: 0 }, getCallback_(e));
    }

    const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    let startRow = 0;
    if (looksLikeHeader_(values[0])) startRow = 1;

    const items = values
      .slice(startRow)
      .filter(row => row.slice(0, HEADERS.length).some(value => String(value).trim() !== ''))
      .map(rowToItem_);

    return respond_({ success: true, items: items, count: items.length }, getCallback_(e));
  } catch (error) {
    return respond_({ success: false, message: error.message, items: [], count: 0 }, getCallback_(e));
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Data POST kosong.');
    }

    const payload = JSON.parse(e.postData.contents);
    const type = String(payload.type || '').toLowerCase();

    if (type === 'absensi' || type === 'attendance') {
      return saveAttendance_(payload);
    }

    if (type === 'produksi' || type === 'production') {
      return saveProduction_(payload);
    }

    if (type === 'oregetting' || type === 'ore_getting') {
      return saveOreGetting_(payload);
    }

    if (payload.values || payload.items) {
      return saveProduction_(payload);
    }

    throw new Error('Jenis data tidak dikenali. Gunakan type "absensi", "produksi", atau "oregetting".');
  } catch (error) {
    return respond_({ success: false, message: error.message, count: 0 }, '');
  }
}

// ============================================================
// SAVE DAILY ABSENSI - DENGAN DEDUP SERVER-SIDE
// ============================================================
// UNIQUE KEY = Tanggal + Shift + Nama (konsisten dengan dedup
// yang dipakai frontend: attendanceKey() di App.jsx).
//
// Diberi LockService supaya dua request yang datang nyaris
// bersamaan (klik dobel, retry jaringan) tidak lolos bersamaan
// melewati pengecekan existingKeys.
// ============================================================
function saveAttendance_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getAttendanceSheet_();
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.values) ? payload.values : [];
    const submittedAt = getSubmissionTimestamp_();

    if (!items.length) {
      return respond_({ success: true, message: 'Tidak ada data Daily Absensi baru.', sheet: ATTENDANCE_SHEET_NAME, count: 0 }, '');
    }

    // --------------------------------------------------------
    // AMBIL KEY YANG SUDAH ADA DI SHEET
    // --------------------------------------------------------
    const existingRows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
      : [];

    const existingKeys = {};
    existingRows.forEach(function(row) {
      const key = attendanceKey_(row[0], row[1], row[3]);
      if (key) existingKeys[key] = true;
    });

    // --------------------------------------------------------
    // SARING DATA MASUK: HANYA KEY YANG BELUM ADA
    // --------------------------------------------------------
    const incoming = {};
    let duplicateCount = 0;
    let invalidCount = 0;

    items.forEach(function(item) {
      const row = Array.isArray(item)
        ? [item[0] || '', item[1] || '', item[2] || '', item[3] || '']
        : [
            item.date || item.tanggal || '',
            item.shift || '',
            item.location || item.lokasi || item.lokasiKerja || '',
            item.name || item.nama || ''
          ];

      const date = row[0];
      const shift = row[1];
      const location = row[2];
      const name = row[3];

      if (!date || !name) { invalidCount++; return; }

      const key = attendanceKey_(date, shift, name);
      if (!key) { invalidCount++; return; }

      // Sudah ada di Sheet -> SKIP, tidak pernah ditulis ulang.
      if (existingKeys[key]) { duplicateCount++; return; }

      // Duplikat di dalam submit yang sama -> SKIP.
      if (incoming[key]) { duplicateCount++; return; }

      incoming[key] = [
        String(date).trim(),
        String(shift).trim(),
        String(location).trim(),
        String(name).trim().replace(/\\s+/g, ' '),
        submittedAt
      ];
    });

    const newRows = Object.keys(incoming).map(function(key) { return incoming[key]; });

    if (!newRows.length) {
      return respond_({
        success: true,
        message: 'Absensi tidak ditambahkan. Data (Tanggal + Shift + Nama) tersebut sudah ada.',
        sheet: ATTENDANCE_SHEET_NAME,
        count: 0,
        duplicateCount: duplicateCount,
        invalidCount: invalidCount
      }, '');
    }

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, 5).setValues(newRows);

    return respond_({
      success: true,
      message: 'Data Daily Absensi berhasil disimpan.',
      sheet: ATTENDANCE_SHEET_NAME,
      count: newRows.length,
      duplicateCount: duplicateCount,
      invalidCount: invalidCount
    }, '');

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// ATTENDANCE KEY - Tanggal + Shift + Nama
// ============================================================
// UNIQUE KEY = TANGGAL + SHIFT + NAMA
// Lokasi kerja tidak ikut menentukan duplikat.
// ============================================================
export function attendanceKey_(date, shift, name) {
  const d = normalizeAttendanceDate_(date);
  const s = String(shift || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const n = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (!d || !s || !n) return '';

  return d + '|' + s + '|' + n;
}

function normalizeAttendanceDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  const raw = String(value || '').trim();

  if (!raw) return '';

  // Format yyyy-mm-dd
  const iso = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (iso) {
    return (
      iso[1] +
      '-' +
      String(iso[2]).padStart(2, '0') +
      '-' +
      String(iso[3]).padStart(2, '0')
    );
  }

  // Format dd-mm-yyyy atau dd/mm/yyyy
  const dmy = raw.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
  );

  if (dmy) {
    return (
      dmy[3] +
      '-' +
      String(dmy[2]).padStart(2, '0') +
      '-' +
      String(dmy[1]).padStart(2, '0')
    );
  }

  return raw
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function saveProduction_(payload) {
  const sheet = getSheet_();
  const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.values) ? payload.values : [];
  const submittedAt = getSubmissionTimestamp_();

  if (!items.length) {
    return respond_({ success: true, message: 'Tidak ada data produksi baru.', sheet: SHEET_NAME, count: 0 }, '');
  }

  const rows = items.map(function(item) {
    if (Array.isArray(item)) {
      const row = item.slice(0, HEADERS.length - 1);
      while (row.length < HEADERS.length - 1) row.push('');
      row.push(item.length >= HEADERS.length ? item[HEADERS.length - 1] || submittedAt : submittedAt);
      return row;
    }
    return itemToRow_(item, submittedAt);
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);

  return respond_({ success: true, message: 'Data MineTrack berhasil disimpan.', sheet: SHEET_NAME, count: items.length }, '');
}

function saveOreGetting_(payload) {
  const sheet = getOreGettingSheet_();
  const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.values) ? payload.values : [];
  const submittedAt = getSubmissionTimestamp_();

  if (!items.length) {
    return respond_({ success: true, message: 'Tidak ada data Ore Getting baru.', sheet: ORE_GETTING_SHEET_NAME, count: 0 }, '');
  }

  const rows = items.map(function(item) {
    if (Array.isArray(item)) {
      const row = item.slice(0, ORE_GETTING_HEADERS.length - 1);
      while (row.length < ORE_GETTING_HEADERS.length - 1) row.push('');
      row.push(item.length >= ORE_GETTING_HEADERS.length ? item[ORE_GETTING_HEADERS.length - 1] || submittedAt : submittedAt);
      return row;
    }
    return oreGettingToRow_(item, submittedAt);
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, ORE_GETTING_HEADERS.length).setValues(rows);

  return respond_({ success: true, message: 'Data Ore Getting berhasil disimpan.', sheet: ORE_GETTING_SHEET_NAME, count: items.length }, '');
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME, 0);
  }
  ensureHeaders_(sheet, HEADERS);
  return sheet;
}

function getAttendanceSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ATTENDANCE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ATTENDANCE_SHEET_NAME, 1);
  }
  ensureHeaders_(sheet, ['Tanggal', 'Shift', 'Lokasi Kerja', 'Nama', 'Timestamp Pengumpulan']);
  return sheet;
}

function getOreGettingSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ORE_GETTING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ORE_GETTING_SHEET_NAME, 2);
  }
  ensureHeaders_(sheet, ORE_GETTING_HEADERS);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (!sheet) return;

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const row = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
  const normalized = row.slice(0, headers.length).map(function(value) {
    return String(value || '').trim().toLowerCase();
  });
  const expected = headers.map(function(header) {
    return String(header || '').trim().toLowerCase();
  });

  const needsHeader = normalized.length !== expected.length || normalized.some(function(value, index) {
    return value !== expected[index];
  });

  if (needsHeader) {
    const existing = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), Math.max(sheet.getLastColumn(), headers.length)).getValues();
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (existing.length > 0 && existing[0].some(function(value) { return String(value || '').trim() !== ''; })) {
      sheet.getRange(2, 1, existing.length, Math.max(sheet.getLastColumn(), headers.length)).setValues(existing);
    }
  }
}

function looksLikeHeader_(row) {
  if (!row) return false;
  const first = String(row[0] || '').toLowerCase().trim();
  const second = String(row[1] || '').toLowerCase().trim();
  return first === 'tanggal' || first === 'date' || second === 'shift';
}

function itemToRow_(item, submittedAt) {
  const ritToday = Number(item.ritToday) || 0;

  return [
    item.date || '',
    item.block || item.blockModel || '',
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
    normalizeMaterial_(item.material || 'Saprolit'),
    Array.isArray(item.equipment) ? item.equipment.join(', ') : (item.equipment || ''),
    Number(item.tonnage) || 0,
    parseNumericValue_(item.niGrade),
    item.reporterName || item.reporter || '',
    item.submissionTimestamp || submittedAt
  ];
}

function oreGettingToRow_(item, submittedAt) {
  const today = item.date || new Date().toISOString().slice(0, 10);

  return [
    today,
    item.areaPit || item.area || '',
    item.shift || '',
    item.metode || '',
    item.idMetode || '',
    item.acuan || '',
    item.titikBor || '',
    item.blockModel || '',
    item.elevasi || '',
    item.submissionTimestamp || item.createdAt || item.timestamp || submittedAt
  ];
}

function getSubmissionTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function rowToItem_(row) {
  const ritToday = Number(row[6]) || 0;

  return {
    id: 'gs-' + Utilities.getUuid(),
    date: formatDate_(row[0]),
    block: String(row[1] || ''),
    shift: String(row[2] || ''),
    pit: String(row[3] || ''),
    dumpingArea: String(row[4] || ''),
    sublot: String(row[5] || '').trim(),
    ritPrevious: 0,
    ritToday: ritToday,
    ritTotal: ritToday,
    status: String(row[7] || ''),
    blockModel: String(row[8] || ''),
    sampleRef: String(row[9] || ''),
    drillHole: String(row[10] || ''),
    elevation: String(row[11] || ''),
    loadingMethod: String(row[12] || ''),
    material: normalizeMaterial_(String(row[13] || 'Saprolit').trim()) || 'Saprolit',
    equipment: row[14] ? String(row[14]).split(',').map(function(v) { return v.trim(); }).filter(Boolean) : [],
    tonnage: Number(row[15]) || 0,
    niGrade: parseNumericValue_(row[16]),
    reporterName: String(row[17] || '').trim(),
    submissionTimestamp: String(row[18] || '').trim()
  };
}

function parseNumericValue_(value) {
  if (value === null || value === undefined || value === '') return 0;

  const text = String(value).trim().replace(/%/g, '').replace(/\\s+/g, '').replace(',', '.');
  const numeric = Number(text);

  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeMaterial_(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Saprolit';
  if (normalized.toLowerCase() === 'saprolite' || normalized.toLowerCase() === 'saprolit') return 'Saprolit';
  if (normalized.toLowerCase() === 'limonite' || normalized.toLowerCase() === 'limonit') return 'Limonit';
  return normalized;
}

function rowToOreGettingItem_(row) {
  return {
    date: formatDate_(row[0]),
    areaPit: String(row[1] || '').trim(),
    shift: String(row[2] || '').trim(),
    metode: String(row[3] || '').trim(),
    idMetode: String(row[4] || '').trim(),
    acuan: String(row[5] || '').trim(),
    titikBor: String(row[6] || '').trim(),
    blockModel: String(row[7] || '').trim(),
    elevasi: String(row[8] || '').trim(),
    submissionTimestamp: String(row[9] || '').trim()
  };
}

function formatDate_(value) {
  return String(value || '').trim();
}

function formatTime_(value) {
  return String(value || '').trim();
}

function getCallback_(e) {
  return e && e.parameter ? e.parameter.callback : '';
}

function respond_(data, callback) {
  const json = JSON.stringify(data);

  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}`;

// ------------------------------------------------------------
// POST DATA KE APPS SCRIPT
// ------------------------------------------------------------
export async function syncLogsToGoogleSheets(url, logs) {
  const endpoint = normalizeUrl_(url);

  if (!endpoint) {
    throw new Error('URL Google Apps Script belum diisi.');
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ type: 'production', items: logs, values: logs }),
    });

    const text = await response.text();
    const payload = parseJsonResponse_(text);

    if (!response.ok) {
      throw new Error(payload?.message || 'Google Apps Script menolak permintaan sinkronisasi.');
    }

    if (payload && payload.success === false) {
      throw new Error(payload.message || 'Sinkronisasi ke Google Sheets gagal.');
    }

    return logs;
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      throw new Error('Tidak dapat terhubung ke Google Apps Script. Cek URL /exec dan deployment Web App.');
    }
    throw error;
  }
}

// ============================================================
// NORMALISASI DAILY ABSENSI
// UNIQUE KEY = TANGGAL + NAMA
// ============================================================
function normalizeAttendancePayload_(attendance = []) {
  const deduped = [];
  const keys = new Set();

  (Array.isArray(attendance) ? attendance : []).forEach((item) => {
    if (!item || typeof item !== 'object') return;

    const normalizedItem = {
      ...item,

      date: String(
        item.date || item.tanggal || ''
      )
        .trim()
        .replace(/\s+/g, ' '),

      shift: String(
        item.shift || ''
      )
        .trim()
        .replace(/\s+/g, ' '),

      location: String(
        item.location ||
        item.lokasi ||
        item.lokasiKerja ||
        ''
      )
        .trim()
        .replace(/\s+/g, ' '),

      name: String(
        item.name || item.nama || ''
      )
        .trim()
        .replace(/\s+/g, ' '),
    };

    const key = attendanceKey(normalizedItem);

    if (
      !normalizedItem.date ||
      !normalizedItem.name ||
      !key
    ) {
      return;
    }

    // Cegah nama yang sama pada tanggal yang sama
    // dikirim lebih dari satu kali dalam satu payload.
    if (keys.has(key)) {
      return;
    }

    keys.add(key);
    deduped.push(normalizedItem);
  });

  return deduped;
}
  

// ============================================================
// SYNC DAILY ABSENSI KE GOOGLE SHEETS
// ============================================================
export async function syncAttendanceToGoogleSheets(
  url,
  attendance
) {
  const endpoint = normalizeUrl_(url);

  if (!endpoint) {
    throw new Error(
      'URL Google Apps Script belum diisi.'
    );
  }

  // Bersihkan dan deduplikasi sebelum dikirim.
  const payloadItems =
    normalizeAttendancePayload_(attendance);

  // Tidak ada data yang layak dikirim.
  if (!payloadItems.length) {
    return {
      success: true,
      count: 0,
      duplicateCount:
        Array.isArray(attendance)
          ? attendance.length
          : 0,
      invalidCount: 0,
      message:
        'Tidak ada data Daily Absensi baru untuk dikirim.',
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },

      body: JSON.stringify({
        type: 'attendance',
        items: payloadItems,
        values: payloadItems,
      }),
    });

    const text = await response.text();

    const payload =
      parseJsonResponse_(text);

    if (!response.ok) {
      throw new Error(
        payload?.message ||
        'Google Apps Script menolak permintaan absensi.'
      );
    }

    if (
      payload &&
      payload.success === false
    ) {
      throw new Error(
        payload.message ||
        'Sinkronisasi absensi gagal.'
      );
    }

    return payload || {
      success: true,
    };

  } catch (error) {
    const message =
      String(error?.message || '');

    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError')
    ) {
      throw new Error(
        'Tidak dapat terhubung ke Google Apps Script. ' +
        'Cek URL /exec dan deployment Web App.'
      );
    }

    throw error;
  }
}

export function readAttendanceFromGoogleSheets(url) {
  const endpoint = normalizeUrl_(url);

  if (!endpoint) {
    return Promise.reject(
      new Error('URL Google Apps Script belum diisi.')
    );
  }

  return new Promise((resolve, reject) => {
    const callbackName =
      '__gradeControlAttendance_' +
      Date.now() +
      '_' +
      Math.random().toString(36).slice(2);

    const script = document.createElement('script');

    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          'Timeout saat membaca Daily Absensi dari Google Sheets.'
        )
      );
    }, 15000);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();

      if (!payload || payload.success === false) {
        reject(
          new Error(
            payload?.message ||
              'Google Sheets mengembalikan error absensi.'
          )
        );
        return;
      }

      const rows = Array.isArray(payload.items)
        ? payload.items
        : [];

      const normalized = rows.map((row, index) => ({
        id: `gs-attendance-${index}-${row[4] || ''}`,
        date: String(row[0] || '')
          .trim()
          .replace(/\s+/g, ' '),
        shift: String(row[1] || '')
          .trim()
          .replace(/\s+/g, ' '),
        location: String(row[2] || '')
          .trim()
          .replace(/\s+/g, ' '),
        name: String(row[3] || '')
          .trim()
          .replace(/\s+/g, ' '),
        submissionTimestamp: row[4] || '',
      }));

      const deduped = [];
      const keyIndex = new Map();

      normalized.forEach((item) => {
        const key = attendanceKey(item);

        if (!key || !item.date || !item.name) {
          return;
        }

        if (!keyIndex.has(key)) {
          keyIndex.set(key, deduped.length);
          deduped.push(item);
          return;
        }

        // Jika Tanggal + Nama sudah ada,
        // tetap hanya satu data.
        const index = keyIndex.get(key);

        deduped[index] = {
          ...deduped[index],
          ...item,
        };
      });

      resolve(deduped);
    };

    script.onerror = () => {
      cleanup();
      reject(
        new Error(
          'Daily Absensi tidak dapat dibaca dari Google Sheets.'
        )
      );
    };

    const separator = endpoint.includes('?') ? '&' : '?';

    script.src =
      endpoint +
      separator +
      'type=attendance' +
      '&callback=' +
      encodeURIComponent(callbackName) +
      '&t=' +
      Date.now();

    document.head.appendChild(script);
  });
}

// ------------------------------------------------------------
// BACA DATA DARI GOOGLE SHEETS DENGAN JSONP
// ------------------------------------------------------------
export function readLogsFromGoogleSheets(url) {
  const endpoint = normalizeUrl_(url);
  if (!endpoint) return Promise.reject(new Error('URL Google Apps Script belum diisi.'));

  return new Promise((resolve, reject) => {
    const callbackName = '__mineTrackGS_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timeout. Pastikan URL berakhiran /exec dan deployment Apps Script diatur Execute as: Me serta Who has access: Anyone.'));
    }, 15000);

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload || payload.success === false) {
        reject(new Error(payload?.message || 'Google Apps Script mengembalikan error.'));
        return;
      }
      resolve(Array.isArray(payload.items) ? payload.items : []);
    };

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    script.onerror = () => {
      cleanup();
      reject(new Error('Web App tidak bisa diakses. Cek URL /exec, deployment Apps Script, dan izin Anyone.'));
    };

    // Cache-buster mencegah browser memakai hasil JSONP lama.
    const separator = endpoint.includes('?') ? '&' : '?';
    script.src = endpoint + separator + 'callback=' + encodeURIComponent(callbackName) + '&t=' + Date.now();
    document.head.appendChild(script);
  });
}

function normalizeUrl_(url) {
  return String(url || '').trim().replace(/\\s+/g, '');
}
function parseJsonResponse_(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}