import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attendanceKey,
  createProductionRecordId,
  getUnsyncedAttendanceItems,
  mergeAttendanceItems,
  normalizeAttendancePayload_,
  withProductionRecordIds,
} from './googleSheetsService.js';

test('attendanceKey menggunakan tanggal dan nama sebagai kunci unik', () => {
  const a = { date: '2026-09-19', shift: 'Pagi', name: 'Andi' };
  const b = { date: '2026-09-19', shift: 'Pagi', name: 'Andi' };
  const c = { date: '2026-09-19', shift: 'Siang', name: 'Andi' };

  assert.equal(attendanceKey(a), attendanceKey(b));
  assert.equal(attendanceKey(a), attendanceKey(c));
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
  const payload = normalizeAttendancePayload_([
    {
      date: '2026-09-19',
      shift: 'Pagi',
      name: 'Andi',
      penanggungJawab: 'Ardiansyah Rahman',
      pembahasan: 'Pesan-pesan keselamatan dan update isu teknis & non teknis',
    },
  ]);

  assert.equal(payload.length, 1);
  assert.equal(payload[0].penanggungJawab, 'Ardiansyah Rahman');
  assert.equal(
    payload[0].pembahasan,
    'Pesan-pesan keselamatan dan update isu teknis & non teknis'
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
