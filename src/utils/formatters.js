// ============================================================
// HELPER FORMATTER
// Fungsi kecil yang dipakai bersama oleh banyak halaman.
// ============================================================

export const fmt = (value) => new Intl.NumberFormat('id-ID').format(Number(value) || 0);

export const toWitaDateInput = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

export const formatWitaDate = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

export const formatWitaTime = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

export const dateFmt = (value) => (value ? value.split('-').reverse().join('/') : '-');

export const materialClass = (material) => {
  const normalized = String(material || '').trim();
  if (normalized === 'Saprolit' || normalized === 'Saprolite') return 'hg';
  if (normalized === 'Limonit' || normalized === 'Limonite') return 'lim';
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
