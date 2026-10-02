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

import { normalizeProductionNiRecord } from '../utils/acuanNi.js';

// ID Google Spreadsheet pengguna.
export const GOOGLE_SPREADSHEET_ID = '18oh2WCDf5p6xSyE1_sDOxCSY6HtV87fpMoEfhDm9cRs';

// URL Apps Script Web App utama yang dipakai untuk sinkronisasi Excel.
// Ditetapkan tetap ke URL ini agar tidak perlu menempelkan URL setiap kali update data.
export const DEFAULT_GOOGLE_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz69oRSWuhXbxQb5yTBwn1xduF9OLeUbwzxciw1_ybdvoTqwDEEeb1rmGQHZMU8T-7jUQ/exec';

// Nama sheet/tab yang dipakai oleh Apps Script.
export const GOOGLE_SHEET_NAME = 'Laporan Produksi';
export const GOOGLE_ATTENDANCE_SHEET_NAME = 'Daily Absensi';
export const GOOGLE_ORE_GETTING_SHEET_NAME = 'Laporan Ore Getting';


export function buildOreGettingPayloadItem(record, fallbackDate) {
  return {
    ...record,
    date: record.date || fallbackDate,
    submissionTimestamp: record.submissionTimestamp,
    reporterName: String(record.reporterName ?? '').trim(),
  };
}

export function normalizeAttendanceValue(value = '') {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeAttendanceName(name = '') {
  return normalizeAttendanceValue(name).toUpperCase();
}

export function attendanceKey(item = {}) {
  const date = normalizeAttendanceValue(item.date || item.tanggal || '').toLowerCase();
  const name = normalizeAttendanceName(item.name || item.nama || '').toLowerCase();

  if (!date || !name) {
    return '';
  }

  return `${date}|${name}`;
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
      penanggungJawab: normalizeAttendanceValue(
        item.penanggungJawab || item.penanggungjawab || item['Penanggung Jawab'] || ''
      ),
      pembahasan: String(
        item.pembahasan || item['Pembahasan'] || item.topik || ''
      ).trim(),
    };

    const key = attendanceKey(normalizedItem);
    if (!key || !normalizedItem.date || !normalizedItem.name) return;

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
  'Jumlah Sampel',
  'Timestamp Pengumpulan',
  'Nama Pelapor'
];

