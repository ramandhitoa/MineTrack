import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
  attendanceKey,
  createProductionRecordId,
  GOOGLE_APPS_SCRIPT,
  getUnsyncedAttendanceItems,
  mergeAttendanceItems,
  normalizeAttendanceName,
  normalizeAttendancePayload_,
  syncAttendanceToGoogleSheets,
  withProductionRecordIds,
} from './googleSheetsService.js';

const appsScriptSource = readFileSync(
  new URL('../../google-apps-script/Code.gs', import.meta.url),
  'utf8'
);

function saveAppsScriptAttendance(item) {
  let writtenRows = [];
  let writeRange;
  let savedBlob;

  const folder = {
    createFile(blob) {
      savedBlob = blob;
      return { getUrl: () => 'https://drive.google.com/file/d/photo-id/view' };
    },
  };

  const context = {
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    DriveApp: {
      getFoldersByName: (name) => {
        assert.equal(name, 'MineTrack Attendance Photos');
        return { hasNext: () => true, next: () => folder };
      },
    },
    Utilities: {
      base64Decode: (encoded) => Uint8Array.from(Buffer.from(encoded, 'base64')),
      newBlob: (bytes, contentType, name) => ({ bytes, contentType, name }),
    },
    getAttendanceSheet_: () => ({
      getLastRow: () => 1,
      getRange(...range) {
        writeRange = range;
        return { setValues: (rows) => { writtenRows = rows; } };
      },
    }),
    getAttendanceTimestamp_: () => '08:30',
    respond_: (payload) => payload,
  };

  runInNewContext(appsScriptSource, context);
  context.getAttendanceSheet_ = () => ({
    getLastRow: () => 1,
    getRange(...range) {
      writeRange = range;
      return { setValues: (rows) => { writtenRows = rows; } };
    },
  });
  context.getAttendanceTimestamp_ = () => '08:30';
  context.respond_ = (payload) => payload;
  const result = context.saveAttendance_({ items: [item] });

  return { result, rows: writtenRows, writeRange, savedBlob };
}

test('attendanceKey menggunakan tanggal dan nama sebagai kunci unik', () => {
  const a = { date: '2026-09-19', shift: 'Pagi', name: 'Andi' };
  const b = { date: '2026-09-19', shift: 'Pagi', name: 'Andi' };
  const c = { date: '2026-09-19', shift: 'Siang', name: 'Andi' };

  assert.equal(attendanceKey(a), attendanceKey(b));
  assert.equal(attendanceKey(a), attendanceKey(c));
});

test('normalizeAttendanceName merapikan spasi dan mengubah nama peserta menjadi kapital', () => {
  assert.equal(normalizeAttendanceName('Hermanto'), 'HERMANTO');
  assert.equal(normalizeAttendanceName('ardi rinaldi'), 'ARDI RINALDI');
  assert.equal(
    normalizeAttendanceName('  Moch   Fadly   Ramdani  '),
    'MOCH FADLY RAMDANI'
  );
});

test('attendanceKey tetap case-insensitive untuk nama Daily Absensi', () => {
  const variants = ['Hermanto', 'hermanto', 'HERMANTO'].map((name) =>
    attendanceKey({ date: '2026-09-19', shift: 'Pagi', name })
  );
  const appsScriptContext = {};

  runInNewContext(appsScriptSource, appsScriptContext);
  const appsScriptKeys = ['Hermanto', 'hermanto', 'HERMANTO'].map((name) =>
    appsScriptContext.attendanceKey_('2026-09-19', 'Pagi', name)
  );

  assert.equal(new Set(variants).size, 1);
  assert.equal(new Set(appsScriptKeys).size, 1);
});

test('embedded Apps Script mengkapitalisasi nama sebelum menyimpan Daily Absensi', () => {
  assert.ok(
    GOOGLE_APPS_SCRIPT.includes(
      "const name = String(row[3] || '').trim().replace(/\\s+/g, ' ').toUpperCase();"
    )
  );
});

test('getUnsyncedAttendanceItems hanya mengembalikan item baru yang belum ada', () => {
  const remote = [
    { date: '2026-09-19', shift: 'Pagi', name: 'Andi' },
    { date: '2026-09-19', shift: 'Sore', name: 'Budi' },
  ];

  const local = [
    { date: '2026-09-19', shift: 'Pagi', name: 'Andi' },
    { date: '2026-09-19', shift: 'Sore', name: 'Budi' },
    { date: '2026-09-19', shift: 'Siang', name: 'Citra' },
    { date: '2026-09-19', shift: 'Siang', name: 'Citra' },
  ];

  const unsynced = getUnsyncedAttendanceItems(local, remote);

  assert.deepEqual(
    unsynced.map((item) => item.name),
    ['Citra']
  );
  assert.equal(mergeAttendanceItems(local).length, 3);
});

