import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCcw, Search } from 'lucide-react';
import { supabase } from '../config/supabase';
import { addOpnameLog, addTransactionLog, getOpnameLogs } from '../utils/inventoryHistory';

const emptyQty = {
  slop: '',
  bal: '',
  karton: '',
};

const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0));
const formatDateTime = (value) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const getTodayKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

const decomposeStockToUnits = (stockSlop, slopPerBal, slopPerKarton) => {
  let remaining = Math.max(Number(stockSlop || 0), 0);
  const safeSlopPerKarton = Number(slopPerKarton || 0);
  const safeSlopPerBal = Number(slopPerBal || 0);

  let karton = 0;
  if (safeSlopPerKarton > 0) {
    karton = Math.floor(remaining / safeSlopPerKarton);
    remaining -= karton * safeSlopPerKarton;
  }

  let bal = 0;
  if (safeSlopPerBal > 0) {
    bal = Math.floor(remaining / safeSlopPerBal);
    remaining -= bal * safeSlopPerBal;
  }

  return {
    slop: String(remaining),
    bal: String(bal),
    karton: String(karton),
  };
};

const getQtyTotalSlop = (product, qtyValue) => {
  if (!product) return 0;

  const slop = Number.parseInt(qtyValue.slop || '0', 10);
  const bal = Number.parseInt(qtyValue.bal || '0', 10);
  const karton = Number.parseInt(qtyValue.karton || '0', 10);
  const slopPerBal = Number(product.isi_slop_per_bal || 10);
  const slopPerKarton = Number(product.isi_slop_per_karton || 0);

  return (
    (Number.isNaN(slop) ? 0 : slop) +
    (Number.isNaN(bal) ? 0 : bal) * slopPerBal +
    (Number.isNaN(karton) ? 0 : karton) * slopPerKarton
  );
};

