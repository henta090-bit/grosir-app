import { supabase } from '../config/supabase';
import { enrichProductCategory, getCategoryFromSku, normalizeCategoryCode } from './productCategories';

export const PRODUCT_SELECT_COLUMNS = [
  'id',
  'sku',
  'category_code',
  'category_name',
  'name',
  'barcode_slop',
  'barcode_bal',
  'barcode_karton',
  'current_stock_slop',
  'min_stock_slop',
  'isi_slop_per_bal',
  'isi_slop_per_karton',
  'is_active',
].join(',');

export const LEGACY_PRODUCT_SELECT_COLUMNS = [
  'id',
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
].join(',');

export const isMissingCategoryColumnError = (error) =>
  /category_code|category_name|schema cache|column .* does not exist/i.test(error?.message || '');

export const fetchProductsForApp = async () => {
  const response = await supabase
    .from('products')
    .select(PRODUCT_SELECT_COLUMNS)
    .order('name', { ascending: true });

  if (!response.error) return (response.data || []).map(enrichProductCategory);
  if (!isMissingCategoryColumnError(response.error)) throw response.error;

  const fallback = await supabase
    .from('products')
    .select(LEGACY_PRODUCT_SELECT_COLUMNS)
    .order('name', { ascending: true });

  if (fallback.error) throw fallback.error;
  return (fallback.data || []).map(enrichProductCategory);
};

export const searchProductsForMutasi = async ({ categoryFilter = 'ALL', term }) => {
  const keyword = String(term || '').trim();
  if (!keyword) return [];

  const baseQuery = (columns) =>
    supabase
      .from('products')
      .select(columns)
      .eq('is_active', true)
      .or(`name.ilike.%${keyword}%,sku.ilike.%${keyword}%,barcode_slop.eq.${keyword},barcode_bal.eq.${keyword},barcode_karton.eq.${keyword}`)
      .order('name', { ascending: true })
      .limit(categoryFilter === 'ALL' ? 10 : 40);

  let response = baseQuery(PRODUCT_SELECT_COLUMNS);
  if (categoryFilter !== 'ALL') response = response.eq('category_code', categoryFilter);

  const result = await response;
  if (!result.error) return (result.data || []).map(enrichProductCategory).slice(0, 10);
  if (!isMissingCategoryColumnError(result.error)) throw result.error;

  const fallback = await baseQuery(LEGACY_PRODUCT_SELECT_COLUMNS);
  if (fallback.error) throw fallback.error;

  const enriched = (fallback.data || []).map(enrichProductCategory);
  if (categoryFilter === 'ALL') return enriched.slice(0, 10);
  return enriched
    .filter((item) => normalizeCategoryCode(item.category_code || getCategoryFromSku(item.sku).code) === categoryFilter)
    .slice(0, 10);
};

const stripCategoryFields = (payload) => {
  const { category_code, category_name, ...legacyPayload } = payload || {};
  return legacyPayload;
};

export const insertProductRow = async (payload) => {
  const response = await supabase
    .from('products')
    .insert(payload)
    .select(PRODUCT_SELECT_COLUMNS)
    .single();

  if (!response.error) return enrichProductCategory(response.data);
  if (!isMissingCategoryColumnError(response.error)) throw response.error;

  const fallback = await supabase
    .from('products')
    .insert(stripCategoryFields(payload))
    .select(LEGACY_PRODUCT_SELECT_COLUMNS)
    .single();

  if (fallback.error) throw fallback.error;
  return enrichProductCategory(fallback.data);
};

export const updateProductRow = async (id, payload) => {
  const response = await supabase
    .from('products')
    .update(payload)
    .eq('id', id)
    .select(PRODUCT_SELECT_COLUMNS)
    .single();

  if (!response.error) return enrichProductCategory(response.data);
  if (!isMissingCategoryColumnError(response.error)) throw response.error;

  const fallback = await supabase
    .from('products')
    .update(stripCategoryFields(payload))
    .eq('id', id)
    .select(LEGACY_PRODUCT_SELECT_COLUMNS)
    .single();

  if (fallback.error) throw fallback.error;
  return enrichProductCategory(fallback.data);
};

export const insertProductRows = async (rows) => {
  const response = await supabase
    .from('products')
    .insert(rows)
    .select(PRODUCT_SELECT_COLUMNS);

  if (!response.error) return (response.data || []).map(enrichProductCategory);
  if (!isMissingCategoryColumnError(response.error)) throw response.error;

  const fallback = await supabase
    .from('products')
    .insert(rows.map(stripCategoryFields))
    .select(LEGACY_PRODUCT_SELECT_COLUMNS);

  if (fallback.error) throw fallback.error;
  return (fallback.data || []).map(enrichProductCategory);
};

export const importProductRowsBySku = async (rows, batchSize = 500) => {
  const importedProducts = [];
  const updateRows = rows.filter((row) => row.id);
  const insertRows = rows.filter((row) => !row.id);

  const upsertBatch = async (batch) => {
    const response = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'id' })
      .select(PRODUCT_SELECT_COLUMNS);

    if (!response.error) {
      importedProducts.push(...(response.data || []).map(enrichProductCategory));
      return;
    }

    if (!isMissingCategoryColumnError(response.error)) throw response.error;

    const fallback = await supabase
      .from('products')
      .upsert(batch.map(stripCategoryFields), { onConflict: 'id' })
      .select(LEGACY_PRODUCT_SELECT_COLUMNS);

    if (fallback.error) throw fallback.error;
    importedProducts.push(...(fallback.data || []).map(enrichProductCategory));
  };

  const insertBatch = async (batch) => {
    const response = await supabase
      .from('products')
      .insert(batch)
      .select(PRODUCT_SELECT_COLUMNS);

    if (!response.error) {
      importedProducts.push(...(response.data || []).map(enrichProductCategory));
      return;
    }

    if (!isMissingCategoryColumnError(response.error)) throw response.error;

    const fallback = await supabase
      .from('products')
      .insert(batch.map(stripCategoryFields))
      .select(LEGACY_PRODUCT_SELECT_COLUMNS);

    if (fallback.error) throw fallback.error;
    importedProducts.push(...(fallback.data || []).map(enrichProductCategory));
  };

  for (let index = 0; index < updateRows.length; index += batchSize) {
    await upsertBatch(updateRows.slice(index, index + batchSize));
  }

  for (let index = 0; index < insertRows.length; index += batchSize) {
    await insertBatch(insertRows.slice(index, index + batchSize));
  }

  return importedProducts;
};

export const createProductWithNextSku = async ({ payload, fallbackSku }) => {
  const response = await supabase.rpc('create_product_with_next_sku', {
    product_payload: payload,
    requested_category_code: payload.category_code,
  });

  if (!response.error) return enrichProductCategory(response.data);

  if (!/function.*create_product_with_next_sku|schema cache/i.test(response.error.message || '')) {
    throw response.error;
  }

  return insertProductRow({
    ...payload,
    sku: fallbackSku,
  });
};
