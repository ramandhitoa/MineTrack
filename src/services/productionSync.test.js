import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { areaPitOptions } from '../data/initialData.js';
import { getShiftPitLabel } from '../utils/oreGetting.js';
import {
  getConfirmedProductionPendingGroups,
  GOOGLE_APPS_SCRIPT,
  syncProductionAndReadBack,
} from './googleSheetsService.js';

const appsScriptSource = readFileSync(new URL('../../google-apps-script/Code.gs', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const dailyModalSource = readFileSync(new URL('../components/Modals.jsx', import.meta.url), 'utf8');
const initialDataSource = readFileSync(new URL('../data/initialData.js', import.meta.url), 'utf8');
const offlineSyncSource = readFileSync(new URL('./offlineSync.js', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./googleSheetsService.js', import.meta.url), 'utf8');

function createAppsScriptRuntime(source, productionIdHeader = '') {
  const headers = [
    'Tanggal', 'Blok', 'Shift', 'Pit', 'Dumping', 'Sublot', 'Retase', 'Status',
    'Block Model', 'Acuan', 'Titik Bor', 'Elevasi', 'Metode', 'Material',
    'Alat Berat', 'Tonase', 'Acuan Ni%', 'Nama Pelapor', 'Timestamp Pengumpulan',
  ];
  const legacyRow = ['legacy-date', 'legacy-block', 'legacy-shift'];
  const rows = [headers.concat(Array(7).fill('')), legacyRow.concat(Array(23).fill(''))];
  rows[0][19] = productionIdHeader;
  const properties = {};
  let lockCount = 0;
  const sheet = {
    getLastRow: () => rows.length,
    getMaxColumns: () => 26,
    getRange(startRow, startColumn, rowCount = 1, columnCount = 1) {
      return {
        getDisplayValue: () => String(rows[startRow - 1]?.[startColumn - 1] || ''),
        getDisplayValues() {
          return Array.from({ length: rowCount }, (_, rowOffset) => (
            Array.from({ length: columnCount }, (_, columnOffset) => (
              rows[startRow - 1 + rowOffset]?.[startColumn - 1 + columnOffset] || ''
            ))
          ));
        },
        setValue(value) {
          rows[startRow - 1][startColumn - 1] = value;
        },
        setValues(newRows) {
          newRows.forEach((newRow, rowOffset) => {
            rows[startRow - 1 + rowOffset] = newRow.slice();
          });
        },
      };
    },
  };
  const context = {
    LockService: {
      getScriptLock: () => ({
        waitLock(timeout) {
          assert.equal(timeout, 30000);
          lockCount++;
        },
        releaseLock() {},
      }),
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => sheet,
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ ...properties }),
        setProperties: (values) => Object.assign(properties, values),
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA-256' },
      computeDigest: () => [1, 2, 3],
      base64EncodeWebSafe: () => 'production-test-key',
      getUuid: () => 'test-uuid',
    },
  };
  const compatibleSource = source.replace(/^export\s+(?=function\s)/gm, '');
  runInNewContext(compatibleSource, context);
  context.getSubmissionTimestamp_ = () => '2026-10-07 13:00';
  context.respond_ = (value) => value;

  return {
    context,
    rows,
    legacyRow: rows[1].slice(),
    get lockCount() { return lockCount; },
  };
}

async function withPostResponses(responses, run, { initialRecordIds = [], sheetCounts } = {}) {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const sentPayloads = [];
  const records = sheetCounts || new Map();
  initialRecordIds.forEach((recordId) => {
    records.set(recordId, (records.get(recordId) || 0) + 1);
  });
  let responseIndex = 0;

  globalThis.window = { setTimeout, clearTimeout };
  globalThis.document = {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild(script) {
        const url = new URL(script.src);
        const callbackName = url.searchParams.get('callback');
        const recordId = url.searchParams.get('recordId');
        queueMicrotask(() => {
          globalThis.window[callbackName]({
            success: true,
            found: (records.get(recordId) || 0) > 0,
            matchCount: records.get(recordId) || 0,
            recordId,
          });
        });
      },
    },
  };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sentPayloads.push(body);
    const response = responses[responseIndex++];
    if (!response) throw new Error('Unexpected Production POST count.');
    const payload = typeof response === 'function'
      ? await response(body, records)
      : response;
    if (payload?.success === true && Number(payload.count) > 0) {
      body.items.forEach((item) => {
        records.set(item.recordId, (records.get(item.recordId) || 0) + 1);
      });
    }
    return {
      ok: true,
      text: async () => JSON.stringify(payload),
    };
  };

  try {
    return await run(() => sentPayloads, records);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  }
}

