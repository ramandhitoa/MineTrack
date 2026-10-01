import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  formatAcuanNiValue,
  getProductionMonthKey,
  getProductionWeekKey,
  groupAcuanNiAverages,
  normalizeProductionNiRecord,
  normalizeAcuanNiGroupKey,
  parseAcuanNiValue,
  readAcuanNiFromSpreadsheetRow,
} from './acuanNi.js';
import {
  aggregateLoadingMethod,
  aggregateProduction,
  getLoadingPeriods,
} from './dashboardAggregations.js';

const reports = [
  { niGrade: 1.6, dumpingArea: 'DMP-001', pit: 'PIT BETA', date: '2026-09-28' },
  { niGrade: 1.4, dumpingArea: 'DMP-001', pit: 'PIT BETA', date: '2026-09-29' },
  { niGrade: 1.8, dumpingArea: 'DMP-001', pit: 'PIT BETA', date: '2026-09-30' },
];
const dashboardSource = readFileSync(new URL('../pages/Dashboard.jsx', import.meta.url), 'utf8');
const dashboardAggregationSource = readFileSync(new URL('./dashboardAggregations.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const offlineSyncSource = readFileSync(new URL('../services/offlineSync.js', import.meta.url), 'utf8');
const monthlySource = readFileSync(new URL('../pages/Monthly.jsx', import.meta.url), 'utf8');
const googleSheetsSource = readFileSync(new URL('../services/googleSheetsService.js', import.meta.url), 'utf8');
const appsScriptSource = readFileSync(new URL('../../google-apps-script/Code.gs', import.meta.url), 'utf8');

const assertAverage = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);

test('Acuan Ni accepts comma/dot decimals and preserves numeric values', () => {
  for (const [input, expected] of [
    ['1,6', 1.6],
    ['1.6', 1.6],
    ['1,60', 1.6],
    ['1.60', 1.6],
    [1.6, 1.6],
    [' 1,49 ', 1.49],
    ['1.10', 1.1],
  ]) {
    assert.equal(parseAcuanNiValue(input), expected);
  }

  assert.equal(parseAcuanNiValue(''), null);
  assert.equal(parseAcuanNiValue('invalid'), null);
  assert.equal(parseAcuanNiValue(Number.NaN), null);
  assert.equal(formatAcuanNiValue(1.6), '1.60%');
  assert.equal(formatAcuanNiValue(null), '-');
});

test('Google Sheets rows and named records map Acuan Ni to numeric niGrade', () => {
  const sheetRow = Array(19).fill('');
  sheetRow[16] = '1,6';
  assert.equal(normalizeProductionNiRecord(sheetRow).niGrade, 1.6);
  sheetRow[16] = '1.49';
  assert.equal(normalizeProductionNiRecord(sheetRow).niGrade, 1.49);
  sheetRow[16] = '1.10';
  assert.equal(normalizeProductionNiRecord(sheetRow).niGrade, 1.1);
  assert.equal(normalizeProductionNiRecord({ niGrade: '1,6' }).niGrade, 1.6);
  assert.equal(normalizeProductionNiRecord({ niGrade: 1.6 }).niGrade, 1.6);
  assert.equal(readAcuanNiFromSpreadsheetRow({ 'Acuan Ni%': '1,6' }), 1.6);
  assert.equal(readAcuanNiFromSpreadsheetRow({ niGrade: '' }), null);
  assert.equal(readAcuanNiFromSpreadsheetRow(Array(16).fill('')), null);
});

test('dumping and pit averages use every valid record and update when records are added', () => {
  const byDumping = groupAcuanNiAverages(reports, (report) => report.dumpingArea);
  const byPit = groupAcuanNiAverages(reports, (report) => report.pit);
  assertAverage(byDumping.get('dmp-001'), 1.6);
  assertAverage(byPit.get('pit beta'), 1.6);

  const withNewRecord = [...reports, { ...reports[0], niGrade: 1.8 }];
  assertAverage(groupAcuanNiAverages(withNewRecord, (report) => report.dumpingArea).get('dmp-001'), 1.65);
  assertAverage(groupAcuanNiAverages(withNewRecord, (report) => report.pit).get('pit beta'), 1.65);
});

test('invalid Acuan Ni values are excluded and pits remain separate', () => {
  const data = [
    ...reports,
    { ...reports[0], niGrade: null },
    { ...reports[0], niGrade: '' },
    { ...reports[0], niGrade: Number.NaN },
    { ...reports[0], niGrade: 'not numeric' },
    { niGrade: 1.2, pit: 'PIT ALPHA', dumpingArea: 'DMP-002' },
    { niGrade: 1.0, pit: 'PIT ALPHA', dumpingArea: 'DMP-002' },
  ];
  const byPit = groupAcuanNiAverages(data, (report) => report.pit);
  assertAverage(byPit.get('pit beta'), 1.6);
  assertAverage(byPit.get('pit alpha'), 1.1);
  assertAverage(groupAcuanNiAverages(data, (report) => report.dumpingArea).get('dmp-002'), 1.1);
});

test('weekly and monthly averages include only records in each pit-period group', () => {
  const periodData = [
    { niGrade: 1.6, pit: 'PIT BETA', dumpingArea: 'DMP-001', date: '2026-09-28' },
    { niGrade: 1.4, pit: 'PIT BETA', dumpingArea: 'DMP-001', date: '2026-09-29' },
    { niGrade: 9.9, pit: 'PIT BETA', dumpingArea: 'DMP-001', date: '2026-10-05' },
  ];

  const weekly = groupAcuanNiAverages(periodData, (report) => `${getProductionWeekKey(report.date)}|${report.pit}`);
  const monthly = groupAcuanNiAverages(periodData, (report) => `${getProductionMonthKey(report.date)}|${report.pit}`);

  assert.equal(getProductionWeekKey('2026-09-28'), '2026-09-28');
  assert.equal(getProductionWeekKey('29/09/2026'), '2026-09-28');
  assert.equal(getProductionMonthKey('2026-09-29'), '2026-09');
  assert.equal(getProductionMonthKey('29/09/2026'), '2026-09');
  assert.equal(weekly.get('2026-09-28|pit beta'), 1.5);
  assert.equal(monthly.get('2026-09|pit beta'), 1.5);
  assert.equal(weekly.get('2026-10-05|pit beta'), 9.9);
  assert.equal(monthly.get('2026-10|pit beta'), 9.9);
});

test('Monthly grouping, average keys, and rendering all use getProductionMonthKey output', () => {
  assert.match(monthlySource, /const month = getProductionMonthKey\(log\.date\)/);
  assert.match(monthlySource, /const monthPitKey = normalizeAcuanNiGroupKey\(`\$\{month\}\|\$\{log\.pit\}`\)/);
  assert.equal(normalizeAcuanNiGroupKey('2026-09|PIT BETA'), '2026-09|pit beta');
  assert.match(monthlySource, /niAveragesByMonthPit\.get\(item\.monthPitKey\)/);
  assert.doesNotMatch(monthlySource, /log\.date\??\.slice\(0, 7\)/);
});

test('Dashboard displays five recent rows but calculates Ni average from all logs', () => {
  const logs = Array.from({ length: 100 }, (_, index) => ({
    niGrade: index < 5 ? 1 : 2,
    dumpingArea: 'DMP-001',
  }));
  const displayedLogs = logs.slice(0, 5);
  const average = groupAcuanNiAverages(logs, (log) => log.dumpingArea).get('dmp-001');

  assert.equal(displayedLogs.length, 5);
  assertAverage(average, 1.95);
  assert.match(dashboardSource, /<LogTable logs=\{logs\.slice\(0, 5\)\} averageLogs=\{logs\} \/>/);
});

test('Dashboard refresh replaces its dataset even when Google Sheets returns no rows', () => {
  assert.ok((appSource.match(/setLogs\(remoteLogs\)/g) || []).length >= 3);
  assert.doesNotMatch(appSource, /remoteLogs\.length\s*>\s*0\)\s*setLogs\(remoteLogs\)/);
  assert.match(appSource, /const metrics = useMemo\(\(\) => \{[\s\S]*?\}, \[logs\]\);/);
  assert.match(appSource, /const chartData = useMemo\(\(\) => \([\s\S]*?\), \[logs\]\);/);
  assert.match(appSource, /const loadingStats = useMemo\(\(\) => \{[\s\S]*?\}, \[logs\]\);/);
});

test('Apps Script and Sheets template read/write Acuan Ni through the locale-aware parser', () => {
  for (const source of [googleSheetsSource, appsScriptSource]) {
    assert.match(source, /Acuan Ni%/);
    assert.match(source, /parseAcuanNiValue_\(item\.niGrade\)\s*\?\?\s*''/);
    assert.match(source, /parseAcuanNiValue_\(\s*row\[acuanNiIndex\]\s*\)/);
    assert.match(source, /replace\(',', '\.'\)/);
  }
});