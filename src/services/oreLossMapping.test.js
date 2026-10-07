import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  buildOreLossPayloadItem,
  GOOGLE_ORE_LOSS_HEADERS,
  GOOGLE_ORE_LOSS_SHEET_NAME,
  mapOreLossRow,
  syncOreLossToGoogleSheets,
} from './googleSheetsService.js';

const appsScriptSource = readFileSync(
  new URL('../../google-apps-script/Code.gs', import.meta.url),
  'utf8'
);
const serviceSource = readFileSync(new URL('./googleSheetsService.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../constants.js', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../components/Layout.jsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../pages/OreLoss.jsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('Ore Loss keeps the historical sheet name and column order', () => {
  assert.equal(GOOGLE_ORE_LOSS_SHEET_NAME, 'LAPORAN ORE LOSS');
  assert.deepEqual(GOOGLE_ORE_LOSS_HEADERS, [
    'Unit Excavator',
    'Start Loading',
    'Stop Loading',
    'Jumlah Bucket',
    'Block Model',
    'Titik Bor',
    'Elevasi',
    'Ritase',
    'Status',
    'Timestamp Pengumpulan',
    'Nama Pelapor',
  ]);
});

test('Ore Loss payload trims text and normalizes numeric fields', () => {
  assert.deepEqual(buildOreLossPayloadItem({
    unitExcavator: ' EX-01 ',
    startLoading: '07:15',
    stopLoading: '08:00',
    jumlahBucket: '12',
    blockModel: ' BM-7 ',
    titikBor: ' TB-2 ',
    elevasi: ' 210 ',
    ritase: '3',
    status: 'Continue',
    reporterName: ' Operator ',
  }), {
    unitExcavator: 'EX-01',
    startLoading: '07:15',
    stopLoading: '08:00',
    jumlahBucket: 12,
    blockModel: 'BM-7',
    titikBor: 'TB-2',
    elevasi: '210',
    ritase: 3,
    status: 'Continue',
    reporterName: 'Operator',
  });
});

test('Ore Loss row reader maps all eleven columns without shifting timestamp or reporter', () => {
  assert.deepEqual(mapOreLossRow([
    'EX-01', '07:15', '08:00', '12', 'BM-7', 'TB-2', '210', '3', 'Continue', '2026-10-03 15:20', 'Operator',
  ]), {
    unitExcavator: 'EX-01',
    startLoading: '07:15',
    stopLoading: '08:00',
    jumlahBucket: 12,
    blockModel: 'BM-7',
    titikBor: 'TB-2',
    elevasi: '210',
    ritase: 3,
    status: 'Continue',
    submissionTimestamp: '2026-10-03 15:20',
    reporterName: 'Operator',
  });
});

test('Ore Loss sync uses its dedicated Google Apps Script type and requires one accepted row', async () => {
  const originalFetch = globalThis.fetch;
  let sentPayload;
  globalThis.fetch = async (_url, options) => {
    sentPayload = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify({ success: true, count: 1 }) };
  };

  try {
    const result = await syncOreLossToGoogleSheets('https://example.test/exec', {
      unitExcavator: 'EX-01', startLoading: '07:15', stopLoading: '08:00',
      jumlahBucket: 12, blockModel: 'BM-7', titikBor: 'TB-2', elevasi: '210',
      ritase: 3, status: 'Continue', reporterName: 'Operator',
    });
    assert.equal(result.count, 1);
    assert.equal(sentPayload.type, 'oreloss');
    assert.equal(sentPayload.items[0].unitExcavator, 'EX-01');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Apps Script reads and appends Ore Loss without changing its eleven-column schema', () => {
  for (const source of [appsScriptSource, serviceSource]) {
    assert.match(source, /type === 'oreloss' \|\| type === 'ore_loss'/);
    assert.match(source, /function saveOreLoss_\(payload\)/);
    assert.match(source, /function oreLossToRow_\(item, submittedAt\)/);
    assert.match(source, /function getOreLossSheet_\(\)/);
    assert.match(source, /function hasOreLossHeaders_\(sheet\)/);
    assert.match(source, /function rowToOreLossItem_\(row\)/);
  }
  assert.match(appsScriptSource, /sheet\.getRange\(startRow, 1, rows\.length, ORE_LOSS_HEADERS\.length\)\.setValues\(rows\)/);
  assert.match(appsScriptSource, /function rowToOreLossItem_\(row\)/);
  const oreLossSheetStart = appsScriptSource.indexOf('function getOreLossSheet_()');
  const oreLossSheetEnd = appsScriptSource.indexOf('function hasOreGettingHeaders_', oreLossSheetStart);
  assert.ok(oreLossSheetStart >= 0 && oreLossSheetEnd > oreLossSheetStart);
  assert.doesNotMatch(appsScriptSource.slice(oreLossSheetStart, oreLossSheetEnd), /insertColumnsAfter|deleteRow|clearContents/);

  const rows = [];
  const sheet = {
    getLastRow: () => 1,
    getMaxColumns: () => GOOGLE_ORE_LOSS_HEADERS.length,
    getRange(row, _column, _rowCount, columnCount) {
      if (row === 1) {
        return {
          getDisplayValues: () => [GOOGLE_ORE_LOSS_HEADERS.slice(0, columnCount)],
        };
      }
      return { setValues: (values) => rows.push(...values) };
    },
  };
  const context = {
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    Utilities: { formatDate: () => '2026-10-03 15:20' },
    Session: { getScriptTimeZone: () => 'Asia/Makassar' },
    ContentService: {
      MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  runInNewContext(appsScriptSource, context);
  const result = context.saveOreLoss_({ items: [{
    unitExcavator: 'EX-01', startLoading: '07:15', stopLoading: '08:00',
    jumlahBucket: 12, blockModel: 'BM-7', titikBor: 'TB-2', elevasi: '210',
    ritase: 3, status: 'Continue', reporterName: 'Operator',
  }] });

  assert.equal(JSON.parse(result.text).count, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), [
    'EX-01', '07:15', '08:00', 12, 'BM-7', 'TB-2', '210', 3, 'Continue', '2026-10-03 15:20', 'Operator',
  ]);
});

test('Apps Script Ore Loss GET reads the existing tab without creating a sheet', () => {
  let createdSheet = false;
  const rangeReads = [];
  const values = [
    [...GOOGLE_ORE_LOSS_HEADERS, 'Keterangan', 'U tidak digunakan'],
    ['EX-01', '07:15', '08:00', '12', 'BM-7', 'TB-2', '210', '3', 'Continue', '2026-10-03 15:20', 'Operator', '', 'Manual note', 'Must not map'],
  ];
  const sheet = {
    getLastRow: () => values.length,
    getMaxColumns: () => 26,
    getRange(row, column, rowCount, columnCount) {
      rangeReads.push({ row, column, rowCount, columnCount });
      assert.ok(column + columnCount - 1 <= GOOGLE_ORE_LOSS_HEADERS.length, 'READ must stop at official Ore Loss columns');
      return {
        getDisplayValues: () => values.slice(row - 1, row - 1 + rowCount)
          .map((sheetRow) => sheetRow.slice(column - 1, column - 1 + columnCount)),
      };
    },
  };
  const context = {
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => {
          assert.equal(name, GOOGLE_ORE_LOSS_SHEET_NAME);
          return sheet;
        },
        insertSheet: () => { createdSheet = true; },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  runInNewContext(appsScriptSource, context);
  const response = context.doGet({ parameter: { type: 'oreloss' } });
  const result = JSON.parse(response.text);

  assert.equal(createdSheet, false);
  assert.equal(result.count, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.items[0])), mapOreLossRow(values[1]));
  assert.equal(Object.hasOwn(result.items[0], 'recordId'), false);
  assert.equal(JSON.stringify(result.items[0]).includes('Manual note'), false);
  assert.equal(JSON.stringify(result.items[0]).includes('Must not map'), false);
  assert.equal(rangeReads.length, 1);
});

test('Ore Loss GET returns valid legacy data even when the original header row is absent', () => {
  const legacyRow = [
    'EX-02', '08:00', '08:45', '9', 'BM-8', 'TB-3', '205', '2', 'Close',
    '2026-10-04 08:45', 'Operator Lama', '', 'Manual note', 'Must not map',
  ];
  const rangeReads = [];
  const sheet = {
    getLastRow: () => 1,
    getMaxColumns: () => 26,
    getRange(row, column, rowCount, columnCount) {
      rangeReads.push({ row, column, rowCount, columnCount });
      return {
        getDisplayValues: () => [legacyRow.slice(column - 1, column - 1 + columnCount)],
      };
    },
  };
  const context = {
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => sheet,
        insertSheet: () => { throw new Error('READ must not create a sheet'); },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };

  runInNewContext(appsScriptSource, context);
  const response = context.doGet({ parameter: { type: 'oreloss' } });
  const result = JSON.parse(response.text);

  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.items[0])), mapOreLossRow(legacyRow));
  assert.equal(Object.hasOwn(result.items[0], 'recordId'), false);
  assert.ok(rangeReads.every((range) => range.row === 1 && range.column + range.columnCount - 1 <= GOOGLE_ORE_LOSS_HEADERS.length));
});

test('Ore Loss is routed from the shared sidebar and keeps the reporting form responsive', () => {
  assert.match(navigationSource, /\['oreloss', 'Ore Loss', ClipboardList\]/);
  assert.match(navigationSource, /oreloss: 'Laporan Ore Loss'/);
  assert.match(layoutSource, /oreloss: 'oreloss'/);
  assert.match(layoutSource, /oreloss: ClipboardList/);
  assert.match(appSource, /import OreLoss from '\.\/pages\/OreLoss'/);
  assert.match(appSource, /activeTab === 'oreloss' && <OreLoss authSession=\{authSession\} \/>/);
  assert.match(pageSource, /formatReporterName\(authSession\?\.user\?\.name\)/);
  assert.match(pageSource, /syncOreLossToGoogleSheets/);
  assert.match(pageSource, /readOreLossFromGoogleSheets/);
  assert.match(pageSource, /formGrid4 oreLossForm/);
  assert.match(stylesSource, /\.oreLossForm[\s\S]*?padding:14px/);
  assert.match(stylesSource, /@media \(max-width:640px\)[\s\S]*?\.oreLossActions/);
});