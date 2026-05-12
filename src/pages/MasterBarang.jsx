import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  Barcode,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  FileDown,
  FileUp,
  Package,
  Plus,
  RefreshCcw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { supabase } from '../config/supabase';

const PRODUCT_FIELDS = [
  'sku',
  'name',
  'barcode_slop',
  'barcode_bal',
  'barcode_karton',
  'current_stock_slop',
  'min_stock_slop',
  'isi_slop_per_bal',
  'isi_slop_per_karton',
  'is_active',
];

const INITIAL_FORM = {
  id: null,
  sku: '',
  name: '',
  barcode_slop: '',
  barcode_bal: '',
  barcode_karton: '',
  current_stock_slop: '0',
  min_stock_slop: '0',
  isi_slop_per_bal: '10',
  isi_slop_per_karton: '',
  is_active: true,
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0));

const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

const parseNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const escapeCsvValue = (value) => {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
};

const parseCsvProducts = (text) => {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
};

const normalizeImportedProduct = (row) => ({
  sku: String(row.sku ?? '').trim(),
  name: String(row.name ?? '').trim(),
  barcode_slop: String(row.barcode_slop ?? '').trim() || null,
  barcode_bal: String(row.barcode_bal ?? '').trim() || null,
  barcode_karton: String(row.barcode_karton ?? '').trim() || null,
  current_stock_slop: parseNumber(row.current_stock_slop),
  min_stock_slop: parseNumber(row.min_stock_slop),
  isi_slop_per_bal: Math.max(parseNumber(row.isi_slop_per_bal || 10), 1),
  isi_slop_per_karton: parseNumber(row.isi_slop_per_karton),
  is_active: String(row.is_active ?? 'true').toLowerCase() !== 'false',
});

