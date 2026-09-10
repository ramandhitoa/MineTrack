// ============================================================
// KOMPONEN UI BERSAMA
// Komponen di sini dipakai oleh beberapa halaman agar tidak ada
// kode JSX yang ditulis berulang-ulang.
// ============================================================

import { Trash2 } from 'lucide-react';
import { fmt, materialClass } from '../utils/formatters';

export function Card({ label, value, unit, sub, accent }) {
  return (
    <div className={`kpi ${accent}`}>
      <small>{label}</small>
      <strong>{value} <i>{unit}</i></strong>
      <span>{sub}</span>
    </div>
  );
}

export function LogTable({ logs, onDelete }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Tanggal / Shift</th>
            <th>Area Pit / Dumping</th>
            <th>Alat Berat</th>
            <th>Sample / BlockModel</th>
            <th>Material</th>
            <th className="num">Rit Today</th>
            <th className="num">Total Rit</th>
            <th className="num">Tonase</th>
            <th>Assay QC</th>
            {onDelete && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={onDelete ? 10 : 9} className="emptyState">Belum ada data.</td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id}>
                <td>
                  <b>{log.date?.split('-').reverse().join('/')}</b>
                  <small>{log.shift}</small>
                </td>
                <td>
                  <b className="greenText">{log.pit}</b>
                  <small>▣ {log.dumpingArea}</small>
                </td>
                <td>
                  {(log.equipment || []).map((equipment) => (
                    <label className="chip" key={equipment}>{equipment}</label>
                  ))}
                </td>
                <td>
                  <code>{log.sampleRef || '-'}</code>
                  <small>BM: {log.blockModel} | Lot: {log.sublot}</small>
                </td>
                <td>
                  <label className={`badge ${materialClass(log.material)}`}>{log.material}</label>
                </td>
                <td className="num amberText">+{fmt(log.ritToday)}</td>
                <td className="num greenText">{fmt(log.ritTotal)}</td>
                <td className="num">{fmt(log.tonnage)} MT</td>
                <td className={log.niGrade >= 1.6 ? 'greenText' : 'amberText'}>
                  <b>{Number(log.niGrade || 0).toFixed(2)}%</b>
                </td>
                {onDelete && (
                  <td>
                    <button className="iconBtn danger" onClick={() => onDelete(log.id)} aria-label="Hapus data">
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, children, close, className = '' }) {
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className={`modal ${className}`}>
        <div className="modalHead">
          <h3>{title}</h3>
          <button onClick={close} aria-label="Tutup modal">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return <label className="field">{label}{children}</label>;
}
