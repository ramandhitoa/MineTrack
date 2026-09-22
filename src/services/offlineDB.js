// ============================================================
// MineTrack - Offline Database
// IndexedDB untuk menyimpan data ketika internet offline
// ============================================================

const DB_NAME = 'MineTrackOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingData';

// Membuka database IndexedDB
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Buat object store jika belum ada
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });

        // Index untuk pencarian data
        store.createIndex('status', 'status', {
          unique: false,
        });

        store.createIndex('type', 'type', {
          unique: false,
        });

        store.createIndex('createdAt', 'createdAt', {
          unique: false,
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Membuat ID unik untuk data offline
export function createOfflineId() {
  return (
    'offline-' +
    Date.now() +
    '-' +
    Math.random().toString(36).substring(2, 10)
  );
}

// ============================================================
// SIMPAN DATA OFFLINE
// ============================================================

export async function savePendingData(type, payload) {
  const db = await openDB();

  const data = {
    id: createOfflineId(),

    // Jenis data:
    // production
    // attendance
    // oregetting
    type,

    payload,

    status: 'pending',

    createdAt: new Date().toISOString(),

    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      'readwrite'
    );

    const store = transaction.objectStore(STORE_NAME);

    const request = store.add(data);

    request.onsuccess = () => {
      resolve(data);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// AMBIL SEMUA DATA YANG MENUNGGU SYNC
// ============================================================

export async function getPendingData() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      'readonly'
    );

    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      const data = request.result || [];

      resolve(
        data.filter((item) => item.status === 'pending')
      );
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// HAPUS DATA SETELAH BERHASIL SYNC
// ============================================================

export async function deletePendingData(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      'readwrite'
    );

    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// HITUNG DATA PENDING
// ============================================================

export async function getPendingCount() {
  const data = await getPendingData();

  return data.length;
}

// ============================================================
// HAPUS SEMUA DATA OFFLINE
// HANYA UNTUK TESTING
// ============================================================

export async function clearPendingData() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      'readwrite'
    );

    const store = transaction.objectStore(STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// UPDATE DATA OFFLINE
// Digunakan untuk mengubah status / retryCount
// ============================================================

export async function updatePendingData(id, updates = {}) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      'readwrite'
    );

    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => {
      const data = request.result;

      if (!data) {
        reject(new Error(`Data offline dengan ID ${id} tidak ditemukan`));
        return;
      }

      const updatedData = {
        ...data,
        ...updates,
      };

      const updateRequest = store.put(updatedData);

      updateRequest.onsuccess = () => {
        resolve(updatedData);
      };

      updateRequest.onerror = () => {
        reject(updateRequest.error);
      };
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}