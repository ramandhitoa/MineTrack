// ============================================================
// APP UTAMA
// Menghubungkan state, halaman, modal, localStorage, export,
// dan Google Sheets. File ini sengaja dibuat ringkas karena
// detail UI sudah dipisahkan ke components/pages/services.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { startOfflineAutoSync } from './services/offlineSync';

import {
  savePendingData,
  getPendingData,
  deletePendingData,
} from './services/offlineDB';
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import { DailyModal, PendingModal, ScriptModal } from './components/Modals';
import {
  loginWithNikAndPassword,
  logoutFromFirebaseSession,
  observeFirebaseAuthSession,
} from './auth/authService';
import Dashboard from './pages/Dashboard';
import Daily from './pages/Daily';
import DailyAttendance from './pages/DailyAttendance';
import Weekly from './pages/Weekly';
import Monthly from './pages/Monthly';
import Pending from './pages/Pending';
import Excel from './pages/Excel';
import OreGetting from './pages/OreGetting';
import MasterAkunPage from './components/MasterAkunPage';
import ManagementUserPage from './components/ManagementUserPage';
import { pageTitles, STORAGE_KEYS } from './constants';
import {
  emptyAttendance,
  emptyDaily,
  emptyPending,
  initialPending,
} from './data/initialData';
import { calculateShiftHours, toWitaDateInput } from './utils/formatters';
import { normalizeProductionNiRecord, parseAcuanNiValue } from './utils/acuanNi';
import { copyLogsAsTSV, exportLogsAsCSV } from './services/exportService';
import {
  attendanceKey,
  createProductionRecordId,
  DEFAULT_GOOGLE_APPS_SCRIPT_URL,
  getUnsyncedAttendanceItems,
  GOOGLE_APPS_SCRIPT,
  GOOGLE_SPREADSHEET_ID,
  mergeAttendanceItems,
  normalizeAttendanceName,
  readAttendanceFromGoogleSheets,
  readLogsFromGoogleSheets,
  syncAttendanceToGoogleSheets,
  syncLogsToGoogleSheets,
} from './services/googleSheetsService';

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
  const [authSession, setAuthSession] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // -------------------- Data utama aplikasi --------------------
  const [logs, setLogs] = useState(clearOldProgressOnce);
  const [pending, setPending] = useState(() => readStorage(STORAGE_KEYS.pending, initialPending));
  const [attendance, setAttendance] = useState(clearOldAttendanceOnce);
  const [gsUrl, setGsUrl] = useState(() => DEFAULT_GOOGLE_APPS_SCRIPT_URL);
  const [gsUrlInput, setGsUrlInput] = useState(() => DEFAULT_GOOGLE_APPS_SCRIPT_URL);
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

  useEffect(() => {
    try {
      localStorage.setItem('minetrack_gsheets_url', DEFAULT_GOOGLE_APPS_SCRIPT_URL);
      setGsUrl(DEFAULT_GOOGLE_APPS_SCRIPT_URL);
      setGsUrlInput(DEFAULT_GOOGLE_APPS_SCRIPT_URL);
    } catch {
      // ignore storage errors in private mode
    }
  }, []);

  const saveGsUrl = () => {
    const fixedUrl = DEFAULT_GOOGLE_APPS_SCRIPT_URL;
    setGsUrl(fixedUrl);
    setGsUrlInput(fixedUrl);
    try {
      localStorage.setItem('minetrack_gsheets_url', fixedUrl);
    } catch {
      // ignore storage errors in private mode
    }
    notify('URL Web App sudah dikunci ke endpoint default untuk sinkronisasi Excel.');
  };

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
    const unsubscribe = observeFirebaseAuthSession({
      onSession: (session) => {
        setAuthSession(session);
        if (session) {
          setAuthError('');
        }
      },
      onError: (message) => {
        console.error('[AUTH SESSION ERROR]', {
          message: message || 'Authentication failed.',
          raw: message,
        });
        setAuthError(message || 'Authentication failed.');
      },
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    readAttendanceFromGoogleSheets(gsUrl)
      .then((remoteAttendance) => {
        if (!cancelled && remoteAttendance.length > 0) setAttendance(mergeAttendanceItems(remoteAttendance));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [gsUrl]);

  // ============================================================
  // OFFLINE AUTO SYNC
  // Memulai mekanisme sinkronisasi IndexedDB secara global.
  // Saat internet kembali, offlineSync.js akan memeriksa queue
  // pendingData dan mengirim data yang masih berstatus pending.
  // ============================================================
  useEffect(() => {
    if (!gsUrl) return undefined;

    const stopAutoSync = startOfflineAutoSync(gsUrl);

    return () => {
      if (typeof stopAutoSync === 'function') {
        stopAutoSync();
      }
    };
  }, [gsUrl]);

  // Status koneksi browser.
  useEffect(() => {
    const handleOffline = () => {
      setGsStatus('Offline • data baru akan disimpan di perangkat');
    };

    const handleOnline = () => {
      setGsStatus('Online • memeriksa data yang menunggu sinkronisasi...');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const notify = (message) => {
    setAlert(message);
    window.setTimeout(() => setAlert(''), 4500);
  };

  const handleAuthLogin = async ({ nik, password }) => {
    setAuthError('');
    setAuthLoading(true);

    try {
      const result = await loginWithNikAndPassword({ nik, password });
      setAuthSession(result.session);
      const displayName = result.user.name === 'MineTrack User'
        ? 'GC PIT REPORT User'
        : result.user.name || result.user.nik;
      notify(`Selamat datang ${displayName}.`);
    } catch (error) {
      console.error('[AUTH LOGIN ORIGINAL ERROR]', {
        name: error?.name,
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
        raw: error,
      });

      const message = error?.message || 'Login gagal.';
      const safeMessage = message.includes('Firebase authentication is not configured')
        ? 'Firebase authentication is not configured. Please provide the Firebase project configuration.'
        : 'Login gagal. Silakan periksa NIK dan password.';

      setAuthError(safeMessage);
      notify(safeMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutFromFirebaseSession();
    } catch {
      // ignore logout errors and clear local app session
    }

    setAuthSession(null);
    setAuthError('');
    notify('Logout berhasil.');
  };

  // -------------------- Perhitungan KPI dashboard --------------------
  const metrics = useMemo(() => {
    const result = {
      rit: 0,
      total: 0,
      ton: 0,
      weightedNi: 0,
      niTonnage: 0,
      mc: 0,
      hours: 0,
    };

    logs.forEach((log) => {
      result.rit += Number(log.ritToday) || 0;
      result.total += Number(log.ritTotal) || 0;
      result.ton += Number(log.tonnage) || 0;
      const niGrade = parseAcuanNiValue(log.niGrade);
      if (niGrade !== null) {
        const niTonnage = Number(log.tonnage) || 0;
        result.weightedNi += niTonnage * niGrade;
        result.niTonnage += niTonnage;
      }
      result.mc += Number(log.mc) || 0;
      result.hours += calculateShiftHours(log.startTime, log.stopTime);
    });

    return {
      ...result,
      ni: result.niTonnage ? (result.weightedNi / result.niTonnage).toFixed(2) : null,
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
        ni: parseAcuanNiValue(log.niGrade),
      }))
  ), [logs]);

  const loadingStats = useMemo(() => {
    const summary = {};
    logs.forEach((log) => {
      summary[log.loadingMethod] = (summary[log.loadingMethod] || 0) + 1;
    });

    return Object.entries(summary).map(([name, value]) => ({ name, value }));
  }, [logs]);

  // ============================================================
  // AUTO SYNC PRODUCTION
  // Mengirim data Production ke Google Sheets.
  // Jika berhasil, data yang berasal dari IndexedDB dihapus.
  // ============================================================
  const autoSyncProduction = async (
    itemsToSync,
    message,
    offlineIds = []
  ) => {
    if (!gsUrl || !itemsToSync || !itemsToSync.length) {
      return;
    }

    setGsLoading(true);
    setGsStatus('Menyinkronkan laporan produksi...');

    try {
      // Kirim data Production ke Google Sheets
      await syncLogsToGoogleSheets(gsUrl, itemsToSync);

      // Hapus dari IndexedDB HANYA setelah proses kirim berhasil
      for (const offlineId of offlineIds) {
        try {
          await deletePendingData(offlineId);
        } catch (deleteError) {
          console.warn(
            'Gagal menghapus data Production dari IndexedDB:',
            offlineId,
            deleteError
          );
        }
      }

      // Baca ulang Google Sheets untuk memastikan data sudah masuk
      const sharedLogs = await readLogsFromGoogleSheets(gsUrl);

      console.log('[ACUAN NI SETLOGS TRACE]', {
        source: 'autoSyncProduction',
        count: sharedLogs.length,
        latest: sharedLogs.length ? {
          date: sharedLogs[0]?.date,
          pit: sharedLogs[0]?.pit,
          dumping: sharedLogs[0]?.dumpingArea,
          niGrade: sharedLogs[0]?.niGrade,
          type: typeof sharedLogs[0]?.niGrade,
        } : null,
      });
      setLogs(sharedLogs);
      setGsRemoteCount(sharedLogs.length);
      setGsStatus(`Terhubung • ${sharedLogs.length} baris`);
      notify(message);
    } catch (error) {
      setGsStatus(`Gagal • ${error.message}`);
      notify(
        `Data tersimpan di perangkat, tetapi gagal sinkron ke Google Sheets: ${error.message}`
      );
    } finally {
      setGsLoading(false);
    }
  };

  const autoSyncAttendance = async (
    newAttendanceItems,
    message,
    offlineIds = []
  ) => {
    if (!gsUrl) return;

    const cleanAttendance = mergeAttendanceItems(newAttendanceItems || []);
    if (!cleanAttendance.length) {
      setGsStatus('Absensi tidak ada yang perlu dikirim');
      notify('Tidak ada data absensi baru yang valid untuk dikirim.');
      return;
    }

    setGsLoading(true);
    setGsStatus('Menyinkronkan Daily Absensi...');
    try {
      await syncAttendanceToGoogleSheets(gsUrl, cleanAttendance);

      // Hapus queue IndexedDB hanya setelah Google Sheets menerima data.
      for (const offlineId of offlineIds) {
        try {
          await deletePendingData(offlineId);
        } catch (deleteError) {
          console.warn(
            'Gagal menghapus data Daily Absensi dari IndexedDB:',
            offlineId,
            deleteError
          );
        }
      }

      const sharedAttendance = await readAttendanceFromGoogleSheets(gsUrl);
      setAttendance(mergeAttendanceItems(sharedAttendance));
      setGsStatus(`Absensi tersinkronisasi • ${cleanAttendance.length} baris`);
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

    const rawNiGrade = String(dailyForm.niGrade ?? '').trim();
    const parsedNiGrade = parseAcuanNiValue(dailyForm.niGrade);
    if (rawNiGrade && parsedNiGrade === null) {
      notify('Acuan Ni harus berupa angka valid.');
      return;
    }

    const newLog = normalizeProductionNiRecord({
      ...dailyForm,
      id: Date.now(),
      recordId: createProductionRecordId(),
      status: dailyForm.status || 'Open',
      block: dailyForm.block || '',
      ritPrevious,
      ritToday,
      ritTotal,
      tonnage: ritTotal * 15,
      niGrade: parsedNiGrade,
      feGrade: Number(dailyForm.feGrade) || 0,
      mc: Number(dailyForm.mc) || 0,
    });

    const nextLogs = [newLog, ...logs];

    setLogs(nextLogs);
setDailyForm({ ...emptyDaily, date: toWitaDateInput() });
setDailyOpen(false);

// ========================================================
// SIMPAN DATA BARU KE INDEXEDDB
// ========================================================
const offlineData = await savePendingData(
  'production',
  newLog
);

// ========================================================
// JIKA ONLINE → LANGSUNG SYNC
// JIKA OFFLINE → TETAP MENUNGGU DI INDEXEDDB
// ========================================================
if (navigator.onLine && gsUrl) {
  await autoSyncProduction(
    [newLog],
    'Laporan produksi berhasil disimpan dan disinkronkan.',
    [offlineData.id]
  );
} else {
  setGsStatus(
    'Offline • Data produksi disimpan di perangkat'
  );

  notify(
    'Data produksi disimpan di perangkat dan menunggu sinkronisasi.'
  );
}

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

    const selectedNames = Array.isArray(form.selectedNames)
      ? form.selectedNames
      : [form.name].filter(Boolean);

    const cleanedNames = [...new Set(
      selectedNames
        .map(normalizeAttendanceName)
        .filter(Boolean)
    )];

    if (!cleanedNames.length) {
      notify('Pilih minimal satu nama untuk menyimpan absensi.');
      return;
    }

    const basePayload = {
      ...form,
      date: String(form.date || '').trim(),
      shift: String(form.shift || '').trim(),
      location: String(form.location || '').trim(),
      penanggungJawab: String(form.penanggungJawab || '').trim().replace(/\s+/g, ' '),
      pembahasan: String(form.pembahasan || '').trim(),
    };

    if (!basePayload.penanggungJawab || !basePayload.pembahasan) {
      notify('Penanggung Jawab dan Pembahasan wajib diisi sebelum menyimpan absensi.');
      return;
    }

    let remoteAttendance = [];
    if (gsUrl) {
      try {
        remoteAttendance = await readAttendanceFromGoogleSheets(gsUrl);
      } catch {
        remoteAttendance = [];
      }
    }

    const existing = mergeAttendanceItems([...attendance, ...remoteAttendance]);
    const candidates = [];
    const seenKeys = new Set();

    cleanedNames.forEach((name, index) => {
      const candidate = {
        ...basePayload,
        name,
        id: Date.now() + index,
      };

      const candidateKey = attendanceKey(candidate);
      if (!candidateKey || seenKeys.has(candidateKey)) {
        return;
      }

      if (existing.some((item) => attendanceKey(item) === candidateKey)) {
        return;
      }

      seenKeys.add(candidateKey);
      candidates.push(candidate);
    });

    if (!candidates.length) {
      notify('Absensi untuk nama, tanggal, dan shift ini sudah ada atau data belum valid. Data tidak dikirim ulang.');
      return;
    }

    const nextAttendance = mergeAttendanceItems([...candidates, ...attendance]);
    setAttendance(nextAttendance);

    const offlineIds = [];
    for (const candidate of candidates) {
      const offlineData = await savePendingData('attendance', candidate);
      offlineIds.push(offlineData.id);
    }

    if (navigator.onLine && gsUrl) {
      await autoSyncAttendance(
        candidates,
        'Data Daily Absensi berhasil disimpan dan disinkronkan.',
        offlineIds
      );
    } else {
      setGsStatus(
        'Offline • Data Daily Absensi disimpan di perangkat'
      );

      notify(
        'Data Daily Absensi disimpan di perangkat dan menunggu sinkronisasi.'
      );
    }
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
    const productionQueue = (await getPendingData()).filter((item) => {
      const type = String(item.type || '').toLowerCase();
      return type === 'production' || type === 'produksi';
    });

    const itemsToSync = productionQueue.flatMap((item) => {
      const payloadItems = Array.isArray(item.payload)
        ? item.payload
        : [item.payload];

      return payloadItems.map((payload, index) => ({
        ...payload,
        recordId: payload?.recordId || payload?.id || `${item.id}-${index}`,
      }));
    });

    if (itemsToSync.length) {
      await syncLogsToGoogleSheets(gsUrl, itemsToSync);

      for (const item of productionQueue) {
        await deletePendingData(item.id);
      }
    }

    const remoteLogs = await readLogsFromGoogleSheets(gsUrl);
    if (remoteLogs.length > 0) setLogs(remoteLogs);
    setGsRemoteCount(remoteLogs.length);
    setGsStatus(`Terhubung • ${remoteLogs.length} baris`);
    notify(
      itemsToSync.length
        ? `Sinkronisasi Production berhasil: ${itemsToSync.length} record.`
        : 'Tidak ada data Production pending untuk disinkronkan.'
    );
  } catch (error) {
    setGsStatus(`Gagal • ${error.message}`);

    notify(
      `Sinkronisasi gagal: ${error.message}`
    );
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

    let remoteAttendance = [];
    try {
      remoteAttendance = await readAttendanceFromGoogleSheets(gsUrl);
    } catch {
      remoteAttendance = [];
    }

    const unsyncedAttendance = getUnsyncedAttendanceItems(attendance, remoteAttendance);

    if (!unsyncedAttendance.length) {
      setGsStatus('Semua absensi sudah sinkron');
      notify('Tidak ada data absensi baru yang perlu dikirim.');
      return;
    }

    setGsLoading(true);
    setGsStatus('Mengirim data Daily Absensi...');
    try {
      await syncAttendanceToGoogleSheets(gsUrl, unsyncedAttendance);

      // Bersihkan queue IndexedDB yang cocok dengan data absensi
      // yang baru saja berhasil dikirim.
      const pendingItems = await getPendingData();
      const syncedKeys = new Set(
        unsyncedAttendance.map((item) => attendanceKey(item))
      );

      for (const item of pendingItems) {
        if (
          item.type === 'attendance' &&
          syncedKeys.has(attendanceKey(item.payload))
        ) {
          try {
            await deletePendingData(item.id);
          } catch (deleteError) {
            console.warn(
              'Gagal menghapus queue absensi:',
              item.id,
              deleteError
            );
          }
        }
      }

      const sharedAttendance = await readAttendanceFromGoogleSheets(gsUrl);
      setAttendance(mergeAttendanceItems(sharedAttendance));
      setGsStatus(`Absensi tersinkronisasi • ${unsyncedAttendance.length} baris`);
      notify(`Data Daily Absensi berhasil disinkronisasi: ${unsyncedAttendance.length} baris.`);
    } catch (error) {
      setGsStatus(`Gagal • ${error.message}`);
      notify(`Gagal sinkronisasi absensi: ${error.message}`);
    } finally {
      setGsLoading(false);
    }
  };

  useEffect(() => {
    const role = authSession?.user?.role || 'USER';
    const ownerOnlyTabs = ['owner-users', 'owner-master', 'owner-settings'];
    const adminTabs = ['admin-users', 'admin-master', 'admin-settings'];

    if (role === 'USER' && [...ownerOnlyTabs, ...adminTabs].includes(activeTab)) {
      setActiveTab('dashboard');
    } else if (role === 'APP_ADMIN' && ownerOnlyTabs.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [authSession?.user?.role, activeTab]);

  if (!authSession) {
    return (
      <LoginScreen
        onLogin={handleAuthLogin}
        error={authError}
        loading={authLoading}
      />
    );
  }

  const currentUser = authSession?.user || null;
  const currentRole = currentUser?.role || 'USER';
  const adminPageTitles = {
    'owner-users': 'Manajemen Pengguna',
    'owner-master': 'Master Akun',
    'owner-settings': 'Pengaturan',
    'admin-users': 'Manajemen User',
    'admin-master': 'Master User',
    'admin-settings': 'Pengaturan',
  };

  return (
    <>
      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        pendingCount={pending.filter((job) => job.status !== 'Selesai').length}
        title={pageTitles[activeTab] || 'GC PIT REPORT'}
        alert={alert}
        setAlert={setAlert}
        theme={theme}
        onThemeChange={setTheme}
        onInputDaily={() => setDailyOpen(true)}
        onInputPending={() => setPendingOpen(true)}
        onCopyExcel={handleCopyExcel}
        onSyncGoogleSheets={syncGoogleSheets}
        onLogout={handleLogout}
        user={currentUser}
        role={currentRole}
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
            gsUrlInput={gsUrlInput}
            setGsUrlInput={setGsUrlInput}
            onSaveUrl={saveGsUrl}
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

        {activeTab === 'owner-master' && <MasterAkunPage role={currentRole} />}
        {activeTab === 'owner-users' && <ManagementUserPage role={currentRole} />}
        {activeTab === 'owner-settings' && currentRole === 'OWNER' && (
          <div className="adminPlaceholder">
            <h3>Pengaturan</h3>
            <p>Pengaturan aplikasi umum tetap mengikuti konfigurasi GC PIT REPORT yang sudah ada.</p>
            <button type="button" className="primaryButton" onClick={() => setActiveTab('owner-users')}>
              Management User
            </button>
          </div>
        )}
        {activeTab === 'admin-master' && <MasterAkunPage role={currentRole} />}
        {activeTab === 'admin-users' && <ManagementUserPage role={currentRole} />}
        {activeTab === 'admin-settings' && currentRole === 'APP_ADMIN' && (
          <div className="adminPlaceholder">
            <h3>Pengaturan</h3>
            <button type="button" className="primaryButton" onClick={() => setActiveTab('admin-users')}>
              Management User
            </button>
          </div>
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