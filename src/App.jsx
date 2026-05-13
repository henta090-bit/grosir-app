import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, LayoutDashboard, ScanBarcode, ClipboardList, Package, LogOut, Menu, Users, FileText } from 'lucide-react';
import { supabase } from './config/supabase';

import Dashboard from './pages/Dashboard';
import MutasiGudang from './pages/MutasiGudang';
import MasterBarang from './pages/MasterBarang';
import StokOpname from './pages/StokOpname';
import LaporanStok from './pages/LaporanStok';
import { enrichProductCategory } from './utils/productCategories';
import { fetchProductsForApp } from './utils/productQueries';

const SESSION_STORAGE_KEY = 'toko-bebeng-session';
const PRODUCTS_CACHE_KEY = 'toko-bebeng-products-cache';
const PASSWORD_HASH_PREFIX = 'sha256:';
const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'KASIR', label: 'Kasir' },
  { value: 'GUDANG', label: 'Gudang' },
];

const VALID_ROLES = ROLE_OPTIONS.map((role) => role.value);

const normalizeRole = (role) => {
  const normalizedRole = String(role ?? '').trim().toUpperCase();
  if (VALID_ROLES.includes(normalizedRole)) return normalizedRole;
  return 'KASIR';
};

const sanitizeUserSession = (userData) => {
  if (!userData) return null;

  return {
    id: userData.id,
    username: userData.username ?? '',
    role: normalizeRole(userData.role),
  };
};

const hasAccess = (userRole, allowedRoles = []) => {
  if (allowedRoles.length === 0) return true;
  return allowedRoles.includes(normalizeRole(userRole));
};

const hashPassword = async (plainPassword) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainPassword);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(digest));
  const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${PASSWORD_HASH_PREFIX}${hashHex}`;
};

const isPasswordHash = (value) => typeof value === 'string' && value.startsWith(PASSWORD_HASH_PREFIX);

const readCachedProducts = () => {
  try {
    const rawCache = localStorage.getItem(PRODUCTS_CACHE_KEY);
    const parsedCache = rawCache ? JSON.parse(rawCache) : [];
    return Array.isArray(parsedCache) ? parsedCache.map(enrichProductCategory) : [];
  } catch {
    return [];
  }
};

const getMenuFromHash = () => {
  if (typeof window === 'undefined') return 'dashboard';
  const menuId = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  return menuId || 'dashboard';
};

const LoginPage = memo(function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const { data, error: dbError } = await supabase
      .from('app_users')
      .select('*')
      .eq('username', username.trim())
      .single();

    if (dbError || !data) {
      setError(`Gagal: ${dbError ? dbError.message : 'User tidak ditemukan'}`);
      setIsSubmitting(false);
      return;
    }

    const hashedPassword = await hashPassword(password);
    const storedPassword = data.password_hash ?? '';
    const passwordMatches = storedPassword === hashedPassword || storedPassword === password;

    if (!passwordMatches) {
      setError('Password salah!');
      setIsSubmitting(false);
      return;
    }

    if (!isPasswordHash(storedPassword)) {
      await supabase
        .from('app_users')
        .update({ password_hash: hashedPassword })
        .eq('id', data.id);
    }

    onLogin(sanitizeUserSession(data));
    setIsSubmitting(false);
  };

  return (
    <div className="flex h-[100dvh] items-center justify-center p-6 bg-slate-100 font-sans">
      <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-200 z-10 text-center">
        <div className="flex justify-center mb-8">
          <div className="bg-indigo-600 p-5 rounded-[1.5rem] text-white shadow-xl shadow-indigo-200">
            <ShieldCheck size={36} />
          </div>
        </div>
        <h1 className="text-2xl font-black tracking-tighter uppercase italic">Toko Bebeng</h1>
        <p className="text-slate-500 mb-8 text-[10px] font-bold tracking-[0.2em] uppercase mt-1">Sistem Manajemen Stok</p>

        <form onSubmit={handleLogin} className="space-y-5 text-left">
          <input
            required
            placeholder="Username"
            className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-500 font-bold outline-none text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            required
            type="password"
            placeholder="Password"
            className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-500 font-bold outline-none text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-rose-600 text-xs font-bold text-center bg-rose-50 p-2 rounded-lg">{error}</p>}
          <button
            disabled={isSubmitting}
            className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Memeriksa...' : 'Masuk Sistem'}
          </button>
        </form>
      </div>
    </div>
  );
});

const Sidebar = memo(function Sidebar({
  accessibleMenus,
  activeMenu,
  isMobileMenuOpen,
  onLogout,
  onMenuClick,
  user,
}) {
  return (
    <aside className={`absolute inset-y-0 left-0 z-50 w-64 bg-indigo-950 text-white flex flex-col shadow-2xl transition-transform duration-500 md:relative md:inset-auto md:min-h-[100dvh] md:self-stretch ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className="flex h-full flex-col md:sticky md:top-0 md:h-screen">
        <div className="p-6 border-b border-white/5 flex flex-col items-center">
          <h1 className="font-black text-xl italic tracking-tighter mt-4">TOKO BEBENG</h1>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          {accessibleMenus.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => onMenuClick(m.id)}
                className={`w-full flex items-center gap-4 p-3.5 rounded-xl font-bold text-xs tracking-wide transition-all ${activeMenu === m.id ? 'bg-white text-indigo-950 shadow-md' : 'text-indigo-100/60 hover:text-white hover:bg-white/5'}`}
              >
                <Icon size={18} className={activeMenu === m.id ? 'text-indigo-600' : ''} /> {m.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto p-4 border-t border-white/5 bg-indigo-900/30 backdrop-blur-sm flex justify-between items-center md:sticky md:bottom-0">
          <div>
            <p className="text-[11px] font-black text-white">{user.username.toUpperCase()}</p>
            <p className="text-[9px] font-bold text-indigo-300 uppercase">{normalizeRole(user.role)}</p>
          </div>
          <button onClick={onLogout} className="text-white/40 hover:text-rose-400 p-2">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
});