const ATTENDANCE_HEADERS = [
  'Tanggal',
  'Shift',
  'Lokasi Kerja',
  'Nama',
  'Penanggung Jawab',
  'Pembahasan',
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

      const values = attendanceSheet.getRange(1, 1, lastRow, Math.max(ATTENDANCE_HEADERS.length, attendanceSheet.getLastColumn())).getDisplayValues();
      const dataRows = values.slice(1)
        .filter(row => row.some(value => String(value).trim() !== ''))
        .map(function(row) {
          return [
            row[0] || '',
            row[1] || '',
            row[2] || '',
            row[3] || '',
            row[4] || '',
            row[5] || '',
            row[6] || ''
          ];
        });
      return respond_({ success: true, items: dataRows, values: dataRows, count: dataRows.length }, getCallback_(e));
    }

    if (type === 'oregetting' || type === 'ore_getting') {
      const oreSheet = getOreGettingSheet_();
      const lastRow = oreSheet.getLastRow();
      if (lastRow <= 1) {
        return respond_({ success: true, items: [], values: [], count: 0 }, getCallback_(e));
      }

      const values = oreSheet.getRange(1, 1, lastRow, Math.max(ORE_GETTING_HEADERS.length, oreSheet.getLastColumn())).getDisplayValues();
      const sampleCountIndex = values[0].findIndex(header => String(header || '').trim().toLowerCase() === 'jumlah sampel');
      let timestampIndex = values[0].findIndex(header => String(header || '').trim().toLowerCase() === 'timestamp pengumpulan');
      const reporterNameIndex = values[0].findIndex(header => String(header || '').trim().toLowerCase() === 'nama pelapor');
      if (timestampIndex < 0) timestampIndex = 9;
      const dataRows = values.slice(1)
        .filter(row => row.some(value => String(value).trim() !== ''))
        .map(row => rowToOreGettingItem_(row, sampleCountIndex, timestampIndex, reporterNameIndex));
      return respond_({ success: true, items: dataRows, values: dataRows, count: dataRows.length }, getCallback_(e));
    }

    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);

    if (lastRow === 0) {
      return respond_({ success: true, items: [], count: 0 }, getCallback_(e));
    }

    const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    let acuanNiIndex = values[0].findIndex(header => ['acuan ni%', 'acuan ni'].includes(String(header || '').trim().toLowerCase()));
    if (acuanNiIndex < 0) acuanNiIndex = 16;
    let startRow = 0;
    if (looksLikeHeader_(values[0])) startRow = 1;

    const items = values
      .slice(startRow)
      .filter(row => row.slice(0, HEADERS.length).some(value => String(value).trim() !== ''))
      .map(row => rowToItem_(row, acuanNiIndex));

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
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, ATTENDANCE_HEADERS.length).getValues()
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
        ? [
            item[0] || '',
            item[1] || '',
            item[2] || '',
            item[3] || '',
            item[4] || '',
            item[5] || '',
            item[6] || ''
          ]
        : [
            item.date || item.tanggal || '',
            item.shift || '',
            item.location || item.lokasi || item.lokasiKerja || '',
            item.name || item.nama || '',
            item.penanggungJawab || item.penanggungjawab || item['Penanggung Jawab'] || '',
            item.pembahasan || item['Pembahasan'] || item.topik || '',
            ''
          ];

      const date = row[0];
      const shift = row[1];
      const location = row[2];
      const name = String(row[3] || '').trim().replace(/\\s+/g, ' ').toUpperCase();
      const penanggungJawab = String(row[4] || '').trim();
      const pembahasan = String(row[5] || '').trim();

      if (!date || !name || !penanggungJawab || !pembahasan) { invalidCount++; return; }

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
        String(penanggungJawab).trim().replace(/\\s+/g, ' '),
        String(pembahasan).trim(),
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
    sheet.getRange(startRow, 1, newRows.length, ATTENDANCE_HEADERS.length).setValues(newRows);

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
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_();
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.values) ? payload.values : [];
    const submittedAt = getSubmissionTimestamp_();

    if (!items.length) {
      return respond_({ success: true, message: 'Tidak ada data produksi baru.', sheet: SHEET_NAME, count: 0 }, '');
    }

    const properties = PropertiesService.getScriptProperties();
    const processed = properties.getProperties();
    const rows = [];
    const keysToMark = {};
    const seenKeys = {};
    let duplicateCount = 0;

    items.forEach(function(item) {
      const recordId = item && !Array.isArray(item)
        ? String(item.recordId || item.id || '').trim()
        : '';

      if (!recordId) {
        throw new Error('Setiap data Production harus memiliki recordId yang stabil.');
      }

      const key = productionIdempotencyKey_(recordId);
      if (processed[key] || seenKeys[key]) {
        duplicateCount++;
        return;
      }

      seenKeys[key] = true;
      keysToMark[key] = '1';
      rows.push(itemToRow_(item, submittedAt));
    });

    if (rows.length) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
      properties.setProperties(keysToMark);
    }

    return respond_({
      success: true,
      message: rows.length ? 'Data MineTrack berhasil disimpan.' : 'Semua record Production sudah pernah diproses.',
      sheet: SHEET_NAME,
      count: rows.length,
      duplicateCount: duplicateCount
    }, '');
  } finally {
    lock.releaseLock();
  }
}

