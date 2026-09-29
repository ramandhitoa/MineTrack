import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compressGalleryPhoto } from './photoCompression.js';
import { normalizeAttendancePayload_ } from './googleSheetsService.js';

const dailyAttendanceSource = readFileSync(
  new URL('../pages/DailyAttendance.jsx', import.meta.url),
  'utf8'
);

async function withCanvasMocks(run, { alwaysOverLimit = false, decodeFails = false } = {}) {
  const originalGlobals = new Map();
  const qualityAttempts = [];
  const encodedSizes = [];
  const renderedDimensions = [];
  let objectUrlCount = 0;
  let currentFile;

  const setGlobal = (name, value) => {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  };

  setGlobal('URL', {
    createObjectURL(file) {
      currentFile = file;
      objectUrlCount += 1;
      return 'blob:gallery-test';
    },
    revokeObjectURL() {},
  });

  setGlobal('Image', class MockImage {
    naturalWidth = currentFile?.width || 2400;
    naturalHeight = currentFile?.height || 1600;
    onload = null;
    onerror = null;

    set src(_value) {
      queueMicrotask(() => {
        if (decodeFails) this.onerror?.();
        else this.onload?.();
      });
    }
  });

  setGlobal('document', {
    createElement() {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(callback, type, quality) {
          qualityAttempts.push(quality);
          renderedDimensions.push([canvas.width, canvas.height]);
          const size = alwaysOverLimit
            ? 100 * 1024 + 1
            : Math.max(20, Math.ceil(canvas.width * canvas.height * quality / 10));
          encodedSizes.push(size);
          callback(new Blob([new Uint8Array(size)], { type }));
        },
      };
      return canvas;
    },
  });

  setGlobal('FileReader', class MockFileReader {
    result = null;
    onloadend = null;
    onerror = null;

    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onloadend?.();
      }, () => this.onerror?.());
    }
  });

  try {
    return await run({
      qualityAttempts,
      encodedSizes,
      renderedDimensions,
      getObjectUrlCount: () => objectUrlCount,
    });
  } finally {
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test('file JPG, PNG, dan screenshot diterima lalu dinormalisasi menjadi JPEG <= 100 KB', async () => {
  for (const file of [
    { name: 'pit-photo.jpg', type: 'image/jpeg' },
    { name: 'pit-photo.png', type: 'image/png' },
    { name: 'Screenshot 2026-09-29.png', type: 'image/png' },
  ]) {
    await withCanvasMocks(async ({ qualityAttempts, encodedSizes, renderedDimensions }) => {
      const dataUrl = await compressGalleryPhoto(file);
      const encodedPhoto = Buffer.from(dataUrl.split(',')[1], 'base64');

      assert.match(dataUrl, /^data:image\/jpeg;base64,/);
      assert.ok(encodedPhoto.byteLength <= 100 * 1024);
      assert.ok(encodedSizes[0] > 100 * 1024);
      assert.ok(encodedSizes.some((size) => size <= 100 * 1024));
      assert.ok(qualityAttempts.length > 1);
      assert.equal(new Set(renderedDimensions.map(([width, height]) => `${width}x${height}`)).size, 1);
    });
  }
});

test('file non-image ditolak sebelum decode', async () => {
  await withCanvasMocks(async ({ getObjectUrlCount }) => {
    await assert.rejects(
      compressGalleryPhoto({ name: 'report.txt', type: 'text/plain' }),
      /bukan gambar yang valid/
    );
    assert.equal(getObjectUrlCount(), 0);
  });
});

test('image rusak atau tidak dapat didecode ditolak', async () => {
  await withCanvasMocks(async () => {
    await assert.rejects(
      compressGalleryPhoto({ name: 'broken.jpg', type: 'image/jpeg' }),
      /bukan gambar yang valid/
    );
  }, { decodeFails: true });
});

test('kompresi berhenti dengan error jika ukuran tetap di atas 100 KB pada resolusi minimum', async () => {
  await withCanvasMocks(async ({ renderedDimensions }) => {
    await assert.rejects(
      compressGalleryPhoto({ name: 'too-detailed.jpg', type: 'image/jpeg' }),
      /maksimal 100 KB/
    );
    assert.deepEqual(renderedDimensions.at(-1), [1, 1]);
  }, { alwaysOverLimit: true });
});

test('kamera tetap memakai capture dan menulis ke preview/photoDataUrl yang sama', () => {
  assert.match(dailyAttendanceSource, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(dailyAttendanceSource, /canvas\.toDataURL\('image\/jpeg', 0\.9\)/);
  assert.match(dailyAttendanceSource, /onClick=\{openCamera\}/);
  assert.match(dailyAttendanceSource, /accept="image\/\*"/);
  assert.match(
    dailyAttendanceSource,
    /setPhotoPreview\(compressedDataUrl\);\s*update\('photoDataUrl', compressedDataUrl\);/
  );
});

test('multiple nama tetap menerima nilai photoDataUrl yang sama', () => {
  const photoDataUrl = 'data:image/jpeg;base64,/9j/';
  const payload = normalizeAttendancePayload_([
    { date: '2026-09-29', name: 'HERMANTO', photoDataUrl },
    { date: '2026-09-29', name: 'ARDI RINALDI', photoDataUrl },
  ]);

  assert.equal(payload.length, 2);
  assert.deepEqual(payload.map((item) => item.photoDataUrl), [photoDataUrl, photoDataUrl]);
});