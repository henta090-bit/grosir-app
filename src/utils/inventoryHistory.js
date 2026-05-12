import { supabase } from '../config/supabase';

const OPNAME_TABLE = 'stock_counts';
const TRANSACTION_TABLE = 'stock_movements';

const isMissingColumnError = (error, column) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    (message.includes(column.toLowerCase()) &&
      (message.includes('does not exist') || message.includes('could not find') || message.includes('schema cache')))
  );
};

const createCode = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const getDateRange = (date) => {
  const start = `${date}T00:00:00+07:00`;
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + 1);
  return {
    start,
    end: endDate.toISOString(),
  };
};

const normalizeOpnameLog = (item) => ({
  id: item.id,
  created_at: item.created_at,
  product_id: item.product_id,
  product_name: item.products?.name || item.product_name || '-',
  sku: item.products?.sku || item.sku || '-',
  system_stock: Number(item.stock_before_slop ?? item.system_stock ?? 0),
  physical_stock: Number(item.physical_stock_slop ?? item.qty_fisik_slop ?? item.physical_stock ?? 0),
  physical_qty: item.physical_qty || { slop: 0, bal: 0, karton: 0 },
  difference: Number(item.variance_slop ?? item.difference ?? item.selisih ?? 0),
  checked_by: item.actor || item.checked_by || item.user_id || '-',
  note: item.note || '',
  opname_date: item.count_date || item.opname_date || item.created_at?.slice(0, 10),
});

const normalizeMovementType = (type) => {
  if (type === 'IN') return 'MASUK';
  if (type === 'OUT') return 'KELUAR';
  if (type === 'CHECK') return 'KOREKSI';
  return type;
};

const normalizeTransactionLog = (item) => ({
  id: item.id,
  created_at: item.created_at,
  type: normalizeMovementType(item.movement_type || item.type),
  direction: normalizeMovementType(item.direction || item.movement_type || item.type),
  product_id: item.product_id,
  product_name: item.products?.name || item.product_name || '-',
  sku: item.products?.sku || item.sku || '-',
  qty: Number(item.quantity_slop ?? item.qty_base_slop ?? item.qty ?? 0),
  stock_before: Number(item.stock_before_slop ?? item.stock_before ?? 0),
  stock_after: Number(item.stock_after_slop ?? item.stock_after ?? 0),
  actor: item.actor || item.user_id || '-',
  note: item.note || item.notes || '',
  source: item.source || 'MUTASI_GUDANG',
});

export const getTransactionLogs = async ({ date, limit } = {}) => {
  let query = supabase
    .from(TRANSACTION_TABLE)
    .select('*, products(name, sku)')
    .order('created_at', { ascending: false });

  if (date) {
    const start = `${date}T00:00:00+07:00`;
    const endDate = new Date(`${date}T00:00:00+07:00`);
    endDate.setDate(endDate.getDate() + 1);
    query = query.gte('created_at', start).lt('created_at', endDate.toISOString());
  }

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(normalizeTransactionLog);
};

export const addTransactionLog = async (entry) => {
  const modernPayload = {
    movement_type: entry.type,
    direction: entry.direction || entry.type,
    product_id: entry.product_id,
    quantity_slop: entry.qty,
    stock_before_slop: entry.stock_before,
    stock_after_slop: entry.stock_after,
    user_id: entry.user_id || null,
    actor: entry.actor,
    note: entry.note,
    source: entry.source || (entry.type === 'KOREKSI' ? 'STOK_OPNAME' : 'MUTASI_GUDANG'),
    metadata: entry.metadata || {},
  };

  const modernResult = await supabase
    .from(TRANSACTION_TABLE)
    .insert(modernPayload)
    .select('*, products(name, sku)')
    .single();

  if (!modernResult.error) return normalizeTransactionLog(modernResult.data);

  const legacyPayload = {
    movement_code: createCode('MOV'),
    product_id: entry.product_id,
    movement_type: entry.type === 'MASUK' ? 'IN' : entry.type === 'KELUAR' ? 'OUT' : 'CHECK',
    source: entry.source === 'STOK_OPNAME' ? 'OPNAME' : 'ADJUST',
    scanned_code: entry.sku || null,
    uom: 'Slop',
    qty_input: entry.qty,
    qty_base_slop: entry.qty,
    user_id: entry.user_id || null,
    note: entry.note,
  };

  const { data, error } = await supabase
    .from(TRANSACTION_TABLE)
    .insert(legacyPayload)
    .select('*, products(name, sku)')
    .single();

  if (error) throw error;
  return normalizeTransactionLog(data);
};

export const getOpnameLogs = async ({ date, limit } = {}) => {
  let query = supabase
    .from(OPNAME_TABLE)
    .select('*, products(name, sku)')
    .order('created_at', { ascending: false });

  if (date) query = query.eq('count_date', date);
  if (limit) query = query.limit(limit);

  const result = await query;
  if (!result.error) return (result.data || []).map(normalizeOpnameLog);

  if (!date || !isMissingColumnError(result.error, 'count_date')) throw result.error;

  const range = getDateRange(date);
  let fallbackQuery = supabase
    .from(OPNAME_TABLE)
    .select('*, products(name, sku)')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('created_at', { ascending: false });

  if (limit) fallbackQuery = fallbackQuery.limit(limit);

  const { data, error } = await fallbackQuery;
  if (error) throw error;

  return (data || []).map(normalizeOpnameLog);
};

export const addOpnameLog = async (entry) => {
  const modernPayload = {
    product_id: entry.product_id,
    stock_before_slop: entry.system_stock,
    physical_stock_slop: entry.physical_stock,
    physical_qty: entry.physical_qty,
    variance_slop: entry.difference,
    user_id: entry.user_id || null,
    actor: entry.checked_by,
    note: entry.note,
    count_date: entry.opname_date,
    status: 'CHECKED',
  };

  const modernResult = await supabase
    .from(OPNAME_TABLE)
    .upsert(modernPayload, { onConflict: 'product_id,count_date' })
    .select('*, products(name, sku)')
    .single();

  if (!modernResult.error) return normalizeOpnameLog(modernResult.data);

  const legacyPayload = {
    count_code: createCode('OPN'),
    product_id: entry.product_id,
    scanned_code: entry.sku || null,
    uom: 'Slop',
    qty_fisik: entry.physical_stock,
    qty_fisik_slop: entry.physical_stock,
    stock_before_slop: entry.system_stock,
    variance_slop: entry.difference,
    status: Number(entry.difference || 0) === 0 ? 'SESUAI' : 'KOREKSI',
    user_id: entry.user_id || null,
  };

  const { data, error } = await supabase
    .from(OPNAME_TABLE)
    .insert(legacyPayload)
    .select('*, products(name, sku)')
    .single();

  if (error) throw error;
  return normalizeOpnameLog(data);
};
