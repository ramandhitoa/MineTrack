import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attendanceKey,
  getUnsyncedAttendanceItems,
  mergeAttendanceItems,
} from './googleSheetsService.js';

test('attendanceKey menggunakan tanggal, shift, dan nama sebagai kunci unik', () => {
  const a = { date: '2026-09-19', shift: 'Pagi', name: 'Andi' };
  const b = { date: '2026-09-19', shift: 'Pagi', name: 'Andi' };
  const c = { date: '2026-09-19', shift: 'Siang', name: 'Andi' };

  assert.equal(attendanceKey(a), attendanceKey(b));
  assert.notEqual(attendanceKey(a), attendanceKey(c));
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
