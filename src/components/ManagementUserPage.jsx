import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';

import { canManageAccountAction } from '../auth/accountAuthorization.js';
import { createManagedAccount, updateManagedAccount } from '../auth/authService.js';
import { firebaseApp, isFirebaseClientConfigured } from '../firebase/client.js';

function formatLastLogin(value) {
  if (!value) return 'Belum pernah login';

  if (typeof value === 'string') {
    return value || 'Belum pernah login';
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  if (value instanceof Date) {
    return value.toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  return 'Belum pernah login';
}

export default function ManagementUserPage({ role = 'USER' }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyUid, setBusyUid] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({ nik: '', name: '', role: 'USER' });
  const [createdAccount, setCreatedAccount] = useState(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const openCreateDialog = () => {
    setCreateForm({ nik: '', name: '', role: 'USER' });
    setCreateError('');
    setCreatedAccount(null);
    setCopiedPassword(false);
    setCreateOpen(true);
  };

  const closeCreateDialog = () => {
    if (createBusy) return;
    setCreateOpen(false);
    setCreatedAccount(null);
    setCreateForm({ nik: '', name: '', role: 'USER' });
    setCreateError('');
    setCopiedPassword(false);
  };

  const submitCreateAccount = async (event) => {
    event.preventDefault();
    setCreateError('');

    if (!createForm.nik.trim()) {
      setCreateError('NIK wajib diisi.');
      return;
    }
    if (!createForm.name.trim()) {
      setCreateError('Nama wajib diisi.');
      return;
    }

    setCreateBusy(true);
    try {
      const result = await createManagedAccount({
        nik: createForm.nik,
        name: createForm.name,
        role: role === 'APP_ADMIN' ? 'USER' : createForm.role,
      });
      setCreatedAccount(result);
    } catch (createAccountError) {
      setCreateError(createAccountError?.message || 'Akun gagal dibuat. Silakan coba kembali.');
    } finally {
      setCreateBusy(false);
    }
  };

  const copyInitialPassword = async () => {
    if (!createdAccount?.initialPassword) return;
    try {
      await navigator.clipboard.writeText(createdAccount.initialPassword);
      setCopiedPassword(true);
    } catch {
      setCreateError('Password tidak dapat disalin. Pilih password yang ditampilkan lalu salin secara manual.');
    }
  };

  const updateAccount = async (user, action, value) => {
    setBusyUid(user.id);
    setNotice('');

    try {
      await updateManagedAccount({
        actorRole: role,
        targetUid: user.id,
        targetRole: user.role,
        action,
        value,
      });
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, [action]: value } : item
      )));
      setNotice('Perubahan akun berhasil disimpan.');
    } catch (updateError) {
      setNotice(updateError?.message || 'Perubahan akun ditolak.');
    } finally {
      setBusyUid('');
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadUsers = async () => {
      if (!isFirebaseClientConfigured) {
        setError('Gagal memuat data akun.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const db = getFirestore(firebaseApp);

        const userQuery = role === 'OWNER'
          ? collection(db, 'users')
          : query(collection(db, 'users'), where('role', '==', 'USER'));

        const snapshot = await getDocs(userQuery);

        if (!mounted) return;

        const rows = snapshot.docs
          .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
          .filter((user) => user && typeof user === 'object');

        setUsers(rows);
      } catch (loadError) {
        if (!mounted) return;
        console.error('[MANAGEMENT_USER_LOAD_ERROR]', loadError);
        setError('Gagal memuat data akun.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadUsers();

    return () => {
      mounted = false;
    };
  }, [role]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allowedRoles = role === 'OWNER' ? ['OWNER', 'APP_ADMIN', 'USER'] : ['USER'];

    return users.filter((user) => {
      if (!allowedRoles.includes(user.role)) return false;
      if (statusFilter !== 'Semua' && user.status !== statusFilter) return false;
      if (!query) return true;

      return `${user.name || ''} ${user.nik || ''}`.toLowerCase().includes(query);
    });
  }, [role, users, search, statusFilter]);

  const pageTitle = role === 'OWNER' ? 'Manajemen Pengguna' : 'Manajemen User';

  return (
    <div className="adminPage">
      <div className="adminHeader">
        <div>
          <div className="eyebrow">Administrasi</div>
          <h2>{pageTitle}</h2>
        </div>
        {(role === 'OWNER' || role === 'APP_ADMIN') && (
          <button type="button" className="primaryButton" onClick={openCreateDialog}>
            + Tambah Akun
          </button>
        )}
      </div>

      {notice && <div className="adminInfoBox">{notice}</div>}

      <div className="adminToolbar">
        <label className="adminSearch">
          <span>Cari nama atau NIK</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIK" />
        </label>

        <div className="adminFilterRow">
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="Semua">Semua Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="adminInfoBox">Memuat data akun...</div>
      ) : error ? (
        <div className="adminErrorBox">{error}</div>
      ) : visibleUsers.length === 0 ? (
        <div className="adminInfoBox">Belum ada akun.</div>
      ) : (
        <div className="tableWrap adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama</th>
                <th>NIK</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user, index) => (
                <tr key={user.id || `${user.nik || 'akun'}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{user.name || '-'}</td>
                  <td>{user.nik || '-'}</td>
                  <td>
                    <span className={`rolePill role-${user.role || 'USER'}`}>{user.role || 'USER'}</span>
                    {role === 'OWNER' && user.role !== 'OWNER' && (
                      <select
                        aria-label={`Role ${user.name || user.nik}`}
                        value={user.role}
                        disabled={busyUid === user.id}
                        onChange={(event) => updateAccount(user, 'role', event.target.value)}
                      >
                        <option value="USER">USER</option>
                        <option value="APP_ADMIN">APP_ADMIN</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <span className={`statusPill status-${user.status || 'ACTIVE'}`}>{user.status || 'ACTIVE'}</span>
                  </td>
                  <td>{formatLastLogin(user.lastLoginAt)}</td>
                  <td>
                    {canManageAccountAction({
                      actorRole: role,
                      targetRole: user.role,
                      action: 'status',
                      value: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                    }) ? (
                      <button
                        type="button"
                        className="tableActionButton"
                        disabled={busyUid === user.id}
                        onClick={() => updateAccount(
                          user,
                          'status',
                          user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
                        )}
                      >
                        {user.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    ) : (
                      <span>Dilindungi</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="modalOverlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCreateDialog();
        }}>
          <section className="adminModal" role="dialog" aria-modal="true" aria-labelledby="create-account-title">
            <div className="adminModalHeader">
              <h3 id="create-account-title">{createdAccount ? 'AKUN BERHASIL DIBUAT' : 'Tambah Akun'}</h3>
              <button type="button" className="closeButton" onClick={closeCreateDialog} disabled={createBusy} aria-label="Tutup">×</button>
            </div>

            {createdAccount ? (
              <div className="adminForm">
                <div className="adminInfoBox fullWidth">
                  <div>NIK : {createdAccount.nik}</div>
                  <div>Nama : {createdAccount.name}</div>
                  <div>Role : {createdAccount.role}</div>
                </div>
                <label className="fullWidth">
                  Password awal
                  <output className="initialPassword">{createdAccount.initialPassword}</output>
                </label>
                {createError && <div className="adminErrorBox">{createError}</div>}
                <div className="adminModalActions">
                  <button type="button" className="secondaryButton" onClick={copyInitialPassword}>
                    {copiedPassword ? 'PASSWORD TERSALIN' : 'SALIN PASSWORD'}
                  </button>
                  <button type="button" className="primaryButton" onClick={closeCreateDialog}>TUTUP</button>
                </div>
              </div>
            ) : (
              <form className="adminForm" onSubmit={submitCreateAccount}>
                <label>
                  NIK
                  <input
                    autoComplete="off"
                    value={createForm.nik}
                    onChange={(event) => setCreateForm((current) => ({ ...current, nik: event.target.value }))}
                    disabled={createBusy}
                  />
                </label>
                <label>
                  Nama
                  <input
                    autoComplete="name"
                    value={createForm.name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={createBusy}
                  />
                </label>
                <label>
                  Role
                  <select
                    value={role === 'APP_ADMIN' ? 'USER' : createForm.role}
                    onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))}
                    disabled={createBusy}
                  >
                    <option value="USER">USER</option>
                    {role === 'OWNER' && <option value="ADMIN">ADMIN</option>}
                  </select>
                </label>
                {createError && <div className="adminErrorBox">{createError}</div>}
                <div className="adminModalActions">
                  <button type="button" className="secondaryButton" onClick={closeCreateDialog} disabled={createBusy}>BATAL</button>
                  <button type="submit" className="primaryButton" disabled={createBusy}>
                    {createBusy ? 'MEMBUAT...' : 'BUAT AKUN'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
