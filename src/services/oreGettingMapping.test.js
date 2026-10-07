import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatOreGettingMethodId, getOreGettingAreaLabel } from '../utils/oreGetting.js';
import { buildOreGettingPayloadItem, GOOGLE_APPS_SCRIPT } from './googleSheetsService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFiles = [
  readFileSync(resolve(__dirname, '../../google-apps-script/Code.gs'), 'utf8'),
  readFileSync(new URL('./googleSheetsService.js', import.meta.url), 'utf8'),
];
const oreGettingSource = readFileSync(new URL('../pages/OreGetting.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

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
  'Nama Pelapor',
];

test('Code.gs and embedded Apps Script preserve Ore Getting A-K and append reporter in L', () => {
  sourceFiles.forEach((source) => assert.deepEqual(oreGettingHeaders(source), expectedHeaders));
  assert.deepEqual(expectedHeaders.slice(0, 11), [
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
  ]);
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

  assert.match(codeGs, /rowToOreGettingItem_\(row, oreSampleCountIndex, oreTimestampIndex, oreReporterNameIndex\)/);
  assert.match(codeGs, /oreTimestampIndex\s*<\s*0\)\s*oreTimestampIndex\s*=\s*9/);
  assert.match(sheetsTemplate, /rowToOreGettingItem_\(row, sampleCountIndex, timestampIndex, reporterNameIndex\)/);
  assert.match(sheetsTemplate, /timestampIndex\s*<\s*0\)\s*timestampIndex\s*=\s*9/);
  assert.match(sheetsTemplate, /row\.length\s*>=\s*11\s*\?\s*10\s*:\s*9/);
});

test('Ore Getting READ returns legacy rows without creating headers and ignores columns after L', () => {
  const headers = [...expectedHeaders, '', '', '', '', '', '', '', 'Keterangan', 'U tidak digunakan'];
  const legacyRow = [
    '2026-10-06', 'Pit BETA', 'Shift 2', 'CH', 'CH 05', 'Acuan 1',
    'BH-5', 'BM-9', '120', '2.5', '15:20 WITA', 'Operator Lama',
    'ignored-M', 'ignored-N', 'ignored-O', 'ignored-P', 'ignored-Q', 'ignored-R',
    'ignored-S', 'Manual note', 'Must not map',
  ];
  const values = [headers, legacyRow];

  for (const source of [sourceFiles[0], GOOGLE_APPS_SCRIPT]) {
    let attemptedMutation = false;
    const rangeReads = [];
    const sheet = {
      getLastRow: () => values.length,
      getMaxColumns: () => 26,
      getRange(row, column, rowCount, columnCount) {
        rangeReads.push({ row, column, rowCount, columnCount });
        assert.ok(column + columnCount - 1 <= expectedHeaders.length, 'READ must stop at official Ore Getting column L');
        return {
          getDisplayValues: () => values.slice(row - 1, row - 1 + rowCount)
            .map((sheetRow) => sheetRow.slice(column - 1, column - 1 + columnCount)),
        };
      },
      setValues: () => { attemptedMutation = true; },
      setValue: () => { attemptedMutation = true; },
    };
    const context = {
      SpreadsheetApp: {
        openById: () => ({
          getSheetByName: (name) => {
            assert.equal(name, 'Laporan Ore Getting');
            return sheet;
          },
          insertSheet: () => { attemptedMutation = true; throw new Error('READ must not create a sheet'); },
        }),
      },
      ContentService: {
        MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript' },
        createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
      },
    };

    const runnableSource = source.replace(/^export\s+/gm, '');
    runInNewContext(runnableSource, context);
    const response = context.doGet({ parameter: { type: 'oregetting' } });
    const result = JSON.parse(response.text);

    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(result.items[0].date, '2026-10-06');
    assert.equal(result.items[0].jumlahSampel, 2.5);
    assert.equal(result.items[0].submissionTimestamp, '15:20 WITA');
    assert.equal(result.items[0].reporterName, 'Operator Lama');
    assert.equal(Object.hasOwn(result.items[0], 'recordId'), false);
    assert.equal(JSON.stringify(result.items[0]).includes('Manual note'), false);
    assert.equal(JSON.stringify(result.items[0]).includes('Must not map'), false);
    assert.equal(attemptedMutation, false);
    assert.equal(rangeReads.length, 1);
  }
});

