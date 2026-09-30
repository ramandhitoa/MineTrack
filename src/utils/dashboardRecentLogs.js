import { toWitaDateInput } from './formatters.js';

function makeDateKey(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return null;

  return date.toISOString().slice(0, 10);
}

export function getProductionDateKey(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toWitaDateInput(value);
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  const yearFirst = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(.*)$/);
  if (yearFirst) {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(yearFirst[4]);
    if (hasTimezone) {
      const timestamp = new Date(text);
      return Number.isNaN(timestamp.getTime()) ? null : toWitaDateInput(timestamp);
    }
    return makeDateKey(yearFirst[1], yearFirst[2], yearFirst[3]);
  }

  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dayFirst) return makeDateKey(dayFirst[3], dayFirst[2], dayFirst[1]);

  const timestamp = new Date(text);
  return Number.isNaN(timestamp.getTime()) ? null : toWitaDateInput(timestamp);
}

function getPreviousDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function getRecentProductionLogs(logs, today = toWitaDateInput()) {
  const endDate = getProductionDateKey(today);
  if (!endDate) return [];
  const startDate = getPreviousDateKey(endDate);

  return (Array.isArray(logs) ? logs : [])
    .map((log, index) => ({ log, index, date: getProductionDateKey(log?.date) }))
    .filter(({ date }) => date && date >= startDate && date <= endDate)
    .sort((left, right) => right.date.localeCompare(left.date) || left.index - right.index)
    .map(({ log }) => log);
}