function productionIdempotencyKey_(recordId) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    recordId
  );
  return 'production_record_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function saveOreGetting_(payload) {
  const sheet = getOreGettingSheet_();
  const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.values) ? payload.values : [];
  const submittedAt = getSubmissionTimestamp_();

  if (!items.length) {
    return respond_({ success: true, message: 'Tidak ada data Ore Getting baru.', sheet: ORE_GETTING_SHEET_NAME, count: 0 }, '');
  }

  if (!hasOreGettingHeaders_(sheet)) {
    throw new Error('Header Laporan Ore Getting harus: Tanggal, Area PIT, Shift, Metode, ID Metode, Acuan, Titik Bor, Block Model, Elevasi, Jumlah Sampel di kolom J dan Timestamp Pengumpulan di kolom K, serta Nama Pelapor di kolom L. Silakan sesuaikan header lembar kerja secara manual sebelum menulis ulang.');
  }

  const rows = items.map(function(item) {
    if (Array.isArray(item)) {
      return [
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
        item[10] || submittedAt,
        item[11] || ''
      ];
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
  ensureHeaders_(sheet, ['Tanggal', 'Shift', 'Lokasi Kerja', 'Nama', 'Penanggung Jawab', 'Pembahasan', 'Timestamp Pengumpulan']);
  return sheet;
}

function getOreGettingSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ORE_GETTING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ORE_GETTING_SHEET_NAME, 2);
  }
  ensureOreGettingReporterHeader_(sheet);
  return sheet;
}

function ensureOreGettingReporterHeader_(sheet) {
  if (!sheet) return;

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ORE_GETTING_HEADERS.length).setValues([ORE_GETTING_HEADERS]);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, 11).getDisplayValues()[0];
  const existingHeadersMatch = ORE_GETTING_HEADERS.slice(0, 11).every((header, index) => (
    String(currentHeaders[index] || '').trim().toLowerCase() === header.toLowerCase()
  ));
  if (!existingHeadersMatch) {
    throw new Error('Header Ore Getting A-K tidak sesuai; header dan data lama tidak diubah.');
  }

  if (sheet.getMaxColumns() < 12) sheet.insertColumnAfter(sheet.getMaxColumns());

  const reporterHeader = String(sheet.getRange(1, 12).getDisplayValue() || '').trim();
  if (reporterHeader.toLowerCase() === ORE_GETTING_HEADERS[11].toLowerCase()) return;
  if (reporterHeader) {
    throw new Error('Kolom L Ore Getting sudah memiliki header lain; header dan data lama tidak diubah.');
  }

  sheet.getRange(1, 12).setValue(ORE_GETTING_HEADERS[11]);
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
    parseAcuanNiValue_(item.niGrade) ?? '',
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
    parseOreGettingSampleCount_(item.jumlahSampel) ?? '',
    item.submissionTimestamp || item.createdAt || item.timestamp || submittedAt,
    item.reporterName || ''
  ];
}

function parseOreGettingSampleCount_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;

  const text = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (!text || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;

  const count = Number(text);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function hasOreGettingHeaders_(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return false;

  const actual = sheet.getRange(1, 1, 1, ORE_GETTING_HEADERS.length).getDisplayValues()[0];
  return ORE_GETTING_HEADERS.every((header, index) => (
    String(actual[index] || '').trim().toLowerCase() === header.toLowerCase()
  ));
}

function getSubmissionTimestamp_() {
  return Utilities.formatDate(
    new Date(),
    'Asia/Makassar',
    'yyyy-MM-dd HH:mm'
  );
}

function rowToItem_(row, acuanNiIndex) {
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
    niGrade: parseAcuanNiValue_(row[acuanNiIndex]),
    reporterName: String(row[17] || '').trim(),
    submissionTimestamp: String(row[18] || '').trim()
  };
}

