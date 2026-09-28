import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFiles = [
  readFileSync(resolve(__dirname, '../../google-apps-script/Code.gs'), 'utf8'),
  readFileSync(new URL('./googleSheetsService.js', import.meta.url), 'utf8'),
];

function oreGettingHeaders(source) {
  const match = source.match(/const ORE_GETTING_HEADERS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(match, 'ORE_GETTING_HEADERS must exist');
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

const expectedHeaders = [
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
];

test('Code.gs and embedded Apps Script use the agreed A-K Ore Getting headers', () => {
  sourceFiles.forEach((source) => assert.deepEqual(oreGettingHeaders(source), expectedHeaders));
});

test('Ore Getting object writer writes quantity before timestamp', () => {
  sourceFiles.forEach((source) => {
    assert.match(source, /parseOreGettingSampleCount_\(item\.jumlahSampel\)\s*\?\?\s*''/);
    assert.match(source, /item\.jumlahSampel\)[\s\S]{0,80}submittedAt/);
  });
});

test('Ore Getting READ maps quantity and timestamp by header and preserves legacy J timestamp', () => {
  const codeGs = sourceFiles[0];
  const sheetsTemplate = sourceFiles[1];

  for (const source of sourceFiles) {
    assert.match(source, /jumlahSampel:[\s\S]{0,100}sampleCountIndex/);
    assert.match(source, /submissionTimestamp:[\s\S]{0,100}timestampIndex/);
  }

  assert.match(codeGs, /rowToOreGettingItem_\(row, oreSampleCountIndex, oreTimestampIndex\)/);
  assert.match(codeGs, /oreTimestampIndex\s*<\s*0\)\s*oreTimestampIndex\s*=\s*9/);
  assert.match(sheetsTemplate, /rowToOreGettingItem_\(row, sampleCountIndex, timestampIndex\)/);
  assert.match(sheetsTemplate, /timestampIndex\s*<\s*0\)\s*timestampIndex\s*=\s*9/);
  assert.match(sheetsTemplate, /row\.length\s*>=\s*11\s*\?\s*10\s*:\s*9/);
});

test('Code.gs array writer maps item[0..9] explicitly and appends server timestamp', () => {
  const codeGs = sourceFiles[0];
  const arrayBranch = codeGs.match(/if \(\s*Array\.isArray\(item\)\s*\)\s*\{([\s\S]*?)\n\s*return row;/)?.[1];
  assert.ok(arrayBranch);
  for (let index = 0; index <= 9; index += 1) {
    assert.match(arrayBranch, new RegExp(`item\\[${index}\\]`));
  }
  assert.match(arrayBranch, /parseOreGettingSampleCount_\(item\[9\]\)/);
  assert.match(arrayBranch, /submittedAt/);
  assert.doesNotMatch(arrayBranch, /item\.slice\(/);
});
test('writes are blocked on the legacy header until the sheet is manually aligned', () => {
  assert.match(sourceFiles[0], /if \(!hasOreGettingHeaders_\(sheet\)\)\s*\{\s*throw new Error\('Header Laporan Ore Getting harus:/);
  assert.match(sourceFiles[1], /hasOreGettingHeaders_\(sheet\)/);
  assert.match(sourceFiles[1], /Jumlah Sampel di kolom J dan Timestamp Pengumpulan di kolom K/);
});