import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { areaPitOptions } from '../data/initialData.js';
import { getShiftPitLabel } from '../utils/oreGetting.js';
import {
  getConfirmedProductionPendingGroups,
  syncProductionAndReadBack,
} from './googleSheetsService.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const dailyModalSource = readFileSync(new URL('../components/Modals.jsx', import.meta.url), 'utf8');
const initialDataSource = readFileSync(new URL('../data/initialData.js', import.meta.url), 'utf8');
const offlineSyncSource = readFileSync(new URL('./offlineSync.js', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./googleSheetsService.js', import.meta.url), 'utf8');

async function withPostResponses(responses, run) {
  const originalFetch = globalThis.fetch;
  const sentPayloads = [];
  let responseIndex = 0;

  globalThis.fetch = async (_url, options) => {
    sentPayloads.push(JSON.parse(options.body));
    const payload = responses[responseIndex++];
    if (!payload) throw new Error('Unexpected Production POST count.');
    return {
      ok: true,
      text: async () => JSON.stringify(payload),
    };
  };

  try {
    return await run(() => sentPayloads);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withPostResponse(payload, run) {
  return withPostResponses([payload], (getSentPayloads) => (
    run(() => getSentPayloads()[0])
  ));
}

const endpoint = 'https://example.test/exec';
const production = [{ recordId: 'production-stable-1', date: '2026-09-29', pit: 'PIT A' }];

test('Production count > 0 syncs and preserves recordId in the unchanged request payload', async () => {
  await withPostResponse({ success: true, count: 1 }, async (getSentPayload) => {
    let readUrl;
    const result = await syncProductionAndReadBack(endpoint, production, async (url) => {
      readUrl = url;
      return [{ id: 'sheet-row' }];
    });
    const sentPayload = getSentPayload();

    assert.equal(readUrl, endpoint);
    assert.equal(sentPayload.type, 'production');
    assert.deepEqual(sentPayload.items, production);
    assert.deepEqual(sentPayload.values, production);
    assert.equal(sentPayload.items[0].recordId, 'production-stable-1');
    assert.deepEqual(result.syncedLogs, production);
    assert.deepEqual(result.remoteLogs, [{ id: 'sheet-row' }]);
  });
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
    { success: true, count: 0, duplicateCount: 1 },
    { success: true, count: 1 },
  ];

  await withPostResponses(responses, async (getSentPayloads) => {
    let readBackCalls = 0;
    const result = await syncProductionAndReadBack(endpoint, records, async () => {
      readBackCalls += 1;
      return [{ id: `read-${readBackCalls}` }];
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
      ['B'],
      ['C'],
    ]);
    assert.equal(readBackCalls, 2);
    assert.deepEqual(result.confirmedRecordIds, ['A', 'C']);
    assert.deepEqual(result.failedRecords.map((record) => record.recordId), ['B']);
    assert.deepEqual(deletableGroups.map((group) => group.pendingId), ['A', 'C']);
    assert.deepEqual(groupedQueueDeletable.map((group) => group.pendingId), ['queue-C']);
  });
});

test('duplicate count without readable recordId confirmation fails and retains pending', async () => {
  await withPostResponse({ success: true, count: 0, duplicateCount: 1 }, async () => {
    let readBackCalled = false;
    let pendingDeleted = false;
    const result = await syncProductionAndReadBack(endpoint, production, async () => {
      readBackCalled = true;
      return [{ id: 'synthetic-sheet-id' }];
    });
    pendingDeleted = result.confirmedRecordIds.includes(production[0].recordId);

    assert.equal(readBackCalled, false);
    assert.equal(pendingDeleted, false);
    assert.match(result.failedRecords[0].message, /Production belum terkonfirmasi tersimpan/);
  });
});

test('all duplicate records remain pending and an array queue needs every record confirmed', async () => {
  const records = ['A', 'B'].map((recordId) => ({ recordId, date: '2026-09-29' }));
  await withPostResponses([
    { success: true, count: 0, duplicateCount: 1 },
    { success: true, count: 0, duplicateCount: 1 },
  ], async () => {
    const result = await syncProductionAndReadBack(endpoint, records, async () => []);
    const deletable = getConfirmedProductionPendingGroups(
      [
        { pendingId: 'queue-A', records: [records[0]] },
        { pendingId: 'queue-B', records: [records[1]] },
        { pendingId: 'queue-array', records },
      ],
      result.recordResults
    );

    assert.deepEqual(result.confirmedRecordIds, []);
    assert.deepEqual(result.failedRecords.map((record) => record.recordId), ['A', 'B']);
    assert.deepEqual(deletable, []);
  });
});

test('a duplicate occurrence cannot inherit confirmation from an earlier matching recordId', async () => {
  const repeated = [
    { recordId: 'same-record', date: '2026-09-29' },
    { recordId: 'same-record', date: '2026-09-29' },
  ];
  await withPostResponses([
    { success: true, count: 1 },
    { success: true, count: 0, duplicateCount: 1 },
  ], async () => {
    const result = await syncProductionAndReadBack(endpoint, repeated, async () => []);
    const deletable = getConfirmedProductionPendingGroups(
      [{ pendingId: 'queue-repeated', records: repeated }],
      result.recordResults
    );

    assert.deepEqual(result.recordResults.map((record) => record.confirmed), [true, false]);
    assert.deepEqual(deletable, []);
  });
});

test('POST failure does not prevent later records from syncing', async () => {
  const records = ['A', 'B'].map((recordId) => ({ recordId, date: '2026-09-29' }));
  await withPostResponses([
    { success: false, message: 'Rejected A' },
    { success: true, count: 1 },
  ], async (getSentPayloads) => {
    const result = await syncProductionAndReadBack(endpoint, records, async () => []);

    assert.equal(getSentPayloads().length, 2);
    assert.deepEqual(result.confirmedRecordIds, ['B']);
    assert.deepEqual(result.failedRecords.map((record) => record.recordId), ['A']);
  });
});

test('network error on one POST keeps it pending and does not block the next record', async () => {
  const originalFetch = globalThis.fetch;
  let postCount = 0;
  globalThis.fetch = async (_url, options) => {
    const sentPayload = JSON.parse(options.body);
    postCount += 1;
    if (postCount === 1) throw new TypeError('Failed to fetch');
    return {
      ok: true,
      text: async () => JSON.stringify({ success: true, count: 1 }),
      sentPayload,
    };
  };

  try {
    const records = ['A', 'B'].map((recordId) => ({ recordId, date: '2026-09-29' }));
    const result = await syncProductionAndReadBack(endpoint, records, async () => []);
    assert.deepEqual(result.confirmedRecordIds, ['B']);
    assert.deepEqual(result.failedRecords.map((record) => record.recordId), ['A']);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('retry uses the same recordId; duplicate response remains unconfirmed', async () => {
  await withPostResponses([
    { success: true, count: 1 },
    { success: true, count: 0, duplicateCount: 1 },
  ], async (getSentPayloads) => {
    const firstTry = await syncProductionAndReadBack(endpoint, production, async () => []);
    const retry = await syncProductionAndReadBack(endpoint, production, async () => []);
    const ids = getSentPayloads().map((payload) => payload.items[0].recordId);

    assert.deepEqual(ids, ['production-stable-1', 'production-stable-1']);
    assert.deepEqual(firstTry.confirmedRecordIds, ['production-stable-1']);
    assert.deepEqual(retry.confirmedRecordIds, []);
    assert.deepEqual(retry.failedRecords.map((record) => record.recordId), ['production-stable-1']);
  });
});

test('auto, manual, and offline Production paths await read-back before deleting pending', () => {
  assert.match(serviceSource, /identifiedLogs\.length !== 1/);
  assert.match(serviceSource, /for \(const record of identifiedLogs\)[\s\S]*syncLogsToGoogleSheets\(url, \[record\]\)/);

  const autoStart = appSource.indexOf('const autoSyncProduction = async');
  const autoEnd = appSource.indexOf('const autoSyncAttendance = async', autoStart);
  const autoSync = appSource.slice(autoStart, autoEnd);
  const autoReadBackIndex = autoSync.indexOf('syncProductionAndReadBack');
  const autoDeleteIndex = autoSync.indexOf('deletePendingData');
  assert.ok(autoReadBackIndex >= 0 && autoDeleteIndex > autoReadBackIndex);

  const manualStart = appSource.indexOf('const syncGoogleSheets = async');
  const manualEnd = appSource.indexOf('const syncAttendance = async', manualStart);
  const manualSync = appSource.slice(manualStart, manualEnd);
  const manualReadBackIndex = manualSync.indexOf('syncProductionAndReadBack');
  const manualDeleteIndex = manualSync.indexOf('deletePendingData');
  assert.ok(manualReadBackIndex >= 0 && manualDeleteIndex > manualReadBackIndex);

  const offlineStart = offlineSyncSource.indexOf("type === 'production'");
  const offlineEnd = offlineSyncSource.indexOf("type === 'attendance'", offlineStart);
  const offlineProduction = offlineSyncSource.slice(offlineStart, offlineEnd);
  const offlineReadBackIndex = offlineProduction.indexOf('syncProductionAndReadBack');
  const offlineDeleteIndex = offlineProduction.indexOf('deletePendingData');
  assert.ok(offlineReadBackIndex >= 0 && offlineDeleteIndex > offlineReadBackIndex);

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
