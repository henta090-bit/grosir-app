import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import supabaseAdmin from './supabaseAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidatePaths = [
  path.resolve(__dirname, 'products.json'),
  path.resolve(__dirname, '../products.json'),
];

const allowedFields = [
  'sku',
  'name',
  'barcode_slop',
  'barcode_bal',
  'barcode_karton',
  'isi_slop_per_bal',
  'current_stock_slop',
  'min_stock_slop',
  'is_active',
  'isi_slop_per_karton',
];

const findProductsFile = () => candidatePaths.find((filePath) => fs.existsSync(filePath));

const parseInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const normalizeBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() !== 'false';
  return Boolean(value);
};

const normalizeBarcode = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const pickAllowedFields = (item) =>
  allowedFields.reduce((accumulator, field) => {
    if (field in item) {
      accumulator[field] = item[field];
    }

    return accumulator;
  }, {});

const prepareProducts = (rawProducts) => {
  const seenBarcodes = new Set();
  let duplicateBarcodesNullified = 0;

  const products = rawProducts.map((item, index) => {
    const baseProduct = pickAllowedFields(item);
    const sku = String(baseProduct.sku ?? '').trim();
    const name = String(baseProduct.name ?? '').trim();

    if (!sku) {
      throw new Error(`Data ke-${index + 1} tidak punya sku.`);
    }

    if (!name) {
      throw new Error(`Data ke-${index + 1} tidak punya name.`);
    }

    const barcodeSlop = normalizeBarcode(baseProduct.barcode_slop);
    const isDuplicateBarcode = barcodeSlop && seenBarcodes.has(barcodeSlop);

    if (barcodeSlop && !isDuplicateBarcode) {
      seenBarcodes.add(barcodeSlop);
    }

    if (isDuplicateBarcode) {
      duplicateBarcodesNullified += 1;
    }

    return {
      sku,
      name,
      barcode_slop: isDuplicateBarcode ? null : barcodeSlop,
      barcode_bal: normalizeBarcode(baseProduct.barcode_bal),
      barcode_karton: normalizeBarcode(baseProduct.barcode_karton),
      isi_slop_per_bal: Math.max(parseInteger(baseProduct.isi_slop_per_bal, 10), 1),
      current_stock_slop: Math.max(parseInteger(baseProduct.current_stock_slop, 0), 0),
      min_stock_slop: Math.max(parseInteger(baseProduct.min_stock_slop, 10), 0),
      is_active: normalizeBoolean(baseProduct.is_active, true),
      isi_slop_per_karton:
        baseProduct.isi_slop_per_karton === undefined ||
        baseProduct.isi_slop_per_karton === null ||
        baseProduct.isi_slop_per_karton === ''
          ? null
          : Math.max(parseInteger(baseProduct.isi_slop_per_karton, 0), 0),
    };
  });

  return { products, duplicateBarcodesNullified };
};

const insertInBatches = async (products, batchSize = 200) => {
  for (let index = 0; index < products.length; index += batchSize) {
    const batch = products.slice(index, index + batchSize);
    const { error } = await supabaseAdmin.from('products').insert(batch);

    if (error) {
      throw new Error(
        `Gagal insert batch ${Math.floor(index / batchSize) + 1}: ${error.message}`
      );
    }
  }
};

async function importProducts() {
  console.log('[import-products] Memulai import products...');

  const productsFile = findProductsFile();
  if (!productsFile) {
    throw new Error(
      'products.json tidak ditemukan. Simpan file di folder project atau folder scripts.'
    );
  }

  const rawFile = fs.readFileSync(productsFile, 'utf8');
  const parsedJson = JSON.parse(rawFile);

  if (!Array.isArray(parsedJson)) {
    throw new Error('products.json harus berupa array.');
  }

  const { products, duplicateBarcodesNullified } = prepareProducts(parsedJson);
  await insertInBatches(products);

  console.log('[import-products] Import berhasil.');
  console.log(
    JSON.stringify(
      {
        source: productsFile,
        totalRead: parsedJson.length,
        totalInserted: products.length,
        duplicateBarcodesNullified,
      },
      null,
      2
    )
  );
}

importProducts().catch((error) => {
  console.error('[import-products] Import gagal.');
  console.error('[import-products] Detail error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
