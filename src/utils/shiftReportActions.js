import { getShiftPitLabel } from './oreGetting.js';
import { getProductionDateKey } from './dashboardRecentLogs.js';

const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

function displayNumber(value) {
  return numberFormat.format(Number(value) || 0);
}

function formatReportDate(date) {
  const key = getProductionDateKey(date);
  if (!key) return '-';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

export function canDeleteShiftReport(role) {
  return role === 'OWNER' || role === 'APP_ADMIN';
}

export function getShiftReportContent(report) {
  const production = report.production.map((record) => {
    const name = record.sublot || record.blockModel || 'Laporan Production';
    const ni = record.niGrade == null || record.niGrade === '' ? '-' : `${record.niGrade}%`;
    return `${name}: ${displayNumber(record.ritToday)} rit, ${displayNumber(record.tonnage)} MT, Ni ${ni}`;
  });
  const oreGetting = report.oreGetting.map((record) => (
    `${record.metode || '-'} ${record.idMetode || ''}: Acuan ${record.acuan || '-'}, Titik Bor ${record.titikBor || '-'}, Block Model ${record.blockModel || '-'}, Elevasi ${record.elevasi || '-'}, Sampel ${record.jumlahSampel ?? '-'}`
  ));
  const totalTonnage = report.production.reduce((total, record) => total + (Number(record.tonnage) || 0), 0);
  const totalSamples = report.oreGetting.reduce((total, record) => total + (Number(record.jumlahSampel) || 0), 0);

  return {
    title: 'HASIL KERJA SHIFT',
    date: formatReportDate(report.date),
    shift: report.shift || '-',
    pit: getShiftPitLabel(report.canonicalPit || report.pitLabel || ''),
    production,
    oreGetting,
    totalTonnage: displayNumber(totalTonnage),
    totalSamples: displayNumber(totalSamples),
  };
}

function getWhatsAppValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || text === '-') return '';
  const numericValue = Number(text.replace(',', '.').replace(/%$/, ''));
  return Number.isFinite(numericValue) && numericValue === 0 ? '' : text;
}

function getIdMetodeLines(records) {
  const uniqueIds = new Set();
  const output = [];
  const methodGroups = new Map();

  records.forEach((record) => {
    let id = String(record.idMetode ?? '').trim().replace(/\s+/g, ' ');
    if (!id) return;
    while (/^(CEK|PSI|CH|TP|HS)\s+\1\s+/i.test(id)) {
      id = id.replace(/^(CEK|PSI|CH|TP|HS)\s+/i, '');
    }
    if (uniqueIds.has(id.toLocaleLowerCase())) return;
    uniqueIds.add(id.toLocaleLowerCase());

    const numericMethod = id.match(/^(CH|TP|HS)\s+(.+)$/i);
    if (numericMethod) {
      const idMethod = numericMethod[1].toUpperCase();
      const parts = numericMethod[2].split(',').map((part) => part.trim());
      const intervals = parts.map((part) => {
        const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        return match ? { start: Number(match[1]), end: Number(match[2]) || Number(match[1]) } : null;
      });
      if (intervals.every(Boolean)) {
        let group = methodGroups.get(idMethod);
        if (!group) {
          group = { method: idMethod, intervals: [] };
          methodGroups.set(idMethod, group);
          output.push(group);
        }
        group.intervals.push(...intervals);
        return;
      }
    }

    output.push(id);
  });

  return output.flatMap((item) => {
    if (typeof item === 'string') return [item];
    const sorted = item.intervals.sort((left, right) => left.start - right.start || left.end - right.end);
    const ranges = [];
    sorted.forEach((interval) => {
      const previous = ranges[ranges.length - 1];
      if (previous && interval.start <= previous.end + 1) {
        previous.end = Math.max(previous.end, interval.end);
      } else {
        ranges.push({ ...interval });
      }
    });
    return ranges.map(({ start, end }) => (
      start === end ? `${item.method} ${start}` : `${item.method} ${start}-${end}`
    ));
  });
}

export function buildShiftReportWhatsAppText(report) {
  const date = getWhatsAppValue(formatReportDate(report.date));
  const shift = getWhatsAppValue(report.shift);
  const pit = getWhatsAppValue(getShiftPitLabel(report.canonicalPit || report.pitLabel || ''));
  const lines = ['HASIL KERJA SHIFT'];
  if (date) lines.push(`Tanggal: ${date}`);
  if (shift) lines.push(`Shift: ${shift}`);
  if (pit) lines.push(`Area PIT: ${pit}`);

  let productionIndex = 0;
  const productionLines = report.production.flatMap((record) => {
    const fields = [
      ['Dumpingan', record.dumpingArea],
      ['Acuan Ni', (() => {
        const ni = getWhatsAppValue(record.niGrade);
        return ni && !ni.endsWith('%') ? `${ni}%` : ni;
      })()],
      ['Acuan', record.sampleRef],
      ['Material', record.material],
      ['Ritase', record.ritToday],
    ].filter(([, value]) => getWhatsAppValue(value));

    if (!fields.length) return [];
    productionIndex += 1;
    return [
      `${productionIndex}. ${fields[0][0]}: ${getWhatsAppValue(fields[0][1])}`,
      ...fields.slice(1).map(([label, value]) => `   ${label}: ${getWhatsAppValue(value)}`),
    ];
  });

  lines.push('', 'HASIL PRODUKSI', ...productionLines);
  const oreGettingIds = getIdMetodeLines(report.oreGetting);
  lines.push('', 'ORE GETTING', ...oreGettingIds.map((id) => `• ${id}`));
  return lines.join('\n');
}