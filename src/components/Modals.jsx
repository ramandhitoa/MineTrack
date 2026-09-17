// ============================================================
// MODAL INPUT DATA
// Form laporan harian dan form job pending dipisahkan dari App
// supaya App.jsx tetap pendek dan mudah dipelihara.
// ============================================================

import { Field, Modal } from './Common';
import { areaPitOptions, equipmentOptions } from '../data/initialData';

export function DailyModal({ data, setData, onClose, onSave }) {
  const update = (key, value) => setData((current) => ({ ...current, [key]: value }));

  return (
    <Modal title="Input Laporan Hasil Kerja Shift & QC Nikel" close={onClose} className="dailyModal">
      <form onSubmit={onSave} className="form">
        <fieldset>
          <legend>1. Data Umum</legend>
          <div className="formGrid4">
            <Field label="Tanggal">
              <input type="date" value={data.date} onChange={(e) => update('date', e.target.value)} required />
            </Field>
            <Field label="Blok">
              <select value={data.block || 'A'} onChange={(e) => update('block', e.target.value)}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="AKP">AKP</option>
              </select>
            </Field>
            <Field label="Shift">
              <select value={data.shift} onChange={(e) => update('shift', e.target.value)}>
                <option>Shift 1 (Siang)</option>
                <option>Shift 2 (Malam)</option>
              </select>
            </Field>
            <Field label="Pit">
              <select value={data.pit} onChange={(e) => update('pit', e.target.value)}>
                {areaPitOptions.map((pit) => <option key={pit}>{pit}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>2. Lokasi & Operasi</legend>
          <div className="formGrid4">
            <Field label="Dumping">
              <input
                value={data.dumpingArea}
                onChange={(e) => update('dumpingArea', e.target.value)}
                placeholder="Area dumping"
                required
              />
            </Field>
            <Field label="Sublot">
              <input value={data.sublot} onChange={(e) => update('sublot', e.target.value)} required />
            </Field>
            <Field label="Retase">
              <input type="number" value={data.ritToday} onChange={(e) => update('ritToday', Number(e.target.value))} required />
            </Field>
            <Field label="Status">
              <select value={data.status || 'Open'} onChange={(e) => update('status', e.target.value)}>
                <option>Open</option>
                <option>In Progress</option>
                <option>Close</option>
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>3. Geologi & Sample</legend>
          <div className="formGrid4">
            {[
              ['blockModel', 'Block Model'],
              ['sampleRef', 'Acuan'],
              ['drillHole', 'Titik Bor'],
              ['elevation', 'Elevasi'],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input value={data[key]} onChange={(e) => update(key, e.target.value)} required />
              </Field>
            ))}
          </div>
          <div className="formGrid2">
            <Field label="Metode">
              <select value={data.loadingMethod} onChange={(e) => update('loadingMethod', e.target.value)}>
                <option>Direct</option>
                <option>Tongkang</option>
                <option>Dome</option>
              </select>
            </Field>
            <Field label="Alat Berat">
              <div className="checks">
                {equipmentOptions.map((equipment) => (
                  <label key={equipment}>
                    <input
                      type="checkbox"
                      checked={data.equipment.includes(equipment)}
                      onChange={(event) => {
                        const nextEquipment = event.target.checked
                          ? [...data.equipment, equipment]
                          : data.equipment.filter((item) => item !== equipment);
                        update('equipment', nextEquipment);
                      }}
                    />
                    {equipment}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>4. Quality Control</legend>
          <div className="formGrid4">
            <Field label="Tonase">
              <div className="readonly">{((Number(data.ritPrevious || 0) + Number(data.ritToday || 0)) * 15)} MT</div>
            </Field>
            <Field label="Acuan Ni%">
              <input
                type="number"
                step="0.01"
                value={data.niGrade}
                onChange={(e) => update('niGrade', Number(e.target.value))}
              />
            </Field>
            <Field label="Nama Pelapor">
              <input value={data.reporterName} onChange={(e) => update('reporterName', e.target.value)} placeholder="Nama pengirim laporan" required />
            </Field>
            <Field label="Timestamp Pengumpulan">
              <div className="readonly">{new Date().toLocaleString('id-ID')}</div>
            </Field>
          </div>
        </fieldset>

        <div className="modalFooter">
          <button type="button" onClick={onClose}>Batal</button>
          <button className="primary" type="submit">Simpan Laporan Hasil Shift</button>
        </div>
      </form>
    </Modal>
  );
}

export function PendingModal({ data, setData, onClose, onSave }) {
  const update = (key, value) => setData((current) => ({ ...current, [key]: value }));

  return (
    <Modal title="Tambah Planning Job Pending" close={onClose} className="pendingModal">
      <form onSubmit={onSave} className="form">
        <Field label="Judul Tugas / Problem Backlog">
          <input
            value={data.title}
            onChange={(e) => update('title', e.target.value)}
            required
            placeholder="Contoh: Re-Assay Moisture Dome A"
          />
        </Field>

        <div className="formGrid2">
          <Field label="Area / Lokasi Pit">
            <input value={data.location} onChange={(e) => update('location', e.target.value)} required />
          </Field>
          <Field label="Tingkat Prioritas">
            <select value={data.priority} onChange={(e) => update('priority', e.target.value)}>
              <option>Tinggi</option>
              <option>Sedang</option>
              <option>Rendah</option>
            </select>
          </Field>
        </div>

        <div className="formGrid2">
          <Field label="Penanggung Jawab (PIC)">
            <input value={data.assignedStaff} onChange={(e) => update('assignedStaff', e.target.value)} />
          </Field>
          <Field label="Target Resolusi">
            <input type="date" value={data.targetDate} onChange={(e) => update('targetDate', e.target.value)} required />
          </Field>
        </div>

        <Field label="Catatan Tambahan">
          <input
            value={data.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Contoh: titik lokasi, kondisi lapangan, estimasi waktu"
          />
        </Field>

        <Field label="Uraian / Rencana Penanganan">
          <textarea value={data.description} onChange={(e) => update('description', e.target.value)} rows="4" />
        </Field>

        <div className="modalFooter">
          <button type="button" onClick={onClose}>Batal</button>
          <button className="amber" type="submit">Simpan Job Pending</button>
        </div>
      </form>
    </Modal>
  );
}

export function ScriptModal({ script, onClose }) {
  return (
    <Modal title="Google Apps Script" close={onClose}>
      <p>Salin script berikut ke Google Apps Script yang terhubung dengan Google Spreadsheet.</p>
      <textarea readOnly value={script} aria-label="Google Apps Script" />
    </Modal>
  );
}
