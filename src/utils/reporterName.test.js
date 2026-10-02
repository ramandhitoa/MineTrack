import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { formatReporterName } from './reporterName.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('../components/Modals.jsx', import.meta.url), 'utf8');

test('formats account names for spreadsheet reporter values', () => {
  assert.equal(formatReporterName('ADITYA RAMANDHITO'), 'Aditya Ramandhito');
  assert.equal(formatReporterName('BUDI SANTOSO'), 'Budi Santoso');
  assert.equal(formatReporterName('SITI NURHALIZA'), 'Siti Nurhaliza');
  assert.equal(formatReporterName('JOHN DOE'), 'John Doe');
  assert.equal(formatReporterName('  NAMA   AKUN  '), 'Nama Akun');
  assert.equal(formatReporterName(''), '');
  assert.equal(formatReporterName(null), '');
});

test('reporter name comes from the logged-in account and is not a form input', () => {
  assert.doesNotMatch(modalSource, /<Field label="Nama Pelapor">/);

  const saveStart = appSource.indexOf('const saveDaily = async (event) => {');
  const saveEnd = appSource.indexOf('const savePending = (event) => {', saveStart);
  const saveDaily = appSource.slice(saveStart, saveEnd);
  assert.match(saveDaily, /formatReporterName\(authSession\?\.user\?\.name\)/);
  assert.match(saveDaily, /\.\.\.dailyForm,[\s\S]*?reporterName,/);
});