function parseAcuanNiValue_(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;

  const text = String(value).trim().replace(/%/g, '').replace(/\s+/g, '');
  if (!text) return null;

  const normalized = text.replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeMaterial_(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Saprolit';
  if (normalized.toLowerCase() === 'saprolite' || normalized.toLowerCase() === 'saprolit') return 'Saprolit';
  if (normalized.toLowerCase() === 'limonite' || normalized.toLowerCase() === 'limonit') return 'Limonit';
  return normalized;
}

function rowToOreGettingItem_(row, sampleCountIndex, timestampIndex) {
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
    jumlahSampel: sampleCountIndex >= 0 ? parseOreGettingSampleCount_(row[sampleCountIndex]) : null,
    submissionTimestamp: String(row[timestampIndex] || '').trim(),
    reporterName: reporterNameIndex >= 0 ? String(row[reporterNameIndex] || '').trim() : ''
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
export function createProductionRecordId() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Browser tidak mendukung pembuatan ID Production yang aman.');
  }

  return `production-${globalThis.crypto.randomUUID()}`;
}

export function withProductionRecordIds(logs, fallbackPrefix = '') {
  if (!Array.isArray(logs)) {
    throw new Error('Data Production harus berupa daftar record.');
  }

  return logs.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Setiap record Production harus berupa object.');
    }

    const recordId = String(
      item.recordId || item.id || (fallbackPrefix ? `${fallbackPrefix}-${index}` : '')
    ).trim();

    if (!recordId) {
      throw new Error('Record Production tidak memiliki ID stabil.');
    }

    return { ...item, recordId };
  });
}