const getStockStatus = (item) => {
  const stock = Number(item.current_stock_slop || 0);
  const minimum = Number(item.min_stock_slop || 0);

  if (!item.is_active) return { label: 'Non-Aktif', className: 'bg-slate-100 text-slate-500 border-slate-200' };
  if (stock <= 0) return { label: 'Habis', className: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (stock <= minimum) return { label: 'Menipis', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Aman', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
};

const getStockConversion = (item) => {
  const totalSlop = Number(item.current_stock_slop || 0);
  const slopPerBal = Math.max(Number(item.isi_slop_per_bal || 10), 1);
  const slopPerKarton = Number(item.isi_slop_per_karton || 0);

  const karton = slopPerKarton > 0 ? Math.floor(totalSlop / slopPerKarton) : 0;
  const afterKarton = slopPerKarton > 0 ? totalSlop % slopPerKarton : totalSlop;
  const bal = Math.floor(afterKarton / slopPerBal);
  const slop = afterKarton % slopPerBal;

  return { slop, bal, karton, slopPerBal, slopPerKarton };
};

const getKartonToBal = (form) => {
  const slopPerBal = Math.max(parseNumber(form.isi_slop_per_bal), 1);
  const slopPerKarton = parseNumber(form.isi_slop_per_karton);

  if (slopPerKarton <= 0) return 0;
  return slopPerKarton / slopPerBal;
};

const buildProductPayload = (form) => ({
  sku: form.sku.trim(),
  name: form.name.trim(),
  barcode_slop: form.barcode_slop.trim() || null,
  barcode_bal: form.barcode_bal.trim() || null,
  barcode_karton: form.barcode_karton.trim() || null,
  current_stock_slop: parseNumber(form.current_stock_slop),
  min_stock_slop: parseNumber(form.min_stock_slop),
  isi_slop_per_bal: Math.max(parseNumber(form.isi_slop_per_bal), 1),
  isi_slop_per_karton: parseNumber(form.isi_slop_per_karton),
  is_active: Boolean(form.is_active),
});

const validateProductForm = (form, products) => {
  const errors = {};
  const sku = form.sku.trim();
  const name = form.name.trim();

  if (!sku) errors.sku = 'SKU wajib diisi.';
  if (!name) errors.name = 'Nama barang wajib diisi.';

  ['current_stock_slop', 'min_stock_slop', 'isi_slop_per_bal', 'isi_slop_per_karton'].forEach((field) => {
    if (form[field] !== '' && parseNumber(form[field]) < 0) {
      errors[field] = 'Tidak boleh minus.';
    }
  });

  if (parseNumber(form.isi_slop_per_bal) <= 0) {
    errors.isi_slop_per_bal = 'Isi bal minimal 1 slop.';
  }

  const skuExists = products.some(
    (item) => item.id !== form.id && normalizeText(item.sku) === normalizeText(sku)
  );

  if (skuExists) errors.sku = 'SKU sudah terdaftar.';

  return errors;
};

const SortButton = memo(function SortButton({ active, direction, field, label, onSort }) {
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] ${
        active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      {label}
      <ArrowDownUp size={13} className={active && direction === 'desc' ? 'rotate-180' : ''} />
    </button>
  );
});

const Notification = memo(function Notification({ message, onClose }) {
  if (!message.text) return null;

  const isSuccess = message.type === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm font-bold flex items-start gap-3 ${
        isSuccess
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'
      }`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <p className="flex-1">{message.text}</p>
      <button type="button" onClick={onClose} className="p-0.5 opacity-70 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  );
});

const ProductForm = memo(function ProductForm({
  barcodeInputRef,
  errors,
  form,
  isEditing,
  onCancel,
  onChange,
  onScanKeyDown,
  onSubmit,
  saving,
}) {
  const [isBarcodePanelOpen, setIsBarcodePanelOpen] = useState(false);
  const kartonToBal = getKartonToBal(form);
  const fieldClass = (field) =>
    `w-full rounded-xl border px-3 py-3 text-sm font-bold text-slate-800 outline-none transition focus:ring-4 focus:ring-indigo-500/10 ${
      errors[field]
        ? 'border-rose-300 bg-rose-50 focus:border-rose-400'
        : 'border-slate-200 bg-slate-50 focus:border-indigo-400 focus:bg-white'
    }`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">
            {isEditing ? 'Edit Barang' : 'Tambah Barang'}
          </p>
          <h3 className="mt-2 text-xl font-black text-slate-900">
            {isEditing ? form.name || 'Ubah data barang' : 'Produk Baru'}
          </h3>
        </div>
        {isEditing && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="Batal edit"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 p-4">
          <button
            type="button"
            onClick={() => setIsBarcodePanelOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">
                Scan Barcode Produk
              </span>
              <span className="mt-1 block text-[11px] font-bold text-indigo-500">
                Buka hanya saat ingin scan agar keyboard mobile tidak muncul otomatis.
              </span>
            </span>
            <span className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">
              {isBarcodePanelOpen ? 'Tutup' : 'Buka'}
            </span>
          </button>

          {isBarcodePanelOpen && (
            <div className="mt-3 grid grid-cols-1 gap-3">
              {[
                { field: 'barcode_slop', label: 'Slop', placeholder: 'Scan barcode slop' },
                { field: 'barcode_bal', label: 'Bal', placeholder: 'Scan barcode bal' },
                { field: 'barcode_karton', label: 'Karton', placeholder: 'Scan barcode karton' },
              ].map((item, index) => (
                <label key={item.field} className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-indigo-400">
                    {item.label}
                  </span>
                  <div className="relative">
                    <Barcode className="absolute left-3 top-3.5 text-indigo-400" size={18} />
                    <input
                      ref={index === 0 ? barcodeInputRef : null}
                      value={form[item.field]}
                      onChange={(event) => onChange(item.field, event.target.value)}
                      onKeyDown={(event) => onScanKeyDown(event, item.label)}
                      placeholder={item.placeholder}
                      className="h-12 w-full rounded-xl border border-indigo-100 bg-white py-3 pl-10 pr-3 text-sm font-black text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-indigo-500">
            <span className="rounded-lg bg-white/80 px-2 py-2">Slop</span>
            <span className="rounded-lg bg-white/80 px-2 py-2">Bal</span>
            <span className="rounded-lg bg-white/80 px-2 py-2">Karton</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">SKU</span>
            <input value={form.sku} onChange={(event) => onChange('sku', event.target.value)} className={fieldClass('sku')} placeholder="Contoh: SKM-001" />
            {errors.sku && <p className="mt-1 text-xs font-bold text-rose-600">{errors.sku}</p>}
          </label>

          <label>
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">Status</span>
            <select
              value={form.is_active ? 'active' : 'inactive'}
              onChange={(event) => onChange('is_active', event.target.value === 'active')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
            >
              <option value="active">Aktif</option>
              <option value="inactive">Non-Aktif</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">Nama Barang</span>
          <input value={form.name} onChange={(event) => onChange('name', event.target.value)} className={fieldClass('name')} placeholder="Nama produk lengkap" />
          {errors.name && <p className="mt-1 text-xs font-bold text-rose-600">{errors.name}</p>}
        </label>

        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">Barcode Slop</span>
            <input value={form.barcode_slop} onChange={(event) => onChange('barcode_slop', event.target.value)} onKeyDown={(event) => onScanKeyDown(event, 'Slop')} className={fieldClass('barcode_slop')} />
          </label>
          <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">Barcode Bal</span>
            <input value={form.barcode_bal} onChange={(event) => onChange('barcode_bal', event.target.value)} onKeyDown={(event) => onScanKeyDown(event, 'Bal')} className={fieldClass('barcode_bal')} />
          </label>
          <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">Barcode Karton</span>
            <input value={form.barcode_karton} onChange={(event) => onChange('barcode_karton', event.target.value)} onKeyDown={(event) => onScanKeyDown(event, 'Karton')} className={fieldClass('barcode_karton')} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">Stok Slop</span>
            <input type="number" min="0" value={form.current_stock_slop} onChange={(event) => onChange('current_stock_slop', event.target.value)} className={fieldClass('current_stock_slop')} />
          </label>
          <label>
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">Min. Stok</span>
            <input type="number" min="0" value={form.min_stock_slop} onChange={(event) => onChange('min_stock_slop', event.target.value)} className={fieldClass('min_stock_slop')} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">1 Bal = Slop</span>
            <input type="number" min="1" value={form.isi_slop_per_bal} onChange={(event) => onChange('isi_slop_per_bal', event.target.value)} className={fieldClass('isi_slop_per_bal')} />
            {errors.isi_slop_per_bal && <p className="mt-1 text-xs font-bold text-rose-600">{errors.isi_slop_per_bal}</p>}
          </label>
          <label>
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">1 Karton = Slop</span>
            <input type="number" min="0" value={form.isi_slop_per_karton} onChange={(event) => onChange('isi_slop_per_karton', event.target.value)} className={fieldClass('isi_slop_per_karton')} placeholder="Opsional" />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Kalkulasi Kemasan</p>
          <p className="mt-2 text-sm font-black text-slate-800">
            1 karton = {kartonToBal > 0 ? formatNumber(kartonToBal) : '0'} bal
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Berdasarkan {formatNumber(parseNumber(form.isi_slop_per_karton))} slop per karton dan {formatNumber(Math.max(parseNumber(form.isi_slop_per_bal), 1))} slop per bal.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={17} />
          {saving ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambah Produk'}
        </button>
      </form>
    </section>
  );
});

const ProductRow = memo(function ProductRow({ isSelected, item, onDelete, onEdit }) {
  const status = getStockStatus(item);
  const conversion = getStockConversion(item);
  const stockIsLow = Number(item.current_stock_slop || 0) <= Number(item.min_stock_slop || 0);
  const rowTone = isSelected ? 'bg-amber-50/80 ring-1 ring-inset ring-amber-200' : 'hover:bg-slate-50/80';
  const stickyTone = isSelected ? 'bg-amber-50/80' : 'bg-white';

  return (
    <tr
      onClick={() => onEdit(item)}
      className={`cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors ${rowTone}`}
      title="Klik untuk edit barang"
    >
      <td className="p-3 align-top md:p-4">
        <p className="font-black text-slate-800">{item.name}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{item.sku || '-'}</p>
      </td>
      <td className="p-3 align-top md:p-4">
        <div className="max-w-44 space-y-1 text-[11px] font-bold text-slate-500">
          <p className="truncate">Slop: {item.barcode_slop || '-'}</p>
          <p className="truncate">Bal: {item.barcode_bal || '-'}</p>
          <p className="truncate">Karton: {item.barcode_karton || '-'}</p>
        </div>
      </td>
      <td className="p-3 align-top md:p-4">
        <div className={`inline-flex min-w-24 justify-center rounded-xl px-3 py-2 text-sm font-black ${stockIsLow ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700'}`}>
          {formatNumber(item.current_stock_slop)} slop
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] font-black text-slate-500">
          <span className="rounded-lg bg-slate-100 px-2 py-1">{formatNumber(conversion.karton)} K</span>
          <span className="rounded-lg bg-slate-100 px-2 py-1">{formatNumber(conversion.bal)} B</span>
          <span className="rounded-lg bg-slate-100 px-2 py-1">{formatNumber(conversion.slop)} S</span>
        </div>
      </td>
      <td className="p-3 align-top text-sm font-black text-slate-600 md:p-4">{formatNumber(item.min_stock_slop)} slop</td>
      <td className="p-3 align-top md:p-4">
        <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${status.className}`}>
          {status.label}
        </span>
      </td>
      <td className={`sticky right-0 z-10 p-3 text-right align-top shadow-[-10px_0_18px_-18px_rgba(15,23,42,0.7)] md:p-4 ${stickyTone}`}>
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(item);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
            title="Edit barang"
          >
            <Edit3 size={16} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            title="Hapus barang"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
});

const LoadingRows = memo(function LoadingRows() {
  return Array.from({ length: 6 }, (_, index) => (
    <tr key={index} className="border-b border-slate-100">
      <td className="p-4" colSpan="6">
        <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
      </td>
    </tr>
  ));
});

export default function MasterBarang({
  products = [],
  productsLoading = false,
  refreshProducts,
  setProducts,
}) {
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ field: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ type: '', text: '' });
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);

  const barcodeInputRef = useRef(null);
  const importInputRef = useRef(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const items = products;
  const loading = productsLoading;

  useEffect(() => {
    setPage(1);
  }, [searchTerm, pageSize, sortConfig]);

  const handleFormChange = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const handleSort = useCallback((field) => {
    setSortConfig((current) => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleEdit = useCallback((item) => {
    setForm({
      id: item.id,
      sku: item.sku || '',
      name: item.name || '',
      barcode_slop: item.barcode_slop || '',
      barcode_bal: item.barcode_bal || '',
      barcode_karton: item.barcode_karton || '',
      current_stock_slop: String(item.current_stock_slop ?? 0),
      min_stock_slop: String(item.min_stock_slop ?? 0),
      isi_slop_per_bal: String(item.isi_slop_per_bal ?? 10),
      isi_slop_per_karton: String(item.isi_slop_per_karton ?? ''),
      is_active: item.is_active !== false,
    });
    setErrors({});
    setMessage({ type: '', text: '' });
  }, []);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setErrors({});
  }, []);

  const handleScanKeyDown = useCallback((event, label = 'Barcode') => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const scannedCode = event.currentTarget.value.trim();
    if (!scannedCode) return;
    setMessage({ type: 'success', text: `${label} ${scannedCode} siap disimpan untuk produk ini.` });
  }, []);

  const handleDelete = useCallback(
    async (item) => {
      const confirmed = window.confirm(`Hapus barang "${item.name}"?`);
      if (!confirmed) return;

      setSaving(true);
      setMessage({ type: '', text: '' });

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', item.id);

      if (error) {
        setMessage({ type: 'error', text: `Gagal menghapus barang: ${error.message}` });
      } else {
        setProducts((current) => current.filter((product) => product.id !== item.id));
        if (form.id === item.id) resetForm();
        setMessage({ type: 'success', text: `Barang "${item.name}" berhasil dihapus.` });
      }

      setSaving(false);
    },
    [form.id, resetForm, setProducts]
  );

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      const nextErrors = validateProductForm(form, items);
      setErrors(nextErrors);

      if (Object.keys(nextErrors).length > 0) {
        setMessage({ type: 'error', text: 'Periksa kembali form barang. Ada data yang belum valid.' });
        return;
      }

      setSaving(true);
      setMessage({ type: '', text: '' });

      const payload = buildProductPayload(form);
      const request = form.id
        ? supabase.from('products').update(payload).eq('id', form.id)
        : supabase.from('products').insert(payload).select(`id,${PRODUCT_FIELDS.join(',')}`).single();

      const { data, error } = await request;

      if (error) {
        setMessage({ type: 'error', text: `Gagal menyimpan barang: ${error.message}` });
      } else {
        setProducts((current) => {
          if (form.id) {
            return current.map((item) => (item.id === form.id ? { ...item, ...payload } : item));
          }
          return [...current, data].sort((left, right) => normalizeText(left.name).localeCompare(normalizeText(right.name), 'id'));
        });
        setMessage({
          type: 'success',
          text: form.id ? 'Data barang berhasil diperbarui.' : 'Produk baru berhasil ditambahkan.',
        });
        resetForm();
      }

      setSaving(false);
    },
    [form, items, resetForm, setProducts]
  );

  const handleExport = useCallback(() => {
    const header = PRODUCT_FIELDS.join(',');
    const rows = items.map((item) =>
      PRODUCT_FIELDS.map((field) => escapeCsvValue(item[field])).join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `master-barang-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: 'Data master barang berhasil diexport.' });
  }, [items]);

  const handleRefresh = useCallback(async () => {
    setMessage({ type: '', text: '' });
    await refreshProducts?.();
  }, [refreshProducts]);

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      const rows = parseCsvProducts(text).map(normalizeImportedProduct);
      const existingSkus = new Set(items.map((item) => normalizeText(item.sku)));
      const seenSkus = new Set();

      const preview = rows.map((row, index) => {
        const skuKey = normalizeText(row.sku);
        const duplicateInFile = seenSkus.has(skuKey);
        if (skuKey) seenSkus.add(skuKey);

        const reason = !row.sku
          ? 'SKU kosong'
          : !row.name
            ? 'Nama kosong'
            : existingSkus.has(skuKey)
              ? 'SKU sudah ada'
              : duplicateInFile
                ? 'Duplikat di file'
                : '';

        return {
          id: `${row.sku || 'row'}-${index}`,
          checked: !reason,
          reason,
          row,
        };
      });

      setImportPreview(preview);
      setMessage({
        type: 'success',
        text: `${formatNumber(preview.filter((item) => item.checked).length)} item baru siap diimport. Centang hanya item yang ingin ditambah.`,
      });
      event.target.value = '';
    },
    [items]
  );

  const toggleImportItem = useCallback((id) => {
    setImportPreview((current) =>
      current.map((item) => (item.id === id && !item.reason ? { ...item, checked: !item.checked } : item))
    );
  }, []);

  const handleImportSelected = useCallback(async () => {
    const selectedRows = importPreview.filter((item) => item.checked && !item.reason).map((item) => item.row);

    if (selectedRows.length === 0) {
      setMessage({ type: 'error', text: 'Pilih minimal 1 item baru untuk diimport.' });
      return;
    }

    setImporting(true);
    setMessage({ type: '', text: '' });

    const { data, error } = await supabase
      .from('products')
      .insert(selectedRows)
      .select(`id,${PRODUCT_FIELDS.join(',')}`);

    if (error) {
      setMessage({ type: 'error', text: `Import gagal: ${error.message}` });
    } else {
      setProducts((current) =>
        [...current, ...(data || [])].sort((left, right) => normalizeText(left.name).localeCompare(normalizeText(right.name), 'id'))
      );
      setImportPreview([]);
      setMessage({ type: 'success', text: `${formatNumber(data?.length || 0)} item berhasil diimport.` });
    }

    setImporting(false);
  }, [importPreview, setProducts]);

  const visibleItems = useMemo(() => {
    const keyword = normalizeText(deferredSearchTerm);
    const filtered = keyword
      ? items.filter((item) => {
          const haystack = [
            item.name,
            item.sku,
            item.barcode_slop,
            item.barcode_bal,
            item.barcode_karton,
          ]
            .map(normalizeText)
            .join(' ');

          return haystack.includes(keyword);
        })
      : items;

    return [...filtered].sort((left, right) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      if (sortConfig.field === 'stock') {
        return (Number(left.current_stock_slop || 0) - Number(right.current_stock_slop || 0)) * direction;
      }

      return normalizeText(left.name).localeCompare(normalizeText(right.name), 'id') * direction;
    });
  }, [deferredSearchTerm, items, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return visibleItems.slice(start, start + pageSize);
  }, [pageSize, safePage, visibleItems]);

  const summary = useMemo(() => {
    const active = items.filter((item) => item.is_active).length;
    const lowStock = items.filter(
      (item) => item.is_active && Number(item.current_stock_slop || 0) <= Number(item.min_stock_slop || 0)
    ).length;
    const totalStock = items.reduce((sum, item) => sum + Number(item.current_stock_slop || 0), 0);

    return { active, lowStock, totalStock };
  }, [items]);

  const showingStart = visibleItems.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const showingEnd = Math.min(safePage * pageSize, visibleItems.length);

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-500">Master Barang</p>
            <h1 className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">Inventory Operasional Toko</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              Kelola produk, barcode, status stok, dan konversi slop/bal/karton dari satu halaman.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700"
            >
              <Plus size={16} />
              Produk
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={items.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <FileDown size={16} />
              Export
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600 hover:bg-slate-50"
            >
              <FileUp size={16} />
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: 'Total Produk', value: formatNumber(items.length), tone: 'text-slate-900' },
            { label: 'Produk Aktif', value: formatNumber(summary.active), tone: 'text-emerald-700' },
            { label: 'Stok Menipis', value: formatNumber(summary.lowStock), tone: 'text-amber-700' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
              <p className={`mt-2 text-3xl font-black ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <Notification message={message} onClose={() => setMessage({ type: '', text: '' })} />

        {importPreview.length > 0 && (
          <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Preview Import</p>
                <h3 className="mt-2 text-xl font-black text-slate-900">Pilih Item Yang Mau Ditambah</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  Item dengan SKU yang sudah ada otomatis dikunci agar tidak menimpa data lama.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setImportPreview([])}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleImportSelected}
                  disabled={importing}
                  className="rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-60"
                >
                  {importing ? 'Mengimport...' : 'Import Terpilih'}
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[780px] border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-12 p-3"></th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">SKU</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Nama</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Barcode</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={Boolean(item.reason)}
                          onChange={() => toggleImportItem(item.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                      </td>
                      <td className="p-3 text-sm font-black text-slate-800">{item.row.sku || '-'}</td>
                      <td className="p-3 text-sm font-bold text-slate-700">{item.row.name || '-'}</td>
                      <td className="p-3 text-xs font-bold text-slate-500">
                        S: {item.row.barcode_slop || '-'} / B: {item.row.barcode_bal || '-'} / K: {item.row.barcode_karton || '-'}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${item.reason ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
                          {item.reason || 'Siap Import'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4 md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Cari realtime: nama, SKU, barcode slop/bal/karton..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-600 outline-none focus:border-indigo-400"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option} / halaman
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="w-[28%] p-3 md:p-4">
                      <SortButton
                        active={sortConfig.field === 'name'}
                        direction={sortConfig.direction}
                        field="name"
                        label="Nama Barang"
                        onSort={handleSort}
                      />
                    </th>
                    <th className="w-[22%] p-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 md:p-4">Barcode</th>
                    <th className="w-[20%] p-3 md:p-4">
                      <SortButton
                        active={sortConfig.field === 'stock'}
                        direction={sortConfig.direction}
                        field="stock"
                        label="Stok"
                        onSort={handleSort}
                      />
                    </th>
                    <th className="w-[12%] p-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 md:p-4">Minimum</th>
                    <th className="w-[10%] p-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 md:p-4">Status</th>
                    <th className="sticky right-0 z-20 w-[88px] bg-slate-50 p-3 text-right text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 shadow-[-10px_0_18px_-18px_rgba(15,23,42,0.7)] md:p-4">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingRows />
                  ) : paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-10">
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                          <Package size={42} className="text-slate-300" />
                          <p className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                            Barang Tidak Ditemukan
                          </p>
                          <p className="mt-2 max-w-md text-sm font-bold text-slate-400">
                            Coba kata kunci lain, scan barcode, atau tambahkan produk baru lewat form kanan.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((item) => (
                      <ProductRow
                        key={item.id}
                        isSelected={form.id === item.id}
                        item={item}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
              <p className="text-sm font-bold text-slate-500">
                Menampilkan {formatNumber(showingStart)}-{formatNumber(showingEnd)} dari {formatNumber(visibleItems.length)} barang
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>
                <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                  {formatNumber(safePage)} / {formatNumber(totalPages)}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </section>

          <ProductForm
            barcodeInputRef={barcodeInputRef}
            errors={errors}
            form={form}
            isEditing={Boolean(form.id)}
            onCancel={resetForm}
            onChange={handleFormChange}
            onScanKeyDown={handleScanKeyDown}
            onSubmit={handleSubmit}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
