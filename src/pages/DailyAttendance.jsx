// ============================================================
// DASHBOARD DAILY ABSENSI
// Mencatat kehadiran personel berdasarkan tanggal, shift, dan lokasi kerja.
// ============================================================

import { useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { attendanceLocations, attendanceNames, emptyAttendance } from '../data/initialData';
import { dateFmt, fmt } from '../utils/formatters';

export default function DailyAttendance({ attendance, onSaveAttendance, onSyncAttendance, syncing }) {
  const [form, setForm] = useState(emptyAttendance);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = (event) => {
    onSaveAttendance(event, form);
    setForm({ ...emptyAttendance, date: form.date });
  };

  return (
    <section className="pageStack">
      <section className="panel attendanceDashboard">
        <div className="panelHead">
          <div>
            <h2>Dashboard Daily Absensi</h2>
            <p>Pencatatan kehadiran berdasarkan tanggal, shift, lokasi kerja, dan nama personel</p>
          </div>
          <div className="attendanceActions">
            <span className="attendanceCount">{fmt(attendance.length)} Data</span>
            <button type="button" onClick={onSyncAttendance} disabled={syncing}>
              <CloudUpload size={14} /> {syncing ? 'Menyinkronkan...' : 'Sync Google Sheets'}
            </button>
          </div>
        </div>

        <form className="attendanceForm" onSubmit={save}>
          <label>
            Tanggal / Hari / Bulan / Tahun
            <input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} required />
          </label>
          <label>
            Shift
            <select value={form.shift} onChange={(event) => update('shift', event.target.value)}>
              <option>Shift 1</option>
              <option>Shift 2</option>
            </select>
          </label>
          <label>
            Lokasi Kerja
            <select value={form.location} onChange={(event) => update('location', event.target.value)}>
              {attendanceLocations.map((location) => <option key={location}>{location}</option>)}
            </select>
          </label>
          <label>
            Nama
            <select value={form.name} onChange={(event) => update('name', event.target.value)}>
              {attendanceNames.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <button className="primary" type="submit">Simpan Absensi</button>
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
                <tr><td colSpan="4" className="emptyState">Belum ada data absensi.</td></tr>
              ) : attendance.map((item) => (
                <tr key={item.id}>
                  <td>{dateFmt(item.date)}</td>
                  <td><span className="pill">{item.shift}</span></td>
                  <td><b>{item.location}</b></td>
                  <td>{item.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