test('Code.gs array writer maps item[0..9], appends server timestamp, then reporter in L', () => {
  const codeGs = sourceFiles[0];
  const arrayBranch = codeGs.match(/if \(\s*Array\.isArray\(item\)\s*\)\s*\{([\s\S]*?)\n\s*return row;/)?.[1];
  assert.ok(arrayBranch);
  for (let index = 0; index <= 9; index += 1) {
    assert.match(arrayBranch, new RegExp(`item\\[${index}\\]`));
  }
  assert.match(arrayBranch, /parseOreGettingSampleCount_\(item\[9\]\)/);
  assert.match(arrayBranch, /submittedAt/);
  assert.match(arrayBranch, /item\[11\]/);
  assert.doesNotMatch(arrayBranch, /item\.slice\(/);
});

test('Ore Getting derives reporter from the login session and carries it through save payload', () => {
  assert.match(appSource, /<OreGetting authSession=\{authSession\} \/>/);
  assert.match(oreGettingSource, /formatReporterName\(authSession\?\.user\?\.name\)/);
  assert.doesNotMatch(oreGettingSource, /Nama Pelapor|namaPelapor/);

  assert.doesNotMatch(readFileSync(new URL('../main.jsx', import.meta.url), 'utf8'), /register\(['\"]\/service-worker\.js['\"]\)/);

  const recordStart = oreGettingSource.indexOf('const newRecord = {');
  const recordEnd = oreGettingSource.indexOf('\n    };', recordStart);
  assert.ok(recordStart >= 0 && recordEnd > recordStart);
  assert.match(oreGettingSource.slice(recordStart, recordEnd), /reporterName,/);
  assert.match(oreGettingSource, /items:\s*\[buildOreGettingPayloadItem\(record, toWitaDateInput\(\)\)\]/);
  assert.deepEqual(
    buildOreGettingPayloadItem({ date: '', submissionTimestamp: '10:44 WITA', reporterName: 'Amelia Sombo' }, '2026-10-01'),
    { date: '2026-10-01', submissionTimestamp: '10:44 WITA', reporterName: 'Amelia Sombo' }
  );
});

test('Ore Getting writer stores reporter in column L without rewriting existing rows', () => {
  sourceFiles.forEach((source) => {
    const writerStart = source.indexOf('function oreGettingToRow_(');
    const writerEnd = source.indexOf('function parseOreGettingSampleCount_', writerStart);
    const writer = source.slice(writerStart, writerEnd);
    assert.match(writer, /submittedAt,[\s\S]*?item\.reporterName\s*\|\|\s*''/);
    const helperStart = source.indexOf('function ensureOreGettingReporterHeader_(');
    assert.ok(helperStart >= 0);
    const nextFunction = source.indexOf('\nfunction ', helperStart + 1);
    const helper = source.slice(helperStart, nextFunction);
    assert.match(helper, /getRange\(1, 12\)\.setValue\(ORE_GETTING_HEADERS\[11\]\)/);
    assert.doesNotMatch(helper, /clearContents|deleteRow/);
  });
});
test('writes are blocked on the legacy header until the sheet is manually aligned', () => {
  assert.match(sourceFiles[0], /if \(!hasOreGettingHeaders_\(sheet\)\)\s*\{\s*throw new Error\('Header Laporan Ore Getting harus:/);
  assert.match(sourceFiles[1], /hasOreGettingHeaders_\(sheet\)/);
  assert.match(sourceFiles[1], /Jumlah Sampel di kolom J dan Timestamp Pengumpulan di kolom K/);
});

test('Area PIT labels omit Pit while canonical spreadsheet values remain intact', () => {
  const areaPits = [
    ['Pit BETA', 'BETA'],
    ['Pit Rantepao Barat', 'Rantepao Barat'],
    ['Pit Rantepao Timur', 'Rantepao Timur'],
    ['Pit Rantepao Selatan', 'Rantepao Selatan'],
    ['Pit Rantepao Extend', 'Rantepao Extend'],
    ['Pit A1M', 'A1M'],
    ['Pit A1E', 'A1E'],
    ['Pit A1S', 'A1S'],
    ['Pit A3M', 'A3M'],
    ['Pit IRG', 'IRG'],
    ['Pit AKP 6', 'AKP6'],
    ['Pit AKP 1', 'AKP1'],
    ['Alorindah', 'Alorindah'],
  ];

  areaPits.forEach(([canonical, label]) => {
    assert.equal(getOreGettingAreaLabel(canonical), label);
  });
  assert.match(oreGettingSource, /areaPit: ''/);
  assert.match(oreGettingSource, /areaPit: '',\s*jumlahSampel/);
  assert.match(oreGettingSource, /<option value="">Silahkan diisi<\/option>/);
  assert.match(oreGettingSource, /value=\{area\}[\s\S]*?\{getOreGettingAreaLabel\(area\)\}/);
  assert.match(oreGettingSource, /required/);

  assert.match(sourceFiles[1], /item\.areaPit \|\| item\.area \|\| ''/);
  assert.match(sourceFiles[0], /item\.areaPit\s*\|\|\s*item\.area\s*\|\|\s*''/);
});

test('ID Metode uses the manual sample number and follows the selected method format', () => {
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CEK', sampleNumber: '01' }), 'BETA_CEK_01');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'PSI', sampleNumber: '01' }), 'BETA_PSI_01');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CH', sampleNumber: '05' }), 'CH 05');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'TP', sampleNumber: '12' }), 'TP 12');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'HS', sampleNumber: '03' }), 'HS 03');
  assert.equal(formatOreGettingMethodId({ areaPit: '', metode: 'CEK', sampleNumber: '01' }), '');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: '', sampleNumber: '01' }), '');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CEK', sampleNumber: '' }), '');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CEK', sampleNumber: 'A1' }), '');
  assert.match(oreGettingSource, /value=\{sampleNumber\}[\s\S]*?setSampleNumber\(event\.target\.value\)/);

  const sampleFieldStart = oreGettingSource.indexOf('<span>Nomor Sampel</span>');
  const sampleFieldEnd = oreGettingSource.indexOf('</label>', sampleFieldStart);
  assert.ok(sampleFieldStart >= 0 && sampleFieldEnd > sampleFieldStart, 'Nomor Sampel input block should exist');
  const sampleFieldBlock = oreGettingSource.slice(sampleFieldStart, sampleFieldEnd + '</label>'.length);
  assert.doesNotMatch(sampleFieldBlock, /inputMode\s*=/);

  assert.match(oreGettingSource, /value=\{idMetode\}\s+readOnly/);
  assert.match(oreGettingSource, /idMetode,/);
  assert.doesNotMatch(oreGettingSource, /nomorSampel:/);
});

