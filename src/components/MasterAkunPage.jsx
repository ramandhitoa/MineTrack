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

export default function MasterAkunPage({ role = 'OWNER' }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('Semua');
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
        const userCollection = collection(db, 'users');
        const userQuery = role === 'APP_ADMIN'
          ? query(userCollection, where('role', '==', 'USER'))
          : userCollection;

        const snapshot = await getDocs(userQuery);

        if (!mounted) return;

        const rows = snapshot.docs
          .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
          .filter((user) => user && typeof user === 'object');

        setUsers(rows);
      } catch (loadError) {
        if (!mounted) return;
        console.error('[MASTER_AKUN_LOAD_ERROR]', loadError);
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

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allowedRoles = role === 'APP_ADMIN' ? ['USER'] : ['OWNER', 'APP_ADMIN', 'USER'];

    return users.filter((user) => {
      if (!allowedRoles.includes(user.role)) return false;
      if (roleFilter !== 'Semua' && user.role !== roleFilter) return false;
      if (statusFilter !== 'Semua' && user.status !== statusFilter) return false;
      if (!query) return true;

      return `${user.name || ''} ${user.nik || ''}`.toLowerCase().includes(query);
    });
  }, [users, search, roleFilter, statusFilter, role]);

  const summary = useMemo(() => {
    const source = users.filter((user) => role === 'APP_ADMIN' ? user.role === 'USER' : true);

    return {
      total: source.length,
      owner: source.filter((user) => user.role === 'OWNER').length,
      appAdmin: source.filter((user) => user.role === 'APP_ADMIN').length,
      user: source.filter((user) => user.role === 'USER').length,
      active: source.filter((user) => user.status === 'ACTIVE').length,
      disabled: source.filter((user) => user.status === 'DISABLED').length,
    };
  }, [users, role]);

  const title = role === 'OWNER' ? 'Master Akun' : 'Master User';

  return (
    <div className="adminPage">
      <div className="adminHeader">
        <div>
          <div className="eyebrow">Administrasi</div>
          <h2>{title}</h2>
        </div>
      </div>

      {notice && <div className="adminInfoBox">{notice}</div>}

      <div className="statGrid">
        <div className="statCard">
          <span>Total Akun</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="statCard">
          <span>OWNER</span>
          <strong>{summary.owner}</strong>
        </div>
        <div className="statCard">
          <span>APP_ADMIN</span>
          <strong>{summary.appAdmin}</strong>
        </div>
        <div className="statCard">
          <span>USER</span>
          <strong>{summary.user}</strong>
        </div>
        <div className="statCard">
          <span>ACTIVE</span>
          <strong>{summary.active}</strong>
        </div>
        <div className="statCard">
          <span>DISABLED</span>
          <strong>{summary.disabled}</strong>
        </div>
      </div>

      <div className="adminToolbar">
        <label className="adminSearch">
          <span>Cari nama atau NIK</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIK" />
        </label>

        <div className="adminFilterRow">
          <label>
            <span>Role</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="Semua">Semua Role</option>
              <option value="OWNER">OWNER</option>
              <option value="APP_ADMIN">APP_ADMIN</option>
              <option value="USER">USER</option>
            </select>
          </label>

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
      ) : filteredUsers.length === 0 ? (
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
              {filteredUsers.map((user, index) => (
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
