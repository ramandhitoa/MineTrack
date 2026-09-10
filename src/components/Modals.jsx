// ============================================================
// MODAL INPUT DATA
// Form laporan harian dan form job pending dipisahkan dari App
// supaya App.jsx tetap pendek dan mudah dipelihara.
// ============================================================

import { Field, Modal } from './Common';
import { equipmentOptions } from '../data/initialData';

export function DailyModal({ data, setData, onClose, onSave }) {
  const update = (key, value) => setData((current) => ({ ...current, [key]: value }));

  return (
    <Modal title="Input Laporan Hasil Kerja Shift & QC Nikel" close={onClose} className="dailyModal">
      <form onSubmit={onSave} className="form">
        <fieldset>
          <legend>1. Tanggal, Shift & Pit Location</legend>
          <div className="formGrid3">
            <Field label="Tanggal">
              <input type="date" value={data.date} onChange={(e) => update('date', e.target.value)} required />
            </Field>
            <Field label="Shift">
              <select value={data.shift} onChange={(e) => update('shift', e.target.value)}>
                <option>Shift 1 (Siang)</option>
                <option>Shift 2 (Malam)</option>
              </select>
            </Field>
            <Field label="Area Pit">
              <select value={data.pit} onChange={(e) => update('pit', e.target.value)}>
                <option>Pit BETA</option>
                <option>Pit Rantepao Barat</option>
                <option>Rantepao Timur</option>
                <option>Rantapao Extend</option>
                <option>Pit A1M</option>
                <option>Pit A3M</option>
                <option>Pit IRG</option>
                <option>Pit AKP 6</option>
                <option>Pit AKP 1</option>
                <option>Alorindah</option>
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>2. Alat Berat, Dumping & Loading Method</legend>
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

          <div className="formGrid2">
            <Field label="Area Dumpingan">
              <input
                value={data.dumpingArea}
                onChange={(e) => update('dumpingArea', e.target.value)}
                placeholder="Masukkan area dumpingan"
                required
              />
            </Field>
            <Field label="Loading Method">
              <select value={data.loadingMethod} onChange={(e) => update('loadingMethod', e.target.value)}>
                <option>Direct</option>
                <option>Tongkang</option>
                <option>Dome</option>
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>3. BlockModel, Acuan Sample & Geologi</legend>
          <div className="formGrid4">
            {[
              ['blockModel', 'BlockModel'],
              ['sampleRef', 'Acuan Sample'],
              ['drillHole', 'Titik Bor'],
              ['elevation', 'Elevasi RL'],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input value={data[key]} onChange={(e) => update(key, e.target.value)} required />
              </Field>
            ))}
          </div>

          <div className="formGrid2">
            <Field label="Material">
              <select value={data.material} onChange={(e) => update('material', e.target.value)}>
                <option>Limonite</option>
                <option>Saprolite</option>
              </select>
            </Field>
            <Field label="Sublot">
              <input value={data.sublot} onChange={(e) => update('sublot', e.target.value)} required />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>4. Start/Stop Time & Perhitungan Ritase</legend>
          <div className="formGrid3">
            <Field label="Start Time">
              <input type="time" value={data.startTime} onChange={(e) => update('startTime', e.target.value)} required />
            </Field>
            <Field label="Stop Time">
              <input type="time" value={data.stopTime} onChange={(e) => update('stopTime', e.target.value)} required />
            </Field>
            <Field label="Rit Sebelum">
              <input type="number" value={data.ritPrevious} onChange={(e) => update('ritPrevious', Number(e.target.value))} required />
            </Field>
          </div>

          <div className="formGrid2">
            <Field label="Rit Hari Ini">
              <input type="number" value={data.ritToday} onChange={(e) => update('ritToday', Number(e.target.value))} required />
            </Field>
            <Field label="Total Ritase">
              <div className="readonly">{Number(data.ritPrevious || 0) + Number(data.ritToday || 0)} Rit</div>
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>5. Tonase & Assay Kadar Quality Control</legend>
          <div className="formGrid4">
            <Field label="Tonase">
              <div className="readonly">
                {((Number(data.ritPrevious || 0) + Number(data.ritToday || 0)) * 15)} MT
              </div>
            </Field>
            {[
              ['niGrade', 'Ni %'],
              ['feGrade', 'Fe %'],
              ['mc', 'MC %'],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  type="number"
                  step="0.01"
                  value={data[key]}
                  onChange={(e) => update(key, Number(e.target.value))}
                />
              </Field>
            ))}
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
