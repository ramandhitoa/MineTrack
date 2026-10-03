import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildShiftReports,
  filterShiftReports,
  getShiftReportSourceId,
  mergeOreGettingRecords,
} from './shiftReports.js';
import {
  buildShiftReportWhatsAppText,
  canDeleteShiftReport,
  getShiftReportContent,
} from './shiftReportActions.js';
import { downloadShiftReportJpg } from '../services/shiftReportExport.js';

const pageSource = readFileSync(new URL('../pages/ShiftReports.jsx', import.meta.url), 'utf8');
const constantsSource = readFileSync(new URL('../constants.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const layoutStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const imageExportSource = readFileSync(new URL('../services/shiftReportExport.js', import.meta.url), 'utf8');

test('Shift Reports menu and heading use Report Shift without changing the route', () => {
  assert.match(constantsSource, /\['shift-reports',\s*'Report Shift',\s*Files\]/);
  assert.match(constantsSource, /'shift-reports':\s*'Report Shift'/);
  assert.match(appSource, /activeTab === 'shift-reports' && <ShiftReports/);
});

const production = [
  { recordId: 'prod-older', date: '2026-09-28', shift: 'Shift 1', pit: 'Pit BETA', tonnage: 15 },
  { recordId: 'prod-29-a', date: '2026-09-29', shift: 'Shift 1', pit: 'Pit BETA', tonnage: 30 },
  { recordId: 'prod-29-b', date: '2026-09-29', shift: 'Shift 1', pit: 'Pit BETA', tonnage: 15 },
  { recordId: 'prod-30-b', date: '2026-09-30', shift: 'Shift 1', pit: 'Pit BETA', tonnage: 45 },
  { recordId: 'prod-30-a1m', date: '2026-09-30', shift: 'Shift 1', pit: 'Pit A1M' },
  { recordId: 'prod-30-shift2', date: '2026-09-30', shift: 'Shift 2', pit: 'Pit BETA' },
  { recordId: 'prod-next-month', date: '2026-10-01', shift: 'Shift 1', pit: 'Pit BETA' },
];

const oreGetting = [
  { date: '2026-09-30', shift: 'Shift 1', areaPit: 'Pit BETA', metode: 'CEK', idMetode: 'BETA_CEK_01', submissionTimestamp: '2026-09-30 08:00' },
  { date: '2026-09-30', shift: 'Shift 1', areaPit: 'Pit BETA', metode: 'CEK', idMetode: 'BETA_CEK_01', submissionTimestamp: '2026-09-30 08:00' },
  { date: '2026-09-29', shift: 'Shift 2', areaPit: 'Rantepao Selatan', metode: 'CH', idMetode: 'CH 01' },
];

test('shift report archive groups Production and Ore Getting, sorted by date, shift, then PIT', () => {
  const reports = buildShiftReports(production, oreGetting);

  assert.deepEqual(reports.map(({ date, shift, pitLabel }) => `${date}|${shift}|${pitLabel}`), [
    '2026-10-01|Shift 1|BETA',
    '2026-09-30|Shift 1|A1M',
    '2026-09-30|Shift 1|BETA',
    '2026-09-30|Shift 2|BETA',
    '2026-09-29|Shift 1|BETA',
    '2026-09-29|Shift 2|Rantepao Selatan',
    '2026-09-28|Shift 1|BETA',
  ]);
  const betaReport = reports.find((report) => report.date === '2026-09-30' && report.pitLabel === 'BETA');
  assert.equal(betaReport.production.length, 1);
  assert.equal(betaReport.oreGetting.length, 1);
  assert.equal(betaReport.production[0].pit, 'Pit BETA');
  assert.equal(betaReport.oreGetting[0].areaPit, 'Pit BETA');
});

test('archive filters only change the displayed report set', () => {
  const reports = buildShiftReports(production, oreGetting);
  const before = structuredClone(reports);
  const filtered = filterShiftReports(reports, {
    startDate: '2026-09-29',
    endDate: '2026-09-30',
    shift: 'Shift 1',
    pit: 'Pit BETA',
  });

  assert.deepEqual(filtered.map((report) => report.date), ['2026-09-30', '2026-09-29']);
  assert.deepEqual(reports, before);
  assert.equal(filterShiftReports(reports, { startDate: '2026-09-29', endDate: '2026-09-30' }).length, 5);
});

test('Ore Getting display and share text label stored fields in order and preserve value hyphens', () => {
  const record = {
    metode: 'CEK',
    idMetode: 'A1M_CEK_70',
    acuan: 'TP 1323 (A-C)',
    titikBor: 'C1 3813',
    blockModel: '363',
    elevasi: '56-53',
    jumlahSampel: 99,
  };
  const report = {
    date: '2026-09-30',
    shift: 'Shift 1',
    canonicalPit: 'Pit BETA',
    production: [{ dumpingArea: 'D-1', niGrade: 1.2, sampleRef: 'S-1', material: 'Saprolit', ritToday: 4 }],
    oreGetting: [record],
  };
  const oreLine = 'ID METODE: A1M_CEK_70 | Acuan: TP 1323 (A-C) | BM: 363 | TB: C1 3813 | Block Model: 363 | Elv: 56-53';

  assert.equal(getShiftReportContent(report).oreGetting[0], oreLine);
  assert.ok(buildShiftReportWhatsAppText(report).includes(`• ${oreLine}`));
  assert.doesNotMatch(oreLine, / - /);
  assert.ok(oreLine.includes('TP 1323 (A-C)'));
  assert.ok(oreLine.includes('56-53'));
  assert.ok(buildShiftReportWhatsAppText(report).includes('1. Dumpingan: D-1\n   Acuan Ni: 1.2%\n   Acuan: S-1\n   Material: Saprolit\n   Ritase: 4'));
  assert.ok(buildShiftReportWhatsAppText({
    ...report,
    oreGetting: [{ idMetode: 'A1M_CEK_70', acuan: '   ', blockModel: '', titikBor: 'TB-2', elevasi: ' 56-53 ' }],
  }).includes('• ID METODE: A1M_CEK_70 | Acuan: - | BM: - | TB: TB-2 | Block Model: - | Elv: 56-53'));
  assert.ok(buildShiftReportWhatsAppText({
    ...report,
    oreGetting: [{ idMetode: 'A1M_CEK_70' }],
  }).includes('• ID METODE: A1M_CEK_70 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'));
  assert.equal(
    getShiftReportContent({ ...report, oreGetting: [{ idMetode: 'CH 1' }] }).oreGetting[0],
    'ID METODE: CH 1 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'
  );
  assert.equal(
    getShiftReportContent({
      ...report,
      oreGetting: [{ idMetode: 'A1M_CEK_70', acuan: '   ', blockModel: '', titikBor: 'TB-2', elevasi: ' 56-53 ' }],
    }).oreGetting[0],
    'ID METODE: A1M_CEK_70 | Acuan: - | BM: - | TB: TB-2 | Block Model: - | Elv: 56-53'
  );
  assert.equal(
    getShiftReportContent({ ...report, oreGetting: [{}] }).oreGetting[0],
    'ID METODE: - | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'
  );
});

test('report and source identifiers are stable combinations rather than array positions', () => {
  const [first] = buildShiftReports([production[1]], []);
  const [sameReport] = buildShiftReports([production[1]], []);
  const firstSourceId = getShiftReportSourceId('production', production[1]);
  const secondSourceId = getShiftReportSourceId('production', production[1]);

  assert.equal(first.id, sameReport.id);
  assert.equal(firstSourceId, secondSourceId);
  assert.equal(firstSourceId, 'production:prod-29-a');
});

test('local and remote Ore Getting reports merge without duplicate source rows', () => {
  const merged = mergeOreGettingRecords(oreGetting.slice(0, 1), oreGetting.slice(0, 2));
  const reports = buildShiftReports([], merged);

  assert.equal(merged.length, 1);
  assert.equal(reports[0].oreGetting.length, 1);
  assert.equal(reports[0].month, '2026-09');
});

test('archive deletion confirms and persists only hidden monitoring IDs', () => {
  assert.match(pageSource, /window\.confirm\('Apakah Anda yakin ingin menghapus laporan Hasil Kerja Shift ini\?'\)/);
  assert.match(pageSource, /localStorage\.setItem\(HIDDEN_REPORTS_KEY, JSON\.stringify\(hiddenReportIds\)\)/);
  assert.match(pageSource, /setHiddenReportIds\(\(current\) =>/);
  assert.match(pageSource, /key=\{report\.id\}/);
  assert.match(pageSource, /filterShiftReports\(allReports, filters\)/);
  assert.match(pageSource, /Arsip dikelompokkan per bulan/);
  assert.doesNotMatch(pageSource, /deletePendingData|deleteOreGetting|deleteProduction|removeLog/);
  assert.doesNotMatch(pageSource, /\.slice\(\s*0\s*,\s*\d+/);
});

test('JPG and WhatsApp actions use the selected report; PNG is absent and delete follows existing role', () => {
  assert.equal(canDeleteShiftReport('OWNER'), true);
  assert.equal(canDeleteShiftReport('APP_ADMIN'), true);
  assert.equal(canDeleteShiftReport('USER'), false);
  assert.match(appSource, /<ShiftReports productionLogs=\{logs\} role=\{currentRole\} \/>/);
  assert.match(pageSource, /\{canDelete && \([\s\S]*?shiftReportDelete/);
  assert.match(pageSource, /handleDownload\(report\)/);
  assert.doesNotMatch(pageSource, /<span>PNG<\/span>|image\/png/);
  assert.match(pageSource, /handleWhatsAppShare\(report\)/);
  assert.match(pageSource, /buildShiftReportWhatsAppText\(report\)\.split\('\\n'\)/);
  assert.match(pageSource, /<h4>HASIL PRODUKSI<\/h4>/);
  assert.match(pageSource, /<h4>ORE GETTING<\/h4>/);
  assert.doesNotMatch(pageSource, /<table/);
  assert.match(imageExportSource, /buildShiftReportWhatsAppText\(report\)/);
  assert.doesNotMatch(imageExportSource, /getShiftReportContent/);
  assert.match(imageExportSource, /canvas\.toBlob/);

  const report = buildShiftReports(production.slice(3, 4), [{ ...oreGetting[0], jumlahSampel: 2 }])[0];
  const message = buildShiftReportWhatsAppText(report);
  assert.ok(message.includes('Tanggal: 30/09/2026'));
  assert.ok(message.includes('Area PIT: BETA'));
  assert.ok(message.includes('BETA_CEK_01'));
  assert.ok(!message.includes('Total Tonase'));
  assert.ok(!message.includes('Total Sampel'));
});

test('archive has one visible date-range control and responsive action targets', () => {
  assert.match(pageSource, /<details className="shiftDateRange">[\s\S]*?Tanggal[\s\S]*?shiftDateRangePopover/);
  assert.doesNotMatch(pageSource, /Tanggal mulai|Tanggal akhir/);
  assert.match(pageSource, /className="shiftReportActions"/);
  assert.match(layoutStyles, /@media\(max-width:760px\)[\s\S]*?\.shiftReportActions[\s\S]*?grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(layoutStyles, /\.shiftReportActionButton\s*\{[^}]*min-width:44px[^}]*min-height:44px/);
  assert.match(layoutStyles, /@media\(max-width:760px\)[\s\S]*?\.shiftReportActionButton\s*\{[^}]*min-width:44px[^}]*min-height:44px/);
  assert.match(layoutStyles, /\.shiftReportActionButton[\s\S]*?min-height:44px/);
  assert.match(layoutStyles, /overflow-wrap:anywhere/);
  assert.match(layoutStyles, /\.shiftReportList\s*\{[\s\S]*?grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(layoutStyles, /\.shiftReportOreList li\s*\{[\s\S]*?overflow-wrap:anywhere/);
  assert.match(layoutStyles, /@media\(max-width:1100px\)\s*\{\s*\.shiftReportList\s*\{\s*grid-template-columns:minmax\(0, 1fr\)/);
  assert.match(layoutStyles, /\.shiftReport\s*\{[\s\S]*?padding:12px/);
  assert.match(layoutStyles, /@media\(max-width:760px\)[\s\S]*?\.shiftReport\s*\{\s*padding:10px/);
});

test('JPG export renders only the selected report using WhatsApp content', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const canvases = [];
  const downloads = [];
  const report = buildShiftReports(
    [{ recordId: 'selected-prod', date: '2026-09-30', shift: 'Shift 1', pit: 'Pit BETA', dumpingArea: 'SELECTED-ONLY', niGrade: 1.2, sampleRef: 'A-1', material: 'Saprolit', ritToday: 3, tonnage: 45 }],
    [{
      date: '2026-09-30',
      shift: 'Shift 1',
      areaPit: 'Pit BETA',
      metode: 'CH',
      idMetode: 'CH 01-10',
      acuan: 'A-5',
      titikBor: 'TB-2',
      blockModel: 'BM-3',
      elevasi: '215',
      jumlahSampel: 10,
    }]
  )[0];

  globalThis.document = {
    body: { appendChild: (link) => downloads.push(link) },
    createElement: (tag) => {
      if (tag === 'a') {
        return {
          style: {},
          click() { this.clicked = true; },
          remove() { this.removed = true; },
        };
      }

      const canvas = { width: 0, height: 0, texts: [] };
      const context = {
        font: '',
        measureText: (text) => ({ width: String(text).length * 12 }),
        fillRect() {},
        fillText: (text) => canvas.texts.push(String(text)),
      };
      canvas.getContext = () => context;
      canvas.toBlob = (callback, mimeType) => callback(null);
      canvas.toDataURL = () => 'data:image/jpeg;base64,eA==';
      canvases.push(canvas);
      return canvas;
    },
  };
  globalThis.window = { setTimeout: (callback) => callback() };
  URL.createObjectURL = (blob) => `blob:${blob.type}`;
  URL.revokeObjectURL = () => {};

  try {
    await downloadShiftReportJpg(report);

    assert.deepEqual(canvases.map((canvas) => canvas.width), [1080]);
    assert.ok(canvases.every((canvas) => canvas.height > 0));
    assert.ok(canvases.every((canvas) => canvas.texts.some((text) => text.includes('SELECTED-ONLY'))));
    assert.ok(canvases.every((canvas) => canvas.texts.includes('HASIL KERJA SHIFT')));
    assert.ok(canvases.every((canvas) => canvas.texts.includes('HASIL PRODUKSI')));
    assert.ok(canvases.every((canvas) => canvas.texts.includes('ORE GETTING')));
    assert.ok(canvases.every((canvas) => (
      canvas.texts.join(' ').includes('• ID METODE: CH 01-10 | Acuan: A-5 | BM: BM-3 | TB: TB-2 | Block Model: BM-3 | Elv: 215')
    )));
    assert.ok(canvases.every((canvas) => canvas.texts.includes('Ritase: 3')));
    assert.ok(canvases.every((canvas) => !canvas.texts.some((text) => text.includes('Tonase:'))));
    assert.ok(canvases.every((canvas) => !canvas.texts.includes('another report')));
    assert.deepEqual(downloads.map((link) => link.download), ['hasil-kerja-shift-2026-09-30-BETA.jpg']);
    assert.ok(downloads.every((link) => link.clicked && link.removed));

    const fallbackCases = [
      [
        { idMetode: 'A1M_CEK_70' },
        'ID METODE: A1M_CEK_70 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -',
      ],
      [
        { idMetode: 'A1M_CEK_70', acuan: ' ', blockModel: '363', titikBor: '', elevasi: '56-53' },
        'ID METODE: A1M_CEK_70 | Acuan: - | BM: 363 | TB: - | Block Model: 363 | Elv: 56-53',
      ],
    ];
    for (const [record, expectedLine] of fallbackCases) {
      const [fallbackReport] = buildShiftReports([], [{
        date: '2026-09-30',
        shift: 'Shift 1',
        areaPit: 'Pit BETA',
        ...record,
      }]);
      const firstCanvasForCase = canvases.length;
      await downloadShiftReportJpg(fallbackReport);
      const fallbackCanvasTexts = canvases.slice(firstCanvasForCase).flatMap((canvas) => canvas.texts).join(' ');
      assert.ok(fallbackCanvasTexts.includes(`• ${expectedLine}`));
    }
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test('WhatsApp Production includes only requested non-empty, non-zero fields', () => {
  const report = {
    date: '2026-09-29',
    shift: 'Shift 1 (Siang)',
    canonicalPit: 'Pit Rantepao Barat',
    production: [
      {
        dumpingArea: 'RTP_IRA_SJS_226',
        niGrade: 1.21,
        sampleRef: 'A-12',
        material: 'Saprolit',
        ritToday: 16,
        blockModel: 'DO-NOT-SHARE',
        sublot: 'DO-NOT-SHARE',
        tonnage: 240,
      },
      {
        dumpingArea: 'RTP_IRA_SJS_227',
        niGrade: 1.3,
        sampleRef: '-',
        material: 'Limonit',
        ritToday: 24,
      },
      { dumpingArea: '', niGrade: 0, sampleRef: null, material: 0, ritToday: '0' },
    ],
    oreGetting: [
      { idMetode: 'TP 604' },
      { idMetode: 'TP 605' },
      { idMetode: 'TP 606' },
      { idMetode: 'CH 2550' },
      { idMetode: 'CH 2551' },
      { idMetode: 'CH CH 2552' },
    ],
  };
  const originalIds = report.oreGetting.map((record) => record.idMetode);
  const message = buildShiftReportWhatsAppText(report);

  assert.ok(message.includes('HASIL KERJA SHIFT\nTanggal: 29/09/2026\nShift: Shift 1 (Siang)\nArea PIT: Rantepao Barat'));
  assert.ok(message.includes('1. Dumpingan: RTP_IRA_SJS_226\n   Acuan Ni: 1.21%\n   Acuan: A-12\n   Material: Saprolit\n   Ritase: 16'));
  assert.ok(message.includes('2. Dumpingan: RTP_IRA_SJS_227\n   Acuan Ni: 1.3%\n   Material: Limonit\n   Ritase: 24'));
  for (const idMetode of originalIds) {
    assert.ok(message.includes(`• ID METODE: ${idMetode} | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -`));
  }
  assert.ok(!message.includes('   Acuan: -'));
  for (const hiddenField of ['DO-NOT-SHARE', 'Ritase: 0', 'Jumlah Sampel', 'Total Tonase']) {
    assert.ok(!message.includes(hiddenField), `WhatsApp should omit ${hiddenField}`);
  }
  assert.deepEqual(report.oreGetting.map((record) => record.idMetode), originalIds);
});

test('WhatsApp omits empty and zero report metadata and Production values', () => {
  const message = buildShiftReportWhatsAppText({
    date: '2026-09-30',
    shift: '-',
    canonicalPit: 'Pit BETA',
    production: [{ dumpingArea: '-', niGrade: '0', sampleRef: undefined, material: '', ritToday: null }],
    oreGetting: [],
  });

  assert.ok(!message.includes('Shift:'));
  assert.ok(!message.includes('Acuan Ni:'));
  assert.ok(!message.includes('Dumpingan:'));
  assert.ok(!message.includes('Material:'));
  assert.ok(!message.includes('Ritase:'));
  assert.ok(!message.includes('Acuan:'));
});

test('WhatsApp formats each Ore Getting ID with labels and preserves value ranges', () => {
  const message = buildShiftReportWhatsAppText({
    date: '2026-09-30',
    shift: 'Shift 1',
    canonicalPit: 'Pit BETA',
    production: [],
    oreGetting: [
      ...['TP 604', 'TP 605', 'TP 606', 'TP 610', 'TP 611', 'TP 604', 'TP 604-606'].map((idMetode) => ({ idMetode })),
      ...Array.from({ length: 19 }, (_, index) => ({ idMetode: `CH ${2550 + index}` })),
      { idMetode: 'CH CH 2550-2568' },
      { idMetode: 'TP 700' },
      { idMetode: 'TP 702' },
    ],
  });

  assert.ok(message.includes('• ID METODE: TP 604-606 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'));
  assert.ok(message.includes('• ID METODE: TP 610 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'));
  assert.ok(message.includes('• ID METODE: TP 700 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'));
  assert.ok(message.includes('• ID METODE: TP 702 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'));
  assert.equal((message.match(/ID METODE: TP 604-606/g) || []).length, 1);
  assert.ok(message.includes('• ID METODE: CH CH 2550-2568 | Acuan: - | BM: - | TB: - | Block Model: - | Elv: -'));
});

test('WhatsApp uses only the selected report and image export content stays unchanged', () => {
  const reports = buildShiftReports(
    [
      { recordId: 'selected', date: '2026-09-29', shift: 'Shift 1', pit: 'Pit BETA', sublot: 'SELECTED-SUBLOT', dumpingArea: 'SELECTED-DUMP', ritToday: 4, tonnage: 60 },
      { recordId: 'other-date', date: '2026-09-30', shift: 'Shift 1', pit: 'Pit BETA', dumpingArea: 'OTHER-DATE' },
      { recordId: 'other-pit', date: '2026-09-29', shift: 'Shift 1', pit: 'Pit A1M', dumpingArea: 'OTHER-PIT' },
      { recordId: 'other-shift', date: '2026-09-29', shift: 'Shift 2', pit: 'Pit BETA', dumpingArea: 'OTHER-SHIFT' },
    ],
    []
  );
  const selected = reports.find((report) => report.date === '2026-09-29' && report.shift === 'Shift 1' && report.pitLabel === 'BETA');
  const message = buildShiftReportWhatsAppText(selected);
  const imageContent = getShiftReportContent(selected);

  assert.ok(message.includes('SELECTED-DUMP'));
  assert.ok(!message.includes('OTHER-DATE'));
  assert.ok(!message.includes('OTHER-PIT'));
  assert.ok(!message.includes('OTHER-SHIFT'));
  assert.ok(imageContent.production[0].includes('SELECTED-SUBLOT'));
  assert.ok(imageContent.production[0].includes('60 MT'));
});