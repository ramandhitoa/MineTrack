// ============================================================
// MINETRACK - GOOGLE APPS SCRIPT API (FIXED A:U)
// ============================================================
const SPREADSHEET_ID = '1uPBK4LI1QXJlxU0zjmXjynruzrUu7JSJwq-t8691F3Q';
const SHEET_NAME = 'Sheet1';
const ATTENDANCE_SHEET_NAME = 'Daily Absensi';

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
  let sheet = ss.getSheetByName(ATTENDANCE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(ATTENDANCE_SHEET_NAME);
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
}
