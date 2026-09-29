import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canEditCutOffGradeNi,
  createCutOffGradeNiState,
  createCutOffGradeNiStore,
  cutOffGradeNiReducer,
  DEFAULT_CUT_OFF_GRADE_NI,
  normalizeCutOffGradeNi,
} from './cutOffGradeNiService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const firestoreRules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');

test('cut-off defaults preserve the current thresholds and restrict edit roles', () => {
  assert.deepEqual(DEFAULT_CUT_OFF_GRADE_NI, {
    saprolitHGMin: 1.60,
    saprolitLGMin: 1.30,
    saprolitLGMax: 1.59,
    limonitOreMin: 1.00,
    limonitOreMax: 1.29,
    wasteOBMax: 1.00,
  });
  assert.equal(canEditCutOffGradeNi('OWNER'), true);
  assert.equal(canEditCutOffGradeNi('APP_ADMIN'), true);
  assert.equal(canEditCutOffGradeNi('USER'), false);
});

test('cut-off validation normalizes numeric input and rejects missing, non-finite, negative, or inconsistent values', () => {
  assert.deepEqual(normalizeCutOffGradeNi({
    ...DEFAULT_CUT_OFF_GRADE_NI,
    saprolitHGMin: '1.75',
  }), {
    ...DEFAULT_CUT_OFF_GRADE_NI,
    saprolitHGMin: 1.75,
  });
  assert.throws(() => normalizeCutOffGradeNi({
    ...DEFAULT_CUT_OFF_GRADE_NI,
    saprolitHGMin: '',
  }), /wajib diisi/);
  assert.throws(() => normalizeCutOffGradeNi({
    ...DEFAULT_CUT_OFF_GRADE_NI,
    saprolitHGMin: Number.NaN,
  }), /nol atau lebih/);
  assert.throws(() => normalizeCutOffGradeNi({
    ...DEFAULT_CUT_OFF_GRADE_NI,
    wasteOBMax: -0.01,
  }), /nol atau lebih/);
  assert.throws(() => normalizeCutOffGradeNi({
    ...DEFAULT_CUT_OFF_GRADE_NI,
    saprolitHGMin: 1.50,
  }), /tidak konsisten/);
});

test('Limonit Ore may be below or above Saprolit LG and persists after reload', async () => {
  const records = new Map();
  const store = createCutOffGradeNiStore({
    createDocumentRef: (_database, collection, id) => `${collection}/${id}`,
    readDocument: async (path) => ({
      exists: () => records.has(path),
      data: () => records.get(path),
    }),
    writeDocument: async (path, data) => records.set(path, data),
    makeServerTimestamp: () => 'server timestamp',
  });
  const limonitRanges = [
    { min: 0.8, max: 0.89 },
    { min: 1.6, max: 2.0 },
    { min: 2.0, max: 2.5 },
  ];

  for (const range of limonitRanges) {
    const values = {
      ...DEFAULT_CUT_OFF_GRADE_NI,
      saprolitLGMin: 0.9,
      saprolitLGMax: 1.59,
      limonitOreMin: range.min,
      limonitOreMax: range.max,
    };

    await store.save({}, values, 'owner-uid');
    const reloaded = await store.load({});

    assert.equal(reloaded.limonitOreMin, range.min);
    assert.equal(reloaded.limonitOreMax, range.max);
  }
});

test('loaded values persist across reload and are the source for a new edit draft', async () => {
  const records = new Map();
  const store = createCutOffGradeNiStore({
    createDocumentRef: (_database, collection, id) => `${collection}/${id}`,
    readDocument: async (path) => ({
      exists: () => records.has(path),
      data: () => records.get(path),
    }),
    writeDocument: async (path, data) => records.set(path, data),
    makeServerTimestamp: () => 'server timestamp',
  });

  assert.deepEqual(await store.load({}), DEFAULT_CUT_OFF_GRADE_NI);
  const updated = { ...DEFAULT_CUT_OFF_GRADE_NI, saprolitHGMin: 1.70 };
  await store.save({}, updated, 'owner-uid');
  const reloaded = await store.load({});
  assert.deepEqual(reloaded, updated);
  assert.equal(records.get('appSettings/cutOffGradeNi').updatedBy, 'owner-uid');
  assert.equal(records.get('appSettings/cutOffGradeNi').updatedAt, 'server timestamp');

  let state = cutOffGradeNiReducer(createCutOffGradeNiState(), { type: 'loaded', value: reloaded });
  state = cutOffGradeNiReducer(state, { type: 'edit' });
  assert.deepEqual(state.draft, updated);
});

test('cancel restores saved values and save failure keeps the changed draft editable', () => {
  const saved = { ...DEFAULT_CUT_OFF_GRADE_NI, saprolitHGMin: 1.70 };
  let state = cutOffGradeNiReducer(createCutOffGradeNiState(), { type: 'loaded', value: saved });
  state = cutOffGradeNiReducer(state, { type: 'edit' });
  state = cutOffGradeNiReducer(state, { type: 'change', field: 'saprolitHGMin', value: '1.80' });
  state = cutOffGradeNiReducer(state, { type: 'save-error', message: 'Simpan gagal.' });

  assert.equal(state.editing, true);
  assert.equal(state.draft.saprolitHGMin, '1.80');
  assert.equal(state.error, 'Simpan gagal.');

  state = cutOffGradeNiReducer(state, { type: 'cancel' });
  assert.equal(state.editing, false);
  assert.equal(state.draft.saprolitHGMin, 1.70);
});

test('save success locks the editor and reports confirmation', () => {
  let state = cutOffGradeNiReducer(createCutOffGradeNiState(), { type: 'edit' });
  const updated = { ...DEFAULT_CUT_OFF_GRADE_NI, saprolitHGMin: 1.75 };
  state = cutOffGradeNiReducer(state, { type: 'change', field: 'saprolitHGMin', value: '1.75' });
  state = cutOffGradeNiReducer(state, { type: 'save-start' });
  state = cutOffGradeNiReducer(state, { type: 'save-success', value: updated });

  assert.equal(state.editing, false);
  assert.equal(state.saving, false);
  assert.deepEqual(state.saved, updated);
  assert.equal(state.notice, 'Cut-Off Grade Ni berhasil disimpan.');
});

test('Firestore rules allow active users to read but only active OWNER and APP_ADMIN to write', () => {
  const settingsRules = firestoreRules.match(/match \/appSettings\/cutOffGradeNi\s*\{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(settingsRules);
  assert.match(settingsRules, /allow get: if isActiveUser\(\)[\s\S]*currentUserRole\(\) in \['OWNER', 'APP_ADMIN', 'USER'\]/);
  assert.match(settingsRules, /allow create, update: if \(isOwner\(\) \|\| isAppAdmin\(\)\)[\s\S]*validCutOffGradeNi\(request\.resource\.data\)/);
  assert.doesNotMatch(firestoreRules, /data\.wasteOBMax <= data\.limonitOreMin/);
  assert.doesNotMatch(firestoreRules, /data\.limonitOreMax < data\.saprolitLGMin/);
  assert.match(settingsRules, /allow list, delete: if false/);
  assert.match(firestoreRules, /function isActiveUser\(\)[\s\S]*isSignedIn\(\)[\s\S]*status == 'ACTIVE'/);
  assert.doesNotMatch(firestoreRules, /request\.auth\.token/);
});