test('Rantepao CEK and PSI use their short prefixes while CH/TP/HS remain unprefixed', () => {
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Barat', metode: 'CEK', sampleNumber: '01' }), 'RTP_B_CEK_01');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Barat', metode: 'PSI', sampleNumber: '02' }), 'RTP_B_PSI_02');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Selatan', metode: 'CEK', sampleNumber: '03' }), 'RTP_S_CEK_03');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Selatan', metode: 'PSI', sampleNumber: '04' }), 'RTP_S_PSI_04');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Timur', metode: 'CEK', sampleNumber: '05' }), 'RTP_T_CEK_05');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Timur', metode: 'PSI', sampleNumber: '06' }), 'RTP_T_PSI_06');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Extend', metode: 'CEK', sampleNumber: '07' }), 'RTP_EXT_CEK_07');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Extend', metode: 'PSI', sampleNumber: '08' }), 'RTP_EXT_PSI_08');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantapao Extend', metode: 'CEK', sampleNumber: '09' }), 'RTP_EXT_CEK_09');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Barat', metode: 'CH', sampleNumber: '01' }), 'CH 01');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Selatan', metode: 'TP', sampleNumber: '02' }), 'TP 02');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Timur', metode: 'HS', sampleNumber: '03' }), 'HS 03');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Extend', metode: 'CH', sampleNumber: '04' }), 'CH 04');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CEK', sampleNumber: '01' }), 'BETA_CEK_01');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CH', sampleNumber: '90 - 100' }), 'CH 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Selatan', metode: 'CH', sampleNumber: '90 - 100' }), 'CH 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Barat', metode: 'TP', sampleNumber: '90 - 100' }), 'TP 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Timur', metode: 'HS', sampleNumber: '90 - 100' }), 'HS 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Rantepao Extend', metode: 'CH', sampleNumber: '90 - 100' }), 'CH 90-100');
});

test('CH, TP, and HS compact numeric ranges and preserve non-contiguous samples', () => {
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CH', sampleNumber: '90-100' }), 'CH 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CH', sampleNumber: '90 - 100' }), 'CH 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CH', sampleNumber: '90,91,92,93,94,95,96,97,98,99,100' }), 'CH 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CH', sampleNumber: '90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100' }), 'CH 90-100');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'TP', sampleNumber: '90,91,92,93,94,95' }), 'TP 90-95');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'HS', sampleNumber: '90,91,92,93,94,95' }), 'HS 90-95');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CH', sampleNumber: '90,91,93,95' }), 'CH 90,91,93,95');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'CEK', sampleNumber: '90-100' }), '');
  assert.equal(formatOreGettingMethodId({ areaPit: 'Pit BETA', metode: 'PSI', sampleNumber: '90,91' }), '');
});