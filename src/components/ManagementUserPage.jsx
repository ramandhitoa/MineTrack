import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';

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

export default function ManagementUserPage({ role = 'OWNER' }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
        <button
          type="button"
          className="primaryButton"
          onClick={() => setNotice('Fitur pengelolaan akun akan diaktifkan pada tahap berikutnya.')}
        >
          Tambah Akun
        </button>
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
                  </td>
                  <td>
                    <span className={`statusPill status-${user.status || 'ACTIVE'}`}>{user.status || 'ACTIVE'}</span>
                  </td>
                  <td>{formatLastLogin(user.lastLoginAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="tableActionButton"
                      disabled
                      onClick={() => setNotice('Fitur pengelolaan akun akan diaktifkan pada tahap berikutnya.')}
                    >
                      {user.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
