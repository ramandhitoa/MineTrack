// ============================================================
// MINETRACK - OFFLINE AUTO SYNC
// ------------------------------------------------------------
// Fungsi:
// 1. Membaca data pending dari IndexedDB
// 2. Mengirim Production ke Google Apps Script
// 3. Mengirim Daily Attendance ke Google Apps Script
// 4. Mengirim Ore Getting ke Google Apps Script
// 5. Jika berhasil -> data pending dihapus
// 6. Jika gagal -> data tetap berada di IndexedDB
// 7. Auto sync saat internet kembali
// 8. Retry otomatis setiap 30 detik
// ============================================================

import {
  savePendingData,
  getPendingData,
  deletePendingData,
} from './offlineDB';
import { STORAGE_KEYS } from '../constants';

import {
  createProductionRecordId,
  getConfirmedProductionPendingGroups,
  withProductionRecordIds,
  syncProductionAndReadBack,
  syncAttendanceToGoogleSheets,
} from './googleSheetsService';


// ------------------------------------------------------------
// STATUS SYNC
// ------------------------------------------------------------

let isSyncing = false;

function markLocalProductionRecordsSent(recordIds) {
  const raw = localStorage.getItem(STORAGE_KEYS.logs);
  if (!raw) {
    throw new Error('Riwayat Production lokal tidak ditemukan; antrean tetap pending.');
  }

  const logs = JSON.parse(raw);
  if (!Array.isArray(logs)) {
    throw new Error('Riwayat Production lokal tidak valid; antrean tetap pending.');
  }

  const confirmedIds = new Set(recordIds);
  const foundIds = new Set();
  const updatedLogs = logs.map((log) => {
    const recordId = String(log?.recordId || '').trim();
    if (!confirmedIds.has(recordId)) return log;
    foundIds.add(recordId);
    return { ...log, syncStatus: 'sent' };
  });

  if (foundIds.size !== confirmedIds.size) {
    throw new Error('Record Production terverifikasi tidak ditemukan di Local Storage; antrean tetap pending.');
  }
  localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(updatedLogs));
}

async function recoverPendingProductionFromLocalStorage() {
  const raw = localStorage.getItem(STORAGE_KEYS.logs);
  if (!raw) return;

  const logs = JSON.parse(raw);
  if (!Array.isArray(logs)) {
    throw new Error('Riwayat Production lokal tidak valid; antrean tetap pending.');
  }

  let logsChanged = false;
  for (const log of logs) {
    if (log?.syncStatus !== 'pending') continue;
    if (!String(log.recordId || '').trim()) {
      log.recordId = createProductionRecordId();
      logsChanged = true;
    }
  }
  if (logsChanged) {
    localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs));
  }

  const queuedItems = await getPendingData();
  const queuedRecordIds = new Set(queuedItems
    .filter((item) => ['production', 'produksi'].includes(String(item.type || '').toLowerCase()))
    .map((item) => String(item.payload?.recordId || '').trim())
    .filter(Boolean));

  for (const log of logs) {
    if (log?.syncStatus !== 'pending') continue;
    const recordId = String(log.recordId || '').trim();
    if (!queuedRecordIds.has(recordId)) {
      await savePendingData('production', log);
      queuedRecordIds.add(recordId);
    }
  }
}


// ------------------------------------------------------------
// CEK INTERNET
// ------------------------------------------------------------

export function isOnline() {
  return navigator.onLine;
}


// ------------------------------------------------------------
// SYNC SATU DATA
// ------------------------------------------------------------

