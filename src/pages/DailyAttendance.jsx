import { useEffect, useRef, useState } from 'react';
import { Camera, CloudUpload, ImagePlus, X } from 'lucide-react';
import { attendanceLocations, attendanceNames, emptyAttendance } from '../data/initialData';
import { dateFmt, fmt } from '../utils/formatters';
import { normalizeAttendanceName } from '../services/googleSheetsService';
import { compressGalleryPhoto } from '../services/photoCompression';

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
    selectedNames: [],
    photoDataUrl: '',
  }));

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [savedReport, setSavedReport] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const photoInputRef = useRef(null);

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

  const toggleName = (name) => {
    const selectedName = normalizeAttendanceName(name);

    setForm((current) => {
      const currentNames = Array.isArray(current.selectedNames)
        ? current.selectedNames.map(normalizeAttendanceName)
        : [];
      const nextNames = currentNames.includes(selectedName)
        ? currentNames.filter((item) => item !== selectedName)
        : [...currentNames, selectedName];

      return {
        ...current,
        selectedNames: nextNames,
        name: nextNames[0] || '',
      };
    });
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

  const selectGalleryPhoto = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file) return;

    setPhotoProcessing(true);

    try {
      const compressedDataUrl = await compressGalleryPhoto(file);
      setPhotoPreview(compressedDataUrl);
      update('photoDataUrl', compressedDataUrl);
    } catch (error) {
      alert(error?.message || 'Foto tidak dapat diproses. Silakan pilih foto lain.');
    } finally {
      setPhotoProcessing(false);
    }
  };

  const removePhoto = () => {
    setPhotoPreview('');
    update('photoDataUrl', '');
  };

  const formatReportDate = (dateValue) => {
    if (!dateValue) return '-';

    const normalized = String(dateValue).includes('T')
      ? dateValue
      : `${dateValue}T00:00:00`;

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateValue;

    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(parsed);
  };

  const buildWhatsAppMessage = (report) => {
    if (!report) return '';

    const participants = (report.participants || [])
      .map(normalizeAttendanceName)
      .filter(Boolean);
    const lines = [];

    const reportTitle = `P5M ${String(report.location || '').toUpperCase()}`;
    lines.push(reportTitle);
    lines.push('');
    lines.push(`Tanggal : ${report.dateLabel || '-'}`);
    lines.push('');
    lines.push(`Penanggung Jawab : ${report.penanggungJawab || '-'}`);
    lines.push('');
    lines.push(`Lokasi : ${report.location || '-'}`);
    lines.push('');
    lines.push('');
    lines.push(`Topik : ${report.pembahasan || '-'}`);
    lines.push('');
    lines.push('');
    lines.push(`Jumlah Peserta : ${participants.length} Orang`);
    lines.push('');

    participants.forEach((participant, index) => {
      lines.push(`${index + 1}. ${participant}`);
    });

    return lines.join('\n');
  };

  const openWhatsAppShare = async () => {
    if (!savedReport) return;

    const text = buildWhatsAppMessage(savedReport);
    const fileDataUrl = savedReport.photoDataUrl || '';

    if (navigator.share && fileDataUrl && navigator.canShare) {
      try {
        const match = fileDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
        if (match) {
          const mimeType = match[1] || 'image/jpeg';
          const binary = atob(match[2]);
          const bytes = new Uint8Array(binary.length);

          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }

          const file = new File([bytes], 'daily-absensi.jpg', { type: mimeType });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'Laporan Daily Absensi',
              text,
              files: [file],
            });
            return;
          }
        }
      } catch (error) {
        console.warn('Share file WhatsApp tidak didukung, fallback ke teks:', error);
      }
    }

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  const save = async (event) => {
    event.preventDefault();

    const selectedNames = (Array.isArray(form.selectedNames)
      ? form.selectedNames
      : [form.name].filter(Boolean)
    ).map(normalizeAttendanceName).filter(Boolean);

    try {
      await onSaveAttendance(event, {
        ...form,
        selectedNames,
        name: selectedNames[0] || form.name || '',
      });

      const participantNames = selectedNames.filter(
        (name) => name !== normalizeAttendanceName(form.penanggungJawab)
      );

      setSavedReport({
        date: form.date,
        dateLabel: formatReportDate(form.date),
        penanggungJawab: form.penanggungJawab,
        location: form.location,
        pembahasan: form.pembahasan,
        participants: participantNames,
        photoDataUrl: photoPreview || form.photoDataUrl || '',
      });

      setForm({
        ...emptyAttendance,
        date: form.date,
        selectedNames: [],
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

          <label className="attendanceNameChecklistLabel">
            <span>Nama</span>
            <div className="attendanceNameChecklistBox">
              {attendanceNames.map((sourceName) => {
                const name = normalizeAttendanceName(sourceName);
                const checked = (form.selectedNames || [])
                  .map(normalizeAttendanceName)
                  .includes(name);

                return (
                  <label
                    key={name}
                    className={`attendanceNameItem ${checked ? 'checked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleName(name)}
                    />
                    <span>{name}</span>
                  </label>
                );
              })}
            </div>
          </label>

          <label>
            <span>Penanggung Jawab</span>
            <input
              type="text"
              value={form.penanggungJawab || ''}
              onChange={(event) =>
                update('penanggungJawab', event.target.value)
              }
              placeholder="Masukkan nama penanggung jawab"
              required
            />
          </label>

          <label>
            <span>Pembahasan</span>
            <textarea
              value={form.pembahasan || ''}
              onChange={(event) =>
                update('pembahasan', event.target.value)
              }
              rows={4}
              placeholder="Masukkan topik atau pembahasan"
              required
            />
          </label>

          <div className="attendancePhotoBox">
            <div>
              <strong>Foto Absensi</strong>
              <small>
                Foto galeri dikompres otomatis maksimal 100 KB.
              </small>
            </div>

            <div className="attendancePhotoActions">
              <button
                type="button"
                className="primary"
                onClick={openCamera}
                disabled={cameraLoading || photoProcessing || cameraOpen}
              >
                <Camera size={16} />
                {cameraLoading ? 'Membuka Kamera...' : 'Ambil Foto'}
              </button>

              <button
                type="button"
                className="attendancePhotoFileButton"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoProcessing || cameraOpen}
              >
                <ImagePlus size={16} />
                {photoProcessing ? 'Memproses Foto...' : 'Tambahkan File'}
              </button>

              <input
                ref={photoInputRef}
                className="attendancePhotoFileInput"
                type="file"
                accept="image/*"
                onChange={selectGalleryPhoto}
                disabled={photoProcessing || cameraOpen}
                aria-label="Pilih foto dari galeri atau penyimpanan perangkat"
              />
            </div>

            {photoPreview && (
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

              <div className="cameraFrameWrap">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="cameraPreview"
                />
              </div>

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

        {savedReport && (
          <div className="attendanceSharePreview">
            <div className="attendanceSharePreviewHead">
              <strong>Preview Laporan</strong>
            </div>

            {savedReport.photoDataUrl && (
              <img
                src={savedReport.photoDataUrl}
                alt="Preview foto absensi"
                className="attendanceSharePreviewImage"
              />
            )}

            <div className="attendanceSharePreviewContent">
              <div className="attendanceShareTitle">P5M {String(savedReport.location || '').toUpperCase()}</div>
              <p>
                <strong>Hari / Tanggal :</strong> {savedReport.dateLabel || savedReport.date || '-'}
              </p>
              <p>
                <strong>Penanggung Jawab :</strong> {savedReport.penanggungJawab || '-'}
              </p>
              <p>
                <strong>Lokasi :</strong> {savedReport.location || '-'}
              </p>
              <p>
                <strong>Topik :</strong> {savedReport.pembahasan || '-'}
              </p>
              <p>
                <strong>Jumlah Peserta :</strong> {savedReport.participants?.length || 0} Orang
              </p>

              <ol>
                {(savedReport.participants || []).map((participant) => (
                  <li key={`${participant}-${Math.random()}`}>
                    {participant}
                  </li>
                ))}
              </ol>
            </div>

            <button
              type="button"
              className="primary attendanceShareButton"
              onClick={openWhatsAppShare}
            >
              Share ke WhatsApp
            </button>
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
                <th>Penanggung Jawab</th>
                <th>Pembahasan</th>
                <th>Timestamp Pengumpulan</th>
                <th>Foto</th>
              </tr>
            </thead>

            <tbody>
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center' }}>
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
                      <td>{normalizeAttendanceName(item.name) || '-'}</td>
                      <td>{item.penanggungJawab || '-'}</td>
                      <td style={{ maxWidth: '220px', whiteSpace: 'pre-wrap' }}>
                        {item.pembahasan || '-'}
                      </td>
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
