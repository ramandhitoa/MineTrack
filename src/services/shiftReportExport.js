import { buildShiftReportWhatsAppText } from '../utils/shiftReportActions.js';

const CANVAS_WIDTH = 1080;
const OUTER_PADDING = 52;
const CONTENT_WIDTH = CANVAS_WIDTH - OUTER_PADDING * 2;

function wrapText(context, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    if (context.measureText(word).width > maxWidth) {
      if (line) {
        lines.push(line);
        line = '';
      }
      let segment = '';
      [...word].forEach((character) => {
        if (segment && context.measureText(`${segment}${character}`).width > maxWidth) {
          lines.push(segment);
          segment = character;
        } else {
          segment += character;
        }
      });
      line = segment;
      return;
    }

    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function dataUrlToBlob(dataUrl) {
  const [metadata, encoded] = dataUrl.split(',');
  const mimeType = metadata.match(/^data:(.*?);base64$/)?.[1];
  if (!mimeType || !encoded) throw new Error('Gambar laporan gagal dibuat.');

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function downloadShiftReportJpg(report) {
  const mimeType = 'image/jpeg';
  const messageLines = buildShiftReportWhatsAppText(report).split('\n');
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas tidak tersedia pada browser ini.');

  const sectionTitles = new Set(['HASIL PRODUKSI', 'ORE GETTING']);
  let inHeader = true;
  const entries = messageLines.map((text) => {
    const isTitle = text === 'HASIL KERJA SHIFT';
    const isSection = sectionTitles.has(text);
    if (isSection) inHeader = false;
    const isBlank = !text;
    const isDetail = /^\s+/.test(text);
    const kind = isBlank ? 'blank' : isTitle ? 'title' : isSection ? 'section' : inHeader ? 'metadata' : isDetail ? 'detail' : /^•\s/.test(text) ? 'bullet' : 'production';
    const font = {
      title: '700 36px Arial, sans-serif',
      metadata: '400 25px Arial, sans-serif',
      section: '700 27px Arial, sans-serif',
      production: '700 22px Arial, sans-serif',
      detail: '400 22px Arial, sans-serif',
      bullet: '400 22px Arial, sans-serif',
    }[kind];
    const lineHeight = { title: 48, metadata: 36, section: 38, production: 32, detail: 30, bullet: 32, blank: 15 }[kind];
    const indent = kind === 'detail' ? 26 : kind === 'bullet' ? 8 : 0;
    let wrapped = [];
    if (!isBlank) {
      context.font = font;
      wrapped = wrapText(context, text.trim(), CONTENT_WIDTH - 56 - indent);
    }
    return { kind, textLines: wrapped, lineHeight, indent };
  });

  const headerEnd = entries.findIndex((entry) => entry.kind === 'section');
  const headerEntries = entries.slice(0, headerEnd < 0 ? entries.length : headerEnd);
  const headerHeight = 28 + headerEntries.reduce((height, entry) => height + (entry.kind === 'blank' ? entry.lineHeight : entry.textLines.length * entry.lineHeight), 0) + 24;
  const bodyEntries = entries.slice(headerEntries.length);
  const bodyHeight = bodyEntries.reduce((height, entry) => height + (entry.kind === 'blank' ? entry.lineHeight : entry.textLines.length * entry.lineHeight) + (entry.kind === 'section' ? 10 : 0), 0);
  const totalHeight = OUTER_PADDING * 2 + headerHeight + bodyHeight + 28;
  canvas.height = totalHeight;

  context.fillStyle = '#f1f5f9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#102a43';
  context.fillRect(OUTER_PADDING, OUTER_PADDING, CONTENT_WIDTH, headerHeight);
  context.fillStyle = '#ffffff';
  context.fillRect(OUTER_PADDING, OUTER_PADDING + headerHeight, CONTENT_WIDTH, bodyHeight + 28);

  let y = OUTER_PADDING + 38;
  entries.forEach((entry) => {
    if (entry.kind === 'blank') {
      y += entry.lineHeight;
      return;
    }
    const color = entry.kind === 'title' || entry.kind === 'metadata'
      ? '#ffffff'
      : entry.kind === 'section' ? '#0f766e' : '#1f2937';
    context.fillStyle = color;
    context.font = {
      title: '700 36px Arial, sans-serif',
      metadata: '400 25px Arial, sans-serif',
      section: '700 27px Arial, sans-serif',
      production: '700 22px Arial, sans-serif',
      detail: '400 22px Arial, sans-serif',
      bullet: '400 22px Arial, sans-serif',
    }[entry.kind];
    entry.textLines.forEach((line) => {
      context.fillText(line, OUTER_PADDING + 28 + entry.indent, y);
      y += entry.lineHeight;
    });
    if (entry.kind === 'section') y += 10;
  });

  let blob = null;
  if (typeof canvas.toBlob === 'function') {
    blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result), mimeType, 0.95);
    });
  }
  if (!blob) blob = dataUrlToBlob(canvas.toDataURL(mimeType, 0.95));
  const filenamePit = String(report.pitLabel || report.canonicalPit || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const filename = `hasil-kerja-shift-${report.date}-${filenamePit}.jpg`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}