export default function StokOpname({
  products,
  productsLoading,
  refreshProducts,
  setProducts,
  user,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [physicalQty, setPhysicalQty] = useState(emptyQty);
  const [note, setNote] = useState('');
  const [todayLogs, setTodayLogs] = useState([]);
  const [opnameLoading, setOpnameLoading] = useState(true);
  const [dbReady, setDbReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const stockInputRef = useRef(null);
  const role = String(user?.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const isGudang = role === 'GUDANG';
  const todayKey = getTodayKey();

  const loadTodayLogs = async () => {
    setOpnameLoading(true);

    try {
      const logs = await getOpnameLogs({ date: todayKey });
      setTodayLogs(logs);
      setDbReady(true);
    } catch (error) {
      setTodayLogs([]);
      setDbReady(false);
      setMessage({
        type: 'error',
        text: `Database opname belum siap: ${error.message}`,
      });
    } finally {
      setOpnameLoading(false);
    }
  };

  const reloadView = async () => {
    setMessage({ type: '', text: '' });
    await Promise.all([refreshProducts?.(), loadTodayLogs()]);
  };

  useEffect(() => {
    loadTodayLogs();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      setTimeout(() => stockInputRef.current?.focus(), 60);
    }
  }, [selectedProduct]);

  const todayLogMap = useMemo(() => {
    const map = new Map();
    for (const item of todayLogs) {
      map.set(item.product_id, item);
    }
    return map;
  }, [todayLogs]);

  const activeProducts = useMemo(
    () => (products || []).filter((item) => item.is_active),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const source = keyword
      ? activeProducts.filter(
          (item) =>
            item.name?.toLowerCase().includes(keyword) ||
            item.sku?.toLowerCase().includes(keyword)
        )
      : activeProducts;

    return source.slice(0, 60);
  }, [activeProducts, searchTerm]);

  const summary = useMemo(() => {
    const checkedCount = todayLogs.length;
    const uncheckedCount = Math.max(activeProducts.length - checkedCount, 0);
    const totalPlus = todayLogs.reduce(
      (sum, item) => sum + Math.max(Number(item.difference || 0), 0),
      0
    );
    const totalMinus = todayLogs.reduce(
      (sum, item) => sum + Math.min(Number(item.difference || 0), 0),
      0
    );

    return {
      checkedCount,
      uncheckedCount,
      totalPlus,
      totalMinus,
    };
  }, [activeProducts.length, todayLogs]);

  const selectProduct = (item) => {
    setSelectedProduct(item);
    setPhysicalQty(
      isGudang
        ? emptyQty
        : decomposeStockToUnits(
            item.current_stock_slop,
            item.isi_slop_per_bal,
            item.isi_slop_per_karton
          )
    );
    setNote('');
    setMessage({ type: '', text: '' });
  };

  const handleQtyFocus = (event) => {
    event.target.select();
  };

  const handleQtyChange = (key, value) => {
    setPhysicalQty((current) => ({
      ...current,
      [key]: value.replace(/^0+(?=\d)/, ''),
    }));
  };

  const handleSaveOpname = async () => {
    if (!dbReady) {
      setMessage({
        type: 'error',
        text: 'Tabel opname Supabase belum siap, jadi data belum bisa disimpan.',
      });
      return;
    }

    if (!selectedProduct) {
      setMessage({ type: 'error', text: 'Pilih barang terlebih dahulu.' });
      return;
    }

    const physical = getQtyTotalSlop(selectedProduct, physicalQty);
    const unitValues = Object.values(physicalQty).map((value) => value.trim());
    const hasInput = unitValues.some((value) => value !== '');
    const hasNegative = Object.values(physicalQty).some((value) => Number(value || 0) < 0);

    if (!hasInput) {
      setMessage({ type: 'error', text: 'Masukkan hasil opname minimal di salah satu satuan.' });
      return;
    }

    if (hasNegative) {
      setMessage({ type: 'error', text: 'Qty opname tidak boleh minus.' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });

    const systemStock = Number(selectedProduct.current_stock_slop || 0);
    const difference = physical - systemStock;

    const { error: stockError } = await supabase
      .from('products')
      .update({ current_stock_slop: physical })
      .eq('id', selectedProduct.id);

    if (stockError) {
      setMessage({ type: 'error', text: `Gagal simpan opname: ${stockError.message}` });
      setSaving(false);
      return;
    }

    try {
      const savedLog = await addOpnameLog({
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        sku: selectedProduct.sku,
        system_stock: systemStock,
        physical_stock: physical,
        physical_qty: {
          slop: Number(physicalQty.slop || 0),
          bal: Number(physicalQty.bal || 0),
          karton: Number(physicalQty.karton || 0),
        },
        difference,
        user_id: user?.id,
        checked_by: user?.username || 'unknown',
        note: note.trim(),
        opname_date: todayKey,
      });

      await addTransactionLog({
        type: 'KOREKSI',
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        sku: selectedProduct.sku,
        qty: Math.abs(difference),
        direction: difference >= 0 ? 'MASUK' : 'KELUAR',
        stock_before: systemStock,
        stock_after: physical,
        user_id: user?.id,
        actor: user?.username || 'unknown',
        note:
          `${physicalQty.slop || 0} Slop, ${physicalQty.bal || 0} Bal, ${physicalQty.karton || 0} Karton` +
          (note.trim() ? `. Keterangan: ${note.trim()}` : '. Koreksi dari stok opname'),
        source: 'STOK_OPNAME',
      });

      const updatedProduct = {
        ...selectedProduct,
        current_stock_slop: physical,
      };

      setProducts((current) =>
        current.map((item) => (item.id === updatedProduct.id ? updatedProduct : item))
      );
      setSelectedProduct(updatedProduct);
      setPhysicalQty(
        decomposeStockToUnits(
          physical,
          updatedProduct.isi_slop_per_bal,
          updatedProduct.isi_slop_per_karton
        )
      );
      setTodayLogs((current) => [
        savedLog,
        ...current.filter(
          (item) => !(item.product_id === savedLog.product_id && item.opname_date === savedLog.opname_date)
        ),
      ]);
      setMessage({
        type: 'success',
        text:
          !isAdmin
            ? 'Opname tersimpan.'
            : difference === 0
              ? 'Opname tersimpan. Tidak ada selisih stok.'
              : `Opname tersimpan. Selisih ${difference > 0 ? '+' : ''}${difference} slop berhasil dikoreksi.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: `Gagal simpan histori Supabase: ${error.message}` });
    }

    setSaving(false);
  };

  const selectedTodayLog = selectedProduct ? todayLogMap.get(selectedProduct.id) : null;
  const physicalTotalSlop = selectedProduct ? getQtyTotalSlop(selectedProduct, physicalQty) : 0;
  const selectedDifference = selectedProduct
    ? physicalTotalSlop - Number(selectedProduct.current_stock_slop || 0)
    : 0;
  const isLoading = productsLoading || opnameLoading;

  return (
    <div className="min-h-full bg-slate-50 p-3 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Stok Opname</p>
              <h3 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">Pencatatan Stok Fisik</h3>
            </div>

            <button
              onClick={reloadView}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCcw size={16} className={isLoading ? 'animate-spin' : ''} />
              Muat Ulang
            </button>
          </div>

          <div className={`mt-4 grid grid-cols-2 gap-3 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Sudah Dicek</p>
              <p className="mt-1 text-2xl font-black text-emerald-700 sm:text-3xl">{formatNumber(summary.checkedCount)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Belum Dicek</p>
              <p className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">{formatNumber(summary.uncheckedCount)}</p>
            </div>
            {isAdmin && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600">Plus Hari Ini</p>
                <p className="mt-1 text-2xl font-black text-emerald-700 sm:text-3xl">+{formatNumber(summary.totalPlus)}</p>
              </div>
            )}
            {isAdmin && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 sm:p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-600">Minus Hari Ini</p>
                <p className="mt-1 text-2xl font-black text-rose-700 sm:text-3xl">{formatNumber(summary.totalMinus)}</p>
              </div>
            )}
          </div>

          {message.text && (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm font-bold ${
                message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {message.text}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.22fr)]">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari barang atau SKU"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>

            <div className="max-h-[56vh] overflow-y-auto divide-y divide-slate-100 xl:max-h-[calc(100vh-20rem)]">
              {isLoading ? (
                <div className="p-6 text-sm font-bold text-slate-400">Memuat data opname...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-6 text-sm font-bold text-slate-400">Barang tidak ditemukan.</div>
              ) : (
                filteredProducts.map((item) => {
                  const checked = todayLogMap.has(item.id);

                  return (
                    <button
                      key={item.id}
                      onClick={() => selectProduct(item)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        selectedProduct?.id === item.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-800">{item.name}</p>
                          <p className="mt-1 truncate text-[11px] font-bold uppercase text-slate-400">{item.sku || '-'}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
                            checked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {checked ? 'Sudah' : 'Belum'}
                        </span>
                      </div>
                      {!isGudang && (
                        <p className="mt-2 text-xs font-bold text-indigo-600">
                          Stok sistem: {formatNumber(item.current_stock_slop)} slop
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {selectedProduct ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Barang Terpilih</p>
                    <h4 className="mt-1 break-words text-xl font-black text-slate-900 sm:text-2xl">{selectedProduct.name}</h4>
                    <p className="mt-1 text-xs font-bold uppercase text-indigo-500">{selectedProduct.sku || '-'}</p>
                  </div>
                  <span
                    className={`inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] ${
                      selectedTodayLog ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {selectedTodayLog ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {selectedTodayLog ? 'Sudah Dicek' : 'Belum Dicek'}
                  </span>
                </div>

                {!isGudang && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Stok Sistem</p>
                      <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(selectedProduct.current_stock_slop)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Minimum</p>
                      <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(selectedProduct.min_stock_slop)}</p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Qty Fisik Hasil Opname</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { key: 'slop', label: 'Slop' },
                      { key: 'bal', label: `Bal x ${formatNumber(selectedProduct.isi_slop_per_bal || 10)}` },
                      { key: 'karton', label: `Karton x ${formatNumber(selectedProduct.isi_slop_per_karton || 0)}` },
                    ].map((item, index) => (
                      <label key={item.key} className="block">
                        <span className="block min-h-8 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                          {item.label}
                        </span>
                        <input
                          ref={index === 0 ? stockInputRef : undefined}
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={physicalQty[item.key]}
                          onFocus={handleQtyFocus}
                          onChange={(event) => handleQtyChange(item.key, event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-3 text-center text-xl font-black text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-2xl"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className={`grid grid-cols-1 gap-3 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Total Fisik</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(physicalTotalSlop)} Slop</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Status Hari Ini</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{selectedTodayLog ? 'Sudah Cek' : 'Belum Cek'}</p>
                  </div>
                  {isAdmin && (
                    <div
                      className={`rounded-lg border p-3 ${
                        selectedDifference === 0
                          ? 'border-slate-200 bg-slate-50'
                          : selectedDifference > 0
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-rose-200 bg-rose-50'
                      }`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Plus / Minus</p>
                      <p
                        className={`mt-1 text-xl font-black ${
                          selectedDifference === 0
                            ? 'text-slate-900'
                            : selectedDifference > 0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                        }`}
                      >
                        {selectedDifference > 0 ? '+' : ''}
                        {formatNumber(selectedDifference)} Slop
                      </p>
                    </div>
                  )}
                </div>

                {selectedTodayLog && (
                  <p className="text-xs font-bold text-slate-500">
                    Terakhir dicek {formatDateTime(selectedTodayLog.created_at)} oleh {(selectedTodayLog.checked_by || '-').toUpperCase()}
                  </p>
                )}

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Catatan</span>
                  <textarea
                    rows="3"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Catatan opname"
                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </label>

                <button
                  onClick={handleSaveOpname}
                  disabled={saving || !dbReady}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-lg hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Opname'}
                </button>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center text-slate-400">
                <ClipboardList size={40} />
                <p className="mt-4 text-sm font-black uppercase tracking-[0.12em]">Belum Ada Barang Dipilih</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
