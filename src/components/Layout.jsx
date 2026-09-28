// ============================================================
// LAYOUT UTAMA
// Mengatur sidebar, header, notifikasi, dan area konten aplikasi.
// ============================================================

import {
  BarChart3,
  CalendarDays,
  Check,
  ClipboardList,
  CloudUpload,
  Clock3,
  Copy,
  Crosshair,
  MapPin,
  Menu,
  Mountain,
  Plus,
  Settings2,
  Table2,
  UserCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { tabs } from '../constants';

function getRoleNavigation(role) {
  const baseNavigation = tabs.map(([id, label]) => [id, label]);

  if (role === 'OWNER') {
    return [
      ...baseNavigation,
      ['owner-users', 'Manajemen Pengguna'],
      ['owner-master', 'Master Akun'],
      ['owner-settings', 'Pengaturan'],
    ];
  }

  if (role === 'APP_ADMIN') {
    return [
      ...baseNavigation,
      ['admin-users', 'Manajemen User'],
      ['admin-master', 'Master User'],
      ['admin-settings', 'Pengaturan'],
    ];
  }

  return baseNavigation;
}

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
  onLogout,
  user,
  role,
  children,
}) {
  const currentRole = role || 'USER';

  return (
    <div className={`app theme-${theme}`}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        pendingCount={pendingCount}
        role={currentRole}
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
          onLogout={onLogout}
          user={user}
          role={currentRole}
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

function Sidebar({ activeTab, setActiveTab, mobileNav, setMobileNav, pendingCount, role }) {
  const navigation = getRoleNavigation(role);
  const canEditCutoff = role === 'OWNER' || role === 'APP_ADMIN';
  const [cutoff, setCutoff] = useState({
    saprolitHg: 1.60,
    saprolitLgMin: 1.30,
    saprolitLgMax: 1.59,
    limoniteMin: 1.00,
    limoniteMax: 1.29,
    waste: 1.00,
  });

  const updateCutoff = (key, value) => setCutoff((current) => ({ ...current, [key]: Number(value) || 0 }));

  const renderCutoffValue = (label, value, isRange = false, secondValue = null, isWaste = false) => {
    if (canEditCutoff) {
      if (isRange) {
        return (
          <span className="cutoffValue">
            <input type="number" step="0.01" min="0" value={value} onChange={(event) => updateCutoff(label, event.target.value)} /> - <input type="number" step="0.01" min="0" value={secondValue} onChange={(event) => updateCutoff(label === 'saprolitLgMin' ? 'saprolitLgMax' : 'limoniteMax', event.target.value)} />% Ni
          </span>
        );
      }

      if (isWaste) {
        return (
          <span className="cutoffValue">&lt; <input type="number" step="0.01" min="0" value={value} onChange={(event) => updateCutoff('waste', event.target.value)} />% Ni</span>
        );
      }

      return (
        <span className="cutoffValue">≥ <input type="number" step="0.01" min="0" value={value} onChange={(event) => updateCutoff('saprolitHg', event.target.value)} />% Ni</span>
      );
    }

    if (isRange) {
      return (
        <span className="cutoffValue">
          {Number(value).toFixed(2)} - {Number(secondValue).toFixed(2)}% Ni
        </span>
      );
    }

    if (isWaste) {
      return <span className="cutoffValue">&lt; {Number(value).toFixed(2)}% Ni</span>;
    }

    return <span className="cutoffValue">≥ {Number(value).toFixed(2)}% Ni</span>;
  };

  return (
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div>
        <div className="brand">
          <div className="brandIcon" aria-label="GC PIT REPORT">
            <Mountain size={20} />
            <Crosshair size={10} className="brandCrosshair" />
          </div>
          <div>
            <b>GC PIT REPORT</b>
            <span>PRODUCTION, ORE GETTING & ABSEN</span>
          </div>
        </div>

        <nav>
          {navigation.map(([id, label], index) => {
            const adminMenuIds = ['owner-users', 'owner-master', 'owner-settings', 'admin-users', 'admin-master', 'admin-settings'];
            const isAdminMenu = adminMenuIds.includes(id);
            const tabMap = {
              dashboard: 'dashboard',
              harian: 'harian',
              mingguan: 'mingguan',
              bulanan: 'bulanan',
              oregetting: 'oregetting',
              absensi: 'absensi',
              pending: 'pending',
              excel: 'excel',
              'owner-users': 'owner-users',
              'owner-master': 'owner-master',
              'owner-settings': 'owner-settings',
              'admin-users': 'admin-users',
              'admin-master': 'admin-master',
              'admin-settings': 'admin-settings',
            };

            const iconMap = {
              dashboard: BarChart3,
              harian: ClipboardList,
              mingguan: CalendarDays,
              bulanan: CalendarDays,
              oregetting: ClipboardList,
              absensi: UserCheck,
              pending: Clock3,
              excel: Table2,
              'owner-users': UserCheck,
              'owner-master': UserCheck,
              'owner-settings': Settings2,
              'admin-users': UserCheck,
              'admin-master': UserCheck,
              'admin-settings': Settings2,
            };

            const Icon = iconMap[id] || Mountain;
            const isOriginalUserSectionBreak = index === 4 && role === 'USER';
            const isAdminSectionBreak = isAdminMenu && index >= tabs.length;

            return (
              <div key={id}>
                {isOriginalUserSectionBreak && <div className="navLabel">QC & Integration Sync</div>}
                {isAdminSectionBreak && <div className="navLabel">Administrasi</div>}
                <button
                  className={activeTab === id || activeTab === tabMap[id] ? 'active' : ''}
                  onClick={() => {
                    const targetTab = tabMap[id] || id;
                    setActiveTab(targetTab);
                    setMobileNav(false);
                  }}
                >
                  <Icon size={16} />
                  {label}
                  {id === 'pending' && pendingCount > 0 && <em>{pendingCount}</em>}
                  {isAdminMenu && <em>Admin</em>}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="spec">
          <div>
            <b>CUT-OFF GRADE Ni</b>
            <small>QC Spec</small>
          </div>
          <div className="cutoffList">
            <label className="cutoffRow">
              <span>Saprolit HG:</span>
              {renderCutoffValue('saprolitHg', cutoff.saprolitHg)}
            </label>
            <label className="cutoffRow">
              <span>Saprolit LG:</span>
              {renderCutoffValue('saprolitLgMin', cutoff.saprolitLgMin, true, cutoff.saprolitLgMax)}
            </label>
            <label className="cutoffRow">
              <span>Limonit Ore:</span>
              {renderCutoffValue('limoniteMin', cutoff.limoniteMin, true, cutoff.limoniteMax)}
            </label>
            <label className="cutoffRow">
              <span>Waste / OB:</span>
              {renderCutoffValue('waste', cutoff.waste, false, null, true)}
            </label>
          </div>
        </div>
      </div>

      <footer>GC PIT REPORT v3.0 • QC & Spreadsheet Sync</footer>
    </aside>
  );
}

function Header({ title, setMobileNav, theme, onThemeChange, onInputDaily, onInputPending, onCopyExcel, onSyncGoogleSheets, onLogout, user, role }) {
  const currentRole = role || 'USER';

  return (
    <header>
      <div className="headTitle">
        <button className="mobileMenu" onClick={() => setMobileNav((value) => !value)} aria-label="Buka menu">
          <Menu size={20} />
        </button>
        <div className="headMeta">
          <h1>{title}</h1>
          {user && (
            <div className="userMetaCard">
              <span className="userName">
                {user.name && user.name !== 'MineTrack User' ? user.name : 'GC PIT REPORT User'}
              </span>
              <span className="userNik">{user.nik || '-'}</span>
              <span className={`userRoleBadge role-${currentRole}`}>
                {currentRole}
              </span>
            </div>
          )}
        </div>
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

        {currentRole === 'USER' && (
          <>
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
          </>
        )}

        {currentRole !== 'USER' && (
          <button className="primary" onClick={onInputDaily}>
            <Plus size={14} /> Input Hasil Shift
          </button>
        )}

        {onLogout && (
          <button onClick={onLogout}>
            Logout
          </button>
        )}
      </div>
    </header>
  );
}

