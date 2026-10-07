import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
  GOOGLE_APPS_SCRIPT,
  GOOGLE_ORE_GETTING_SHEET_NAME,
  GOOGLE_ORE_LOSS_HEADERS,
  GOOGLE_ORE_LOSS_SHEET_NAME,
  readOreGettingFromGoogleSheets,
  readOreLossFromGoogleSheets,
} from './googleSheetsService.js';

const appsScriptSource = readFileSync(
  new URL('../../google-apps-script/Code.gs', import.meta.url),
  'utf8'
);

const oreGettingHeaders = [
  'Tanggal', 'Area PIT', 'Shift', 'Metode', 'ID Metode', 'Acuan',
  'Titik Bor', 'Block Model', 'Elevasi', 'Jumlah Sampel',
  'Timestamp Pengumpulan', 'Nama Pelapor',
];
const oreGettingRecord = [
  '2026-10-06', 'Pit BETA', 'Shift 2', 'CH', 'CH 05', 'Acuan OG',
  'BH-OG', 'BM-OG', '120', '2.5', '15:20 WITA', 'Reporter OG',
];
const oreLossRecord = [
  'EX-LOSS', '07:15', '08:00', '12', 'BM-LOSS', 'BH-LOSS',
  '210', '3', 'Continue', '2026-10-06 15:20', 'Reporter Loss',
];

function createSheet(rows) {
  return {
    getLastRow: () => rows.length,
    getMaxColumns: () => 26,
    getRange(startRow, startColumn, rowCount, columnCount) {
      assert.ok(startColumn + columnCount - 1 <= 12, 'Ore reads must stop within the official tab fields');
      return {
        getDisplayValues: () => rows
          .slice(startRow - 1, startRow - 1 + rowCount)
          .map((row) => row.slice(startColumn - 1, startColumn - 1 + columnCount)),
      };
    },
  };
}

test('Apps Script GET routes unique Ore Getting and Ore Loss rows to their own sheets', () => {
  for (const source of [appsScriptSource, GOOGLE_APPS_SCRIPT]) {
    const sheets = new Map([
      [GOOGLE_ORE_GETTING_SHEET_NAME, createSheet([
        [...oreGettingHeaders, 'manual extra T', 'unused U'],
        [...oreGettingRecord, 'extra M', '', '', '', '', '', '', 'Keterangan', 'unused U'],
      ])],
      [GOOGLE_ORE_LOSS_SHEET_NAME, createSheet([
        [...GOOGLE_ORE_LOSS_HEADERS, 'manual extra L', 'unused U'],
        [...oreLossRecord, 'extra L', '', '', '', '', '', '', '', 'Keterangan', 'unused U'],
      ])],
    ]);
    const requestedSheets = [];
    const context = {
      SpreadsheetApp: {
        openById: () => ({
          getSheetByName: (name) => {
            requestedSheets.push(name);
            return sheets.get(name) || null;
          },
        }),
      },
      ContentService: {
        MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript' },
        createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
      },
    };
    runInNewContext(source.replace(/^export\s+/gm, ''), context);

    const getting = JSON.parse(context.doGet({ parameter: { type: 'oregetting' } }).text);
    const loss = JSON.parse(context.doGet({ parameter: { type: 'oreloss' } }).text);

    assert.deepEqual(requestedSheets, [GOOGLE_ORE_GETTING_SHEET_NAME, GOOGLE_ORE_LOSS_SHEET_NAME]);
    assert.equal(getting.resource, 'oregetting');
    assert.equal(getting.count, 1);
    assert.equal(getting.items[0].areaPit, 'Pit BETA');
    assert.equal(getting.items[0].titikBor, 'BH-OG');
    assert.equal(Object.hasOwn(getting.items[0], 'recordId'), false);
    assert.equal(loss.resource, 'oreloss', JSON.stringify(loss));
    assert.equal(loss.count, 1);
    assert.equal(loss.items[0].unitExcavator, 'EX-LOSS');
    assert.equal(loss.items[0].titikBor, 'BH-LOSS');
    assert.equal(Object.hasOwn(loss.items[0], 'recordId'), false);
    assert.equal(JSON.stringify(getting.items).includes('EX-LOSS'), false);
    assert.equal(JSON.stringify(loss.items).includes('Pit BETA'), false);
  }
});

