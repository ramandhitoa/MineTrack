import { useEffect, useState } from 'react';
import { areaPitOptions } from '../data/initialData';
import {
  buildOreGettingPayloadItem,
  DEFAULT_GOOGLE_APPS_SCRIPT_URL,
  readOreGettingFromGoogleSheets,
} from '../services/googleSheetsService';
import { toWitaDateInput } from '../utils/formatters';
import { formatOreGettingMethodId, getOreGettingAreaLabel } from '../utils/oreGetting';
import { formatReporterName } from '../utils/reporterName';
import { savePendingData, deletePendingData } from '../services/offlineDB';

const STORAGE_KEY = 'mineTrack_ore_getting_records';

const oreGettingInputStyle = {
  backgroundColor: '#163559',
  color: '#ffffff',
  border: '1px solid #2b4f7a',
  borderRadius: '8px',
  padding: '8px',
  fontSize: '11px',
  width: '100%',
  outline: 'none',
  WebkitTextFillColor: '#ffffff',
  caretColor: '#ffffff',
};

const oreGettingTimestampStyle = {
  backgroundColor: '#163559',
  color: '#ffffff',
  border: '1px solid #2b4f7a',
  borderRadius: '8px',
  padding: '8px',
  fontSize: '11px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const initialForm = {
  date: toWitaDateInput(),
  areaPit: '',
  shift: 'Shift 1 (Siang)',
  metode: 'CEK',
  idMetode: '',
  acuan: '',
  titikBor: '',
  blockModel: '',
  elevasi: '',
  jumlahSampel: '',
};

function formatWitaTimestamp(value) {
  if (!value) return '-';

  const text = String(value).trim();

  // Jika timestamp sudah berupa HH:mm WITA
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?:\s*WITA)?$/i);

  if (timeMatch) {
    return `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]} WITA`;
  }

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    const time = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Makassar',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    return `${time} WITA`;
  } catch {
    return '-';
  }
}

