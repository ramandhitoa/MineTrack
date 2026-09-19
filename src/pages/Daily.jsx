// ============================================================
// HALAMAN PROGRES HARIAN
// Berisi filter, pencarian, tabel laporan, dan aksi input.
// ============================================================

import { Copy, Plus, Table2 } from 'lucide-react';
import { LogTable } from '../components/Common';

export default function Daily({
  filteredLogs,
  filterPit,
  setFilterPit,
  filterMaterial,
  setFilterMaterial,
  query,
  setQuery,
  onOpenModal,
  onCopyExcel,
}) {
  return (
    <section className="pageStack">
      <div className="panel filters">
        <div>
          <label>
            Filter Area Pit
            <select value={filterPit} onChange={(event) => setFilterPit(event.target.value)}>
              <option>Semua</option>
              <option>Pit BETA</option>
              <option>Pit Rantepao Barat</option>
              <option>Rantepao Timur</option>
              <option>Rantepao Selatan</option>
              <option>Rantapao Extend</option>
              <option>Pit A1M</option>
              <option>Pit A1E</option>
              <option>Pit A1S</option>
              <option>Pit A3M</option>
              <option>Pit IRG</option>
              <option>Pit AKP 6</option>
              <option>Pit AKP 1</option>
              <option>Alorindah</option>
            </select>
          </label>

          <label>
            Filter Material
            <select value={filterMaterial} onChange={(event) => setFilterMaterial(event.target.value)}>
              <option>Semua</option>
              <option>Limonit</option>
              <option>Saprolit</option>
            </select>
          </label>

          <label>
            Cari BlockModel / Sample / Sublot
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari Kode..."
            />
          </label>
        </div>

        <div className="filterActions">
          Total Data: {filteredLogs.length} Entry
          <button className="primary" onClick={onOpenModal}>
            <Plus size={14} /> Input Log Harian
          </button>
        </div>
      </div>

      <div className="panel tablePanel">
        <div className="panelHead">
          <h3><Table2 size={15} /> Data Laporan Hasil Kerja & QC Nikel</h3>
          <div>
            <button onClick={onCopyExcel}>
              <Copy size={14} /> Copy Tabel Excel
            </button>
          </div>
        </div>
        <LogTable logs={filteredLogs} />
      </div>
    </section>
  );
}
