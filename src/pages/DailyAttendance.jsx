import { useEffect, useRef, useState } from 'react';
import { Camera, CloudUpload, X } from 'lucide-react';
import { attendanceLocations, attendanceNames, emptyAttendance } from '../data/initialData';
import { dateFmt, fmt } from '../utils/formatters';

const MAX_PHOTO_BYTES = 100 * 1024;

function stopCamera(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Foto tidak dapat diproses.'));
    reader.readAsDataURL(blob);
  });
}

async function compressPhotoTo100Kb(source) {
  const imageUrl =
    typeof source === 'string'
      ? source
      : URL.createObjectURL(source);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Foto tidak dapat dibaca.'));
      image.src = imageUrl;
    });

    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;

    const maxDimension = 1280;

    if (Math.max(width, height) > maxDimension) {
      const ratio = maxDimension / Math.max(width, height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      throw new Error('Browser tidak mendukung pemrosesan foto.');
    }

    for (let scaleAttempt = 0; scaleAttempt < 8; scaleAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      for (let quality = 0.82; quality >= 0.25; quality -= 0.07) {
        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        });

        if (!blob) continue;

        if (blob.size <= MAX_PHOTO_BYTES) {
          return await blobToDataUrl(blob);
        }
      }

      width = Math.round(width * 0.8);
      height = Math.round(height * 0.8);
    }

    throw new Error('Foto tidak dapat dikompres sampai maksimal 100 KB.');
  } finally {
    if (typeof source !== 'string') {
      URL.revokeObjectURL(imageUrl);
    }
  }
}

export default function DailyAttendance({
  attendance,
  onSaveAttendance,
  onSyncAttendance,
  syncing,
}) {
  const [form, setForm] = useState(() => ({
    ...emptyAttendance,
    photoDataUrl: '',
  }));

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const update = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const openCamera = async () => {
    setCameraLoading(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Kamera tidak tersedia. Pastikan aplikasi dibuka melalui HTTPS dan browser mengizinkan kamera.'
        );
      }

      stopCamera(streamRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (error) {
      console.error('Kamera gagal dibuka:', error);
      alert(
        error?.message ||
          'Kamera tidak dapat dibuka. Izinkan akses kamera pada browser.'
      );
    } finally {
      setCameraLoading(false);
    }
  };

  const closeCamera = () => {
    stopCamera(streamRef.current);
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      alert('Kamera belum siap. Tunggu beberapa detik lalu coba lagi.');
      return;
    }

    setPhotoProcessing(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Kamera tidak dapat diproses.');

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const compressedDataUrl = await compressPhotoTo100Kb(rawDataUrl);

      setPhotoPreview(compressedDataUrl);
      update('photoDataUrl', compressedDataUrl);
      closeCamera();
    } catch (error) {
      console.error('Gagal mengambil foto:', error);
      alert(
        error?.message ||
          'Foto gagal diproses. Silakan coba lagi.'
      );
    } finally {
      setPhotoProcessing(false);
    }
  };

  const removePhoto = () => {
    setPhotoPreview('');
    update('photoDataUrl', '');
  };

  const save = async (event) => {
    event.preventDefault();

    try {
      await onSaveAttendance(event, form);

      setForm({
        ...emptyAttendance,
        date: form.date,
        photoDataUrl: '',
      });
      setPhotoPreview('');
    } catch (error) {
      console.error('Gagal menyimpan absensi:', error);
    }
  };

  return (
    <section className="pageStack">
      <section className="panel attendanceDashboard">
        <div className="panelHead">
          <div>
            <h3>Daily Absensi</h3>
          </div>

          <button
            type="button"
            onClick={onSyncAttendance}
            disabled={syncing}
          >
            <CloudUpload size={14} />
            {syncing ? 'Sinkronisasi...' : 'Sinkronkan'}
          </button>
        </div>

        <form className="attendanceForm" onSubmit={save}>
          <label>
            <span>Tanggal</span>
            <input
              type="date"
              value={form.date || ''}
              onChange={(event) =>
                update('date', event.target.value)
              }
              required
            />
          </label>

          <label>
            <span>Shift</span>
            <select
              value={form.shift || ''}
              onChange={(event) =>
                update('shift', event.target.value)
              }
              required
            >
              <option value="Shift 1 (Siang)">
                Shift 1 (Siang)
              </option>
              <option value="Shift 2 (Malam)">
                Shift 2 (Malam)
              </option>
            </select>
          </label>

          <label>
            <span>Lokasi Kerja</span>
            <select
              value={form.location || ''}
              onChange={(event) =>
                update('location', event.target.value)
              }
              required
            >
              <option value="">Pilih lokasi kerja</option>
              {attendanceLocations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Nama</span>
            <select
              value={form.name || ''}
              onChange={(event) =>
                update('name', event.target.value)
              }
              required
            >
              <option value="">Pilih nama</option>
              {attendanceNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="attendancePhotoBox">
            <div>
              <strong>Foto Absensi</strong>
              <small>
                Foto dikompres otomatis maksimal 100 KB.
              </small>
            </div>

            {!photoPreview ? (
              <button
                type="button"
                className="primary"
                onClick={openCamera}
                disabled={cameraLoading || photoProcessing}
              >
                <Camera size={16} />
                {cameraLoading ? 'Membuka Kamera...' : 'Ambil Foto'}
              </button>
            ) : (
              <div className="attendancePhotoPreview">
                <img
                  src={photoPreview}
                  alt="Preview foto absensi"
                />

                <button
                  type="button"
                  onClick={removePhoto}
                >
                  <X size={14} />
                  Ganti Foto
                </button>
              </div>
            )}
          </div>

          <button
            className="primary"
            type="submit"
            disabled={photoProcessing || cameraOpen}
          >
            Simpan Absensi
          </button>
        </form>

        {cameraOpen && (
          <div
            className="cameraModal"
            role="dialog"
            aria-modal="true"
            aria-label="Kamera absensi"
          >
            <div className="cameraModalContent">
              <div className="cameraModalHead">
                <strong>Ambil Foto Absensi</strong>
                <button
                  type="button"
                  onClick={closeCamera}
                  disabled={photoProcessing}
                  aria-label="Tutup kamera"
                >
                  <X size={18} />
                </button>
              </div>

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="cameraPreview"
              />

              <button
                type="button"
                className="primary cameraCaptureButton"
                onClick={capturePhoto}
                disabled={photoProcessing}
              >
                <Camera size={18} />
                {photoProcessing
                  ? 'Mengompres Foto...'
                  : 'Ambil Foto'}
              </button>
            </div>
          </div>
        )}

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Shift</th>
                <th>Lokasi Kerja</th>
                <th>Nama</th>
                <th>Timestamp Pengumpulan</th>
                <th>Foto</th>
              </tr>
            </thead>

            <tbody>
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center' }}>
                    Belum ada data absensi.
                  </td>
                </tr>
              ) : (
                attendance.map((item) => {
                  const photo =
                    item.photo ||
                    item.foto ||
                    item.photoUrl ||
                    item.photoDataUrl ||
                    '';

                  return (
                    <tr key={item.id}>
                      <td>{dateFmt(item.date)}</td>
                      <td>{item.shift || '-'}</td>
                      <td>{item.location || '-'}</td>
                      <td>{item.name || '-'}</td>
                      <td>{item.submissionTimestamp || '-'}</td>
                      <td>
                        {photo ? (
                          <a
                            href={photo}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Lihat Foto
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