const AppHeader = memo(function AppHeader({ activeLabel, isMobileMenuOpen, onToggleMenu }) {
  return (
    <header className="p-4 md:p-6 border-b border-slate-100 flex items-center bg-white z-10 shadow-sm">
      <button className="md:hidden text-slate-500 p-2 mr-4" onClick={() => onToggleMenu(!isMobileMenuOpen)}>
        <Menu size={24} />
      </button>
      <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">
        {activeLabel}
      </h2>
    </header>
  );
});

const UserManagementPage = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'KASIR',
  });
  const [passwordDrafts, setPasswordDrafts] = useState({});

  const fetchUsers = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, role')
      .order('username', { ascending: true });

    if (error) {
      setMessage({ type: 'error', text: `Gagal memuat user: ${error.message}` });
      setUsers([]);
    } else {
      setUsers((data ?? []).map((item) => ({ ...item, role: normalizeRole(item.role) })));
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    const payload = {
      username: form.username.trim(),
      password_hash: await hashPassword(form.password),
      role: normalizeRole(form.role),
    };

    const { error } = await supabase.from('app_users').insert(payload);

    if (error) {
      setMessage({ type: 'error', text: `Gagal menambah user: ${error.message}` });
    } else {
      setMessage({ type: 'success', text: 'User baru berhasil ditambahkan.' });
      setForm({ username: '', password: '', role: 'KASIR' });
      await fetchUsers();
    }

    setSaving(false);
  };

  const handleRoleChange = async (userId, nextRole) => {
    setMessage({ type: '', text: '' });
    setPendingUserId(userId);

    const normalizedRole = normalizeRole(nextRole);
    const previousUsers = users;

    setUsers((current) =>
      current.map((item) => (item.id === userId ? { ...item, role: normalizedRole } : item))
    );

    const { error } = await supabase
      .from('app_users')
      .update({ role: normalizedRole })
      .eq('id', userId);

    if (error) {
      setUsers(previousUsers);
      setMessage({ type: 'error', text: `Gagal mengubah role: ${error.message}` });
    } else {
      setMessage({ type: 'success', text: 'Role user berhasil diperbarui.' });
    }

    setPendingUserId(null);
  };

  const handlePasswordUpdate = async (userId) => {
    const nextPassword = passwordDrafts[userId]?.trim();
    if (!nextPassword) {
      setMessage({ type: 'error', text: 'Password baru tidak boleh kosong.' });
      return;
    }

    setPendingUserId(userId);
    setMessage({ type: '', text: '' });

    const { error } = await supabase
      .from('app_users')
      .update({ password_hash: await hashPassword(nextPassword) })
      .eq('id', userId);

    if (error) {
      setMessage({ type: 'error', text: `Gagal mengubah password: ${error.message}` });
    } else {
      setPasswordDrafts((current) => ({ ...current, [userId]: '' }));
      setMessage({ type: 'success', text: 'Password user berhasil diperbarui.' });
    }

    setPendingUserId(null);
  };

  const handleDeleteUser = async (userId, username) => {
    if (currentUser?.id === userId) {
      setMessage({ type: 'error', text: 'User yang sedang login tidak bisa dihapus.' });
      return;
    }

    const confirmed = window.confirm(`Hapus user "${username}"?`);
    if (!confirmed) return;

    setPendingUserId(userId);
    setMessage({ type: '', text: '' });

    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (error) {
      setMessage({ type: 'error', text: `Gagal menghapus user: ${error.message}` });
    } else {
      setUsers((current) => current.filter((item) => item.id !== userId));
      setMessage({ type: 'success', text: 'User berhasil dihapus.' });
    }

    setPendingUserId(null);
  };

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-full">
      <div className="max-w-6xl mx-auto grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Management User</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Tambah user dan atur role akses</p>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Username</label>
              <input
                required
                value={form.username}
                onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
                className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-500 font-bold outline-none text-sm"
                placeholder="Masukkan username"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-500 font-bold outline-none text-sm"
                placeholder="Masukkan password"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Role</label>
              <select
                value={normalizeRole(form.role)}
                onChange={(e) => setForm((current) => ({ ...current, role: normalizeRole(e.target.value) }))}
                className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-500 font-bold outline-none text-sm"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Menyimpan...' : 'Tambah User'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Aturan Role</p>
            <div className="space-y-2 text-xs font-bold text-slate-600">
              <p>Admin: semua menu bisa dilihat.</p>
              <p>Kasir: mutasi gudang dan stok opname.</p>
              <p>Gudang: hanya stok opname.</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest">Daftar User</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Kelola role akses per user</p>
            </div>
            <button onClick={fetchUsers} className="px-4 py-3 rounded-xl border border-slate-200 font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-50">
              Refresh
            </button>
          </div>

          {message.text && (
            <div className={`mx-6 mt-6 rounded-xl px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {message.text}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Username</th>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</th>
                  <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="p-10 text-center font-bold text-slate-400 animate-pulse">
                      Memuat data user...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-10 text-center font-bold text-slate-400">
                      Belum ada user terdaftar
                    </td>
                  </tr>
                ) : (
                  users.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <p className="font-black text-slate-800">{item.username}</p>
                      </td>
                      <td className="p-4">
                        <select
                          value={normalizeRole(item.role)}
                          onChange={(e) => handleRoleChange(item.id, e.target.value)}
                          disabled={pendingUserId === item.id}
                          className="w-full md:w-44 p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col md:flex-row gap-2">
                          <input
                            type="password"
                            value={passwordDrafts[item.id] ?? ''}
                            onChange={(e) => setPasswordDrafts((current) => ({ ...current, [item.id]: e.target.value }))}
                            className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500"
                            placeholder="Password baru"
                          />
                          <button
                            onClick={() => handlePasswordUpdate(item.id)}
                            disabled={pendingUserId === item.id}
                            className="px-4 py-3 rounded-xl bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 disabled:opacity-60"
                          >
                            Simpan
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleDeleteUser(item.id, item.username)}
                            disabled={pendingUserId === item.id || currentUser?.id === item.id}
                            className="px-4 py-3 rounded-xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 disabled:opacity-50"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      return sanitizeUserSession(savedSession ? JSON.parse(savedSession) : null);
    } catch {
      return null;
    }
  });
  const [activeMenu, setActiveMenu] = useState(() => getMenuFromHash());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [products, setProducts] = useState(() => readCachedProducts());
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsReady, setProductsReady] = useState(() => readCachedProducts().length > 0);
  const productsFetchRef = useRef(null);
  const productsRef = useRef([]);

  const menuList = useMemo(
    () => [
      { id: 'dashboard', label: 'DASHBOARD', icon: LayoutDashboard, roles: [] },
      { id: 'gudang', label: 'MUTASI GUDANG', icon: ScanBarcode, roles: ['ADMIN', 'KASIR'] },
      { id: 'inventory', label: 'MASTER BARANG', icon: Package, roles: ['ADMIN'] },
      { id: 'opname', label: 'STOK OPNAME', icon: ClipboardList, roles: ['ADMIN', 'KASIR', 'GUDANG'] },
      { id: 'laporan', label: 'LAPORAN', icon: FileText, roles: ['ADMIN'] },
      { id: 'users', label: 'MANAGEMENT USER', icon: Users, roles: ['ADMIN'] },
    ],
    []
  );

  const accessibleMenus = useMemo(
    () => menuList.filter((menu) => hasAccess(user?.role, menu.roles)),
    [menuList, user?.role]
  );

  const accessibleMenuIds = useMemo(
    () => new Set(accessibleMenus.map((menu) => menu.id)),
    [accessibleMenus]
  );

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const fetchProducts = useCallback(async ({ force = false } = {}) => {
    if (!force && productsReady) return productsRef.current;
    if (!force && productsFetchRef.current) return productsFetchRef.current;

    setProductsLoading(true);

    const request = fetchProductsForApp()
      .then((nextProducts) => {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(nextProducts));
        setProducts(nextProducts);
        setProductsReady(true);
        return nextProducts;
      })
      .catch((error) => {
        console.error('Gagal memuat produk:', error);
        return [];
      })
      .finally(() => {
        productsFetchRef.current = null;
        setProductsLoading(false);
      });

    productsFetchRef.current = request;
    return request;
  }, [productsReady]);

  useEffect(() => {
    if (!user) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProducts([]);
      setProductsReady(false);
      productsFetchRef.current = null;
      return;
    }

    if (!productsReady && products.length === 0) {
      const cachedProducts = readCachedProducts();
      if (cachedProducts.length > 0) {
        setProducts(cachedProducts);
        setProductsReady(true);
        window.setTimeout(() => {
          fetchProducts({ force: true });
        }, 250);
        return;
      }
    }

    if (!productsReady) {
      fetchProducts();
      return;
    }

    window.setTimeout(() => {
      fetchProducts({ force: true });
    }, 250);
  }, [fetchProducts, products.length, productsReady, user]);

  useEffect(() => {
    if (!accessibleMenus.some((menu) => menu.id === activeMenu)) {
      setActiveMenu(accessibleMenus[0]?.id ?? 'dashboard');
    }
  }, [accessibleMenus, activeMenu]);

  useEffect(() => {
    if (!user) return undefined;

    const syncMenuFromBrowser = () => {
      const nextMenu = getMenuFromHash();
      if (accessibleMenuIds.has(nextMenu)) {
        setActiveMenu(nextMenu);
        setIsMobileMenuOpen(false);
        if (nextMenu === 'inventory') fetchProducts();
        return;
      }

      const fallbackMenu = accessibleMenus[0]?.id ?? 'dashboard';
      if (window.location.hash !== `#${fallbackMenu}`) {
        window.history.replaceState(null, '', `#${fallbackMenu}`);
      }
      setActiveMenu(fallbackMenu);
      setIsMobileMenuOpen(false);
    };

    syncMenuFromBrowser();
    window.addEventListener('hashchange', syncMenuFromBrowser);

    return () => window.removeEventListener('hashchange', syncMenuFromBrowser);
  }, [accessibleMenuIds, accessibleMenus, fetchProducts, user]);

  useEffect(() => {
    if (!user) return;
    if (!accessibleMenuIds.has(activeMenu)) return;
    if (window.location.hash === `#${activeMenu}`) return;
    window.history.pushState(null, '', `#${activeMenu}`);
  }, [accessibleMenuIds, activeMenu, user]);

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setIsMobileMenuOpen(false);
    setActiveMenu('dashboard');
    setProducts([]);
    setProductsReady(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setUser(null);
  };

  const handleMenuClick = useCallback((menuId) => {
    setActiveMenu(menuId);
    setIsMobileMenuOpen(false);
    if (menuId === 'inventory') fetchProducts();
  }, [fetchProducts]);

  const refreshProducts = useCallback(() => fetchProducts({ force: true }), [fetchProducts]);

  const activeLabel = accessibleMenus.find((m) => m.id === activeMenu)?.label;

  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <div className="relative flex min-h-[100dvh] items-stretch bg-slate-50 font-sans">
      <Sidebar
        accessibleMenus={accessibleMenus}
        activeMenu={activeMenu}
        isMobileMenuOpen={isMobileMenuOpen}
        onLogout={handleLogout}
        onMenuClick={handleMenuClick}
        user={user}
      />

      <main className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col bg-slate-50">
        <AppHeader
          activeLabel={activeLabel}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMenu={setIsMobileMenuOpen}
        />

        <div className="flex-1 min-h-0">
          {activeMenu === 'dashboard' && (
            <Dashboard
              products={products}
              productsLoading={productsLoading && !productsReady}
              refreshProducts={refreshProducts}
              user={user}
            />
          )}

          {activeMenu === 'gudang' && <MutasiGudang user={user} />}
          {activeMenu === 'inventory' && (
            <MasterBarang
              products={products}
              productsLoading={productsLoading && !productsReady}
              refreshProducts={refreshProducts}
              setProducts={setProducts}
            />
          )}
          {activeMenu === 'users' && <UserManagementPage currentUser={user} />}
          {activeMenu === 'laporan' && <LaporanStok />}

          {activeMenu === 'opname' && (
            <StokOpname
              products={products}
              productsLoading={productsLoading && !productsReady}
              refreshProducts={refreshProducts}
              setProducts={setProducts}
              user={user}
            />
          )}
        </div>
      </main>
    </div>
  );
}
