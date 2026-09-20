// ============================================================
// DASHBOARD DAILY ABSENSI
// Mencatat kehadiran personel berdasarkan tanggal, shift, lokasi kerja,
// dan foto dokumentasi.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CloudUpload,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  attendanceLocations,
  attendanceNames,
  emptyAttendance,
} from '../data/initialData';
import { dateFmt, fmt } from '../utils/formatters';

const MAX_PHOTO_BYTES = 100 * 1024;
const INITIAL_PHOTO_WIDTH = 1280;

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

async function compressPhoto(video) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Kamera belum siap. Silakan coba ambil foto lagi.');
  }

  let width = Math.min(sourceWidth, INITIAL_PHOTO_WIDTH);
  let height = Math.round((sourceHeight / sourceWidth) * width);

  for (let dimensionAttempt = 0; dimensionAttempt < 7; dimensionAttempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Browser tidak dapat memproses foto.');
    }

    context.drawImage(video, 0, 0, width, height);

    for (let quality = 0.85; quality >= 0.15; quality -= 0.05) {
      const blob = await canvasToBlob(canvas, quality);

      if (!blob) {
        continue;
      }

      if (blob.size <= MAX_PHOTO_BYTES) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();

          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Foto gagal diproses.'));
          reader.readAsDataURL(blob);
        });

        return {
          dataUrl,
          bytes: blob.size,
        };
      }
    }

    width = Math.round(width * 0.8);
    height = Math.round(height * 0.8);
  }

  throw new Error('Foto tidak dapat dikompres hingga maksimal 100 KB.');
}

export default function DailyAttendance({
  attendance,
  onSaveAttendance,
  onSyncAttendance,
  syncing,
}) {
  const [form, setForm] = useState(emptyAttendance);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoSize, setPhotoSize] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const update = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
      return undefined;
    }

    let cancelled = false;

    const startCamera = async () => {
      try {
        setCameraError('');

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Browser ini tidak mendukung akses kamera. Gunakan Chrome atau Edge pada perangkat yang memiliki kamera.'
          );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: 'environment',
            },
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        setCameraError(
          error?.message ||
            'Kamera tidak dapat dibuka. Pastikan izin kamera diberikan kepada browser.'
        );
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const openCamera = () => {
    setCameraError('');
    setCameraOpen(true);
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
    setCameraError('');
    setPhotoProcessing(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) {
      setCameraError('Kamera belum siap.');
      return;
    }

    try {
      setCameraError('');
      setPhotoProcessing(true);

      const compressed = await compressPhoto(videoRef.current);

      update('photoDataUrl', compressed.dataUrl);
      setPhotoSize(compressed.bytes);

      closeCamera();
    } catch (error) {
      setCameraError(
        error?.message || 'Foto gagal diproses. Silakan coba lagi.'
      );
    } finally {
      setPhotoProcessing(false);
    }
  };

  const removePhoto = () => {
    update('photoDataUrl', '');
    setPhotoSize(0);
  };

  const save = (event) => {
    onSaveAttendance(event, form);

    setForm({
      ...emptyAttendance,
      date: form.date,
    });

    setPhotoSize(0);
  };

  const hasPhoto = Boolean(form.photoDataUrl);

  return (
    <section className="pageStack">
      <section className="panel attendanceDashboard">
        <div className="panelHead">
          <div>
            <h2>Dashboard Daily Absensi</h2>
            <p>
              Pencatatan kehadiran berdasarkan tanggal, shift, lokasi kerja,
              dan nama personel
            </p>
          </div>

          <div className="attendanceActions">
            <span className="attendanceCount">
              {fmt(attendance.length)} Data
            </span>

            <button
              type="button"
              onClick={onSyncAttendance}
              disabled={syncing}
            >
              <CloudUpload size={14} />
              {syncing ? 'Menyinkronkan...' : 'Sync Google Sheets'}
            </button>
          </div>
        </div>

        <form className="attendanceForm" onSubmit={save}>
          <label>
            Tanggal / Hari / Bulan / Tahun
            <input
              type="date"
              value={form.date}
              onChange={(event) => update('date', event.target.value)}
              required
            />
          </label>

          <label>
            Shift
            <select
              value={form.shift}
              onChange={(event) => update('shift', event.target.value)}
            >
              <option>Shift 1</option>
              <option>Shift 2</option>
            </select>
          </label>

          <label>
            Lokasi Kerja
            <select
              value={form.location}
              onChange={(event) => update('location', event.target.value)}
            >
              {attendanceLocations.map((location) => (
                <option key={location}>{location}</option>
              ))}
            </select>
          </label>

          <label>
            Nama
            <select
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            >
              {attendanceNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <strong>Foto</strong>

            {!hasPhoto ? (
              <button
                className="primary"
                type="button"
                onClick={openCamera}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: 'fit-content',
                }}
              >
                <Camera size={16} />
                Ambil Foto
              </button>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  maxWidth: '420px',
                }}
              >
                <img
                  src={form.photoDataUrl}
                  alt="Preview foto absensi"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: '300px',
                    objectFit: 'cover',
                    borderRadius: '10px',
                    border: '1px solid #ddd',
                  }}
                />

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '13px' }}>
                    Foto siap
                    {photoSize
                      ? ` (${Math.ceil(photoSize / 1024)} KB)`
                      : ''}
                  </span>

                  <button
                    type="button"
                    onClick={openCamera}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <RotateCcw size={15} />
                    Ambil Ulang
                  </button>

                  <button
                    type="button"
                    onClick={removePhoto}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Trash2 size={15} />
                    Hapus
                  </button>
                </div>
              </div>
            )}
          </div>

          <button className="primary" type="submit">
            Simpan Absensi
          </button>
        </form>

        <div className="tableWrap attendanceTable">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Shift</th>
                <th>Lokasi Kerja</th>
                <th>Nama</th>
              </tr>
            </thead>

            <tbody>
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan="4" className="emptyState">
                    Belum ada data absensi.
                  </td>
                </tr>
              ) : (
                attendance.map((item) => (
                  <tr key={item.id}>
                    <td>{dateFmt(item.date)}</td>
                    <td>
                      <span className="pill">{item.shift}</span>
                    </td>
                    <td>
                      <b>{item.location}</b>
                    </td>
                    <td>{item.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {cameraOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ambil foto absensi"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.75)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
              maxHeight: '95vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: '14px',
              padding: '16px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <strong>Ambil Foto Absensi</strong>

              <button
                type="button"
                onClick={closeCamera}
                aria-label="Tutup kamera"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                position: 'relative',
                width: '100%',
                background: '#000',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: '65vh',
                  objectFit: 'cover',
                }}
              />

              {cameraError && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    textAlign: 'center',
                    color: '#fff',
                    background: 'rgba(0, 0, 0, 0.65)',
                  }}
                >
                  {cameraError}
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                marginTop: '14px',
              }}
            >
              <button
                type="button"
                onClick={closeCamera}
              >
                Batal
              </button>

              <button
                className="primary"
                type="button"
                onClick={capturePhoto}
                disabled={photoProcessing || Boolean(cameraError)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Camera size={18} />
                {photoProcessing ? 'Memproses...' : 'Jepret Foto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
