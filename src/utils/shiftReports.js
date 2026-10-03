import { getProductionDateKey } from './dashboardRecentLogs.js';
import { getShiftPitLabel } from './oreGetting.js';

function normalizeGroupValue(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function getReportGroup(record) {
  const date = getProductionDateKey(record?.date);
  if (!date) return null;

  const shift = String(record.shift || 'Tanpa Shift').trim();
  const canonicalPit = String(record.pit || record.areaPit || 'Tanpa PIT').trim();
  const pitKey = normalizeGroupValue(getShiftPitLabel(canonicalPit));
  const key = JSON.stringify([date, normalizeGroupValue(shift), pitKey]);

  return {
    date,
    month: date.slice(0, 7),
    shift,
    pitKey,
    canonicalPit,
    key,
  };
}

function oreGettingSignature(record) {
  return JSON.stringify([
    getProductionDateKey(record.date),
    normalizeGroupValue(record.areaPit),
    normalizeGroupValue(record.shift),
    normalizeGroupValue(record.metode),
    normalizeGroupValue(record.idMetode),
    normalizeGroupValue(record.acuan),
    normalizeGroupValue(record.titikBor),
    normalizeGroupValue(record.blockModel),
    normalizeGroupValue(record.elevasi),
    String(record.jumlahSampel ?? ''),
    String(record.submissionTimestamp || record.createdAt || ''),
  ]);
}

export function mergeOreGettingRecords(...recordGroups) {
  const recordsBySignature = new Map();
  recordGroups.forEach((records) => {
    (Array.isArray(records) ? records : []).forEach((record) => {
      recordsBySignature.set(oreGettingSignature(record), record);
    });
  });
  return [...recordsBySignature.values()];
}

export function getShiftReportSourceId(type, record) {
  const stableId = record?.recordId ?? record?.id;
  if (stableId !== null && stableId !== undefined && stableId !== '') {
    return `${type}:${stableId}`;
  }

  const fields = type === 'production'
    ? ['date', 'shift', 'pit', 'sublot', 'blockModel', 'sampleRef', 'drillHole', 'submissionTimestamp']
    : ['date', 'shift', 'areaPit', 'metode', 'idMetode', 'acuan', 'titikBor', 'blockModel', 'elevasi', 'jumlahSampel', 'submissionTimestamp'];

  return `${type}:${JSON.stringify(fields.map((field) => record?.[field] ?? ''))}`;
}

export function buildShiftReports(productionRecords = [], oreGettingRecords = []) {
  const groups = new Map();
  const addRecord = (type, record) => {
    const group = getReportGroup(record);
    if (!group) return;

    let report = groups.get(group.key);
    if (!report) {
      report = {
        ...group,
        id: group.key,
        pitLabel: getShiftPitLabel(group.canonicalPit),
        production: [],
        oreGetting: [],
      };
      groups.set(group.key, report);
    }
    report[type].push(record);
  };

  (Array.isArray(productionRecords) ? productionRecords : []).forEach((record) => {
    addRecord('production', record);
  });

  const seenOreGetting = new Set();
  (Array.isArray(oreGettingRecords) ? oreGettingRecords : []).forEach((record) => {
    const signature = oreGettingSignature(record);
    if (seenOreGetting.has(signature)) return;
    seenOreGetting.add(signature);
    addRecord('oreGetting', record);
  });

  return [...groups.values()].sort((left, right) => (
    right.date.localeCompare(left.date)
    || left.shift.localeCompare(right.shift, 'id')
    || left.pitLabel.localeCompare(right.pitLabel, 'id')
  ));
}

export function filterShiftReports(reports, { startDate = '', endDate = '', shift = '', pit = '' } = {}) {
  const pitKey = normalizeGroupValue(pit ? getShiftPitLabel(pit) : '');
  return reports.filter((report) => (
    (!startDate || report.date >= startDate)
    && (!endDate || report.date <= endDate)
    && (!shift || report.shift === shift)
    && (!pitKey || report.pitKey === pitKey)
  ));
}