test('normalizeAttendancePayload_ menjaga field Penanggung Jawab dan Pembahasan', () => {
  const photoDataUrl = 'data:image/jpeg;base64,/9j/';
  const payload = normalizeAttendancePayload_([
    {
      date: '2026-09-19',
      shift: 'Pagi',
      name: 'Andi',
      penanggungJawab: 'Ardiansyah Rahman',
      pembahasan: 'Pesan-pesan keselamatan dan update isu teknis & non teknis',
      photoDataUrl,
    },
  ]);

  assert.equal(payload.length, 1);
  assert.equal(payload[0].name, 'ANDI');
  assert.equal(payload[0].penanggungJawab, 'Ardiansyah Rahman');
  assert.equal(
    payload[0].pembahasan,
    'Pesan-pesan keselamatan dan update isu teknis & non teknis'
  );
  assert.equal(payload[0].photoDataUrl, photoDataUrl);
});

test('syncAttendanceToGoogleSheets mengirim photoDataUrl tanpa membuangnya', async () => {
  const photoDataUrl = 'data:image/jpeg;base64,/9j/';
  const originalFetch = globalThis.fetch;
  let sentPayload;

  globalThis.fetch = async (_url, options) => {
    sentPayload = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => JSON.stringify({ success: true, count: 1 }),
    };
  };

  try {
    await syncAttendanceToGoogleSheets('https://example.test/exec', [
      {
        date: '2026-09-19',
        shift: 'Pagi',
        location: 'Pit A',
        name: 'Andi',
        penanggungJawab: 'Ardi',
        pembahasan: 'Briefing',
        photoDataUrl,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(sentPayload.type, 'attendance');
  assert.equal(sentPayload.items[0].name, 'ANDI');
  assert.equal(sentPayload.items[0].photoDataUrl, photoDataUrl);
  assert.equal(sentPayload.values[0].photoDataUrl, photoDataUrl);
});

test('Apps Script menyimpan object attendance sebagai delapan kolom dengan URL Drive di H', () => {
  const photoDataUrl = 'data:image/jpeg;base64,/9j/';
  const { result, rows, writeRange, savedBlob } = saveAppsScriptAttendance({
    date: '2026-09-19',
    shift: 'Pagi',
    location: 'Pit A',
    name: '  Andi   Rinaldi ',
    penanggungJawab: 'Ardi',
    pembahasan: 'Briefing',
    photoDataUrl,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [[
    '2026-09-19',
    'Pagi',
    'Pit A',
    'ANDI RINALDI',
    'Ardi',
    'Briefing',
    '08:30',
    'https://drive.google.com/file/d/photo-id/view',
  ]]);
  assert.equal(writeRange[3], 8);
  assert.equal(savedBlob.contentType, 'image/jpeg');
  assert.match(savedBlob.name, /\.jpg$/);
  assert.equal(result.photoCount, 1);
});

test('Apps Script menerima photoDataUrl array di index 7 dan index 6 tanpa timestamp', () => {
  const photoDataUrl = 'data:image/jpeg;base64,/9j/';
  const base = ['2026-09-19', 'Pagi', 'Pit A', 'Andi', 'Ardi', 'Briefing'];
  const withTimestamp = saveAppsScriptAttendance([...base, 'client-time', photoDataUrl]);
  const withoutTimestamp = saveAppsScriptAttendance([...base, photoDataUrl]);

  assert.equal(withTimestamp.rows[0][7], 'https://drive.google.com/file/d/photo-id/view');
  assert.equal(withoutTimestamp.rows[0][7], 'https://drive.google.com/file/d/photo-id/view');
  assert.equal(withTimestamp.rows[0].length, 8);
  assert.equal(withoutTimestamp.rows[0].length, 8);
});

test('Apps Script menolak foto bukan JPEG dan foto yang melebihi 100 KB', () => {
  const attendance = {
    date: '2026-09-19',
    shift: 'Pagi',
    location: 'Pit A',
    name: 'Andi',
    penanggungJawab: 'Ardi',
    pembahasan: 'Briefing',
  };
  const oversizedJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(100 * 1024),
  ]).toString('base64');

  assert.throws(
    () => saveAppsScriptAttendance({ ...attendance, photoDataUrl: 'data:image/png;base64,/9j/' }),
    /JPEG base64/
  );
  assert.throws(
    () => saveAppsScriptAttendance({
      ...attendance,
      photoDataUrl: `data:image/jpeg;base64,${oversizedJpeg}`,
    }),
    /maksimal 100 KB/
  );
});

test('Production record ID tetap sama saat payload dipersiapkan ulang untuk retry', () => {
  const recordId = createProductionRecordId();
  const firstAttempt = withProductionRecordIds([{ recordId, date: '2026-09-28' }]);
  const retryAttempt = withProductionRecordIds(firstAttempt);

  assert.match(recordId, /^production-/);
  assert.equal(retryAttempt[0].recordId, recordId);
});

test('Production outbox fallback memakai ID record yang sama setiap kali', () => {
  const item = { date: '2026-09-28' };
  const firstAttempt = withProductionRecordIds([item], 'offline-queue-id');
  const retryAttempt = withProductionRecordIds([item], 'offline-queue-id');

  assert.equal(firstAttempt[0].recordId, 'offline-queue-id-0');
  assert.equal(retryAttempt[0].recordId, firstAttempt[0].recordId);
});
