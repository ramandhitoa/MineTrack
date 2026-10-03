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

function formatOreGettingRecord(record) {
  return [
    ['ID METODE', record.idMetode],
    ['Acuan', record.acuan],
    ['BM', record.blockModel],
    ['TB', record.titikBor],
    ['Elv', record.elevasi],
  ].map(([label, value]) => `${label}: ${String(value ?? '').trim() || '-'}`).join(' | ');
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
  const oreGetting = report.oreGetting.map(formatOreGettingRecord);
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
  const oreGettingLines = report.oreGetting.map(formatOreGettingRecord);
  lines.push('', 'ORE GETTING', ...oreGettingLines.map((line) => `• ${line}`));
  return lines.join('\n');
}