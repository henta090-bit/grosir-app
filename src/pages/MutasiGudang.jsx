import React, { Suspense, lazy, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { supabase } from '../config/supabase';
import { addTransactionLog, getTransactionLogs } from '../utils/inventoryHistory';
const MobileBarcodeScanner = lazy(() => import('../components/MobileBarcodeScanner'));

const emptyQty = {
  slop: '',
  bal: '',
  karton: '',
};

const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0));
const scannerFallback = (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
    Menyiapkan kamera...
  </div>
);
const formatDateTime = (value) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export default function MutasiGudang({ user }) {
  const [product, setProduct] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qty, setQty] = useState(emptyQty);
  const [manualInput, setManualInput] = useState('');
  const [note, setNote] = useState('');
  const [recentLogs, setRecentLogs] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const inputRef = useRef(null);
  const resultListRef = useRef(null);
  const resultRefs = useRef([]);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    loadRecentLogs();
  }, []);

  const loadRecentLogs = async () => {
    try {
      const logs = await getTransactionLogs({ limit: 5 });
      setRecentLogs(logs);
    } catch (error) {
      setMessage({ type: 'error', text: `Gagal memuat history mutasi: ${error.message}` });
    }
  };

  useLayoutEffect(() => {
    if (!showResults) return;
    scrollResultIntoView(highlightedIndex);
  }, [highlightedIndex, showResults]);

  const scrollResultIntoView = (index) => {
    const container = resultListRef.current;
    const item = resultRefs.current[index];
    if (!container || !item) return;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;

    if (itemTop < visibleTop) {
      container.scrollTop = itemTop;
      return;
    }

    if (itemBottom > visibleBottom) {
      container.scrollTop = itemBottom - container.clientHeight;
    }
  };

  const moveHighlight = (nextIndex) => {
    const safeIndex = Math.max(0, Math.min(nextIndex, searchResults.length - 1));
    flushSync(() => {
      setHighlightedIndex(safeIndex);
    });
    scrollResultIntoView(safeIndex);
  };

  useEffect(() => {
    const term = manualInput.trim();
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    if (!term || !showResults) {
      setLoading(false);
      setSearchResults([]);
      setHighlightedIndex(0);
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode_slop.eq.${term},barcode_bal.eq.${term},barcode_karton.eq.${term}`)
        .order('name', { ascending: true })
        .limit(10);

      if (requestId !== searchRequestRef.current) return;

      if (error) {
        setSearchResults([]);
        setMessage({ type: 'error', text: error.message });
      } else {
        setSearchResults(data || []);
        setHighlightedIndex(0);
      }

      setLoading(false);
    }, 180);

    return () => clearTimeout(timer);
  }, [manualInput, showResults]);

  const handleSearchKeyDown = (event) => {
    if (!showResults || searchResults.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(highlightedIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(highlightedIndex - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      selectProduct(searchResults[highlightedIndex] || searchResults[0]);
    }
  };

  const selectProduct = (selectedProd) => {
    if (!selectedProd) return;

    setProduct({ ...selectedProd, notFound: false });
    setSearchResults([]);
    setHighlightedIndex(0);
    setShowResults(false);
    setManualInput(selectedProd.name);
    setQty(emptyQty);
    setNote('');
    setMessage({ type: '', text: '' });
  };

  const getQtyTotalSlop = () => {
    if (!product) return 0;

    const slop = Number.parseInt(qty.slop || '0', 10);
    const bal = Number.parseInt(qty.bal || '0', 10);
    const karton = Number.parseInt(qty.karton || '0', 10);
    const slopPerBal = Number(product.isi_slop_per_bal || 10);
    const slopPerKarton = Number(product.isi_slop_per_karton || 0);

    return (
      (Number.isNaN(slop) ? 0 : slop) +
      (Number.isNaN(bal) ? 0 : bal) * slopPerBal +
      (Number.isNaN(karton) ? 0 : karton) * slopPerKarton
    );
  };

  const handleMutasi = async (jenis) => {
    if (!product) {
      setMessage({ type: 'error', text: 'Pilih barang terlebih dahulu.' });
      return;
    }

    const jumlah = getQtyTotalSlop();
    if (!jumlah || jumlah <= 0) {
      setMessage({ type: 'error', text: 'Masukkan angka jumlah dengan benar!' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });
    
    const stokLama = Number(product.current_stock_slop || 0);
    const stokBaru = jenis === 'MASUK' ? stokLama + jumlah : stokLama - jumlah;

    if (stokBaru < 0) {
      setMessage({ type: 'error', text: 'Stok keluar melebihi stok yang tersedia.' });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('products')
      .update({ current_stock_slop: stokBaru })
      .eq('id', product.id); 

    if (error) {
      setMessage({ type: 'error', text: "Gagal update: " + error.message });
    } else {
      const inputNote = `Input: ${qty.slop || 0} Slop, ${qty.bal || 0} Bal, ${qty.karton || 0} Karton`;
      const description = note.trim();

      try {
        await addTransactionLog({
          type: jenis,
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          qty: jumlah,
          direction: jenis,
          stock_before: stokLama,
          stock_after: stokBaru,
          user_id: user?.id,
          actor: actorName,
          note: description ? `${inputNote}. Keterangan: ${description}` : inputNote,
          source: 'MUTASI_GUDANG',
        });
      } catch (transactionError) {
        setMessage({ type: 'error', text: `Stok terupdate, tapi log transaksi gagal: ${transactionError.message}` });
        setSaving(false);
        return;
      }
      setProduct({ ...product, current_stock_slop: stokBaru });
      setQty(emptyQty);
      setNote('');
      await loadRecentLogs();
      setMessage({ type: 'success', text: `Berhasil! Stok ${jenis} sebanyak ${formatNumber(jumlah)} Slop.` });
      setManualInput('');
    }
    setSaving(false);
  };

  const totalQtySlop = getQtyTotalSlop();
  const canMutate = product && totalQtySlop > 0 && !saving;
  const actorName = user?.username?.trim() || 'unknown';
  const getDisplayActor = (actor) => {
    const savedActor = String(actor || '').trim();
    if (savedActor && savedActor.toLowerCase() !== 'unknown') return savedActor;
    return actorName;
  };

  return (
    <div className="p-4 md:p-6 bg-slate-50 h-[calc(100vh-80px)] overflow-y-auto">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_23rem] gap-6 items-start pb-20">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h2 className="text-sm font-black uppercase tracking-widest text-indigo-600 mb-4">Pencarian Master Data</h2>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <input 
                ref={inputRef}
                type="text" 
                placeholder="Tembak Barcode / Ketik Nama..." 
                className="w-full p-4 bg-slate-100 rounded-xl font-black text-lg outline-none focus:ring-4 focus:ring-indigo-500/20 focus:bg-white border-2 border-transparent transition-all uppercase"
                value={manualInput}
                onChange={(e) => {
                  setManualInput(e.target.value);
                  setProduct(null);
                  setShowResults(true);
                }}
                onKeyDown={handleSearchKeyDown}
              />

              {showResults && (searchResults.length > 0 || (manualInput.trim() && !loading)) && (
                <div className="absolute z-20 mt-3 w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-sm font-bold text-slate-400">Barang tidak ditemukan.</div>
                  ) : (
                    <div ref={resultListRef} className="max-h-80 overflow-y-auto">
                      {searchResults.map((item, index) => (
                        <button
                          key={item.id}
                          ref={(element) => {
                            resultRefs.current[index] = element;
                          }}
                          type="button"
                          onMouseMove={() => setHighlightedIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectProduct(item)}
                          className={`w-full text-left p-4 border-b border-slate-100 last:border-b-0 flex justify-between items-center group ${
                            highlightedIndex === index
                              ? 'bg-indigo-50 border-indigo-100'
                              : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <p className={`font-black ${highlightedIndex === index ? 'text-indigo-800' : 'text-slate-800'}`}>
                              {item.name}
                            </p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">SKU: {item.sku || '-'}</p>
                          </div>
                          <span className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            highlightedIndex === index
                              ? 'bg-indigo-600 text-white'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            Pilih
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Suspense fallback={scannerFallback}>
              <MobileBarcodeScanner
                buttonLabel="Scan Barcode Kamera"
                title="Pindai Barcode Gudang"
                onDetected={(decodedText) => {
                  setManualInput(decodedText);
                  setProduct(null);
                  setShowResults(true);
                  setMessage({ type: 'success', text: `Barcode ${decodedText} berhasil dipindai.` });
                }}
              />
            </Suspense>

          </div>
          <p className="mt-3 text-[11px] font-bold text-slate-400">
            Gunakan panah atas/bawah untuk memilih, lalu tekan Enter.
          </p>
          </div>

          {loading && <p className="text-center font-bold text-slate-400 animate-pulse">Mencari barang...</p>}

          {message.text && (
            <div className={`p-4 rounded-xl font-bold text-center text-sm ${message.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {message.text}
            </div>
          )}

          <div className="bg-white p-6 md:p-8 rounded-3xl border-2 shadow-xl transition-all border-indigo-100">
          {product ? (
            <div>
              <div className="flex justify-between items-start mb-6 pb-6 border-b border-slate-100">
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Identitas Barang</h3>
                  <p className="text-2xl font-black text-slate-800">{product.name}</p>
                  <p className="text-xs font-bold text-indigo-400 mt-1 uppercase">SKU: {product.sku || '-'}</p>
                </div>
                <div className="text-right bg-slate-50 p-4 rounded-2xl border border-slate-100 min-w-[120px]">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Stok (Slop)</p>
                  <p className="text-3xl font-black text-indigo-600 leading-none mt-1">{formatNumber(product.current_stock_slop)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 pb-6 border-b border-slate-100 text-center">
              <p className="text-slate-400 font-black text-lg uppercase">Belum Ada Barang Dipilih</p>
              <p className="text-sm text-slate-400 mt-2 font-bold">Cari dan pilih barang untuk mengaktifkan mutasi stok.</p>
            </div>
          )}

          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200 border-dashed">
            <p className="text-xs font-black text-slate-500 mb-4 text-center uppercase tracking-widest">Eksekusi Mutasi</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {[
                { key: 'slop', label: 'Slop' },
                { key: 'bal', label: 'Bal' },
                { key: 'karton', label: 'Karton' },
              ].map((item) => (
                <label key={item.key} className="block">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">
                    {item.label}
                  </span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    className="w-full p-4 bg-white rounded-xl text-center font-black text-xl outline-none focus:ring-4 focus:ring-indigo-500/20 border-2 border-slate-200 focus:border-indigo-500"
                    value={qty[item.key]}
                    onChange={(e) => setQty((current) => ({ ...current, [item.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>

            <div className="mb-4 rounded-xl bg-white border border-slate-200 p-3 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Konversi</p>
              <p className="mt-1 text-xl font-black text-slate-800">{formatNumber(totalQtySlop)} Slop</p>
            </div>

            <label className="mb-4 block">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Keterangan Mutasi
              </span>
              <textarea
                rows="3"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: retur supplier, barang rusak, pindah rak, penyesuaian gudang..."
                className="w-full p-4 bg-white rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/20 border-2 border-slate-200 focus:border-indigo-500 resize-none"
              />
            </label>

            <div className="flex flex-col md:flex-row gap-4">
              <button
                onClick={() => handleMutasi('MASUK')}
                disabled={!canMutate}
                className="flex-1 bg-emerald-500 text-white font-black py-4 rounded-xl shadow-lg hover:bg-emerald-600 active:scale-95 transition-all uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                + Stok Masuk
              </button>
              <button
                onClick={() => handleMutasi('KELUAR')}
                disabled={!canMutate}
                className="flex-1 bg-rose-500 text-white font-black py-4 rounded-xl shadow-lg hover:bg-rose-600 active:scale-95 transition-all uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                - Stok Keluar
              </button>
            </div>
          </div>
          </div>
        </div>

        <aside className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 md:sticky md:top-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">History Mutasi</p>
              <h3 className="mt-1 text-xl font-black text-slate-900">5 Transaksi Terakhir</h3>
            </div>
          </div>

          {recentLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-400">
              Belum ada transaksi mutasi yang tersimpan.
            </div>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-800">{item.product_name}</p>
                      <p className="mt-1 text-[11px] font-bold uppercase text-slate-400">SKU: {item.sku || '-'}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${
                        item.direction === 'MASUK'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.direction === 'KELUAR'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.direction || item.type}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm font-bold">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Qty</p>
                      <p className="mt-1 text-slate-800">{formatNumber(item.qty)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Sebelum</p>
                      <p className="mt-1 text-slate-800">{formatNumber(item.stock_before)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Sesudah</p>
                      <p className="mt-1 text-slate-800">{formatNumber(item.stock_after)}</p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs font-bold text-slate-500">
                    {formatDateTime(item.created_at)} oleh {getDisplayActor(item.actor).toUpperCase()}
                  </p>
                  {item.note && <p className="mt-2 text-sm font-bold text-slate-600">{item.note}</p>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