async function withPostResponse(payload, run, options) {
  return withPostResponses([payload], (getSentPayloads) => (
    run(() => getSentPayloads()[0])
  ), options);
}

const endpoint = 'https://example.test/exec';
const production = [{ recordId: 'production-stable-1', date: '2026-09-29', pit: 'PIT A' }];
const readBackRecord = async (_url, record) => [{ recordId: record.recordId }];

test('Production checks recordId, POSTs only when absent, and confirms exactly one read-back match', async () => {
  await withPostResponse({ success: true, count: 1 }, async (getSentPayload) => {
    let readUrl;
    const result = await syncProductionAndReadBack(endpoint, production, async (url, record) => {
      readUrl = url;
      return [{ id: 'sheet-row', recordId: record.recordId }];
    });
    const sentPayload = getSentPayload();

    assert.equal(readUrl, endpoint);
    assert.equal(sentPayload.type, 'production');
    assert.deepEqual(sentPayload.items, production);
    assert.deepEqual(sentPayload.values, production);
    assert.equal(sentPayload.items[0].recordId, 'production-stable-1');
    assert.deepEqual(result.syncedLogs, production);
    assert.deepEqual(result.remoteLogs, [{ id: 'sheet-row', recordId: 'production-stable-1' }]);
  });
});

test('recordId already present exactly once is confirmed without a duplicate POST', async () => {
  await withPostResponses([], async (getSentPayloads) => {
    const result = await syncProductionAndReadBack(endpoint, production, readBackRecord);
    assert.equal(getSentPayloads().length, 0);
    assert.deepEqual(result.confirmedRecordIds, ['production-stable-1']);
    assert.deepEqual(result.failedRecords, []);
  }, { initialRecordIds: ['production-stable-1'] });
});

test('full read-back with zero or multiple recordId matches never confirms or clears pending', async () => {
  for (const readBack of [
    async () => [],
    async (_url, record) => [{ recordId: record.recordId }, { recordId: record.recordId }],
  ]) {
    await withPostResponses([], async () => {
      const result = await syncProductionAndReadBack(endpoint, production, readBack);
      assert.deepEqual(result.confirmedRecordIds, []);
      assert.equal(result.failedRecords.length, 1);
      assert.match(result.failedRecords[0].message, /read-back/);
    }, { initialRecordIds: ['production-stable-1'] });
  }
});

test('recordId absent after POST stays pending', async () => {
  await withPostResponses([
    async () => ({ success: true, count: 0, duplicateCount: 0 }),
  ], async () => {
    const result = await syncProductionAndReadBack(endpoint, production, readBackRecord);
    assert.deepEqual(result.confirmedRecordIds, []);
    assert.match(result.failedRecords[0].message, /belum ditemukan pada read-back/);
  });
});

test('more than one matching Sheet row fails preflight and prevents POST', async () => {
  await withPostResponses([], async (getSentPayloads) => {
    const result = await syncProductionAndReadBack(endpoint, production, readBackRecord);
    assert.equal(getSentPayloads().length, 0);
    assert.deepEqual(result.confirmedRecordIds, []);
    assert.match(result.failedRecords[0].message, /ditemukan 2 kali/);
  }, { initialRecordIds: ['production-stable-1', 'production-stable-1'] });
});

test('more than one matching Sheet row after POST stays pending', async () => {
  await withPostResponses([
    async (body, records) => {
      records.set(body.items[0].recordId, 2);
      return { success: true, count: 0 };
    },
  ], async () => {
    const result = await syncProductionAndReadBack(endpoint, production, readBackRecord);
    assert.deepEqual(result.confirmedRecordIds, []);
    assert.match(result.failedRecords[0].message, /ditemukan 2 kali/);
  });
});

