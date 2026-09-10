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
// Spreadsheet utama sudah dikunci ke ID milik pengguna.
// Yang perlu dimasukkan pengguna hanya URL Web App /exec.
// ============================================================

// ID Google Spreadsheet pengguna.
export const GOOGLE_SPREADSHEET_ID = '1uPBK4LI1QXJlxU0zjmXjynruzrUu7JSJwq-t8691F3Q';

// URL Apps Script Web App. Bisa diganti dari halaman Integrasi.
export const DEFAULT_GOOGLE_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwk6-ryssNeztCxMIKXfD-wZUfIOwUi7We2CX_hWh8RpsoOqmhyNvRpeb6oJFM_VPfJ/exec';

// Nama sheet/tab yang dipakai oleh Apps Script.
export const GOOGLE_SHEET_NAME = 'Sheet1';
export const GOOGLE_ATTENDANCE_SHEET_NAME = 'Daily Absensi';

// ------------------------------------------------------------
// SCRIPT GOOGLE APPS SCRIPT
// ------------------------------------------------------------
// Salin script ini ke Extensions > Apps Script pada spreadsheet.
// Script sengaja diberi komentar supaya mudah dirawat.
export const GOOGLE_APPS_SCRIPT = `// ============================================================
// MINETRACK - GOOGLE APPS SCRIPT API (FIXED A:U)
// ============================================================
const SPREADSHEET_ID = '${GOOGLE_SPREADSHEET_ID}';
const SHEET_NAME = '${GOOGLE_SHEET_NAME}';

const HEADERS = [
  'Tanggal', 'Shift', 'Area Pit', 'Alat Berat', 'Dumping',
  'Block Model', 'Sample', 'Hole', 'Elevasi', 'Loading',
  'Material', 'Sublot', 'Start Time', 'Stop Time',
  'Rit Today', 'Tonase', 'Total Rit', 'Total Tonase',
  'Assay Ni', 'Assay Fe', 'MC'
];

function doGet(e) {
  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 21);
    if (lastRow === 0) return respond_({success:true, items:[], count:0}, getCallback_(e));

    // PENTING: gunakan getDisplayValues(), bukan getValues().
    // getValues() dapat mengubah nilai seperti "3-2" menjadi Date object
    // dan jam seperti "7:00" menjadi waktu dengan timezone.
    // getDisplayValues() mengambil nilai persis seperti yang tampil di Sheet.
    const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    let startRow = 0;

    // Mendukung dua format:
    // 1) baris 1 = header, data mulai baris 2
    // 2) baris 1 langsung data A:U (format lama pengguna)
    if (looksLikeHeader_(values[0])) startRow = 1;

    const items = values.slice(startRow)
      .filter(row => row.slice(0, 21).some(v => v !== ''))
      .map(rowToItem_);

    return respond_({success:true, items:items, count:items.length}, getCallback_(e));
  } catch (error) {
    return respond_({success:false, message:error.message, items:[], count:0}, getCallback_(e));
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Data POST kosong.');
    const payload = JSON.parse(e.postData.contents);
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (payload.type === 'attendance') {
      const attendanceSheet = getAttendanceSheet_();
      attendanceSheet.clearContents();
      attendanceSheet.getRange(1, 1, 1, 4).setValues([['Tanggal', 'Shift', 'Lokasi Kerja', 'Nama']]);
      if (items.length) {
        attendanceSheet.getRange(2, 1, items.length, 4).setValues(items.map(attendanceToRow_));
      }
      return respond_({success:true, message:'Data Daily Absensi berhasil disimpan.', count:items.length}, '');
    }
    const sheet = getSheet_();

    sheet.clearContents();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    if (items.length) {
      sheet.getRange(2, 1, items.length, HEADERS.length).setValues(items.map(itemToRow_));
    }
    return respond_({success:true, message:'Data MineTrack berhasil disimpan.', count:items.length}, '');
  } catch (error) {
    return respond_({success:false, message:error.message, count:0}, '');
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function getAttendanceSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('${GOOGLE_ATTENDANCE_SHEET_NAME}');
  if (!sheet) sheet = ss.insertSheet('${GOOGLE_ATTENDANCE_SHEET_NAME}');
  return sheet;
}

function attendanceToRow_(item) {
  return [item.date || '', item.shift || '', item.location || '', item.name || ''];
}

function looksLikeHeader_(row) {
  const first = String(row[0] || '').toLowerCase();
  const second = String(row[1] || '').toLowerCase();
  return first === 'tanggal' || first === 'date' || second === 'shift';
}

function itemToRow_(item) {
  const ritToday = Number(item.ritToday) || 0;
  const ritTotal = Number(item.ritTotal) || 0;
  const ritPrevious = Number(item.ritPrevious) || Math.max(0, ritTotal - ritToday);
  return [
    item.date || '', item.shift || '', item.pit || '',
    Array.isArray(item.equipment) ? item.equipment.join(', ') : (item.equipment || ''),
    item.dumpingArea || '', item.blockModel || '', item.sampleRef || '', item.drillHole || '',
    item.elevation || '', item.loadingMethod || '', item.material || '', item.sublot || '',
    item.startTime || '', item.stopTime || '', ritToday, Number(item.tonnage) || 0,
    ritTotal, Number(item.totalTonnage) || Number(item.tonnage) || 0,
    Number(item.niGrade) || 0, Number(item.feGrade) || 0, Number(item.mc) || 0
  ];
}

function rowToItem_(row) {
  const ritToday = Number(row[14]) || 0;
  const tonnage = Number(row[15]) || 0;
  const ritTotal = Number(row[16]) || 0;
  return {
    id: 'gs-' + Utilities.getUuid(),
    date: formatDate_(row[0]), shift: String(row[1] || ''), pit: String(row[2] || ''),
    equipment: row[3] ? String(row[3]).split(',').map(v => v.trim()).filter(Boolean) : [],
    dumpingArea: String(row[4] || ''), blockModel: String(row[5] || ''), sampleRef: String(row[6] || ''),
    drillHole: String(row[7] || ''), elevation: String(row[8] || ''), loadingMethod: String(row[9] || ''),
    material: String(row[10] || ''), sublot: String(row[11] || '').trim(), startTime: String(row[12] || '').trim(),
    stopTime: String(row[13] || '').trim(), ritPrevious: Math.max(0, ritTotal - ritToday),
    ritToday: ritToday, ritTotal: ritTotal, tonnage: tonnage,
    totalTonnage: Number(row[17]) || 0, niGrade: Number(row[18]) || 0,
    feGrade: Number(row[19]) || 0, mc: Number(row[20]) || 0
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
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}`;

// ------------------------------------------------------------
// POST DATA KE APPS SCRIPT
// ------------------------------------------------------------
export async function syncLogsToGoogleSheets(url, logs) {
  const endpoint = normalizeUrl_(url);
  if (!endpoint) throw new Error('URL Google Apps Script belum diisi.');

  // text/plain menghindari preflight CORS karena Apps Script Web App.
  await fetch(endpoint, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ items: logs }),
  });

  // POST no-cors tidak dapat membaca respons server. Kita anggap request
  // terkirim lalu baca ulang Sheet melalui GET JSONP untuk verifikasi.
  const remoteLogs = await readLogsFromGoogleSheets(endpoint);
  return remoteLogs;
}

export async function syncAttendanceToGoogleSheets(url, attendance) {
  const endpoint = normalizeUrl_(url);
  if (!endpoint) throw new Error('URL Google Apps Script belum diisi.');

  await fetch(endpoint, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type: 'attendance', items: attendance }),
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
