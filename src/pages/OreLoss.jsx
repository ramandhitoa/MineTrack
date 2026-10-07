import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  DEFAULT_GOOGLE_APPS_SCRIPT_URL,
  readOreLossFromGoogleSheets,
  syncOreLossToGoogleSheets,
} from '../services/googleSheetsService';
import { formatReporterName } from '../utils/reporterName';

const emptyForm = {
  unitExcavator: '',
  startLoading: '',
  stopLoading: '',
  jumlahBucket: '',
  blockModel: '',
  titikBor: '',
  elevasi: '',
  ritase: '',
  status: '',
};

function getSheetsUrl() {
  try {
    return localStorage.getItem('minetrack_gsheets_url') || DEFAULT_GOOGLE_APPS_SCRIPT_URL;
  } catch {
    return DEFAULT_GOOGLE_APPS_SCRIPT_URL;
  }
}

export default function OreLoss({ authSession }) {
  const [form, setForm] = useState(emptyForm);
  const [records, setRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [feedback, setFeedback] = useState(null);

  const loadHistory = async () => {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const remoteRecords = await readOreLossFromGoogleSheets(getSheetsUrl());
      setRecords(remoteRecords);
    } catch (error) {
      setHistoryError(error?.message || 'Riwayat Ore Loss gagal dimuat dari Google Sheets.');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const reporterName = formatReporterName(authSession?.user?.name);
    if (!reporterName) {
      setFeedback({ type: 'error', message: 'Nama akun tidak tersedia. Silakan login kembali.' });
      return;
    }

    const jumlahBucket = Number(form.jumlahBucket);
    const ritase = Number(form.ritase);
    if (
      !Number.isSafeInteger(jumlahBucket) || jumlahBucket < 0 ||
      !Number.isSafeInteger(ritase) || ritase < 0
    ) {
      setFeedback({ type: 'error', message: 'Jumlah Bucket dan Ritase harus bilangan bulat nol atau lebih.' });
      return;
    }

    if (!navigator.onLine) {
      setFeedback({ type: 'error', message: 'Tidak ada koneksi. Laporan belum tersimpan ke Google Sheets.' });
      return;
    }

    setSubmitting(true);
    setFeedback({ type: 'pending', message: 'Mengirim laporan Ore Loss...' });
    try {
      await syncOreLossToGoogleSheets(getSheetsUrl(), {
        ...form,
        jumlahBucket,
        ritase,
        reporterName,
      });
      setForm(emptyForm);
      setFeedback({ type: 'success', message: 'Laporan Ore Loss berhasil disimpan ke Google Sheets.' });
      await loadHistory();
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Laporan Ore Loss gagal disimpan.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pageStack oreLossPage">
      <div className="panel">
        <div className="panelHead">
          <h3>Input Laporan Ore Loss</h3>
        </div>

        <form className="formGrid4 oreLossForm" onSubmit={handleSubmit}>
          <label className="oreLossField">
            <span>Unit Excavator</span>
            <input type="text" value={form.unitExcavator} onChange={(event) => updateField('unitExcavator', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Start Loading</span>
            <input type="time" value={form.startLoading} onChange={(event) => updateField('startLoading', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Stop Loading</span>
            <input type="time" value={form.stopLoading} onChange={(event) => updateField('stopLoading', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Jumlah Bucket</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={form.jumlahBucket} onChange={(event) => updateField('jumlahBucket', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Block Model</span>
            <input type="text" value={form.blockModel} onChange={(event) => updateField('blockModel', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Titik Bor</span>
            <input type="text" value={form.titikBor} onChange={(event) => updateField('titikBor', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Elevasi</span>
            <input type="text" value={form.elevasi} onChange={(event) => updateField('elevasi', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Ritase</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={form.ritase} onChange={(event) => updateField('ritase', event.target.value)} required />
          </label>
          <label className="oreLossField">
            <span>Status</span>
            <select value={form.status} onChange={(event) => updateField('status', event.target.value)} required>
              <option value="" disabled>Pilih status</option>
              <option value="Close">Close</option>
              <option value="Continue">Continue</option>
            </select>
          </label>
          <div className="oreLossActions">
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? 'Mengirim...' : 'Simpan Laporan'}
            </button>
          </div>
        </form>

        {feedback && (
          <p className={`oreLossFeedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'} aria-live="polite">
            {feedback.message}
          </p>
        )}
      </div>

      <div className="panel tablePanel">
        <div className="panelHead">
          <h3>Riwayat Ore Loss</h3>
          <button type="button" onClick={loadHistory} disabled={loadingHistory} aria-label="Muat ulang riwayat Ore Loss">
            <RefreshCw size={15} />
            {loadingHistory ? 'Memuat...' : 'Muat Ulang'}
          </button>
        </div>
        {historyError && <p className="oreLossHistoryStatus" role="alert">{historyError}</p>}
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Unit Excavator</th>
                <th>Start Loading</th>
                <th>Stop Loading</th>
                <th>Jumlah Bucket</th>
                <th>Block Model</th>
                <th>Titik Bor</th>
                <th>Elevasi</th>
                <th>Ritase</th>
                <th>Status</th>
                <th>Timestamp Pengumpulan</th>
                <th>Nama Pelapor</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory && records.length === 0 ? (
                <tr><td colSpan="11" className="emptyState">Memuat riwayat Ore Loss...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="11" className="emptyState">Belum ada laporan Ore Loss.</td></tr>
              ) : records.map((record, index) => (
                <tr key={`${record.submissionTimestamp}-${record.unitExcavator}-${index}`}>
                  <td>{record.unitExcavator || '-'}</td>
                  <td>{record.startLoading || '-'}</td>
                  <td>{record.stopLoading || '-'}</td>
                  <td>{record.jumlahBucket ?? '-'}</td>
                  <td>{record.blockModel || '-'}</td>
                  <td>{record.titikBor || '-'}</td>
                  <td>{record.elevasi || '-'}</td>
                  <td>{record.ritase ?? '-'}</td>
                  <td>{record.status || '-'}</td>
                  <td>{record.submissionTimestamp || '-'}</td>
                  <td>{record.reporterName || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}