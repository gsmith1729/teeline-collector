import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const admin = createClient(url, serviceKey);

const FILE = process.argv[2] || 'teeline_outlines.json';

// Helper: split into chunks so we don’t overload Supabase
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

(async () => {
  const raw = await fs.readFile(FILE, 'utf-8');
  const items = JSON.parse(raw);

  // Map JSON keys to DB column names
  const rows = items.map(it => ({
    meanings: it.meanings,
    reference_paths: it.paths
  }));

  for (const group of chunk(rows, 500)) {
    const { error } = await admin.from('words').insert(group);
    if (error) {
      console.error('Insert error:', error);
      process.exit(1);
    }
    console.log(`Inserted ${group.length} rows...`);
  }

  console.log('✅ Import complete');
})();
