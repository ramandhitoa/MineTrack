import { useEffect, useMemo, useState } from 'react';
import { ImageDown, MessageCircle, Trash2 } from 'lucide-react';
import { DEFAULT_GOOGLE_APPS_SCRIPT_URL, readOreGettingFromGoogleSheets } from '../services/googleSheetsService';
import { downloadShiftReportJpg } from '../services/shiftReportExport';
import { getShiftPitLabel } from '../utils/oreGetting';
import { buildShiftReportWhatsAppText, canDeleteShiftReport } from '../utils/shiftReportActions';
import {
  buildShiftReports,
  filterShiftReports,
  mergeOreGettingRecords,
} from '../utils/shiftReports';

const HIDDEN_REPORTS_KEY = 'minetrack_shift_report_hidden_v1';
const ORE_GETTING_KEY = 'mineTrack_ore_getting_records';

function readLocalOreGetting() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORE_GETTING_KEY) || 'null');
    return Array.isArray(saved?.records) ? saved.records : [];
  } catch {
    return [];
  }
}

function readHiddenReports() {
  try {
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_REPORTS_KEY) || '[]');
    return Array.isArray(hidden) ? hidden : [];
  } catch {
    return [];
  }
}

function monthLabel(month) {
  const date = new Date(`${month}-01T00:00:00Z`);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getPitOptions(reports) {
  const pits = new Map();
  reports.forEach((report) => pits.set(report.pitKey, report.canonicalPit));
  return [...pits.entries()].map(([key, value]) => ({ key, value, label: getShiftPitLabel(value) }));
}

function formatFilterDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function getRangeLabel(filters) {
  if (filters.startDate && filters.endDate) {
    return `${formatFilterDate(filters.startDate)} - ${formatFilterDate(filters.endDate)}`;
  }
  if (filters.startDate) return `Dari ${formatFilterDate(filters.startDate)}`;
  if (filters.endDate) return `Sampai ${formatFilterDate(filters.endDate)}`;
  return 'Semua tanggal';
}

function getReportMessageSections(report) {
  const lines = buildShiftReportWhatsAppText(report).split('\n');
  const productionStart = lines.indexOf('HASIL PRODUKSI');
  const oreGettingStart = lines.indexOf('ORE GETTING');
  const productionLines = lines.slice(productionStart + 1, oreGettingStart).filter(Boolean);
  const productionItems = [];

  productionLines.forEach((line) => {
    if (/^\d+\. /.test(line)) productionItems.push([line]);
    else if (productionItems.length) productionItems[productionItems.length - 1].push(line);
  });

  return {
    title: lines[0],
    metadata: lines.slice(1, productionStart).filter(Boolean),
    production: productionItems,
    oreGetting: lines.slice(oreGettingStart + 1).filter(Boolean),
  };
}

function ReportMessage({ report }) {
  const sections = getReportMessageSections(report);

  return (
    <div className="shiftReportMessage">
      <header className="shiftReportMessageHead">
        <h3>{sections.title}</h3>
        {sections.metadata.map((line) => <p key={line}>{line}</p>)}
      </header>

      <section className="shiftReportSection">
        <h4>HASIL PRODUKSI</h4>
        {sections.production.length ? sections.production.map((item, index) => (
          <div className="shiftReportProductionItem" key={`${index}-${item[0]}`}>
            <p>{item[0]}</p>
            {item.slice(1).map((line) => <p key={line}>{line.trim()}</p>)}
          </div>
        )) : <p className="shiftReportEmptySource">Tidak ada laporan Production.</p>}
      </section>

      <section className="shiftReportSection">
        <h4>ORE GETTING</h4>
        {sections.oreGetting.length ? (
          <ul className="shiftReportOreList">
            {sections.oreGetting.map((line) => <li key={line}>{line.replace(/^•\s*/, '')}</li>)}
          </ul>
        ) : <p className="shiftReportEmptySource">Tidak ada laporan Ore Getting.</p>}
      </section>
    </div>
  );
}

export default function ShiftReports({ productionLogs = [], role = 'USER' }) {
  const [oreGettingRecords, setOreGettingRecords] = useState(readLocalOreGetting);
  const [hiddenReportIds, setHiddenReportIds] = useState(readHiddenReports);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', shift: '', pit: '' });
  const [oreGettingStatus, setOreGettingStatus] = useState('Memuat Ore Getting...');
  const canDelete = canDeleteShiftReport(role);

  useEffect(() => {
    let cancelled = false;
    const url = localStorage.getItem('minetrack_gsheets_url') || DEFAULT_GOOGLE_APPS_SCRIPT_URL;

    readOreGettingFromGoogleSheets(url)
      .then((remoteRecords) => {
        if (cancelled) return;
        setOreGettingRecords((current) => mergeOreGettingRecords(current, remoteRecords));
        setOreGettingStatus('');
      })
      .catch(() => {
        if (cancelled) return;
        setOreGettingStatus('Ore Getting online tidak dapat dimuat; arsip lokal tetap ditampilkan.');
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_REPORTS_KEY, JSON.stringify(hiddenReportIds));
    } catch {
      // Keep the current view usable if browser storage is unavailable.
    }
  }, [hiddenReportIds]);

  const allReports = useMemo(
    () => buildShiftReports(productionLogs, oreGettingRecords),
    [productionLogs, oreGettingRecords]
  );
  const pitOptions = useMemo(() => getPitOptions(allReports), [allReports]);
  const filteredReports = useMemo(
    () => filterShiftReports(allReports, filters).filter((report) => !hiddenReportIds.includes(report.id)),
    [allReports, filters, hiddenReportIds]
  );
  const monthlyReports = useMemo(() => {
    const months = new Map();
    filteredReports.forEach((report) => {
      if (!months.has(report.month)) months.set(report.month, []);
      months.get(report.month).push(report);
    });
    return [...months.entries()];
  }, [filteredReports]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const deleteReport = (reportId) => {
    if (!canDelete) return;
    if (!window.confirm('Apakah Anda yakin ingin menghapus laporan Hasil Kerja Shift ini?')) return;
    setHiddenReportIds((current) => (
      current.includes(reportId) ? current : [...current, reportId]
    ));
  };
  const handleDownload = async (report) => {
    try {
      await downloadShiftReportJpg(report);
    } catch (error) {
      console.error('Gagal mengekspor laporan Hasil Kerja Shift:', error);
      window.alert(error?.message || 'Gagal mengunduh laporan.');
    }
  };
  const handleWhatsAppShare = (report) => {
    const text = buildShiftReportWhatsAppText(report);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="pageStack shiftReportsPage">
      <div className="panel filters">
        <div>
          <details className="shiftDateRange">
            <summary>
              <span>Tanggal</span>
              <strong>{getRangeLabel(filters)}</strong>
            </summary>
            <div className="shiftDateRangePopover">
              <label>
                Dari
                <input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} />
              </label>
              <label>
                Sampai
                <input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} />
              </label>
            </div>
          </details>
          <label>
            Shift
            <select value={filters.shift} onChange={(event) => updateFilter('shift', event.target.value)}>
              <option value="">Semua</option>
              {[...new Set(allReports.map((report) => report.shift))].sort().map((shift) => (
                <option key={shift} value={shift}>{shift}</option>
              ))}
            </select>
          </label>
          <label>
            Pit
            <select value={filters.pit} onChange={(event) => updateFilter('pit', event.target.value)}>
              <option value="">Semua</option>
              {pitOptions.map((pit) => (
                <option key={pit.key} value={pit.value}>{pit.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="filterActions">{filteredReports.length} laporan</div>
      </div>

      <p className="shiftArchiveNote">Arsip dikelompokkan per bulan. Tidak ada penghapusan otomatis; tombol hapus hanya menyembunyikan laporan monitoring ini.</p>
      {oreGettingStatus && <p className="shiftArchiveStatus">{oreGettingStatus}</p>}

      {monthlyReports.length === 0 ? (
        <div className="panel emptyState">Belum ada laporan Hasil Kerja Shift untuk filter ini.</div>
      ) : monthlyReports.map(([month, reports]) => (
        <section className="shiftReportMonth" key={month}>
          <h2>{monthLabel(month)}</h2>
          <div className="shiftReportList">
            {reports.map((report) => (
              <article className="panel shiftReport" key={report.id}>
                <ReportMessage report={report} />
                <footer className="shiftReportActions" aria-label="Aksi laporan">
                  <button type="button" className="shiftReportActionButton" onClick={() => handleDownload(report)}>
                    <ImageDown size={15} /><span>JPG</span>
                  </button>
                  <button type="button" className="shiftReportActionButton" onClick={() => handleWhatsAppShare(report)}>
                    <MessageCircle size={15} /><span>WhatsApp</span>
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      className="shiftReportActionButton shiftReportDelete"
                      title="Hapus laporan monitoring"
                      aria-label={`Hapus laporan ${report.date} ${report.shift} ${report.pitLabel}`}
                      onClick={() => deleteReport(report.id)}
                    >
                      <Trash2 size={15} /><span>Hapus</span>
                    </button>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}