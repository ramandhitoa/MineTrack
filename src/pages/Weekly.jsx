// ============================================================
// HALAMAN MINGGUAN
// Menampilkan target, aktual ritase, pencapaian, kadar Ni, dan tonase.
// ============================================================

import { weekly } from '../data/initialData';
import { fmt } from '../utils/formatters';

export default function Weekly() {
  return (
    <section className="pageStack">
      <div className="panel">
        <h2>Agregasi & Evaluasi Progres Mingguan Tambang Nikel</h2>
        <p>Monitoring Pencapaian Target Ritase, Tonase, dan Mutu Kadar % Ni Mingguan</p>
      </div>

      <div className="cards4">
        {weekly.length === 0 ? (
          <div className="panel emptyState">Belum ada data progres mingguan.</div>
        ) : weekly.map((item) => {
          const achievement = item.ritTarget
            ? Math.round((item.ritActual / item.ritTarget) * 100)
            : 0;

          return (
            <div className="panel week" key={item.weekNumber}>
              <div>
                <b>Minggu Ke-{item.weekNumber}</b>
                <small>{item.dateRange}</small>
                <hr />

                <p>
                  Ritase Ore:
                  <strong>{fmt(item.ritActual)} / {fmt(item.ritTarget)} Rit</strong>
                </p>

                <div className="progress">
                  <i style={{ width: `${Math.min(achievement, 100)}%` }} />
                </div>

                <p>Pencapaian Volume: <strong>{achievement}%</strong></p>
                <p>Rata-Rata Kadar Ni: <strong>{item.avgNi}% Ni</strong></p>
                <p>Total Tonase Estimasi: <strong>{fmt(item.tonnage)} MT</strong></p>
              </div>

              <span className="status">
                {item.avgNi >= 1.6 ? 'On Spec Target' : 'Need Blending'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
