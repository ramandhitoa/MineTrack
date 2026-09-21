import { useEffect, useState } from 'react';
import { areaPitOptions } from '../data/initialData';
import { DEFAULT_GOOGLE_APPS_SCRIPT_URL } from '../services/googleSheetsService';
import { toWitaDateInput } from '../utils/formatters';

const STORAGE_KEY = 'mineTrack_ore_getting_records';

const initialForm = {
  date: toWitaDateInput(),
  areaPit: areaPitOptions[0],
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

  // Timestamp dari Apps Script sudah HH:MM WITA.
  const text = String(value).trim();
  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const [hour, minute] = text.split(':');
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Makassar',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  } catch {
    return '-';
  }
}

export default function OreGetting() {
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || 'null'
      );

      if (saved && saved.form) {
        return {
          ...initialForm,
          ...saved.form,
          jumlahSampel: saved.form.jumlahSampel ?? '',
          metode: saved.form.metode || 'CEK',
        };
      }
    } catch (error) {
      console.error('Gagal membaca form Ore Getting:', error);
    }

    return initialForm;
  });

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

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ form, records })
    );
  }, [form, records]);

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
        items: [
          {
            ...record,
            date: record.date || toWitaDateInput(),
            submissionTimestamp: record.submissionTimestamp,
          },
        ],
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

    const timestamp = new Date().toISOString();

    const newRecord = {
      id: Date.now(),
      date: form.date || toWitaDateInput(),
      areaPit: form.areaPit,
      shift: form.shift,
      metode: form.metode,
      idMetode: form.idMetode,
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
    };

    try {
      await syncOreGettingToGoogleSheets(newRecord);

      setRecords((current) => [newRecord, ...current]);

      setForm({
        ...initialForm,
        date: toWitaDateInput(),
      });

      alert('Laporan Ore Getting berhasil disimpan.');
    } catch (error) {
      console.error('Gagal menyimpan Ore Getting:', error);
      alert(
        'Data Ore Getting gagal dikirim ke Google Sheets. ' +
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
            />
          </label>

          <label>
            <span>Area PIT</span>
            <select
              value={form.areaPit}
              onChange={(event) =>
                updateField('areaPit', event.target.value)
              }
              required
            >
              {areaPitOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
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
            >
              <option value="CEK">CEK</option>
              <option value="PSI">PSI</option>
              <option value="CH">CH</option>
              <option value="TP">TP</option>
              <option value="HS">HS</option>
            </select>
          </label>

          <label>
            <span>ID Metode</span>
            <input
              type="text"
              value={form.idMetode}
              onChange={(event) =>
                updateField('idMetode', event.target.value)
              }
              placeholder="Masukkan ID metode"
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
              {records.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center' }}>
                    Belum ada data Ore Getting.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id || record.submissionTimestamp}>
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
                    <td>
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
