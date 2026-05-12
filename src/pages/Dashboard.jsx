import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Boxes,
  CalendarClock,
  PackageCheck,
  RefreshCcw,
  TrendingDown,
} from 'lucide-react';
import { getTransactionLogs } from '../utils/inventoryHistory';

const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0));

const isToday = (value) => {
  if (!value) return false;

  const currentDate = new Date();
  const targetDate = new Date(value);

  return (
    currentDate.getFullYear() === targetDate.getFullYear() &&
    currentDate.getMonth() === targetDate.getMonth() &&
    currentDate.getDate() === targetDate.getDate()
  );
};

const MetricCard = ({ icon: Icon, label, value, helper, tone }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
        <p className="mt-4 text-3xl font-black leading-none text-slate-950">{value}</p>
        <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">{helper}</p>
      </div>
      <div className={`shrink-0 rounded-2xl p-3 ${tone}`}>
        <Icon size={22} />
      </div>
    </div>
  </div>
);

export default function Dashboard({
  products = [],
  productsLoading = false,
  refreshProducts,
  user,
}) {
  const [transactionLogs, setTransactionLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchDashboard = useCallback(async () => {
    setRefreshing(true);
    setError('');

    try {
      const [logs] = await Promise.all([
        getTransactionLogs(),
        refreshProducts?.() ?? Promise.resolve(),
      ]);
      setTransactionLogs(logs);
    } catch (refreshError) {
      setTransactionLogs([]);
      setError(refreshError.message || 'Gagal menyinkronkan data dashboard.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshProducts]);

  useEffect(() => {
    let ignore = false;

    const loadTransactions = async () => {
      setError('');

      try {
        const logs = await getTransactionLogs();
        if (!ignore) setTransactionLogs(logs);
      } catch (transactionError) {
        if (!ignore) {
          setTransactionLogs([]);
          setError(transactionError.message || 'Gagal memuat transaksi dashboard.');
        }
      }
    };

    loadTransactions();

    return () => {
      ignore = true;
    };
  }, []);

  const todayTransactions = useMemo(
    () => transactionLogs.filter((item) => isToday(item.created_at)),
    [transactionLogs]
  );

  const summary = useMemo(() => {
    const activeProducts = products.filter((item) => item.is_active);
    const lowStockItems = activeProducts.filter((item) => {
      const stock = Number(item.current_stock_slop || 0);
      const minimum = Number(item.min_stock_slop || 0);
      return stock <= minimum;
    });

    const outgoingToday = todayTransactions.filter((item) => item.type === 'KELUAR' || item.direction === 'KELUAR');
    const outgoingByProduct = new Map();

    outgoingToday.forEach((item) => {
      const key = item.product_id || item.sku || item.product_name || item.id;
      const current = outgoingByProduct.get(key) || {
        productName: item.product_name || 'Tanpa nama',
        sku: item.sku || '-',
        qty: 0,
        transactions: 0,
      };

      current.qty += Number(item.qty || 0);
      current.transactions += 1;
      outgoingByProduct.set(key, current);
    });

    const topOutgoingItems = [...outgoingByProduct.values()]
      .sort((left, right) => right.qty - left.qty)
      .slice(0, 5);

    return {
      totalProducts: products.length,
      activeProducts: activeProducts.length,
      lowStockItems,
      todayTransactions,
      outgoingToday,
      topOutgoingItem: topOutgoingItems[0],
      topOutgoingItems,
    };
  }, [products, todayTransactions]);

  const lowStockPreview = useMemo(
    () =>
      [...summary.lowStockItems]
        .sort((left, right) => Number(left.current_stock_slop || 0) - Number(right.current_stock_slop || 0))
        .slice(0, 5),
    [summary.lowStockItems]
  );

  return (
    <div className="min-h-full bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
          <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Dashboard Stok</p>
              <h3 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
                Monitor toko hari ini, {user?.username?.toUpperCase() || 'TEAM'}
              </h3>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                Ringkasan cepat untuk total produk, stok menipis, transaksi hari ini, dan barang yang paling banyak keluar.
              </p>
            </div>

            <button
              onClick={fetchDashboard}
              disabled={refreshing}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-xs font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Sync' : 'Refresh'}
            </button>
          </div>
        </section>

        {(error || productsLoading) && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {error || 'Data awal sedang disinkronkan. Dashboard tetap bisa dipakai dari cache lokal.'}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Boxes}
            label="Total Produk"
            value={formatNumber(summary.totalProducts)}
            helper={`${formatNumber(summary.activeProducts)} produk aktif di master barang`}
            tone="bg-indigo-50 text-indigo-600"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Stok Menipis"
            value={formatNumber(summary.lowStockItems.length)}
            helper="Produk aktif dengan stok sama atau di bawah minimum"
            tone="bg-amber-50 text-amber-600"
          />
          <MetricCard
            icon={CalendarClock}
            label="Transaksi Hari Ini"
            value={formatNumber(summary.todayTransactions.length)}
            helper={`${formatNumber(summary.outgoingToday.length)} transaksi stok keluar hari ini`}
            tone="bg-cyan-50 text-cyan-600"
          />
          <MetricCard
            icon={TrendingDown}
            label="Item Paling Keluar"
            value={formatNumber(summary.topOutgoingItem?.qty || 0)}
            helper={summary.topOutgoingItem?.productName || 'Belum ada stok keluar hari ini'}
            tone="bg-rose-50 text-rose-600"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Ranking Keluar</p>
                <h4 className="mt-2 text-xl font-black text-slate-950">Item Paling Banyak Keluar Hari Ini</h4>
              </div>
              <ArrowDownRight className="text-rose-500" size={24} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="p-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Barang</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">SKU</th>
                    <th className="p-4 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Qty Keluar</th>
                    <th className="p-4 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Transaksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.topOutgoingItems.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-sm font-bold text-slate-400">
                        Belum ada transaksi stok keluar hari ini.
                      </td>
                    </tr>
                  ) : (
                    summary.topOutgoingItems.map((item, index) => (
                      <tr key={`${item.sku}-${item.productName}`} className="hover:bg-slate-50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white">
                              {index + 1}
                            </span>
                            <p className="font-black text-slate-800">{item.productName}</p>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-bold uppercase text-slate-500">{item.sku}</td>
                        <td className="p-4 text-center">
                          <span className="inline-flex min-w-20 justify-center rounded-xl bg-rose-50 px-3 py-2 text-sm font-black text-rose-700">
                            {formatNumber(item.qty)}
                          </span>
                        </td>
                        <td className="p-4 text-center text-sm font-black text-slate-700">{formatNumber(item.transactions)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Perlu Restock</p>
                <h4 className="mt-2 text-xl font-black text-slate-950">Stok Menipis</h4>
              </div>
              <PackageCheck className="text-amber-500" size={24} />
            </div>

            <div className="mt-5 space-y-3">
              {lowStockPreview.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-700">
                  Semua stok aktif masih aman.
                </div>
              ) : (
                lowStockPreview.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-800">{item.name}</p>
                        <p className="mt-1 text-[11px] font-bold uppercase text-slate-400">SKU: {item.sku || '-'}</p>
                      </div>
                      <span className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-700">
                        {formatNumber(item.current_stock_slop)}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{
                          width: `${Math.min(
                            (Number(item.current_stock_slop || 0) / Math.max(Number(item.min_stock_slop || 1), 1)) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      Minimum: {formatNumber(item.min_stock_slop)} slop
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
