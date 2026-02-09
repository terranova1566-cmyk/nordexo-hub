import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

const OUT_PATH =
  process.env.OUT_FILE ?? '/srv/nordexo-hub/imports/sales-template.xlsx';

await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });

const workbook = new ExcelJS.Workbook();
workbook.creator = 'nordexo-hub';
workbook.created = new Date();

const ws = workbook.addWorksheet('sales');

ws.columns = [
  { header: 'sku', key: 'sku', width: 24 },
  { header: 'sold_date', key: 'sold_date', width: 14 },
  { header: 'units_sold', key: 'units_sold', width: 12 },
  { header: 'revenue', key: 'revenue', width: 12 },
  { header: 'currency', key: 'currency', width: 10 },
  { header: 'seller', key: 'seller', width: 16 },
  { header: 'title', key: 'title', width: 42 },
  { header: 'supplier_name', key: 'supplier_name', width: 28 },
  { header: 'google_taxonomy_path', key: 'google_taxonomy_path', width: 70 },
  { header: 'google_taxonomy_l1', key: 'google_taxonomy_l1', width: 26 },
  { header: 'google_taxonomy_l2', key: 'google_taxonomy_l2', width: 26 },
  { header: 'google_taxonomy_l3', key: 'google_taxonomy_l3', width: 26 },
];

ws.addRow({
  sku: 'EXAMPLE-SKU-123',
  sold_date: '2024-05-01',
  units_sold: 3,
  revenue: 299,
  currency: 'SEK',
  seller: 'shopify',
  title: 'Example Product Title',
  supplier_name: 'Example Supplier',
  google_taxonomy_path:
    'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils',
  google_taxonomy_l1: 'Home & Garden',
  google_taxonomy_l2: 'Kitchen & Dining',
  google_taxonomy_l3: 'Kitchen Tools & Utensils',
});

ws.addRow({
  sku: 'EXAMPLE-SKU-123',
  sold_date: '2024-05-02',
  units_sold: 1,
  revenue: 99,
  currency: 'SEK',
  seller: 'shopify',
  title: 'Example Product Title',
  supplier_name: 'Example Supplier',
  google_taxonomy_path:
    'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils',
  google_taxonomy_l1: 'Home & Garden',
  google_taxonomy_l2: 'Kitchen & Dining',
  google_taxonomy_l3: 'Kitchen Tools & Utensils',
});

ws.getRow(1).font = { bold: true };
ws.views = [{ state: 'frozen', ySplit: 1 }];

await workbook.xlsx.writeFile(OUT_PATH);
console.log(`Wrote template: ${OUT_PATH}`);

