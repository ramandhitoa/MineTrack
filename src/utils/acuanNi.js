export const ACUAN_NI_SPREADSHEET_INDEX = 16;

const acuanNiAliases = ['niGrade', 'Acuan Ni%', 'Acuan Ni', 'acuanNi', 'ni'];

export function parseAcuanNiValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== 'string') return null;

  const text = value.trim().replace(/%/g, '').replace(/\s+/g, '');
  if (!text) return null;

  const normalized = text.replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function formatAcuanNiValue(value) {
  const parsed = parseAcuanNiValue(value);
  return parsed === null ? '-' : `${parsed.toFixed(2)}%`;
}

export function readAcuanNiFromSpreadsheetRow(row) {
  if (Array.isArray(row)) {
    return parseAcuanNiValue(row[ACUAN_NI_SPREADSHEET_INDEX]);
  }

  if (!row || typeof row !== 'object') return null;

  for (const field of acuanNiAliases) {
    const parsed = parseAcuanNiValue(row[field]);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function normalizeProductionNiRecord(record) {
  if (Array.isArray(record)) {
    const date = String(record[0] ?? '').trim();
    const shift = String(record[2] ?? '').trim();
    const pit = String(record[3] ?? '').trim();
    const dumpingArea = String(record[4] ?? '').trim();
    const sublot = String(record[5] ?? '').trim();
    const submissionTimestamp = String(record[18] ?? '').trim();

    return {
      id: `gs-${date}-${shift}-${pit}-${dumpingArea}-${sublot}-${submissionTimestamp}`,
      date,
      block: String(record[1] ?? ''),
      shift,
      pit,
      dumpingArea,
      sublot,
      ritPrevious: 0,
      ritToday: Number(record[6]) || 0,
      ritTotal: Number(record[6]) || 0,
      status: String(record[7] ?? ''),
      blockModel: String(record[8] ?? ''),
      sampleRef: String(record[9] ?? ''),
      drillHole: String(record[10] ?? ''),
      elevation: String(record[11] ?? ''),
      loadingMethod: String(record[12] ?? ''),
      material: String(record[13] || 'Saprolit'),
      equipment: String(record[14] || '').split(',').map((value) => value.trim()).filter(Boolean),
      tonnage: Number(record[15]) || 0,
      niGrade: readAcuanNiFromSpreadsheetRow(record),
      reporterName: String(record[17] ?? '').trim(),
      submissionTimestamp,
    };
  }

  if (!record || typeof record !== 'object') return record;
  return { ...record, niGrade: readAcuanNiFromSpreadsheetRow(record) };
}

export function normalizeAcuanNiGroupKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function groupAcuanNiAverages(records, getGroupKey) {
  const totals = new Map();

  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record || typeof record !== 'object') return;

    const key = normalizeAcuanNiGroupKey(getGroupKey(record));
    const value = parseAcuanNiValue(record.niGrade);
    if (!key || value === null) return;

    const total = totals.get(key) || { sum: 0, count: 0 };
    total.sum += value;
    total.count += 1;
    totals.set(key, total);
  });

  return new Map([...totals].map(([key, total]) => [key, total.sum / total.count]));
}

export function getProductionMonthKey(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const yearFirst = text.match(/^(\d{4})[-/](\d{1,2})/);
  if (yearFirst) {
    const month = Number(yearFirst[2]);
    return month >= 1 && month <= 12 ? `${yearFirst[1]}-${String(month).padStart(2, '0')}` : null;
  }

  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dayFirst) {
    const month = Number(dayFirst[2]);
    return month >= 1 && month <= 12 ? `${dayFirst[3]}-${String(month).padStart(2, '0')}` : null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getProductionWeekKey(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  let year;
  let month;
  let day;
  const yearFirst = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);

  if (yearFirst) {
    [, year, month, day] = yearFirst;
  } else if (dayFirst) {
    [, day, month, year] = dayFirst;
  } else {
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

  const dayOfWeek = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));
  return date.toISOString().slice(0, 10);
}