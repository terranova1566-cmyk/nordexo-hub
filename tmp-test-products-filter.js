const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of content.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx < 0) continue;
  const key = line.slice(0, idx).trim();
  let val = line.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}
const { createClient } = require('@supabase/supabase-js');
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE;
if (!url || !key) {
  console.error('missing supabase env');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const formatInValues = (values) => values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(',');

(async () => {
  const { data: rows, error } = await supabase
    .from('catalog_products')
    .select('google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3')
    .neq('is_blocked', true)
    .not('google_taxonomy_l1', 'is', null)
    .limit(5);

  if (error) {
    console.error('seed error:', error.message);
    return;
  }

  const l1 = rows?.map((row) => row.google_taxonomy_l1).filter(Boolean) ?? [];
  if (l1.length === 0) {
    console.log('no l1 values');
    return;
  }

  let query = supabase.from('catalog_products').select('id').neq('is_blocked', true);
  const filters = [`google_taxonomy_l1.in.(${formatInValues([l1[0]])})`];
  query = query.or(filters.join(','));
  const { error: filterError } = await query.limit(1);
  if (filterError) {
    console.error('filter error:', filterError.message);
  } else {
    console.log('filter ok');
  }
})();
