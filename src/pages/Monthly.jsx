// ============================================================
// HALAMAN BULANAN
// Menampilkan rekap kinerja bulanan berdasarkan data default aplikasi.
// ============================================================

import { monthly } from '../data/initialData';
import { fmt } from '../utils/formatters';

export default function Monthly() {
  return (
    <section>
      <div className="panel">
        <h2>Rekapitulasi Kinerja Bulanan & Target Smelter</h2>
        <p>Monitoring pencapaian bulanan volume ritase, tonase, dan rata-rata kadar nikel</p>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Bulan Produksi</th>
                <th>Target Ritase</th>
                <th>Aktual Ritase</th>
                <th>Total Tonase Ore</th>
                <th>Rata-Rata % Ni</th>
                <th>Rata-Rata % MC</th>
                <th>Achievement</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 ? (
                <tr>
                  <td colSpan="7" className="emptyState">Belum ada data rekapitulasi kinerja bulanan.</td>
                </tr>
              ) : monthly.map((item) => (
                <tr key={item.month}>
                  <td><b>{item.month}</b></td>
                  <td>{fmt(item.ritTarget)}</td>
                  <td className="greenText"><b>{fmt(item.ritActual)}</b></td>
                  <td className="amberText"><b>{fmt(item.tonnage)} MT</b></td>
                  <td>{item.avgNi}%</td>
                  <td>{item.avgMc}%</td>
                  <td>
                    <span className={`pill ${item.achieve >= 100 ? 'good' : 'warn'}`}>
                      {item.achieve}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
