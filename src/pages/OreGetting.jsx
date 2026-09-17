// ============================================================
// HALAMAN INPUT LAPORAN ORE GETTING
// Form input ringkas untuk pencatatan pit, shift, metode, serta
// referensi titik bor / block model / elevasi sesuai kebutuhan.
// ============================================================

import { useEffect, useState } from 'react';
import { areaPitOptions } from '../data/initialData';

const STORAGE_KEY = 'mineTrack_ore_getting_records';

const initialForm = {
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

  const handleSubmit = (event) => {
    event.preventDefault();
    const newRecord = {
      id: Date.now(),
      ...form,
      createdAt: new Date().toISOString(),
    };

    setRecords((current) => [newRecord, ...current]);
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
            <div className="fieldHeader">Area PIT</div>
            <div className="fieldHeader">Shift</div>
            <div className="fieldHeader">Metode</div>
            <div className="fieldHeader">ID Metode</div>

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

            <label className="field">
              <input
                value={form.idMetode}
                onChange={(event) => updateField('idMetode', event.target.value)}
                placeholder="Nomor ID metode"
              />
            </label>
          </div>

          <div className="formGrid4">
            <div className="fieldHeader">Acuan</div>
            <div className="fieldHeader">Titik Bor</div>
            <div className="fieldHeader">Block Model</div>
            <div className="fieldHeader">Elevasi</div>

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
                <th>Area PIT</th>
                <th>Shift</th>
                <th>Metode</th>
                <th>ID Metode</th>
                <th>Acuan</th>
                <th>Titik Bor</th>
                <th>Block Model</th>
                <th>Elevasi</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="emptyState">Belum ada data ore getting.</td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.areaPit}</td>
                    <td>{record.shift}</td>
                    <td>{record.metode}</td>
                    <td>{record.idMetode || '-'}</td>
                    <td>{record.acuan || '-'}</td>
                    <td>{record.titikBor || '-'}</td>
                    <td>{record.blockModel || '-'}</td>
                    <td>{record.elevasi || '-'}</td>
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