test('standalone and embedded Apps Script persist IDs, serialize writes, and preserve old rows', () => {
  for (const source of [appsScriptSource, GOOGLE_APPS_SCRIPT]) {
    const runtime = createAppsScriptRuntime(source);
    const first = runtime.context.saveProduction_({ items: production });
    const retry = runtime.context.saveProduction_({ items: production });
    const readBack = runtime.context.doGet({
      parameter: { recordId: production[0].recordId },
    });

    assert.equal(first.success, true);
    assert.equal(first.count, 1);
    assert.equal(retry.count, 0);
    assert.equal(retry.duplicateCount, 1);
    assert.equal(runtime.rows[0][19], 'ID Laporan');
    assert.equal(runtime.rows[2][19], production[0].recordId);
    assert.deepEqual(runtime.rows[1], runtime.legacyRow);
    assert.equal(readBack.matchCount, 1);
    assert.equal(readBack.recordId, production[0].recordId);
    assert.equal(runtime.lockCount, 2);
  }
});

test('Apps Script refuses an occupied Production ID column without modifying existing data', () => {
  for (const source of [appsScriptSource, GOOGLE_APPS_SCRIPT]) {
    const runtime = createAppsScriptRuntime(source, 'Existing Header');
    const before = runtime.rows.map((row) => row.slice());
    assert.throws(
      () => runtime.context.saveProduction_({ items: production }),
      /Kolom ID Production sudah digunakan/
    );
    assert.deepEqual(runtime.rows, before);
  }
});

test('Production success false fails before read-back or pending cleanup', async () => {
  await withPostResponse({ success: false, message: 'Rejected' }, async () => {
    let readBackCalled = false;
    let pendingDeleted = false;
    const result = await syncProductionAndReadBack(endpoint, production, async () => {
      readBackCalled = true;
      return [];
    });
    pendingDeleted = result.confirmedRecordIds.includes(production[0].recordId);

    assert.equal(readBackCalled, false);
    assert.equal(pendingDeleted, false);
    assert.match(result.failedRecords[0].message, /Rejected/);
  });
});

test('mixed batch posts each record separately and deletes only individually confirmed items', async () => {
  const records = ['A', 'B', 'C'].map((recordId) => ({ recordId, date: '2026-09-29' }));
  const responses = [
    { success: true, count: 1 },
    { success: true, count: 1 },
  ];

  await withPostResponses(responses, async (getSentPayloads) => {
    let readBackCalls = 0;
    const result = await syncProductionAndReadBack(endpoint, records, async () => {
      readBackCalls += 1;
      return [{
        id: `read-${readBackCalls}`,
        recordId: records[readBackCalls - 1].recordId,
      }];
    });
    const sentPayloads = getSentPayloads();
    const groups = records.map((record) => ({ pendingId: record.recordId, records: [record] }));
    const deletableGroups = getConfirmedProductionPendingGroups(
      groups,
      result.recordResults
    );
    const groupedQueueDeletable = getConfirmedProductionPendingGroups([
      { pendingId: 'queue-AB', records: records.slice(0, 2) },
      { pendingId: 'queue-C', records: [records[2]] },
    ], result.recordResults);

    assert.deepEqual(sentPayloads.map((payload) => payload.items.map((item) => item.recordId)), [
      ['A'],
      ['C'],
    ]);
    assert.equal(readBackCalls, 3);
    assert.deepEqual(result.confirmedRecordIds, ['A', 'B', 'C']);
    assert.deepEqual(result.failedRecords, []);
    assert.deepEqual(deletableGroups.map((group) => group.pendingId), ['A', 'B', 'C']);
    assert.deepEqual(groupedQueueDeletable.map((group) => group.pendingId), ['queue-AB', 'queue-C']);
  }, { initialRecordIds: ['B'] });
});

test('existing Sheet record is confirmed by read-back without POST', async () => {
  await withPostResponses([], async (getSentPayloads) => {
    let readBackCalled = false;
    const result = await syncProductionAndReadBack(endpoint, production, async (_url, record) => {
      readBackCalled = true;
      return [{ id: 'synthetic-sheet-id', recordId: record.recordId }];
    });

    assert.equal(readBackCalled, true);
    assert.equal(getSentPayloads().length, 0);
    assert.deepEqual(result.confirmedRecordIds, ['production-stable-1']);
    assert.deepEqual(result.failedRecords, []);
  }, { initialRecordIds: ['production-stable-1'] });
});

