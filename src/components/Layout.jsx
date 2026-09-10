// ============================================================
// LAYOUT UTAMA
// Mengatur sidebar, header, notifikasi, dan area konten aplikasi.
// ============================================================

import { Check, CloudUpload, Clock3, Copy, MapPin, Menu, Plus, Truck, X } from 'lucide-react';
import { tabs } from '../constants';

export default function Layout({
  activeTab,
  setActiveTab,
  mobileNav,
  setMobileNav,
  pendingCount,
  title,
  alert,
  setAlert,
  theme,
  onThemeChange,
  onInputDaily,
  onInputPending,
  onCopyExcel,
  onSyncGoogleSheets,
  children,
}) {
  return (
    <div className={`app theme-${theme}`}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        pendingCount={pendingCount}
      />

      <main>
        <Header
          title={title}
          setMobileNav={setMobileNav}
          theme={theme}
          onThemeChange={onThemeChange}
          onInputDaily={onInputDaily}
          onInputPending={onInputPending}
          onCopyExcel={onCopyExcel}
          onSyncGoogleSheets={onSyncGoogleSheets}
        />

        <div className="content">
          {alert && (
            <div className="alert">
              <Check size={16} />
              {alert}
              <button onClick={() => setAlert('')} aria-label="Tutup notifikasi">
                <X size={15} />
              </button>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

function Sidebar({ activeTab, setActiveTab, mobileNav, setMobileNav, pendingCount }) {
  return (
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div>
        <div className="brand">
          <div className="brandIcon">
            <Truck size={22} />
          </div>
          <div>
            <b>MINETRACK PRO</b>
            <span>QC & Nickel Mining Operations</span>
          </div>
        </div>

        <nav>
          {tabs.map(([id, label, Icon], index) => (
            <div key={id}>
              {index === 4 && <div className="navLabel">QC & Integration Sync</div>}
              <button
                className={activeTab === id ? 'active' : ''}
                onClick={() => {
                  setActiveTab(id);
                  setMobileNav(false);
                }}
              >
                <Icon size={16} />
                {label}
                {id === 'pending' && pendingCount > 0 && <em>{pendingCount}</em>}
              </button>
            </div>
          ))}
        </nav>

        <div className="spec">
          <div>
            <b>CUT-OFF GRADE Ni</b>
            <small>QC Spec</small>
          </div>
          <p><span>Saprolit HG:</span> ≥ 1.60% Ni</p>
          <p><span>Saprolit LG:</span> 1.30 - 1.59%</p>
          <p><span>Limonit Ore:</span> 1.00 - 1.29%</p>
          <p>Waste / OB: &lt; 1.00% Ni</p>
        </div>
      </div>

      <footer>MineTrack Nickel v3.0 • QC & Spreadsheet Sync</footer>
    </aside>
  );
}

function Header({ title, setMobileNav, theme, onThemeChange, onInputDaily, onInputPending, onCopyExcel, onSyncGoogleSheets }) {
  return (
    <header>
      <div className="headTitle">
        <button className="mobileMenu" onClick={() => setMobileNav((value) => !value)} aria-label="Buka menu">
          <Menu size={20} />
        </button>
        <h1>{title}</h1>
        <span>
          <MapPin size={12} /> Central & East Mining Pit
        </span>
      </div>

      <div className="actions">
        <label className="themeSelector">
          <span>Tema</span>
          <select value={theme} onChange={(event) => onThemeChange(event.target.value)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <button className="primary" onClick={onInputDaily}>
          <Plus size={14} /> Input Hasil Shift
        </button>
        <button onClick={onInputPending}>
          <Clock3 size={14} /> Job Pending
        </button>
        <button onClick={onCopyExcel}>
          <Copy size={14} /> Copy Excel
        </button>
        <button className="sync" onClick={onSyncGoogleSheets}>
          <CloudUpload size={14} /> Sync Google Sheets
        </button>
      </div>
    </header>
  );
}
