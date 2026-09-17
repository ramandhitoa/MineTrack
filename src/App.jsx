// ============================================================
// APP UTAMA
// Menghubungkan state, halaman, modal, localStorage, export,
// dan Google Sheets. File ini sengaja dibuat ringkas karena
// detail UI sudah dipisahkan ke components/pages/services.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout';
import { DailyModal, PendingModal, ScriptModal } from './components/Modals';
import Dashboard from './pages/Dashboard';
import Daily from './pages/Daily';
import DailyAttendance from './pages/DailyAttendance';
import Weekly from './pages/Weekly';
import Monthly from './pages/Monthly';
import Pending from './pages/Pending';
import Excel from './pages/Excel';
import OreGetting from './pages/OreGetting';
import { pageTitles, STORAGE_KEYS } from './constants';
import {
  emptyAttendance,
  emptyDaily,
  emptyPending,
  initialPending,
} from './data/initialData';
import { calculateShiftHours } from './utils/formatters';
import { copyLogsAsTSV, exportLogsAsCSV } from './services/exportService';
import { DEFAULT_GOOGLE_APPS_SCRIPT_URL, GOOGLE_APPS_SCRIPT, GOOGLE_SPREADSHEET_ID, readAttendanceFromGoogleSheets, readLogsFromGoogleSheets, syncAttendanceToGoogleSheets, syncLogsToGoogleSheets } from './services/googleSheetsService';

const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
  } catch {
    return fallback;
  }
};

const clearOldProgressOnce = () => {
  const resetKey = 'mineTrack_progress_reset_20260910';
  if (localStorage.getItem(resetKey) !== 'done') {
    localStorage.removeItem(STORAGE_KEYS.logs);
    localStorage.setItem(resetKey, 'done');
  }
  return [];
};

const clearOldAttendanceOnce = () => {
  const resetKey = 'mineTrack_attendance_reset_20260910';
  if (localStorage.getItem(resetKey) !== 'done') {
    localStorage.removeItem(STORAGE_KEYS.attendance);
    localStorage.setItem(resetKey, 'done');
  }
  return [];
};