function getCurrentWitaTime() {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export default function OreGetting({ authSession }) {
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || 'null'
      );

      if (saved && saved.form) {
        return {
          ...initialForm,
          ...saved.form,
          areaPit: '',
          jumlahSampel: saved.form.jumlahSampel ?? '',
          metode: saved.form.metode || 'CEK',
        };
      }
    } catch (error) {
      console.error('Gagal membaca form Ore Getting:', error);
    }

    return initialForm;
  });
  const [sampleNumber, setSampleNumber] = useState('');

  const [records, setRecords] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || 'null'
      );

      return Array.isArray(saved?.records)
        ? saved.records
        : [];
    } catch (error) {
      console.error('Gagal membaca riwayat Ore Getting:', error);
      return [];
    }
  });
  const [sheetRecords, setSheetRecords] = useState([]);
  const idMetode = formatOreGettingMethodId({
    areaPit: form.areaPit,
    metode: form.metode,
    sampleNumber,
  });

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ form, records })
    );
  }, [form, records]);

  useEffect(() => {
    let cancelled = false;
    const gsUrl =
      localStorage.getItem('minetrack_gsheets_url') ||
      DEFAULT_GOOGLE_APPS_SCRIPT_URL;

    readOreGettingFromGoogleSheets(gsUrl)
      .then((remoteRecords) => {
        if (cancelled) return;
        setSheetRecords(remoteRecords);
      })
      .catch((error) => {
        console.warn('Gagal membaca riwayat Ore Getting dari Google Sheets:', error);
      });

    return () => { cancelled = true; };
  }, []);

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateJumlahSampel = (value) => {
    if (value === '') {
      updateField('jumlahSampel', '');
      return;
    }

    if (!/^\d*(\.\d*)?$/.test(value)) {
      return;
    }

    updateField('jumlahSampel', value);
  };

  const syncOreGettingToGoogleSheets = async (record) => {
    const gsUrl =
      localStorage.getItem('minetrack_gsheets_url') ||
      DEFAULT_GOOGLE_APPS_SCRIPT_URL;

    if (!gsUrl) {
      throw new Error('URL Google Apps Script belum tersedia.');
    }

    const response = await fetch(gsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        type: 'oregetting',
        items: [buildOreGettingPayloadItem(record, toWitaDateInput())],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result?.success !== true) {
      throw new Error(
        result?.message ||
          'Gagal menyimpan Ore Getting ke Google Sheets.'
      );
    }

    return result;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const reporterName = formatReporterName(authSession?.user?.name);
    if (!reporterName) {
      alert('Nama akun tidak tersedia. Silakan login kembali.');
      return;
    }

    if (!form.areaPit || !areaPitOptions.includes(form.areaPit)) {
      alert('Area PIT wajib dipilih.');
      return;
    }

    if (!sampleNumber.trim() || !idMetode) {
      alert(sampleNumber.trim()
        ? 'Format nomor sampel tidak valid untuk metode yang dipilih.'
        : 'Nomor sampel wajib diisi untuk membentuk ID Metode.');
      return;
    }

    const jumlahSampelValue =
      form.jumlahSampel === '' ||
      form.jumlahSampel === null ||
      form.jumlahSampel === undefined
        ? ''
        : Number(form.jumlahSampel);

    if (
      form.jumlahSampel !== '' &&
      !Number.isFinite(jumlahSampelValue)
    ) {
      alert('Jumlah Sampel harus berupa angka.');
      return;
    }

    if (
      form.jumlahSampel !== '' &&
      jumlahSampelValue < 0
    ) {
      alert('Jumlah Sampel tidak boleh negatif.');
      return;
    }

    // Timestamp menggunakan waktu Makassar / WITA.
    // Format yang disimpan: HH:mm WITA.
    const timestamp = getCurrentWitaTime() + ' WITA';

    const newRecord = {
      id: Date.now(),
      date: form.date || toWitaDateInput(),
      areaPit: form.areaPit,
      shift: form.shift,
      metode: form.metode,
      idMetode,
      acuan: form.acuan,
      titikBor: form.titikBor,
      blockModel: form.blockModel,
      elevasi: form.elevasi,
      jumlahSampel:
        form.jumlahSampel === ''
          ? ''
          : jumlahSampelValue,
      createdAt: timestamp,
      submissionTimestamp: timestamp,
      reporterName,
    };

    try {
      // ========================================================
      // SELALU SIMPAN TERLEBIH DAHULU KE INDEXEDDB
      // Jika internet putus, data tetap aman di perangkat.
      // offlineSync.js akan mengirim data saat internet kembali.
      // ========================================================
      const offlineData = await savePendingData(
        'oregetting',
        newRecord
      );

      // Tampilkan data langsung di riwayat lokal.
      setRecords((current) => [newRecord, ...current]);

      setForm({
        ...initialForm,
        date: toWitaDateInput(),
      });
      setSampleNumber('');

      // ========================================================
      // JIKA ONLINE → COBA KIRIM LANGSUNG
      // JIKA GAGAL → DATA TETAP DI INDEXEDDB UNTUK AUTO SYNC
      // ========================================================
      if (navigator.onLine) {
        try {
          await syncOreGettingToGoogleSheets(newRecord);

          // Hapus dari antrean hanya setelah Google Sheets sukses.
          await deletePendingData(offlineData.id);

          alert('Laporan Ore Getting berhasil disimpan dan disinkronkan.');
        } catch (syncError) {
          console.warn(
            'Ore Getting tersimpan di perangkat, tetapi sinkronisasi langsung gagal:',
            syncError
          );

          alert(
            'Laporan Ore Getting tersimpan di perangkat dan menunggu sinkronisasi.\n\n' +
              'Internet/Google Sheets belum dapat dihubungi. Data tidak hilang.'
          );
        }
      } else {
        alert(
          'Laporan Ore Getting tersimpan di perangkat dan menunggu sinkronisasi.\n\n' +
            'Saat internet kembali, data akan dikirim otomatis.'
        );
      }
    } catch (error) {
      console.error('Gagal menyimpan Ore Getting ke perangkat:', error);

      alert(
        'Data Ore Getting gagal disimpan ke perangkat. ' +
          (error?.message || '')
      );
    }
  };

  return (
    <section className="pageStack">
      <div className="panel">
        <div className="panelHead">
          <h3>Input Laporan Ore Getting</h3>
        </div>

        <form className="formGrid4" onSubmit={handleSubmit}>
          <label>
            <span>Tanggal</span>

            <input
              type="date"
              value={form.date}
              onChange={(event) =>
                updateField('date', event.target.value)
              }
              required
              style={oreGettingInputStyle}
            />
          </label>

          <label>
            <span>Area PIT</span>

            <select
              value={form.areaPit}
              onChange={(event) =>
                updateField('areaPit', event.target.value)
              }
              onInvalid={(event) => event.currentTarget.setCustomValidity('Area PIT wajib dipilih.')}
              onInput={(event) => event.currentTarget.setCustomValidity('')}
              required
              style={oreGettingInputStyle}
            >
              <option value="">Silahkan diisi</option>
              {areaPitOptions.map((area) => (
                <option key={area} value={area}>
                  {getOreGettingAreaLabel(area)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Shift</span>

            <select
              value={form.shift}
              onChange={(event) =>
                updateField('shift', event.target.value)
              }
              required
              style={oreGettingInputStyle}
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
            <span>Metode</span>

            <select
              value={form.metode}
              onChange={(event) =>
                updateField('metode', event.target.value)
              }
              required
              style={oreGettingInputStyle}
            >
              <option value="CEK">CEK</option>
              <option value="PSI">PSI</option>
              <option value="CH">CH</option>
              <option value="TP">TP</option>
              <option value="HS">HS</option>
            </select>
          </label>

          <label>
            <span>Nomor Sampel</span>

            <input
              type="text"
              inputMode="text"
              value={sampleNumber}
              onChange={(event) => setSampleNumber(event.target.value)}
              placeholder="Masukkan nomor sampel"
              onInvalid={(event) => event.currentTarget.setCustomValidity('Nomor sampel wajib diisi.')}
              onInput={(event) => event.currentTarget.setCustomValidity('')}
              required
              style={oreGettingInputStyle}
            />
          </label>

          <label>
            <span>ID Metode</span>

            <input
              type="text"
              value={idMetode}
              readOnly
              placeholder="ID Metode terbentuk dari pilihan dan nomor sampel"
              style={oreGettingInputStyle}
            />
          </label>

          <label>
            <span>Acuan</span>

            <input
              type="text"
              value={form.acuan}
              onChange={(event) =>
                updateField('acuan', event.target.value)
              }
              placeholder="Masukkan acuan"
              style={oreGettingInputStyle}
            />
          </label>

          <label>
            <span>Titik Bor</span>

            <input
              type="text"
              value={form.titikBor}
              onChange={(event) =>
                updateField('titikBor', event.target.value)
              }
              placeholder="Masukkan titik bor"
              style={oreGettingInputStyle}
            />
          </label>

          <label>
            <span>Block Model</span>

            <input
              type="text"
              value={form.blockModel}
              onChange={(event) =>
                updateField('blockModel', event.target.value)
              }
              placeholder="Masukkan block model"
              style={oreGettingInputStyle}
            />
          </label>

          <label>
            <span>Elevasi</span>

            <input
              type="text"
              value={form.elevasi}
              onChange={(event) =>
                updateField('elevasi', event.target.value)
              }
              placeholder="Masukkan elevasi"
              style={oreGettingInputStyle}
            />
          </label>

          <label>
            <span>Jumlah Sampel</span>

            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={form.jumlahSampel}
              onChange={(event) =>
                updateJumlahSampel(event.target.value)
              }
              placeholder="Contoh: 2"
              style={oreGettingInputStyle}
            />

            <small>Satuan: inc</small>
          </label>

          <div></div>
          <div></div>

          <div className="formActions">
            <button className="primary" type="submit">
              Simpan Laporan
            </button>
          </div>
        </form>
      </div>

      <div className="panel tablePanel">
        <div className="panelHead">
          <h3>Riwayat Input Ore Getting</h3>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Area PIT</th>
                <th>Shift</th>
                <th>Metode</th>
                <th>ID Metode</th>
                <th>Acuan</th>
                <th>Titik Bor</th>
                <th>Block Model</th>
                <th>Elevasi</th>
                <th>Jumlah Sampel</th>
                <th>Timestamp Pengumpulan</th>
              </tr>
            </thead>

            <tbody>
              {sheetRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan="11"
                    style={{ textAlign: 'center' }}
                  >
                    Belum ada data Ore Getting.
                  </td>
                </tr>
              ) : (
                sheetRecords.map((record) => (
                  <tr
                    key={
                      record.id ||
                      record.submissionTimestamp
                    }
                  >
                    <td>{record.date || '-'}</td>

                    <td>{record.areaPit || '-'}</td>

                    <td>{record.shift || '-'}</td>

                    <td>{record.metode || '-'}</td>

                    <td>{record.idMetode || '-'}</td>

                    <td>{record.acuan || '-'}</td>

                    <td>{record.titikBor || '-'}</td>

                    <td>{record.blockModel || '-'}</td>

                    <td>{record.elevasi || '-'}</td>

                    <td>
                      {record.jumlahSampel !== '' &&
                      record.jumlahSampel !== null &&
                      record.jumlahSampel !== undefined
                        ? `${record.jumlahSampel} inc`
                        : '-'}
                    </td>

                    <td style={oreGettingTimestampStyle}>
                      {formatWitaTimestamp(
                        record.submissionTimestamp ||
                          record.createdAt
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
