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
  getPendingData,
  deletePendingData,
} from './offlineDB';

import {
  syncLogsToGoogleSheets,
  syncAttendanceToGoogleSheets,
} from './googleSheetsService';


// ------------------------------------------------------------
// STATUS SYNC
// ------------------------------------------------------------

let isSyncing = false;


// ------------------------------------------------------------
// CEK INTERNET
// ------------------------------------------------------------

export function isOnline() {
  return navigator.onLine;
}


// ------------------------------------------------------------
// SYNC SATU DATA
// ------------------------------------------------------------

async function syncOneItem(item, gsUrl) {

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

      await syncLogsToGoogleSheets(
        gsUrl,
        Array.isArray(payload)
          ? payload
          : [payload]
      );

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

export async function syncPendingData(gsUrl) {

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

    const pendingItems =
      await getPendingData();


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
          gsUrl
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

export function startOfflineAutoSync(gsUrl) {

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
      gsUrl
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
        gsUrl
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
          gsUrl
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