export default function App() {
  // -------------------- Navigasi & UI state --------------------
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [alert, setAlert] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('mineTrackTheme') || 'dark');

  // -------------------- Data utama aplikasi --------------------
  const [logs, setLogs] = useState(clearOldProgressOnce);
  const [pending, setPending] = useState(() => readStorage(STORAGE_KEYS.pending, initialPending));
  const [attendance, setAttendance] = useState(clearOldAttendanceOnce);
  const [gsUrl] = useState(DEFAULT_GOOGLE_APPS_SCRIPT_URL);
  const [gsLoading, setGsLoading] = useState(false);
  const [gsStatus, setGsStatus] = useState('Belum terhubung');
  const [gsRemoteCount, setGsRemoteCount] = useState(null);

  // -------------------- Filter halaman harian --------------------
  const [filterPit, setFilterPit] = useState('Semua');
  const [filterMaterial, setFilterMaterial] = useState('Semua');
  const [query, setQuery] = useState('');

  // -------------------- Modal state --------------------
  const [dailyOpen, setDailyOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [dailyForm, setDailyForm] = useState(emptyDaily);
  const [pendingForm, setPendingForm] = useState(emptyPending);

  // -------------------- Simpan otomatis ke browser --------------------
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.pending, JSON.stringify(pending));
  }, [pending]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(attendance));
  }, [attendance]);

  useEffect(() => {
    localStorage.setItem('mineTrackTheme', theme);
  }, [theme]);

  // -------------------- Muat data pusat dari Google Sheets --------------------
  // Jika URL Apps Script sudah disimpan, Google Sheets menjadi sumber data
  // bersama sehingga HP dan PC dapat melihat dataset yang sama.
  const loadGoogleSheets = async (showNotification = true) => {
    if (!gsUrl) {
      setGsStatus('URL belum diisi');
      return null;
    }

    setGsLoading(true);
    setGsStatus('Membaca Google Sheets...');
    try {
      const remoteLogs = await readLogsFromGoogleSheets(gsUrl);
      setGsRemoteCount(remoteLogs.length);
      if (remoteLogs.length > 0) setLogs(remoteLogs);
      setGsStatus(`Terhubung • ${remoteLogs.length} baris`);
      if (showNotification) notify(`Data Google Sheets dimuat: ${remoteLogs.length} baris.`);
      return remoteLogs;
    } catch (error) {
      setGsStatus(`Gagal • ${error.message}`);
      if (showNotification) notify(`Gagal membaca Google Sheets: ${error.message}`);
      return null;
    } finally {
      setGsLoading(false);
    }
  };

  // Saat URL tersedia, Google Sheets menjadi sumber data utama.
  useEffect(() => {
    if (!gsUrl) {
      setGsStatus('URL belum diisi');
      setGsRemoteCount(null);
      return;
    }
    let cancelled = false;
    setGsLoading(true);
    setGsStatus('Membaca Google Sheets...');
    readLogsFromGoogleSheets(gsUrl)
      .then((remoteLogs) => {
        if (cancelled) return;
        setGsRemoteCount(remoteLogs.length);
        if (remoteLogs.length > 0) setLogs(remoteLogs);
        setGsStatus(`Terhubung • ${remoteLogs.length} baris`);
        notify(`Data Google Sheets berhasil dimuat: ${remoteLogs.length} baris.`);
      })
      .catch((error) => {
        if (cancelled) return;
        setGsStatus(`Gagal • ${error.message}`);
        notify(`Google Sheets belum terbaca: ${error.message}`);
      })
      .finally(() => {
        if (!cancelled) setGsLoading(false);
      });
    return () => { cancelled = true; };
  }, [gsUrl]);

  useEffect(() => {
    let cancelled = false;
    readAttendanceFromGoogleSheets(gsUrl)
      .then((remoteAttendance) => {
        if (!cancelled && remoteAttendance.length > 0) setAttendance(remoteAttendance);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [gsUrl]);

  const notify = (message) => {
    setAlert(message);
    window.setTimeout(() => setAlert(''), 4500);
  };

  // -------------------- Perhitungan KPI dashboard --------------------
  const metrics = useMemo(() => {
    const result = {
      rit: 0,
      total: 0,
      ton: 0,
      weightedNi: 0,
      mc: 0,
      hours: 0,
    };

    logs.forEach((log) => {
      result.rit += Number(log.ritToday) || 0;
      result.total += Number(log.ritTotal) || 0;
      result.ton += Number(log.tonnage) || 0;
      result.weightedNi += (Number(log.tonnage) || 0) * (Number(log.niGrade) || 0);
      result.mc += Number(log.mc) || 0;
      result.hours += calculateShiftHours(log.startTime, log.stopTime);
    });

    return {
      ...result,
      ni: result.ton ? (result.weightedNi / result.ton).toFixed(2) : '0.00',
      mc: (result.mc / (logs.length || 1)).toFixed(1),
      hours: Math.round(result.hours),
    };
  }, [logs]);

  // -------------------- Filter data log harian --------------------
  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return logs.filter((log) => {
      const matchPit = filterPit === 'Semua' || log.pit === filterPit;
      const matchMaterial = filterMaterial === 'Semua' || log.material === filterMaterial;
      const matchQuery = !keyword || [
        log.sublot,
        log.sampleRef,
        log.drillHole,
        log.blockModel,
      ].some((value) => String(value || '').toLowerCase().includes(keyword));

      return matchPit && matchMaterial && matchQuery;
    });
  }, [logs, filterPit, filterMaterial, query]);

  // -------------------- Data grafik dashboard --------------------
  const chartData = useMemo(() => (
    [...logs]
      .slice(0, 7)
      .reverse()
      .map((log) => ({
        name: `${log.date?.split('-').reverse().join('/')} ${log.sublot}`,
        rit: Number(log.ritToday) || 0,
        ni: Number(log.niGrade) || 0,
      }))
  ), [logs]);

  const loadingStats = useMemo(() => {
    const summary = {};
    logs.forEach((log) => {
      summary[log.loadingMethod] = (summary[log.loadingMethod] || 0) + 1;
    });

    return Object.entries(summary).map(([name, value]) => ({ name, value }));
  }, [logs]);

  const autoSyncProduction = async (nextLogs, message) => {
    if (!gsUrl) return;

    setGsLoading(true);
    setGsStatus('Menyinkronkan laporan produksi...');
    try {
      await syncLogsToGoogleSheets(gsUrl, nextLogs);
      const sharedLogs = await readLogsFromGoogleSheets(gsUrl);
      setLogs(sharedLogs);
      setGsRemoteCount(sharedLogs.length);
      setGsStatus(`Terhubung • ${sharedLogs.length} baris`);
      notify(message);
    } catch (error) {
      setGsStatus(`Gagal • ${error.message}`);
      notify(`Data tersimpan di perangkat, tetapi gagal sinkron ke Google Sheets: ${error.message}`);
    } finally {
      setGsLoading(false);
    }
  };

  const autoSyncAttendance = async (nextAttendance, message) => {
    if (!gsUrl) return;

    setGsLoading(true);
    setGsStatus('Menyinkronkan Daily Absensi...');
    try {
      await syncAttendanceToGoogleSheets(gsUrl, nextAttendance);
      const sharedAttendance = await readAttendanceFromGoogleSheets(gsUrl);
      if (sharedAttendance.length > 0) setAttendance(sharedAttendance);
      setGsStatus(`Absensi tersinkronisasi • ${nextAttendance.length} baris`);
      notify(message);
    } catch (error) {
      setGsStatus(`Gagal • ${error.message}`);
      notify(`Absensi tersimpan di perangkat, tetapi gagal sinkron ke Google Sheets: ${error.message}`);
    } finally {
      setGsLoading(false);
    }
  };

  // -------------------- Daily log CRUD --------------------
  const saveDaily = async (event) => {
    event.preventDefault();

    const ritPrevious = Number(dailyForm.ritPrevious) || 0;
    const ritToday = Number(dailyForm.ritToday) || 0;
    const ritTotal = ritPrevious + ritToday;

    const newLog = {
      ...dailyForm,
      id: Date.now(),
      status: dailyForm.status || 'Open',
      block: dailyForm.block || '',
      ritPrevious,
      ritToday,
      ritTotal,
      tonnage: ritTotal * 15,
      niGrade: Number(dailyForm.niGrade) || 0,
      feGrade: Number(dailyForm.feGrade) || 0,
      mc: Number(dailyForm.mc) || 0,
    };

    const nextLogs = [newLog, ...logs];
    setLogs(nextLogs);
    setDailyForm({ ...emptyDaily, date: new Date().toISOString().slice(0, 10) });
    setDailyOpen(false);
    await autoSyncProduction(nextLogs, 'Laporan produksi berhasil disimpan dan disinkronkan.');
  };

  // -------------------- Pending job CRUD --------------------
  const savePending = (event) => {
    event.preventDefault();

    setPending((current) => [
      { ...pendingForm, id: Date.now(), status: 'Open' },
      ...current,
    ]);

    setPendingForm(emptyPending);
    setPendingOpen(false);
    notify('Planning job pending berhasil disimpan ke backlog.');
  };

  const saveAttendance = async (event, form) => {
    event.preventDefault();
    const nextAttendance = [{ ...form, id: Date.now() }, ...attendance];
    setAttendance(nextAttendance);
    await autoSyncAttendance(nextAttendance, 'Data Daily Absensi berhasil disimpan dan disinkronkan.');
  };

  // -------------------- Clipboard / CSV / Google Sheets --------------------
  const handleCopyExcel = async () => {
    try {
      await copyLogsAsTSV(logs);
      notify('Seluruh 23 kolom data QC disalin ke clipboard.');
    } catch {
      notify('Clipboard tidak dapat digunakan di browser ini.');
    }
  };

  const handleExportCSV = () => {
    exportLogsAsCSV(logs);
    notify('File CSV 23 kolom berhasil dibuat.');
  };

  // Tombol ini selalu mengambil data terbaru dari Google Sheets.
  const reloadGoogleSheets = async () => {
    await loadGoogleSheets(true);
  };

  const syncGoogleSheets = async () => {
    if (!gsUrl) {
      setActiveTab('excel');
      notify('Harap masukkan URL Web App Google Apps Script terlebih dahulu.');
      return;
    }

    setGsLoading(true);
    setGsStatus('Memeriksa data Google Sheets...');
    try {
      // Baca Google Sheets terlebih dahulu. Ini mencegah kondisi berbahaya
      // ketika Sheet memiliki 5 baris tetapi browser lokal hanya memiliki 3.
      const remoteLogs = await readLogsFromGoogleSheets(gsUrl);

      if (remoteLogs.length > logs.length) {
        // Google Sheets lebih lengkap -> ambil data Sheet, JANGAN overwrite.
        setLogs(remoteLogs);
        setGsRemoteCount(remoteLogs.length);
        setGsStatus(`Terhubung • ${remoteLogs.length} baris`);
        notify(`Data Google Sheets dipakai sebagai sumber utama: ${remoteLogs.length} baris.`);
      } else {
        // Browser memiliki data yang sama/lebih baru -> kirim ke Sheet lalu baca ulang.
        const verifiedLogs = await syncLogsToGoogleSheets(gsUrl, logs);
        setLogs(verifiedLogs);
        setGsRemoteCount(verifiedLogs.length);
        setGsStatus(`Terhubung • ${verifiedLogs.length} baris`);
        notify(`Sinkronisasi berhasil: ${verifiedLogs.length} baris.`);
      }
    } catch (error) {
      setGsStatus(`Gagal • ${error.message}`);
      notify(`Gagal sinkronisasi: ${error.message}`);
    } finally {
      setGsLoading(false);
    }
  };

  const syncAttendance = async () => {
    if (!gsUrl) {
      setActiveTab('excel');
      notify('Harap masukkan URL Web App Google Apps Script terlebih dahulu.');
      return;
    }

    setGsLoading(true);
    setGsStatus('Mengirim data Daily Absensi...');
    try {
      await syncAttendanceToGoogleSheets(gsUrl, attendance);
      setGsStatus(`Absensi tersinkronisasi • ${attendance.length} baris`);
      notify(`Data Daily Absensi berhasil disinkronisasi: ${attendance.length} baris.`);
    } catch (error) {
      setGsStatus(`Gagal • ${error.message}`);
      notify(`Gagal sinkronisasi absensi: ${error.message}`);
    } finally {
      setGsLoading(false);
    }
  };

  return (
    <>
      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        pendingCount={pending.filter((job) => job.status !== 'Selesai').length}
        title={pageTitles[activeTab]}
        alert={alert}
        setAlert={setAlert}
        theme={theme}
        onThemeChange={setTheme}
        onInputDaily={() => setDailyOpen(true)}
        onInputPending={() => setPendingOpen(true)}
        onCopyExcel={handleCopyExcel}
        onSyncGoogleSheets={syncGoogleSheets}
      >
        {activeTab === 'dashboard' && (
          <Dashboard
            metrics={metrics}
            logs={logs}
            chartData={chartData}
            loadingStats={loadingStats}
            pendingCount={pending.filter((job) => job.status !== 'Selesai').length}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'harian' && (
          <Daily
            filteredLogs={filteredLogs}
            filterPit={filterPit}
            setFilterPit={setFilterPit}
            filterMaterial={filterMaterial}
            setFilterMaterial={setFilterMaterial}
            query={query}
            setQuery={setQuery}
            onOpenModal={() => setDailyOpen(true)}
            onCopyExcel={handleCopyExcel}
          />
        )}

        {activeTab === 'mingguan' && <Weekly logs={logs} />}
        {activeTab === 'bulanan' && <Monthly logs={logs} />}

        {activeTab === 'oregetting' && <OreGetting />}

        {activeTab === 'absensi' && (
          <DailyAttendance
            attendance={attendance}
            onSaveAttendance={saveAttendance}
            onSyncAttendance={syncAttendance}
            syncing={gsLoading}
          />
        )}

        {activeTab === 'pending' && (
          <Pending
            jobs={pending}
            setJobs={setPending}
            onOpenModal={() => setPendingOpen(true)}
            notify={notify}
          />
        )}

        {activeTab === 'excel' && (
          <Excel
            gsUrl={gsUrl}
            onSync={syncGoogleSheets}
            onReload={reloadGoogleSheets}
            onCopy={handleCopyExcel}
            onExport={handleExportCSV}
            onOpenScript={() => setScriptOpen(true)}
            spreadsheetId={GOOGLE_SPREADSHEET_ID}
            gsLoading={gsLoading}
            gsStatus={gsStatus}
            gsRemoteCount={gsRemoteCount}
          />
        )}
      </Layout>

      {dailyOpen && (
        <DailyModal
          data={dailyForm}
          setData={setDailyForm}
          onClose={() => setDailyOpen(false)}
          onSave={saveDaily}
        />
      )}

      {pendingOpen && (
        <PendingModal
          data={pendingForm}
          setData={setPendingForm}
          onClose={() => setPendingOpen(false)}
          onSave={savePending}
        />
      )}

      {scriptOpen && (
        <ScriptModal
          script={GOOGLE_APPS_SCRIPT}
          onClose={() => setScriptOpen(false)}
        />
      )}
    </>
  );
}
