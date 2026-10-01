export function formatReporterName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('id-ID') + word.slice(1).toLocaleLowerCase('id-ID'))
    .join(' ');
}