function installJsonpResponses(responses) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const requests = [];

  globalThis.window = { setTimeout, clearTimeout };
  globalThis.document = {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild(script) {
        const requestUrl = new URL(script.src);
        requests.push(requestUrl);
        const callbackName = requestUrl.searchParams.get('callback');
        const resource = requestUrl.searchParams.get('type');
        queueMicrotask(() => globalThis.window[callbackName](responses[resource]));
      },
    },
  };

  return {
    requests,
    restore() {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else delete globalThis.window;
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else delete globalThis.document;
    },
  };
}

test('Frontend GET replaces conflicting URL type and maps each typed response to its own contract', async () => {
  const mock = installJsonpResponses({
    oregetting: {
      success: true,
      resource: 'oregetting',
      items: [{
        date: '2026-10-06', areaPit: 'Pit BETA', shift: 'Shift 2',
        metode: 'CH', idMetode: 'CH 05', jumlahSampel: 2.5,
        submissionTimestamp: '15:20 WITA', reporterName: 'Reporter OG',
      }],
    },
    oreloss: {
      success: true,
      resource: 'oreloss',
      items: [{
        unitExcavator: 'EX-LOSS', startLoading: '07:15', stopLoading: '08:00',
        jumlahBucket: 12, blockModel: 'BM-LOSS', titikBor: 'BH-LOSS',
        ritase: 3, status: 'Continue', submissionTimestamp: '15:20', reporterName: 'Reporter Loss',
      }],
    },
  });

  try {
    const [getting, loss] = await Promise.all([
      readOreGettingFromGoogleSheets('https://example.test/exec?type=oreloss&keep=og'),
      readOreLossFromGoogleSheets('https://example.test/exec?type=oregetting&keep=loss'),
    ]);

    assert.deepEqual(mock.requests.map((url) => url.searchParams.get('type')), ['oregetting', 'oreloss']);
    assert.deepEqual(mock.requests.map((url) => url.searchParams.getAll('type')), [['oregetting'], ['oreloss']]);
    assert.equal(mock.requests[0].searchParams.get('keep'), 'og');
    assert.equal(mock.requests[1].searchParams.get('keep'), 'loss');
    assert.equal(getting[0].areaPit, 'Pit BETA');
    assert.equal(getting[0].jumlahSampel, 2.5);
    assert.equal(Object.hasOwn(getting[0], 'recordId'), false);
    assert.equal(loss[0].unitExcavator, 'EX-LOSS');
    assert.equal(loss[0].titikBor, 'BH-LOSS');
    assert.equal(Object.hasOwn(loss[0], 'recordId'), false);
    assert.equal('unitExcavator' in getting[0], false);
    assert.equal('areaPit' in loss[0], false);
  } finally {
    mock.restore();
  }
});

test('Frontend read rejects an explicitly mismatched resource instead of showing cross-sheet records', async () => {
  const mock = installJsonpResponses({
    oregetting: { success: true, resource: 'oreloss', items: [{ unitExcavator: 'EX-LOSS' }] },
    oreloss: { success: true, resource: 'oregetting', items: [{ areaPit: 'Pit BETA' }] },
  });

  try {
    await assert.rejects(
      readOreGettingFromGoogleSheets('https://example.test/exec'),
      /resource oreloss/
    );
    await assert.rejects(
      readOreLossFromGoogleSheets('https://example.test/exec'),
      /resource oregetting/
    );
  } finally {
    mock.restore();
  }
});
