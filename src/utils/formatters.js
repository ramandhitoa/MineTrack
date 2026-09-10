// ============================================================
// HELPER FORMATTER
// Fungsi kecil yang dipakai bersama oleh banyak halaman.
// ============================================================

export const fmt = (value) => new Intl.NumberFormat('id-ID').format(Number(value) || 0);

export const dateFmt = (value) => (value ? value.split('-').reverse().join('/') : '-');

export const materialClass = (material) => {
  if (material === 'Saprolite') return 'hg';
  if (material === 'Limonite') return 'lim';
  return 'ob';
};

export const calculateShiftHours = (startTime, stopTime) => {
  if (!startTime || !stopTime) return 0;

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [stopHour, stopMinute] = stopTime.split(':').map(Number);

  let hours = stopHour + stopMinute / 60 - startHour - startMinute / 60;
  if (hours < 0) hours += 24;

  return hours;
};

export const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
