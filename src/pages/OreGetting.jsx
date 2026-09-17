// ============================================================
// HALAMAN INPUT LAPORAN ORE GETTING
// Form input ringkas untuk pencatatan pit, shift, metode, serta
// referensi titik bor / block model / elevasi sesuai kebutuhan.
// ============================================================

import { useEffect, useState } from 'react';
import { areaPitOptions } from '../data/initialData';
import { DEFAULT_GOOGLE_APPS_SCRIPT_URL } from '../services/googleSheetsService';

const STORAGE_KEY = 'mineTrack_ore_getting_records';

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  areaPit: areaPitOptions[0],
  shift: 'Shift 1 (Siang)',
  metode: 'CEK',
  idMetode: '',
  acuan: '',
  titikBor: '',
  blockModel: '',
  elevasi: '',
};

export default function OreGetting() {
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.form) return saved.form;
    } catch {
      // ignore parse error
    }
    return initialForm;
  });

  const [records, setRecords] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return Array.isArray(saved?.records) ? saved.records : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, records }));
  }, [form, records]);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const syncOreGettingToGoogleSheets = async (record) => {
    const gsUrl = localStorage.getItem('minetrack_gsheets_url') || DEFAULT_GOOGLE_APPS_SCRIPT_URL;

    if (!gsUrl) return;

    try {
      const response = await fetch(gsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          type: 'oregetting',
          items: [{
            ...record,
            date: record.date || new Date().toISOString().slice(0, 10),
            submissionTimestamp: new Date().toISOString(),
          }],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result?.success !== true) {
        throw new Error(result?.message || 'Gagal menyimpan ke Google Sheets');
      }

      return result;
    } catch (error) {
      console.error('Ore Getting sync failed:', error);
      throw error;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const timestamp = new Date().toISOString();
    const newRecord = {
      id: Date.now(),
      ...form,
      date: form.date || new Date().toISOString().slice(0, 10),
      createdAt: timestamp,
      submissionTimestamp: timestamp,
    };

    setRecords((current) => [newRecord, ...current]);
    await syncOreGettingToGoogleSheets(newRecord);
    setForm(initialForm);
  };

  return (
    <section className="pageStack">
      <div className="panel">
        <div className="panelHead">
          <h3>Input Laporan Ore Getting</h3>
        </div>

        <form onSubmit={handleSubmit} className="form" style={{ paddingTop: 12 }}>
          <div className="formGrid4">
            <div className="fieldHeader">Tanggal</div>
            <div className="fieldHeader">Area PIT</div>
            <div className="fieldHeader">Shift</div>
            <div className="fieldHeader">Metode</div>

            <label className="field">
              <input
                type="date"
                value={form.date || ''}
                onChange={(event) => updateField('date', event.target.value)}
              />
            </label>

            <label className="field">
              <select value={form.areaPit} onChange={(event) => updateField('areaPit', event.target.value)}>
                {areaPitOptions.map((pit) => (
                  <option key={pit} value={pit}>{pit}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <select value={form.shift} onChange={(event) => updateField('shift', event.target.value)}>
                <option>Shift 1 (Siang)</option>
                <option>Shift 2 (Malam)</option>
              </select>
            </label>

            <label className="field">
              <select value={form.metode} onChange={(event) => updateField('metode', event.target.value)}>
                <option value="CEK">CEK</option>
                <option value="PSI">PSI</option>
              </select>
            </label>
          </div>

          <div className="formGrid4">
            <div className="fieldHeader">ID Metode</div>
            <div className="fieldHeader">Acuan</div>
            <div className="fieldHeader">Titik Bor</div>
            <div className="fieldHeader">Block Model</div>

            <label className="field">
              <input
                value={form.idMetode}
                onChange={(event) => updateField('idMetode', event.target.value)}
                placeholder="Nomor ID metode"
              />
            </label>

            <label className="field">
              <input
                value={form.acuan}
                onChange={(event) => updateField('acuan', event.target.value)}
                placeholder="Tulis acuan"
              />
            </label>

            <label className="field">
              <input
                value={form.titikBor}
                onChange={(event) => updateField('titikBor', event.target.value)}
                placeholder="Titik bor"
              />
            </label>

            <label className="field">
              <input
                value={form.blockModel}
                onChange={(event) => updateField('blockModel', event.target.value)}
                placeholder="Block model"
              />
            </label>
          </div>

          <div className="formGrid4" style={{ marginTop: 12 }}>
            <div className="fieldHeader">Elevasi</div>
            <div style={{ visibility: 'hidden' }} className="fieldHeader">Spacer</div>
            <div style={{ visibility: 'hidden' }} className="fieldHeader">Spacer</div>
            <div style={{ visibility: 'hidden' }} className="fieldHeader">Spacer</div>

            <label className="field">
              <input
                value={form.elevasi}
                onChange={(event) => updateField('elevasi', event.target.value)}
                placeholder="Elevasi"
              />
            </label>
          </div>

          <div className="modalFooter" style={{ justifyContent: 'flex-end', paddingTop: 8 }}>
            <button className="primary" type="submit">Simpan Laporan Ore Getting</button>
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
                <th>Timestamp Pengumpulan</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="emptyState">Belum ada data ore getting.</td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.date || '-'}</td>
                    <td>{record.areaPit || '-'}</td>
                    <td>{record.shift || '-'}</td>
                    <td>{record.metode || '-'}</td>
                    <td>{record.idMetode || '-'}</td>
                    <td>{record.acuan || '-'}</td>
                    <td>{record.titikBor || '-'}</td>
                    <td>{record.blockModel || '-'}</td>
                    <td>{record.elevasi || '-'}</td>
                    <td>{record.submissionTimestamp || record.createdAt || '-'}</td>
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