test('pre-existing records in an array queue are confirmed individually without POST', async () => {
  const records = ['A', 'B'].map((recordId) => ({ recordId, date: '2026-09-29' }));
  await withPostResponses([], async (getSentPayloads) => {
    const result = await syncProductionAndReadBack(endpoint, records, readBackRecord);
    const deletable = getConfirmedProductionPendingGroups(
      [{ pendingId: 'queue-array', records }],
      result.recordResults
    );

    assert.deepEqual(result.confirmedRecordIds, ['A', 'B']);
    assert.deepEqual(result.failedRecords, []);
    assert.equal(getSentPayloads().length, 0);
    assert.deepEqual(deletable.map((group) => group.pendingId), ['queue-array']);
  }, { initialRecordIds: ['A', 'B'] });
});

test('a repeated recordId creates one Sheet row and is read back for each queued occurrence', async () => {
  const repeated = [
    { recordId: 'same-record', date: '2026-09-29' },
    { recordId: 'same-record', date: '2026-09-29' },
  ];
  await withPostResponses([
    { success: true, count: 1 },
  ], async (getSentPayloads) => {
    const result = await syncProductionAndReadBack(endpoint, repeated, readBackRecord);
    const deletable = getConfirmedProductionPendingGroups(
      [{ pendingId: 'queue-repeated', records: repeated }],
      result.recordResults
    );

    assert.deepEqual(result.recordResults.map((record) => record.confirmed), [true, true]);
    assert.equal(getSentPayloads().length, 1);
    assert.deepEqual(deletable.map((group) => group.pendingId), ['queue-repeated']);
  });
});

test('POST failure does not prevent later records from syncing', async () => {
  const records = ['A', 'B'].map((recordId) => ({ recordId, date: '2026-09-29' }));
  await withPostResponses([
    { success: false, message: 'Rejected A' },
    { success: true, count: 1 },
  ], async (getSentPayloads) => {
    const result = await syncProductionAndReadBack(endpoint, records, async (_url, record) => (
      [{ recordId: record.recordId }]
    ));

    assert.equal(getSentPayloads().length, 2);
    assert.deepEqual(result.confirmedRecordIds, ['B']);
    assert.deepEqual(result.failedRecords.map((record) => record.recordId), ['A']);
  });
});

test('network error on one POST keeps it pending and does not block the next record', async () => {
  await withPostResponses([
    async () => { throw new TypeError('Failed to fetch'); },
    { success: true, count: 1 },
  ], async () => {
    const records = ['A', 'B'].map((recordId) => ({ recordId, date: '2026-09-29' }));
    const result = await syncProductionAndReadBack(endpoint, records, readBackRecord);
    assert.deepEqual(result.confirmedRecordIds, ['B']);
    assert.deepEqual(result.failedRecords.map((record) => record.recordId), ['A']);
  });
});

test('read-back failure fails sync and retains pending', async () => {
  await withPostResponse({ success: true, count: 1 }, async () => {
    let pendingDeleted = false;
    const result = await syncProductionAndReadBack(endpoint, production, async () => {
      throw new Error('READ failed');
    });
    pendingDeleted = result.confirmedRecordIds.includes(production[0].recordId);

    assert.equal(pendingDeleted, false);
    assert.match(result.failedRecords[0].message, /Production belum terkonfirmasi tersimpan.*READ failed/);
  });
});

test('retry checks the same recordId and skips POST once it is in Google Sheets', async () => {
  await withPostResponses([
    { success: true, count: 1 },
  ], async (getSentPayloads) => {
    const firstTry = await syncProductionAndReadBack(endpoint, production, readBackRecord);
    const retry = await syncProductionAndReadBack(endpoint, production, readBackRecord);
    const ids = getSentPayloads().map((payload) => payload.items[0].recordId);

    assert.deepEqual(ids, ['production-stable-1']);
    assert.deepEqual(firstTry.confirmedRecordIds, ['production-stable-1']);
    assert.deepEqual(retry.confirmedRecordIds, ['production-stable-1']);
    assert.deepEqual(retry.failedRecords, []);
  });
});

