// ============================================================
// SERVICE EXPORT & CLIPBOARD
// Semua fungsi terkait Excel/CSV/clipboard diletakkan di sini.
// ============================================================

import { csvEscape } from '../utils/formatters';

export const HEADERS_21 = [
  'Tanggal', 'Shift', 'Area Pit', 'Alat Berat', 'Area Dumpingan',
  'BlockModel', 'Acuan Sample', 'Titik Bor', 'Elevasi RL', 'Loading Method',
  'Material', 'Sublot', 'Start Time', 'Stop Time', 'Rit Sebelum',
  'Rit Hari Ini', 'Total Ritase', 'Tonase MT', 'Ni %', 'Fe %', 'MC %',
];

export const logsToRows = (logs) => logs.map((log) => [
  log.date, log.shift, log.pit, (log.equipment || []).join('; '),
  log.dumpingArea, log.blockModel, log.sampleRef || '', log.drillHole,
  log.elevation, log.loadingMethod, log.material, log.sublot,
  log.startTime, log.stopTime, log.ritPrevious, log.ritToday,
  log.ritTotal, log.tonnage, log.niGrade || '', log.feGrade || '', log.mc || '',
]);

export const copyLogsAsTSV = async (logs) => {
  const text = [HEADERS_21, ...logsToRows(logs)]
    .map((row) => row.join('\t'))
    .join('\n');

  await navigator.clipboard.writeText(text);
};

export const exportLogsAsCSV = (logs) => {
  const csv = [HEADERS_21, ...logsToRows(logs)]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `Laporan_QC_Tambang_Nikel_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
