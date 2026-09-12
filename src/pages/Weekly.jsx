// ============================================================
// HALAMAN MINGGUAN
// Menampilkan target, aktual ritase, pencapaian, kadar Ni, dan tonase.
// ============================================================

import { fmt } from '../utils/formatters';

const getWeekStart = (date) => {
  const value = new Date(`${date}T00:00:00`);
  const day = value.getDay();
  value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day));
  return value;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const groupByWeekAndPit = (logs) => {
  const groups = new Map();
  logs.forEach((log) => {
    if (!log.date || !log.pit) return;
    const weekStart = getWeekStart(log.date);
    const weekKey = formatDate(weekStart);
    const key = `${weekKey}|${log.pit}`;
    const group = groups.get(key) || { weekKey, weekStart, pit: log.pit, rit: 0, tonnage: 0, ni: 0, mc: 0, count: 0 };
    group.rit += Number(log.ritToday) || 0;
    group.tonnage += Number(log.tonnage) || 0;
    group.ni += Number(log.niGrade) || 0;
    group.mc += Number(log.mc) || 0;
    group.count += 1;
    groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => b.weekStart - a.weekStart || a.pit.localeCompare(b.pit));
};

export default function Weekly({ logs = [] }) {
  const groups = groupByWeekAndPit(logs);

  return (
    <section className="pageStack">
      <div className="panel">
        <h2>Agregasi & Evaluasi Progres Mingguan Tambang Nikel</h2>
        <p>Rekap mingguan dipisahkan berdasarkan Area Pit.</p>
      </div>

      <div className="cards4">
        {groups.length === 0 ? (
          <div className="panel emptyState">Belum ada data progres mingguan.</div>
        ) : groups.map((item) => {
          const avgNi = item.count ? item.ni / item.count : 0;
          const avgMc = item.count ? item.mc / item.count : 0;
          const weekEnd = new Date(item.weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);

          return (
            <div className="panel week" key={`${item.weekKey}-${item.pit}`}>
              <div>
                <b>{item.pit}</b>
                <small>{item.weekKey} s/d {formatDate(weekEnd)}</small>
                <hr />

                <p>Ritase Ore: <strong>{fmt(item.rit)} Rit</strong></p>
                <p>Rata-Rata Kadar Ni: <strong>{avgNi.toFixed(2)}% Ni</strong></p>
                <p>Rata-Rata MC: <strong>{avgMc.toFixed(2)}%</strong></p>
                <p>Total Tonase: <strong>{fmt(item.tonnage)} MT</strong></p>
              </div>

              <span className="status">
                {avgNi >= 1.6 ? 'On Spec Target' : 'Need Blending'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
