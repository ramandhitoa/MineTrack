import { getProductionMonthKey, getProductionWeekKey, parseAcuanNiValue } from './acuanNi.js';

function getDailyKey(value) {
  const text = String(value ?? '').trim();
  const yearFirst = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  let year;
  let month;
  let day;

  if (yearFirst) [, year, month, day] = yearFirst;
  else if (dayFirst) [, day, month, year] = dayFirst;
  else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth() + 1;
    day = parsed.getUTCDate();
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return null;

  return date.toISOString().slice(0, 10);
}

function getPeriodKey(date, period) {
  if (period === 'weekly') return getProductionWeekKey(date);
  if (period === 'monthly') return getProductionMonthKey(date);
  return getDailyKey(date);
}

export function formatPeriodLabel(key, period) {
  if (period === 'monthly') {
    const [year, month] = key.split('-');
    return `${month}/${year}`;
  }
  const [year, month, day] = key.split('-');
  const dateLabel = `${day}/${month}/${year}`;
  return period === 'weekly' ? `Minggu ${dateLabel}` : dateLabel;
}

export function aggregateProduction(logs, period) {
  const groups = new Map();

  logs.forEach((log) => {
    const key = getPeriodKey(log.date, period);
    if (!key) return;

    const group = groups.get(key) || { key, rit: 0, niTotal: 0, niCount: 0 };
    group.rit += Number(log.ritToday) || 0;
    const ni = parseAcuanNiValue(log.niGrade);
    if (ni !== null) {
      group.niTotal += ni;
      group.niCount += 1;
    }
    groups.set(key, group);
  });

  return [...groups.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((group) => ({
      name: formatPeriodLabel(group.key, period),
      rit: group.rit,
      ni: group.niCount ? group.niTotal / group.niCount : null,
    }));
}

export function getLoadingPeriods(logs, period) {
  const keys = [...new Set(logs.map((log) => getPeriodKey(log.date, period)).filter(Boolean))];
  return keys.sort((left, right) => right.localeCompare(left));
}

export function aggregateLoadingMethod(logs, period, selectedPeriod) {
  const counts = new Map();
  logs.forEach((log) => {
    if (getPeriodKey(log.date, period) !== selectedPeriod) return;
    const name = String(log.loadingMethod || 'Tidak diketahui').trim() || 'Tidak diketahui';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()].map(([name, value]) => ({ name, value }));
}