export async function syncLogsToGoogleSheets(url, logs) {
  const endpoint = normalizeUrl_(url);

  if (!endpoint) {
    throw new Error('URL Google Apps Script belum diisi.');
  }

  const identifiedLogs = withProductionRecordIds(logs);
  if (identifiedLogs.length !== 1) {
    throw new Error('Production harus disinkronkan satu record per permintaan.');
  }

  try {
    const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain;charset=utf-8',
  },
  body: JSON.stringify({
    type: 'production',
    items: identifiedLogs,
    values: identifiedLogs,
  }),
});

    const text = await response.text();
    const payload = parseJsonResponse_(text);

    if (!response.ok) {
      throw new Error(payload?.message || 'Google Apps Script menolak permintaan sinkronisasi.');
    }

    if (payload && payload.success === false) {
      throw new Error(payload.message || 'Sinkronisasi ke Google Sheets gagal.');
    }

    if (payload?.success !== true) {
      throw new Error('Production belum terkonfirmasi tersimpan di Google Sheets. Data tetap disimpan untuk retry.');
    }

    const acceptedCount = Number(payload.count);
    if (!Number.isFinite(acceptedCount) || acceptedCount <= 0) {
      throw new Error('Production belum terkonfirmasi tersimpan di Google Sheets. Data tetap disimpan untuk retry.');
    }

    return identifiedLogs;
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
export function normalizeAttendancePayload_(attendance = []) {
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

      name: normalizeAttendanceName(item.name || item.nama || ''),

      penanggungJawab: String(
        item.penanggungJawab ||
        item.penanggungjawab ||
        item['Penanggung Jawab'] ||
        ''
      )
        .trim()
        .replace(/\s+/g, ' '),

      pembahasan: String(
        item.pembahasan ||
        item['Pembahasan'] ||
        item.topik ||
        ''
      )
        .trim(),
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
  'Content-Type': 'text/plain;charset=utf-8',
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

      const normalized = rows.map((row, index) => {
        const hasNewColumns = Array.isArray(row) && row.length >= 7;
        const penanggungJawab = hasNewColumns ? row[4] : '';
        const pembahasan = hasNewColumns ? row[5] : '';
        const submissionTimestamp = hasNewColumns ? row[6] : row.length >= 6 ? row[5] : row[4] || '';

        return {
          id: `gs-attendance-${index}-${row[3] || ''}`,
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
          penanggungJawab: String(penanggungJawab || '')
            .trim()
            .replace(/\s+/g, ' '),
          pembahasan: String(pembahasan || '')
            .trim(),
          submissionTimestamp: String(submissionTimestamp || ''),
        };
      });

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

      const items = Array.isArray(payload.items) ? payload.items : [];
      const normalizedItems = items.map((item) => {
        if (Array.isArray(item)) {
          return normalizeProductionNiRecord(item);
        }

        if (item && typeof item === 'object') {
          return normalizeProductionNiRecord(item);
        }

        return item;
      });

      resolve(normalizedItems);
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

export async function syncProductionAndReadBack(url, logs, readBack = readLogsFromGoogleSheets) {
  const identifiedLogs = withProductionRecordIds(logs);
  const syncedLogs = [];
  const confirmedRecordIds = [];
  const failedRecords = [];
  const recordResults = [];
  let remoteLogs = null;

  for (const record of identifiedLogs) {
    try {
      const [syncedRecord] = await syncLogsToGoogleSheets(url, [record]);
      const readRecords = await readBack(url);
      if (!Array.isArray(readRecords)) {
        throw new Error('Google Sheets mengembalikan data Production yang tidak valid.');
      }

      syncedLogs.push(syncedRecord);
      confirmedRecordIds.push(record.recordId);
      recordResults.push({ recordId: record.recordId, confirmed: true });
      remoteLogs = readRecords;
    } catch (error) {
      const readError = String(error?.message || 'Google Sheets tidak dapat mengonfirmasi record.');
      const message = `Production belum terkonfirmasi tersimpan di Google Sheets. Data tetap disimpan untuk retry. ${readError}`;
      failedRecords.push({
        recordId: record.recordId,
        message,
      });
      recordResults.push({ recordId: record.recordId, confirmed: false, message });
    }
  }

  return { syncedLogs, confirmedRecordIds, failedRecords, recordResults, remoteLogs };
}

export function getConfirmedProductionPendingGroups(groups, recordResults) {
  const confirmedGroups = [];
  let resultIndex = 0;

  for (const group of groups) {
    const results = recordResults.slice(resultIndex, resultIndex + group.records.length);
    resultIndex += group.records.length;

    if (
      group.pendingId
      && group.records.length > 0
      && results.length === group.records.length
      && group.records.every((record, index) => (
        results[index].recordId === record.recordId && results[index].confirmed
      ))
    ) {
      confirmedGroups.push(group);
    }
  }

  return confirmedGroups;
}

function parseOreGettingSampleCountValue_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;

  const text = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (!text || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;

  const count = Number(text);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

export function readOreGettingFromGoogleSheets(url) {
  const endpoint = normalizeUrl_(url);
  if (!endpoint) return Promise.reject(new Error('URL Google Apps Script belum diisi.'));

  return new Promise((resolve, reject) => {
    const callbackName = '__mineTrackOreGetting_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timeout saat membaca Ore Getting dari Google Sheets.'));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload || payload.success === false) {
        reject(new Error(payload?.message || 'Google Sheets mengembalikan error Ore Getting.'));
        return;
      }

      const rows = Array.isArray(payload.items) ? payload.items : [];
      resolve(rows.map((row) => {
        if (Array.isArray(row)) {
          return {
            date: String(row[0] || ''),
            areaPit: String(row[1] || ''),
            shift: String(row[2] || ''),
            metode: String(row[3] || ''),
            idMetode: String(row[4] || ''),
            acuan: String(row[5] || ''),
            titikBor: String(row[6] || ''),
            blockModel: String(row[7] || ''),
            elevasi: String(row[8] || ''),
            jumlahSampel: row.length >= 11 ? parseOreGettingSampleCountValue_(row[9]) : null,
            submissionTimestamp: String(row[row.length >= 11 ? 10 : 9] || ''),
            reporterName: String(row[11] || ''),
          };
        }

        return row && typeof row === 'object' ? { ...row } : row;
      }));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Web App tidak bisa diakses untuk membaca Ore Getting.'));
    };

    const separator = endpoint.includes('?') ? '&' : '?';
    script.src = endpoint + separator + 'type=oregetting&callback=' + encodeURIComponent(callbackName) + '&t=' + Date.now();
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
