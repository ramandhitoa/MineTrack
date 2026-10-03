export function getOreGettingAreaLabel(areaPit) {
  return String(areaPit ?? '')
    .trim()
    .replace(/^Pit\s+/i, '')
    .replace(/^AKP ([61])$/i, 'AKP$1');
}

export function getShiftPitLabel(areaPit) {
  const label = getOreGettingAreaLabel(areaPit);
  return label === 'Rantapao Extend' ? 'Rantepao Extend' : label;
}

function normalizeSampleNumber(value, allowRange) {
  const sample = String(value ?? '').trim();
  if (!sample) return '';
  if (!allowRange) return /^\d+$/.test(sample) ? sample : '';

  const range = sample.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return `${range[1]}-${range[2]}`;
  if (/^\d+$/.test(sample)) return sample;

  const numbers = sample.split(',').map((number) => number.trim());
  if (numbers.some((number) => !/^\d+$/.test(number))) return '';

  const values = numbers.map(Number);
  const isConsecutive = values.length > 1
    && values.every((number, index) => (
      Number.isSafeInteger(number)
      && (index === 0 || number === values[index - 1] + 1)
    ));

  return isConsecutive
    ? `${numbers[0]}-${numbers[numbers.length - 1]}`
    : numbers.join(',');
}

export function formatOreGettingMethodId({ areaPit, metode, sampleNumber }) {
  const method = String(metode ?? '').trim().toUpperCase();
  const allowRange = ['CH', 'TP', 'HS'].includes(method);
  const sample = normalizeSampleNumber(sampleNumber, allowRange);

  if (!method || !sample) return '';
  const area = getOreGettingAreaLabel(areaPit);
  if (method === 'CEK' || method === 'PSI') {
    const areaKey = area.toLocaleLowerCase();
    const rantepaoPrefix = {
      'rantepao selatan': 'RTP_S',
      'rantepao barat': 'RTP_B',
      'rantepao timur': 'RTP_T',
      'rantepao extend': 'RTP_EXT',
      'rantapao extend': 'RTP_EXT',
    }[areaKey];
    const prefix = rantepaoPrefix || area;
    return prefix ? `${prefix}_${method}_${sample}` : '';
  }
  if (['CH', 'TP', 'HS'].includes(method)) return `${method} ${sample}`;
  return '';
}