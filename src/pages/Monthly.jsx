// ============================================================
// HALAMAN BULANAN
// Menampilkan rekap kinerja bulanan berdasarkan data default aplikasi.
// ============================================================

import { fmt } from '../utils/formatters';

const groupByMonthAndPit = (logs) => {
  const groups = new Map();
  logs.forEach((log) => {
    if (!log.date || !log.pit) return;
    const month = log.date.slice(0, 7);
    const key = `${month}|${log.pit}`;
    const group = groups.get(key) || { month, pit: log.pit, rit: 0, tonnage: 0, ni: 0, mc: 0, count: 0 };
    group.rit += Number(log.ritToday) || 0;
    group.tonnage += Number(log.tonnage) || 0;
    group.ni += Number(log.niGrade) || 0;
    group.mc += Number(log.mc) || 0;
    group.count += 1;
    groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => b.month.localeCompare(a.month) || a.pit.localeCompare(b.pit));
};

export default function Monthly({ logs = [] }) {
  const groups = groupByMonthAndPit(logs);

  return (
    <section>
      <div className="panel">
        <h2>Rekapitulasi Kinerja Bulanan & Target Smelter</h2>
        <p>Rekap bulanan dipisahkan berdasarkan Area Pit.</p>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Bulan Produksi</th>
                <th>Area Pit</th>
                <th>Aktual Ritase</th>
                <th>Total Tonase Ore</th>
                <th>Rata-Rata % Ni</th>
                <th>Rata-Rata % MC</th>
                <th>Jumlah Laporan</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan="7" className="emptyState">Belum ada data rekapitulasi kinerja bulanan.</td>
                </tr>
              ) : groups.map((item) => (
                <tr key={`${item.month}-${item.pit}`}>
                  <td><b>{item.month}</b></td>
                  <td><b className="greenText">{item.pit}</b></td>
                  <td className="greenText"><b>{fmt(item.rit)}</b></td>
                  <td className="amberText"><b>{fmt(item.tonnage)} MT</b></td>
                  <td>{(item.ni / item.count).toFixed(2)}%</td>
                  <td>{(item.mc / item.count).toFixed(2)}%</td>
                  <td>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