test('timeout after storage and retry of the same recordId does not create a second row', async () => {
  const storedCounts = new Map();
  const requestedIds = [];
  await withPostResponses([
    async (body, records) => {
      const recordId = body.items[0].recordId;
      requestedIds.push(recordId);
      records.set(recordId, 1);
      throw new TypeError('Failed to fetch after server stored the record');
    },
  ], async (getSentPayloads, records) => {
    const firstTry = await syncProductionAndReadBack(endpoint, production, readBackRecord);
    const retry = await syncProductionAndReadBack(endpoint, production, readBackRecord);

    requestedIds.push(...getSentPayloads().slice(1).map((payload) => payload.items[0].recordId));
    assert.deepEqual(requestedIds, ['production-stable-1']);
    assert.equal(records.get('production-stable-1'), 1);
    assert.equal(firstTry.failedRecords.length, 1);
    assert.deepEqual(retry.confirmedRecordIds, ['production-stable-1']);
    assert.deepEqual(retry.failedRecords, []);
  }, { sheetCounts: storedCounts });
});

test('different records with the same date and shift remain separate Production records', async () => {
  const records = [
    { recordId: 'production-same-shift-a', date: '2026-09-29', shift: 'Shift 1', ritToday: 2 },
    { recordId: 'production-same-shift-b', date: '2026-09-29', shift: 'Shift 1', ritToday: 3 },
  ];

  await withPostResponses([
    { success: true, count: 1 },
    { success: true, count: 1 },
  ], async (getSentPayloads) => {
    const result = await syncProductionAndReadBack(endpoint, records, readBackRecord);

    assert.deepEqual(
      getSentPayloads().map((payload) => payload.items[0].recordId),
      ['production-same-shift-a', 'production-same-shift-b']
    );
    assert.deepEqual(result.confirmedRecordIds, [
      'production-same-shift-a',
      'production-same-shift-b',
    ]);
  });
});

