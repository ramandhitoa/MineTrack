import {
  savePendingData,
  getPendingData,
  getPendingCount,
  clearPendingData,
} from './offlineDB';

// ============================================================
// TEST SIMPAN DATA OFFLINE
// ============================================================

export async function testSaveOffline() {
  try {
    const result = await savePendingData('production', {
      test: true,
      message: 'TEST DATA OFFLINE',
      waktu: new Date().toISOString(),
    });

    console.log('✅ DATA BERHASIL DISIMPAN KE INDEXEDDB');
    console.log(result);

    return result;
  } catch (error) {
    console.error('❌ GAGAL SIMPAN DATA OFFLINE');
    console.error(error);

    throw error;
  }
}

// ============================================================
// TEST BACA DATA OFFLINE
// ============================================================

export async function testReadOffline() {
  try {
    const data = await getPendingData();

    console.log('📦 DATA PENDING DI INDEXEDDB:');
    console.log(data);

    return data;
  } catch (error) {
    console.error('❌ GAGAL MEMBACA INDEXEDDB');
    console.error(error);

    throw error;
  }
}

// ============================================================
// TEST HITUNG DATA PENDING
// ============================================================

export async function testCountOffline() {
  try {
    const count = await getPendingCount();

    console.log(`📊 JUMLAH DATA PENDING: ${count}`);

    return count;
  } catch (error) {
    console.error('❌ GAGAL MENGHITUNG DATA PENDING');
    console.error(error);

    throw error;
  }
}

// ============================================================
// TEST HAPUS SEMUA DATA
// ============================================================

export async function testClearOffline() {
  try {
    const result = await clearPendingData();

    console.log('🗑️ SEMUA DATA TEST OFFLINE DIHAPUS');

    return result;
  } catch (error) {
    console.error('❌ GAGAL MENGHAPUS DATA OFFLINE');
    console.error(error);

    throw error;
  }
}

// ============================================================
// DAFTARKAN KE WINDOW
// AGAR BISA DIPANGGIL DARI CHROME CONSOLE
// ============================================================

if (typeof window !== 'undefined') {
  window.testSaveOffline = testSaveOffline;
  window.testReadOffline = testReadOffline;
  window.testCountOffline = testCountOffline;
  window.testClearOffline = testClearOffline;

  console.log('✅ MineTrack Offline DB Test siap digunakan');
}