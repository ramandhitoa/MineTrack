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
// ============================================================

// ID Google Spreadsheet pengguna.
export const GOOGLE_SPREADSHEET_ID = '18oh2WCDf5p6xSyE1_sDOxCSY6HtV87fpMoEfhDm9cRs';

// URL Apps Script Web App resmi yang terhubung ke spreadsheet di atas.
export const DEFAULT_GOOGLE_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwg926VyTKTfiYJR6A1HJTVqFoaUZwI7_lQRgeE89p9Moi3XRB2Vy_GgoVf29ZJHgc1_w/exec';

// Nama sheet/tab yang dipakai oleh Apps Script.
export const GOOGLE_SHEET_NAME = 'Laporan Produksi';
export const GOOGLE_ATTENDANCE_SHEET_NAME = 'Daily Absensi';
export const GOOGLE_ORE_GETTING_SHEET_NAME = 'Laporan Ore Getting';

// ------------------------------------------------------------
// SCRIPT GOOGLE APPS SCRIPT
// ------------------------------------------------------------
// Salin script ini ke Extensions > Apps Script pada spreadsheet.
// Script sengaja diberi komentar supaya mudah dirawat.
export const GOOGLE_APPS_SCRIPT = `// ============================================================
// GRADE CONTROL AKP - GOOGLE APPS SCRIPT API
// SESUAI TEMPLATE SHEET:
// - Laporan Produksi
// - Daily Absensi
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

function saveAttendance_(payload) {
  const attendanceSheet = getAttendanceSheet_();
  let data = Array.isArray(payload.values) ? payload.values : Array.isArray(payload.items) ? payload.items : [];
  const submittedAt = getSubmissionTimestamp_();

  const lastRow = attendanceSheet.getLastRow();
  const existingWidth = Math.max(5, attendanceSheet.getLastColumn());
  const rawExistingRows = lastRow > 1 ? attendanceSheet.getRange(2, 1, lastRow - 1, existingWidth).getDisplayValues() : [];
  const existingRows = rawExistingRows.map(function(row) { return row.length >= 6 ? [row[0], row[1], row[2], row[3], row[5]] : row.slice(0, 5); });
  const knownKeys = new Set(existingRows.map(function(row) { return attendanceKey_(row[0], row[1], row[2], row[3]); }));
  const rows = [];

  data.forEach(function(item) {
    let row;
    if (Array.isArray(item)) {
      row = [item[0] || '', item[1] || '', item[2] || '', item[3] || '', item[4] || submittedAt];
    } else {
      row = [item.date || item.tanggal || '', item.shift || '', item.location || item.lokasi || item.lokasiKerja || '', item.name || item.nama || '', submittedAt];
    }
    const key = attendanceKey_(row[0], row[1], row[2], row[3]);
    if (!knownKeys.has(key)) {
      knownKeys.add(key);
      rows.push(row);
    }
  });

  attendanceSheet.clearContents();
  attendanceSheet.getRange(1, 1, 1, 5).setValues([['Tanggal', 'Shift', 'Lokasi Kerja', 'Nama', 'Timestamp Pengumpulan']]);

  if (existingRows.length > 0) {
    attendanceSheet.getRange(2, 1, existingRows.length, 5).setValues(existingRows);
  }
  if (rows.length > 0) {
    attendanceSheet.getRange(attendanceSheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  }

  return respond_({ success: true, message: 'Data Daily Absensi berhasil disimpan.', sheet: ATTENDANCE_SHEET_NAME, count: rows.length }, '');
}

function attendanceKey_(date, shift, location, name) {
  return [date, shift, location, name].map(function(value) { return String(value || '').trim().toLowerCase(); }).join('|');
}

function saveProduction_(payload) {
  const sheet = getSheet_();
  let items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.values) ? payload.values : [];
  const submittedAt = getSubmissionTimestamp_();

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  if (items.length > 0) {
    const rows = items.map(function(item) {
      if (Array.isArray(item)) {
        const row = item.slice(0, HEADERS.length - 1);
        while (row.length < HEADERS.length - 1) row.push('');
        row.push(item.length >= HEADERS.length ? item[HEADERS.length - 1] || submittedAt : submittedAt);
        return row;
      }
      return itemToRow_(item, submittedAt);
    });

    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  return respond_({ success: true, message: 'Data MineTrack berhasil disimpan.', sheet: SHEET_NAME, count: items.length }, '');
}

function saveOreGetting_(payload) {
  const sheet = getOreGettingSheet_();
  const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.values) ? payload.values : [];
  const submittedAt = getSubmissionTimestamp_();

  sheet.clearContents();
  sheet.getRange(1, 1, 1, ORE_GETTING_HEADERS.length).setValues([ORE_GETTING_HEADERS]);

  if (items.length > 0) {
    const rows = items.map(function(item) {
      if (Array.isArray(item)) {
        const row = item.slice(0, ORE_GETTING_HEADERS.length - 1);
        while (row.length < ORE_GETTING_HEADERS.length - 1) row.push('');
        row.push(item.length >= ORE_GETTING_HEADERS.length ? item[ORE_GETTING_HEADERS.length - 1] || submittedAt : submittedAt);
        return row;
      }
      return oreGettingToRow_(item, submittedAt);
    });

    sheet.getRange(2, 1, rows.length, ORE_GETTING_HEADERS.length).setValues(rows);
  }

  return respond_({ success: true, message: 'Data Ore Getting berhasil disimpan.', sheet: ORE_GETTING_SHEET_NAME, count: items.length }, '');
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function getAttendanceSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ATTENDANCE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(ATTENDANCE_SHEET_NAME);
  return sheet;
}

function getOreGettingSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ORE_GETTING_SHEET_NAME);
  if (!sheet) {
    const sheets = ss.getSheets();
    if (sheets.length >= 2) {
      sheet = ss.insertSheet(ORE_GETTING_SHEET_NAME, 2);
    } else {
      sheet = ss.insertSheet(ORE_GETTING_SHEET_NAME);
    }
  }
  return sheet;
}

function attendanceToRow_(item) {
  return [
    item.date || item.tanggal || '',
    item.shift || '',
    item.location || item.lokasi || item.lokasiKerja || '',
    item.name || item.nama || ''
  ];
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
    Array.isArray(item.equipment) ? item.equipment.join(', ') : (item.equipment || ''),
    Number(item.tonnage) || 0,
    Number(item.niGrade) || 0,
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
    equipment: row[13] ? String(row[13]).split(',').map(function(v) { return v.trim(); }).filter(Boolean) : [],
    tonnage: Number(row[14]) || 0,
    niGrade: Number(row[15]) || 0,
    reporterName: String(row[16] || '').trim(),
    submissionTimestamp: String(row[17] || '').trim()
  };
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

  await fetch(endpoint, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type: 'production', items: logs, values: logs }),
  });

  return logs;
}

export async function syncAttendanceToGoogleSheets(url, attendance) {
  const endpoint = normalizeUrl_(url);
  if (!endpoint) throw new Error('URL Google Apps Script belum diisi.');

  await fetch(endpoint, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type: 'attendance', items: attendance, values: attendance }),
  });
}

export function readAttendanceFromGoogleSheets(url) {
  const endpoint = normalizeUrl_(url);
  if (!endpoint) return Promise.reject(new Error('URL Google Apps Script belum diisi.'));

  return new Promise((resolve, reject) => {
    const callbackName = '__gradeControlAttendance_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timeout saat membaca Daily Absensi dari Google Sheets.'));
    }, 15000);

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload || payload.success === false) {
        reject(new Error(payload?.message || 'Google Sheets mengembalikan error absensi.'));
        return;
      }
      const rows = Array.isArray(payload.items) ? payload.items : [];
      resolve(rows.map((row, index) => ({
        id: `gs-attendance-${index}-${row[4] || ''}`,
        date: row[0] || '',
        shift: row[1] || '',
        location: row[2] || '',
        name: row[3] || '',
        submissionTimestamp: row[4] || '',
      })));
    };

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    script.onerror = () => {
      cleanup();
      reject(new Error('Daily Absensi tidak dapat dibaca dari Google Sheets.'));
    };

    const separator = endpoint.includes('?') ? '&' : '?';
    script.src = endpoint + separator + 'type=attendance&callback=' + encodeURIComponent(callbackName) + '&t=' + Date.now();
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
