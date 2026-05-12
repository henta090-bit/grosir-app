import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download, FileClock, Search } from 'lucide-react';
import { getOpnameLogs, getTransactionLogs } from '../utils/inventoryHistory';

const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0));
const formatDate = (value) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
  }).format(new Date(value));
const formatDateTime = (value) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const escapeCsv = (value) => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function LaporanStok() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [typeFilter, setTypeFilter] = useState('SEMUA');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [transactionLogs, setTransactionLogs] = useState([]);
  const [transactionLoading, setTransactionLoading] = useState(true);
  const [transactionError, setTransactionError] = useState('');
  const [opnameLogs, setOpnameLogs] = useState([]);
  const [opnameLoading, setOpnameLoading] = useState(true);
  const [opnameError, setOpnameError] = useState('');

  useEffect(() => {
    let ignore = false;

    const fetchTransactionLogs = async () => {
      setTransactionLoading(true);
      setTransactionError('');

      try {
        const logs = await getTransactionLogs();
        if (!ignore) setTransactionLogs(logs);
      } catch (error) {
        if (!ignore) {
          setTransactionLogs([]);
          setTransactionError(error.message);
        }
      } finally {
        if (!ignore) setTransactionLoading(false);
      }
    };

    const fetchOpnameLogs = async () => {
      setOpnameLoading(true);
      setOpnameError('');

      try {
        const logs = await getOpnameLogs();
        if (!ignore) setOpnameLogs(logs);
      } catch (error) {
        if (!ignore) {
          setOpnameLogs([]);
          setOpnameError(error.message);
        }
      } finally {
        if (!ignore) setOpnameLoading(false);
      }
    };

    fetchTransactionLogs();
    fetchOpnameLogs();

    return () => {
      ignore = true;
    };
  }, [refreshTick]);

  const filteredTransactions = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return transactionLogs.filter((item) => {
      const sameType = typeFilter === 'SEMUA' || item.type === typeFilter;
      const sameDate = !dateFilter || item.created_at.slice(0, 10) === dateFilter;
      const sameKeyword =
        !keyword ||
        item.product_name?.toLowerCase().includes(keyword) ||
        item.sku?.toLowerCase().includes(keyword) ||
        item.actor?.toLowerCase().includes(keyword);

      return sameType && sameDate && sameKeyword;
    });
  }, [dateFilter, searchTerm, transactionLogs, typeFilter]);

  const groupedOpname = useMemo(() => {
    const groups = new Map();

    for (const item of opnameLogs) {
      const key = item.opname_date || item.created_at.slice(0, 10);
      const current = groups.get(key) || {
        date: key,
        items: [],
        totalChecked: 0,
        totalDifference: 0,
        positiveDifference: 0,
        negativeDifference: 0,
        mismatchCount: 0,
      };

      const difference = Number(item.difference || 0);

      current.items.push(item);
      current.totalChecked += 1;
      current.totalDifference += difference;
      if (difference > 0) current.positiveDifference += difference;
      if (difference < 0) current.negativeDifference += difference;
      if (difference !== 0) current.mismatchCount += 1;

      groups.set(key, current);
    }

    return [...groups.values()].sort((left, right) => right.date.localeCompare(left.date));
  }, [opnameLogs]);

  const downloadTransactionReport = () => {
    downloadCsv('laporan-log-transaksi.csv', [
      ['Waktu', 'Barang', 'SKU', 'Jenis', 'Arah', 'Qty Slop', 'Stok Sebelum', 'Stok Sesudah', 'User', 'Sumber', 'Catatan'],
      ...filteredTransactions.map((item) => [
        formatDateTime(item.created_at),
        item.product_name,
        item.sku || '',
        item.type,
        item.direction || '',
        item.qty,
        item.stock_before,
        item.stock_after,
        item.actor || '',
        item.source || '',
        item.note || '',
      ]),
    ]);
  };

  const downloadOpnameReport = () => {
    downloadCsv('laporan-analisis-selisih-opname.csv', [
      ['Tanggal', 'Waktu', 'Barang', 'SKU', 'Stok Sistem', 'Stok Fisik', 'Selisih', 'Petugas', 'Catatan'],
      ...opnameLogs.map((item) => [
        item.opname_date || '',
        formatDateTime(item.created_at),
        item.product_name,
        item.sku || '',
        item.system_stock,
        item.physical_stock,
        item.difference,
        item.checked_by || '',
        item.note || '',
      ]),
    ]);
  };

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-500">Laporan</p>
              <h3 className="mt-2 text-3xl font-black text-slate-900">Log Transaksi & Analisis Opname</h3>
              <p className="mt-2 text-sm font-bold text-slate-500">
                Ringkasan ini menampilkan mutasi masuk, keluar, koreksi, dan selisih stok opname per hari.
              </p>
            </div>

            <button
              onClick={() => setRefreshTick((current) => current + 1)}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg hover:bg-indigo-700"
            >
              Muat Ulang Laporan
            </button>
          </div>
        </section>

        {opnameError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            Gagal memuat histori opname Supabase: {opnameError}
          </div>
        )}

        {transactionError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            Gagal memuat log transaksi Supabase: {transactionError}
          </div>
        )}

        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <FileClock className="text-indigo-500" size={22} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Laporan 1</p>
                <h4 className="text-xl font-black text-slate-900">Log Transaksi</h4>
              </div>
            </div>
            <button
              onClick={downloadTransactionReport}
              disabled={filteredTransactions.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Download CSV
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-4 text-slate-400" size={18} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Cari barang, SKU, atau user..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400"
            >
              <option value="SEMUA">Semua Jenis</option>
              <option value="MASUK">Masuk</option>
              <option value="KELUAR">Keluar</option>
              <option value="KOREKSI">Koreksi</option>
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400"
            />
          </div>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Waktu</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Barang</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-center text-slate-400">Jenis</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-center text-slate-400">Qty</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-center text-slate-400">Sebelum</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-center text-slate-400">Sesudah</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactionLoading ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-sm font-bold text-slate-400">
                      Memuat log transaksi...
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-sm font-bold text-slate-400">
                      Belum ada data transaksi yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-4 text-sm font-bold text-slate-500">{formatDateTime(item.created_at)}</td>
                      <td className="p-4">
                        <p className="font-black text-slate-800">{item.product_name}</p>
                        <p className="mt-1 text-[11px] font-bold uppercase text-slate-400">{item.sku || '-'}</p>
                        {item.note && <p className="mt-2 text-xs font-bold text-slate-500">{item.note}</p>}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex rounded-lg px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${
                            item.type === 'MASUK'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.type === 'KELUAR'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.type}
                        </span>
                      </td>
                      <td className="p-4 text-center font-black text-slate-700">{formatNumber(item.qty)}</td>
                      <td className="p-4 text-center font-black text-slate-500">{formatNumber(item.stock_before)}</td>
                      <td className="p-4 text-center font-black text-slate-900">{formatNumber(item.stock_after)}</td>
                      <td className="p-4 text-sm font-bold uppercase text-slate-500">{item.actor || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="text-indigo-500" size={22} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Laporan 2</p>
                <h4 className="text-xl font-black text-slate-900">Analisis Selisih Barang per Hari</h4>
              </div>
            </div>
            <button
              onClick={downloadOpnameReport}
              disabled={opnameLogs.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Download CSV
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {opnameLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-400">
                Memuat histori opname...
              </div>
            ) : groupedOpname.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-400">
                Belum ada data opname harian untuk dianalisis.
              </div>
            ) : (
              groupedOpname.map((group) => (
                <div key={group.date} className="rounded-3xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-100 px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Tanggal Opname</p>
                      <h5 className="mt-1 text-xl font-black text-slate-900">{formatDate(group.date)}</h5>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Dicek</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(group.totalChecked)}</p>
                      </div>
                      <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Berselisih</p>
                        <p className="mt-1 text-2xl font-black text-amber-700">{formatNumber(group.mismatchCount)}</p>
                      </div>
                      <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Plus</p>
                        <p className="mt-1 text-2xl font-black text-emerald-700">+{formatNumber(group.positiveDifference)}</p>
                      </div>
                      <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Minus</p>
                        <p className="mt-1 text-2xl font-black text-rose-700">{formatNumber(group.negativeDifference)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Barang</th>
                          <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-center text-slate-400">Sistem</th>
                          <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-center text-slate-400">Fisik</th>
                          <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-center text-slate-400">Selisih</th>
                          <th className="p-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Petugas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-4">
                              <p className="font-black text-slate-800">{item.product_name}</p>
                              <p className="mt-1 text-[11px] font-bold uppercase text-slate-400">{item.sku || '-'}</p>
                              {item.note && <p className="mt-2 text-xs font-bold text-slate-500">{item.note}</p>}
                            </td>
                            <td className="p-4 text-center font-black text-slate-500">{formatNumber(item.system_stock)}</td>
                            <td className="p-4 text-center font-black text-slate-900">{formatNumber(item.physical_stock)}</td>
                            <td className="p-4 text-center">
                              <span
                                className={`inline-flex rounded-lg px-3 py-1 text-[11px] font-black ${
                                  Number(item.difference) === 0
                                    ? 'bg-slate-100 text-slate-600'
                                    : Number(item.difference) > 0
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {Number(item.difference) > 0 ? '+' : ''}
                                {formatNumber(item.difference)}
                              </span>
                            </td>
                            <td className="p-4 text-sm font-bold uppercase text-slate-500">{item.checked_by || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