async function syncOneItem(item, gsUrl, onProductionSynced) {

  if (!item || !item.id) {
    return false;
  }

  const type = String(item.type || '').toLowerCase();

  const payload = item.payload;


  try {

    // ========================================================
    // 1. PRODUCTION
    // ========================================================

    if (
      type === 'production' ||
      type === 'produksi'
    ) {

      const productionItems = withProductionRecordIds(
        Array.isArray(payload) ? payload : [payload],
        item.id
      );

      const { confirmedRecordIds, failedRecords, recordResults, remoteLogs } = await syncProductionAndReadBack(
        gsUrl,
        productionItems
      );
      const confirmedGroups = getConfirmedProductionPendingGroups(
        [{ pendingId: item.id, records: productionItems }],
        recordResults
      );

      if (!confirmedGroups.length) {
        console.warn('Production belum terkonfirmasi; queue tetap pending:', {
          itemId: item.id,
          failedRecords,
        });
        return false;
      }

      markLocalProductionRecordsSent(confirmedRecordIds);
      if (Array.isArray(remoteLogs)) onProductionSynced?.(remoteLogs);

      await deletePendingData(item.id);

      console.log(
        '✅ OFFLINE PRODUCTION BERHASIL DISINKRONKAN:',
        item.id
      );

      return true;
    }


    // ========================================================
    // 2. DAILY ABSENSI
    // ========================================================

    if (
      type === 'attendance' ||
      type === 'absensi'
    ) {

      await syncAttendanceToGoogleSheets(
        gsUrl,
        Array.isArray(payload)
          ? payload
          : [payload]
      );

      await deletePendingData(item.id);

      console.log(
        '✅ OFFLINE ABSENSI BERHASIL DISINKRONKAN:',
        item.id
      );

      return true;
    }


    // ========================================================
    // 3. ORE GETTING
    // ========================================================

    if (
      type === 'oregetting' ||
      type === 'ore_getting'
    ) {

      console.log(
        '📤 MENGIRIM OFFLINE ORE GETTING:',
        item.id
      );

      const items = Array.isArray(payload)
        ? payload
        : [payload];


      const response = await fetch(
        gsUrl,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'text/plain;charset=utf-8',
          },

          body: JSON.stringify({
            type: 'oregetting',
            items: items,
            values: items,
          }),
        }
      );


      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status}`
        );

      }


      const text = await response.text();


      let result;

      try {

        result = JSON.parse(text);

      } catch (parseError) {

        console.error(
          '❌ RESPONSE ORE GETTING BUKAN JSON:',
          text
        );

        throw new Error(
          'Response Google Apps Script tidak valid.'
        );

      }


      if (
        result &&
        result.success === false
      ) {

        throw new Error(
          result.message ||
          'Google Apps Script menolak data Ore Getting.'
        );

      }


      // ------------------------------------------------------
      // HANYA HAPUS INDEXEDDB JIKA SERVER BERHASIL
      // ------------------------------------------------------

      await deletePendingData(item.id);


      console.log(
        '✅ OFFLINE ORE GETTING BERHASIL DISINKRONKAN:',
        item.id
      );


      return true;
    }


    // ========================================================
    // TIPE DATA TIDAK DIKENAL
    // ========================================================

    console.warn(
      '⚠️ TIPE OFFLINE DATA TIDAK DIKENAL:',
      type,
      item
    );

    return false;


  } catch (error) {

    console.error(
      '❌ GAGAL SYNC:',
      item.id,
      error
    );

    // --------------------------------------------------------
    // JANGAN HAPUS DATA
    // Data tetap berada di IndexedDB
    // untuk dicoba kembali nanti.
    // --------------------------------------------------------

    return false;
  }
}


// ------------------------------------------------------------
// SYNC SEMUA DATA PENDING
// ------------------------------------------------------------

export async function syncPendingData(gsUrl, onProductionSynced, allowedTypes = null) {

  // ----------------------------------------------------------
  // JANGAN JALANKAN DUA SYNC BERSAMAAN
  // ----------------------------------------------------------

  if (isSyncing) {

    console.log(
      '⏳ Sync masih berjalan. Permintaan baru diabaikan.'
    );

    return {
      success: false,
      skipped: true,
      synced: 0,
      failed: 0,
    };
  }


  // ----------------------------------------------------------
  // TIDAK ADA INTERNET
  // ----------------------------------------------------------

  if (!navigator.onLine) {

    console.log(
      '🔴 OFFLINE - Sync ditunda.'
    );

    return {
      success: false,
      offline: true,
      synced: 0,
      failed: 0,
    };
  }


  // ----------------------------------------------------------
  // URL GOOGLE APPS SCRIPT BELUM ADA
  // ----------------------------------------------------------

  if (!gsUrl) {

    console.warn(
      '⚠️ URL Google Apps Script belum tersedia.'
    );

    return {
      success: false,
      missingUrl: true,
      synced: 0,
      failed: 0,
    };
  }


  isSyncing = true;

  let synced = 0;
  let failed = 0;


  try {

    // --------------------------------------------------------
    // AMBIL SEMUA DATA PENDING
    // --------------------------------------------------------

    await recoverPendingProductionFromLocalStorage();
    const queuedItems = await getPendingData();
    const pendingItems = Array.isArray(allowedTypes)
      ? queuedItems.filter((item) => allowedTypes.includes(String(item.type || '').toLowerCase()))
      : queuedItems;


    console.log(
      `📦 DATA PENDING DITEMUKAN: ${pendingItems.length}`
    );


    if (!pendingItems.length) {

      console.log(
        '✅ Tidak ada data yang perlu disinkronkan.'
      );

      return {
        success: true,
        synced: 0,
        failed: 0,
      };
    }


    // --------------------------------------------------------
    // TAMPILKAN JENIS DATA YANG MENUNGGU
    // --------------------------------------------------------

    console.table(
      pendingItems.map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        createdAt: item.createdAt,
      }))
    );


    // --------------------------------------------------------
    // KIRIM SATU PER SATU
    // --------------------------------------------------------

    for (const item of pendingItems) {

      // ------------------------------------------------------
      // JIKA INTERNET PUTUS DI TENGAH PROSES
      // ------------------------------------------------------

      if (!navigator.onLine) {

        console.warn(
          '🔴 Internet terputus saat proses sync.'
        );

        break;
      }


      const success =
        await syncOneItem(
          item,
          gsUrl,
          onProductionSynced
        );


      if (success) {

        synced++;

      } else {

        failed++;

      }
    }


    console.log(
      `📊 HASIL SYNC → berhasil: ${synced}, gagal: ${failed}`
    );


    return {
      success: failed === 0,
      synced,
      failed,
    };


  } catch (error) {

    console.error(
      '❌ AUTO SYNC ERROR:',
      error
    );


    return {
      success: false,
      synced,
      failed: failed + 1,
      error,
    };


  } finally {

    isSyncing = false;

  }
}


// ------------------------------------------------------------
// AUTO SYNC SAAT INTERNET KEMBALI
// ------------------------------------------------------------

export function startOfflineAutoSync(gsUrl, onProductionSynced) {

  console.log(
    '🔄 MineTrack Offline Auto Sync aktif.'
  );


  // ----------------------------------------------------------
  // 1. KETIKA INTERNET KEMBALI
  // ----------------------------------------------------------

  const handleOnline = async () => {

    console.log(
      '🟢 INTERNET KEMBALI - MEMULAI AUTO SYNC...'
    );

    await syncPendingData(
      gsUrl,
      onProductionSynced
    );
  };


  window.addEventListener(
    'online',
    handleOnline
  );


  // ----------------------------------------------------------
  // 2. KETIKA APLIKASI DIBUKA
  // ----------------------------------------------------------

  if (navigator.onLine) {

    setTimeout(() => {

      syncPendingData(
        gsUrl,
        onProductionSynced
      );

    }, 1000);
  }


  // ----------------------------------------------------------
  // 3. RETRY SETIAP 30 DETIK
  // ----------------------------------------------------------

  const intervalId =
    window.setInterval(() => {

      if (
        navigator.onLine &&
        !isSyncing
      ) {

        syncPendingData(
          gsUrl,
          onProductionSynced
        );

      }

    }, 30000);


  // ----------------------------------------------------------
  // RETURN CLEANUP
  // ----------------------------------------------------------

  return () => {

    window.removeEventListener(
      'online',
      handleOnline
    );

    window.clearInterval(
      intervalId
    );

    console.log(
      '🛑 MineTrack Offline Auto Sync dihentikan.'
    );
  };
}


// ------------------------------------------------------------
// EXPORT UNTUK DEBUG CONSOLE
// ------------------------------------------------------------

if (
  typeof window !== 'undefined'
) {

  window.mineTrackSyncPending =
    syncPendingData;

  window.mineTrackStartAutoSync =
    startOfflineAutoSync;

}