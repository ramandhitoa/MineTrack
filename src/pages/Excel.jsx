// ============================================================
// HALAMAN GOOGLE SHEETS & EXCEL
// Tempat melihat endpoint Web App, sync data, copy TSV, export CSV,
// dan melihat/copy Google Apps Script.
// ============================================================

import { CloudUpload, Code2, Copy, Download, ExternalLink, FileSpreadsheet, RefreshCw } from 'lucide-react';

export default function Excel({ gsUrl, gsUrlInput, setGsUrlInput, onSaveUrl, onSync, onReload, onCopy, onExport, onOpenScript, spreadsheetId, gsLoading, gsStatus, gsRemoteCount }) {
  return (
    <section>
      <div className="panel excel">
        <div className="panelHead">
          <div className="fileIcon"><FileSpreadsheet /></div>
          <div>
            <h2>Integrasi Google Spreadsheets & Microsoft Excel</h2>
            <p>Sinkronisasi langsung via Webhook / Apps Script atau Salin-Tempel Format Presisi</p>
          </div>
          <a
            className="spreadsheetLink"
            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} /> Buka Google Spreadsheet
          </a>
          <button onClick={onOpenScript}>
            <Code2 size={14} /> Script Google Apps Script
          </button>
        </div>

        {/* CARD KONFIGURASI: URL Web App adalah alamat API Apps Script. */}
        <div className="integrationInfo">
          <b>Spreadsheet terhubung</b>
          <code>{spreadsheetId}</code>
          <small>Spreadsheet hasil sinkronisasi dapat dibuka melalui tombol di atas. URL yang dipakai aplikasi tetap URL Web App Apps Script berakhiran <b>/exec</b> — bukan URL edit Google Sheets.</small>
          <div className="gsStatus">Status: <b>{gsStatus}</b>{gsRemoteCount !== null && <span> • Data Google Sheets: {gsRemoteCount} baris</span>}</div>
        </div>

        {/* CARD URL: endpoint resmi dikunci agar semua perangkat memakai sumber data yang sama. */}
        <div className="urlBox">
          <label>Webhook / Google Apps Script Web App URL</label>
          <input
            type="url"
            value={gsUrlInput ?? gsUrl}
            onChange={(event) => setGsUrlInput(event.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
          <small>Gunakan URL Web App berakhiran <b>/exec</b>. Jangan pakai link spreadsheet edit Google Sheets.</small>
          <div className="urlActions">
            <button className="secondary" onClick={onSaveUrl} disabled={gsLoading}>Simpan URL</button>
            <button className="secondary" onClick={onReload} disabled={gsLoading}><RefreshCw size={14} /> Tes / Muat Data</button>
          </div>
        </div>

        <div className="actionCards">
          <div>
            <h3><CloudUpload /> Direct Sync Google Sheets</h3>
            <p>Mengirimkan seluruh data terdaftar langsung ke Google Sheet via Webhook JSON.</p>
            <button className="sync" onClick={onSync} disabled={gsLoading}>{gsLoading ? 'Memproses...' : 'Sync / Samakan Data'}</button>
            <button className="secondary" onClick={onReload} disabled={gsLoading}><RefreshCw size={14} /> Muat Ulang dari Google Sheets</button>
          </div>

          <div>
            <h3><Copy /> Salin Format Tab (TSV)</h3>
            <p>Menyiapkan 23 kolom lengkap ke clipboard, termasuk nama pelapor dan timestamp.</p>
            <button className="amber" onClick={onCopy}>Salin Tabel</button>
          </div>

          <div>
            <h3><Download /> Export CSV / Database</h3>
            <p>Mengunduh file .csv terstruktur untuk backup database atau pengarsipan.</p>
            <button className="cyan" onClick={onExport}>Unduh CSV</button>
          </div>
        </div>
      </div>
    </section>
  );
}