test('Production submissions and manual sync use the single locked queue dispatcher', () => {
  assert.match(serviceSource, /identifiedLogs\.length !== 1/);
  assert.match(serviceSource, /for \(const record of identifiedLogs\)[\s\S]*syncLogsToGoogleSheets\(url, \[record\]\)/);

  const saveStart = appSource.indexOf('const saveDaily = async (event) => {');
  const saveEnd = appSource.indexOf('// -------------------- Pending job CRUD', saveStart);
  const saveDaily = appSource.slice(saveStart, saveEnd);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  assert.ok(saveDaily.indexOf('localStorage.setItem(STORAGE_KEYS.logs') < saveDaily.indexOf("savePendingData('production', newLog)"));
  assert.match(saveDaily, /syncStatus: 'pending'/);
  assert.match(saveDaily, /savePendingData\('production', newLog\)/);
  assert.doesNotMatch(saveDaily, /syncProductionAndReadBack|syncLogsToGoogleSheets|autoSyncProduction/);
  assert.match(saveDaily, /if \(dailySaveInProgressRef\.current\) return/);
  assert.match(saveDaily, /dailySaveInProgressRef\.current = true/);
  assert.match(saveDaily, /dailySaveInProgressRef\.current = false/);

  const manualStart = appSource.indexOf('const syncGoogleSheets = async');
  const manualEnd = appSource.indexOf('const syncAttendance = async', manualStart);
  const manualSync = appSource.slice(manualStart, manualEnd);
  assert.match(manualSync, /syncPendingData\([\s\S]*\['production', 'produksi'\]/);
  assert.doesNotMatch(manualSync, /syncProductionAndReadBack|deletePendingData/);

  const offlineStart = offlineSyncSource.indexOf("type === 'production'");
  const offlineEnd = offlineSyncSource.indexOf("type === 'attendance'", offlineStart);
  const offlineProduction = offlineSyncSource.slice(offlineStart, offlineEnd);
  const offlineReadBackIndex = offlineProduction.indexOf('syncProductionAndReadBack');
  const localSentIndex = offlineProduction.indexOf('markLocalProductionRecordsSent(confirmedRecordIds)');
  const offlineDeleteIndex = offlineProduction.indexOf('deletePendingData');
  assert.ok(offlineReadBackIndex >= 0 && localSentIndex > offlineReadBackIndex && offlineDeleteIndex > localSentIndex);
  assert.match(offlineSyncSource, /recoverPendingProductionFromLocalStorage\(\)/);
  assert.match(offlineSyncSource, /if \(isSyncing\)/);
  assert.match(offlineSyncSource, /isSyncing = true/);

  const appAttendanceStart = appSource.indexOf('const autoSyncAttendance = async');
  const appAttendanceEnd = appSource.indexOf('// -------------------- Daily log CRUD', appAttendanceStart);
  assert.doesNotMatch(appSource.slice(appAttendanceStart, appAttendanceEnd), /syncProductionAndReadBack/);

  const offlineAttendanceStart = offlineSyncSource.indexOf("type === 'attendance'");
  const offlineAttendanceEnd = offlineSyncSource.indexOf("type === 'oregetting'", offlineAttendanceStart);
  assert.doesNotMatch(offlineSyncSource.slice(offlineAttendanceStart, offlineAttendanceEnd), /syncProductionAndReadBack/);
  assert.match(offlineSyncSource.slice(offlineAttendanceStart, offlineAttendanceEnd), /syncAttendanceToGoogleSheets/);

  const offlineOreStart = offlineSyncSource.indexOf("type === 'oregetting'");
  const offlineOreEnd = offlineSyncSource.indexOf('return false;', offlineOreStart);
  assert.doesNotMatch(offlineSyncSource.slice(offlineOreStart, offlineOreEnd), /syncProductionAndReadBack/);
});

test('Input Hasil Shift requires user-selected Block and PIT before creating Production data', () => {
  assert.match(initialDataSource, /block: ''/);
  assert.match(initialDataSource, /pit: ''/);
  assert.equal((dailyModalSource.match(/<option value="">Silahkan diisi<\/option>/g) || []).length, 2);
  assert.match(dailyModalSource, /value=\{data\.block\}[\s\S]*?required/);
  assert.match(dailyModalSource, /value=\{data\.pit\}[\s\S]*?required/);
  assert.match(dailyModalSource, /setCustomValidity\('Silahkan pilih BLOK\.'\)/);
  assert.match(dailyModalSource, /setCustomValidity\('Silahkan pilih PIT\.'\)/);

  const saveStart = appSource.indexOf('const saveDaily = async (event) => {');
  const saveEnd = appSource.indexOf('const savePending = (event) => {', saveStart);
  const saveDaily = appSource.slice(saveStart, saveEnd);
  const recordStart = saveDaily.indexOf('const newLog = normalizeProductionNiRecord({');
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  assert.ok(saveDaily.indexOf("if (!block)") < recordStart);
  assert.ok(saveDaily.indexOf("if (!pit)") < recordStart);
  assert.match(saveDaily.slice(recordStart), /\n\s+block,\n\s+pit,/);
  assert.doesNotMatch(saveDaily, /block: dailyForm\.block\s*\|\|/);
});

test('Input Hasil Shift displays Ore Getting Pit labels and keeps canonical option values', () => {
  assert.deepEqual(areaPitOptions, [
    'Pit BETA',
    'Pit Rantepao Barat',
    'Rantepao Timur',
    'Rantepao Selatan',
    'Rantapao Extend',
    'Pit A1M',
    'Pit A1E',
    'Pit A1S',
    'Pit A3M',
    'Pit IRG',
    'Pit AKP 6',
    'Pit AKP 1',
    'Alorindah',
  ]);
  assert.deepEqual(areaPitOptions.map(getShiftPitLabel), [
    'BETA',
    'Rantepao Barat',
    'Rantepao Timur',
    'Rantepao Selatan',
    'Rantepao Extend',
    'A1M',
    'A1E',
    'A1S',
    'A3M',
    'IRG',
    'AKP6',
    'AKP1',
    'Alorindah',
  ]);
  assert.match(dailyModalSource, /<option key=\{pit\} value=\{pit\}>\{getShiftPitLabel\(pit\)\}<\/option>/);
});
