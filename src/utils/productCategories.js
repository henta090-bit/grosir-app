export const PRODUCT_CATEGORIES = [
  { code: '01', name: 'Rokok' },
  { code: '02', name: 'Obat' },
  { code: '03', name: 'Kopi' },
  { code: '04', name: 'Permen' },
  { code: '05', name: 'Shampoo' },
  { code: '06', name: 'Susu' },
  { code: '07', name: 'Mie' },
  { code: '08', name: 'Snack' },
  { code: '09', name: 'Sabun/Cuci' },
  { code: '10', name: 'Dental' },
  { code: '11', name: 'Teh' },
  { code: '12', name: 'Bumbu/Sembako' },
  { code: '13', name: 'Minuman Energi' },
  { code: '14', name: 'Tissue/Pampers' },
  { code: '15', name: 'Minuman' },
  { code: '16', name: 'Kosmetik' },
  { code: '17', name: 'Pembersih' },
  { code: '18', name: 'ATK/Lainnya' },
];

export const DEFAULT_CATEGORY_CODE = '01';

const categoryMap = new Map(PRODUCT_CATEGORIES.map((item) => [item.code, item.name]));

export const normalizeCategoryCode = (value) => {
  const code = String(value ?? '').trim().slice(0, 2);
  return categoryMap.has(code) ? code : DEFAULT_CATEGORY_CODE;
};

export const getCategoryName = (code) => categoryMap.get(normalizeCategoryCode(code)) || '';

export const getCategoryFromSku = (sku) => {
  const code = String(sku ?? '').trim().slice(0, 2);
  if (!/^\d{2}$/.test(code) || !categoryMap.has(code)) {
    return {
      code: DEFAULT_CATEGORY_CODE,
      name: getCategoryName(DEFAULT_CATEGORY_CODE),
    };
  }

  return {
    code,
    name: getCategoryName(code),
  };
};

export const enrichProductCategory = (product) => {
  const fallback = getCategoryFromSku(product?.sku);
  const code = product?.category_code ? normalizeCategoryCode(product.category_code) : fallback.code;

  return {
    ...product,
    category_code: code,
    category_name: product?.category_name || getCategoryName(code),
  };
};

export const buildCategoryOptions = () => [
  { code: 'ALL', name: 'Semua Kategori' },
  ...PRODUCT_CATEGORIES,
];

export const buildSkuPreview = (products, categoryCode, excludedProductId = null) => {
  const code = normalizeCategoryCode(categoryCode);
  const usedNumbers = new Set();

  for (const item of products || []) {
    if (excludedProductId && String(item?.id ?? '') === String(excludedProductId)) continue;
    if (item?.is_active === false) continue;
    const sku = String(item?.sku || '').trim();
    const match = sku.match(/^(\d{2})(\d{3})$/);
    if (!match || match[1] !== code) continue;
    usedNumbers.add(Number.parseInt(match[2], 10));
  }

  for (let nextNumber = 1; nextNumber <= 999; nextNumber += 1) {
    if (!usedNumbers.has(nextNumber)) return `${code}${String(nextNumber).padStart(3, '0')}`;
  }

  return `${code}999`;
};
