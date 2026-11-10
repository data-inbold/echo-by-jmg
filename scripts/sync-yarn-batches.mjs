#!/usr/bin/env node
/**
 * Sync the "Yarn batch" metaobject list from the products.
 *
 * Source of truth = the Yarn Passport metafields on each product. This script groups the
 * products by "Yarn Passport - Batch" and writes one yarn_batch entry per batch:
 *
 *   kg            = sum of "Rescued kg" over the batch's products
 *   closed_pieces = sum of "Pieces made" over the batch's products (shown as Pieces on the tracker)
 *   fibre/origin  = from the products (a warning is printed if they disagree)
 *   products      = every active product in the batch
 *   logged        = earliest "Yarn Passport - Logged" if that metafield exists; otherwise only set
 *                   (to today) when a new entry is created
 *
 * Entries that no product points to (closed history) are never changed or deleted.
 * Status (open / closed / left) is NOT synced: the theme computes it live from stock.
 *
 * Usage:
 *   SHOPIFY_STORE=your-shop.myshopify.com SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... node scripts/sync-yarn-batches.mjs   (dry run)
 *   ... node scripts/sync-yarn-batches.mjs --apply                                                                          (write)
 *
 * Auth: Dev Dashboard app, client credentials grant (the script requests a fresh access token on
 * every run, so nothing expires between runs). A fixed SHOPIFY_ADMIN_TOKEN is still accepted
 * instead of the client id / secret.
 * App scopes: read_products, read_metaobjects, write_metaobjects, read_metaobject_definitions.
 * Metafields are found by their definition NAME (Settings > Custom data > Products), so the
 * namespace and key do not matter.
 */
import { pathToFileURL } from 'node:url';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10';
const TYPE = 'yarn_batch';

// Product metafield definition names (case-insensitive) -> role
const PRODUCT_FIELDS = {
  'yarn passport - batch': 'batch',
  'yarn passport - rescued kg': 'kg',
  'yarn passport - pieces made': 'pieces',
  'yarn passport - fibre': 'fibre',
  'yarn passport - origin': 'origin',
  'yarn passport - logged': 'logged', // optional
};
const REQUIRED_ROLES = ['batch', 'kg', 'pieces', 'fibre', 'origin'];

// Keys of the yarn_batch metaobject definition (same keys the theme reads)
const MO_KEYS = ['batch_id', 'kg', 'fibre', 'origin', 'products', 'closed_pieces', 'logged'];

export function parseNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const norm = (s) => String(s || '').trim();
const normKey = (s) => norm(s).toLowerCase();
const normText = (s) => norm(s).replace(/\s+/g, ' ');

export function toDate(v) {
  const s = norm(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return null;
}

/**
 * products: [{ id, title, handle, values: { batch, kg, pieces, fibre, origin, logged } }]
 * Returns { batches: Map<normBatchId, batch>, warnings: string[] }
 */
export function aggregate(products) {
  const batches = new Map();
  const warnings = [];
  for (const p of products) {
    const id = norm(p.values.batch);
    if (!id) continue;
    const key = normKey(id);
    let b = batches.get(key);
    if (!b) {
      b = { batchId: id, kg: 0, kgCount: 0, pieces: 0, pieceCount: 0, fibres: new Map(), origins: new Map(), logged: null, products: [] };
      batches.set(key, b);
    }
    b.products.push({ id: p.id, title: p.title });

    const kg = parseNumber(p.values.kg);
    if (kg === null) warnings.push(`${id}: "${p.title}" has no valid Rescued kg (value: ${JSON.stringify(p.values.kg ?? null)})`);
    else { b.kg += kg; b.kgCount += 1; }

    const pcs = parseNumber(p.values.pieces);
    if (pcs === null) warnings.push(`${id}: "${p.title}" has no valid Pieces made (value: ${JSON.stringify(p.values.pieces ?? null)})`);
    else { b.pieces += pcs; b.pieceCount += 1; }

    const fibre = normText(p.values.fibre);
    if (fibre) b.fibres.set(fibre, (b.fibres.get(fibre) || 0) + 1);
    const origin = normText(p.values.origin);
    if (origin) b.origins.set(origin, (b.origins.get(origin) || 0) + 1);

    const d = toDate(p.values.logged);
    if (d && (!b.logged || d < b.logged)) b.logged = d;
  }

  for (const b of batches.values()) {
    b.kg = round3(b.kg);
    b.pieces = Math.round(b.pieces);
    b.fibre = pickMostCommon(b.fibres, `${b.batchId}: products disagree on Fibre`, warnings);
    b.origin = pickMostCommon(b.origins, `${b.batchId}: products disagree on Origin`, warnings);
  }
  return { batches, warnings };
}

function pickMostCommon(map, warnMsg, warnings) {
  if (map.size === 0) return '';
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1) warnings.push(`${warnMsg}: ${sorted.map(([v, n]) => `"${v}" x${n}`).join(' vs ')} (using "${sorted[0][0]}")`);
  return sorted[0][0];
}

/** Compare a batch against an existing entry; returns the fields to write (possibly empty). */
export function diffFields(batch, entry) {
  const cur = entry ? entry.fields : {};
  const out = [];
  const num = (v) => parseNumber(v);

  if (!entry || norm(cur.batch_id) !== batch.batchId) out.push({ key: 'batch_id', value: batch.batchId });
  if (batch.kgCount > 0 && (!entry || num(cur.kg) !== batch.kg)) out.push({ key: 'kg', value: String(batch.kg) });
  if (batch.pieceCount > 0 && (!entry || num(cur.closed_pieces) !== batch.pieces)) out.push({ key: 'closed_pieces', value: String(batch.pieces) });
  if (batch.fibre && (!entry || normText(cur.fibre) !== batch.fibre)) out.push({ key: 'fibre', value: batch.fibre });
  if (batch.origin && (!entry || normText(cur.origin) !== batch.origin)) out.push({ key: 'origin', value: batch.origin });

  let curIds = [];
  try { curIds = JSON.parse(cur.products || '[]'); } catch { curIds = []; }
  const newIds = batch.products.map((p) => p.id);
  const same = curIds.length === newIds.length && [...curIds].sort().join() === [...newIds].sort().join();
  if (!entry || !same) out.push({ key: 'products', value: JSON.stringify(newIds) });

  if (batch.logged) {
    if (!entry || toDate(cur.logged) !== batch.logged) out.push({ key: 'logged', value: batch.logged });
  } else if (!entry) {
    out.push({ key: 'logged', value: new Date().toISOString().slice(0, 10) });
  }
  return out;
}

/* ---------------------------------- Shopify ---------------------------------- */

let cachedToken = null;

async function getToken(force = false) {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (cachedToken && !force) return cachedToken;
  const res = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const cid = String(process.env.SHOPIFY_CLIENT_ID || '');
    throw new Error(`Could not get an access token for shop "${process.env.SHOPIFY_STORE}" with client id "${cid.slice(0, 6)}..." (HTTP ${res.status}): ${await res.text()}. ` +
      'Check that this is the right shop domain, that the app is installed on that shop, that the app and shop are in the same organization, and that the client id / secret belong to this app.');
  }
  const json = await res.json();
  if (!json.access_token) throw new Error('Token response had no access_token');
  cachedToken = json.access_token;
  return cachedToken;
}

async function gql(query, variables = {}) {
  const store = process.env.SHOPIFY_STORE;
  const url = `https://${store}/admin/api/${API_VERSION}/graphql.json`;
  let token = await getToken();
  let refreshed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401 && !refreshed && !process.env.SHOPIFY_ADMIN_TOKEN) {
      refreshed = true;
      token = await getToken(true);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.errors) {
      const throttled = json.errors.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
      throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }
  throw new Error('Too many retries');
}

async function loadProductDefinitions() {
  const data = await gql(`{ metafieldDefinitions(ownerType: PRODUCT, first: 250) { nodes { name namespace key } } }`);
  const found = {};
  for (const d of data.metafieldDefinitions.nodes) {
    const role = PRODUCT_FIELDS[normKey(d.name)];
    if (role) found[role] = { namespace: d.namespace, key: d.key, name: d.name };
  }
  const missing = REQUIRED_ROLES.filter((r) => !found[r]);
  if (missing.length) throw new Error(`Missing product metafield definitions for: ${missing.join(', ')}`);
  return found;
}

async function loadProducts(defs) {
  const roles = Object.keys(defs);
  const idents = roles.map((r) => `{namespace: ${JSON.stringify(defs[r].namespace)}, key: ${JSON.stringify(defs[r].key)}}`).join(', ');
  const q = `query($cursor: String) {
    products(first: 100, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle metafields(identifiers: [${idents}]) { namespace key value } }
    }
  }`;
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(q, { cursor });
    for (const n of data.products.nodes) {
      const values = {};
      for (const m of n.metafields || []) {
        if (!m) continue;
        const role = roles.find((r) => defs[r].namespace === m.namespace && defs[r].key === m.key);
        if (role) values[role] = m.value;
      }
      out.push({ id: n.id, title: n.title, handle: n.handle, values });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

async function loadEntries() {
  const def = await gql(`query($t: String!) { metaobjectDefinitionByType(type: $t) { fieldDefinitions { key } } }`, { t: TYPE });
  if (!def.metaobjectDefinitionByType) throw new Error(`Metaobject definition "${TYPE}" not found`);
  const keys = def.metaobjectDefinitionByType.fieldDefinitions.map((f) => f.key);
  const missing = MO_KEYS.filter((k) => !keys.includes(k));
  if (missing.length) throw new Error(`yarn_batch is missing field keys: ${missing.join(', ')} (has: ${keys.join(', ')})`);

  const q = `query($t: String!, $cursor: String) {
    metaobjects(type: $t, first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle fields { key value } }
    }
  }`;
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(q, { t: TYPE, cursor });
    for (const n of data.metaobjects.nodes) {
      const fields = {};
      for (const f of n.fields) fields[f.key] = f.value;
      out.push({ id: n.id, handle: n.handle, fields });
    }
    if (!data.metaobjects.pageInfo.hasNextPage) break;
    cursor = data.metaobjects.pageInfo.endCursor;
  }
  return out;
}

const slug = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'batch';

async function writeEntry(entry, batch, fields) {
  if (entry) {
    const d = await gql(
      `mutation($id: ID!, $mo: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $mo) { userErrors { field message code } } }`,
      { id: entry.id, mo: { fields } },
    );
    return d.metaobjectUpdate.userErrors;
  }
  const d = await gql(
    `mutation($mo: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $mo) { userErrors { field message code } } }`,
    { mo: { type: TYPE, handle: slug(batch.batchId), fields } },
  );
  return d.metaobjectCreate.userErrors;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const required = process.env.SHOPIFY_ADMIN_TOKEN
    ? ['SHOPIFY_STORE']
    : ['SHOPIFY_STORE', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'];
  for (const v of required) {
    if (!process.env[v]) { console.error(`Missing env var ${v}`); process.exit(2); }
  }
  process.env.SHOPIFY_STORE = process.env.SHOPIFY_STORE.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  console.log(apply ? 'MODE: apply (writing to Shopify)' : 'MODE: dry run (add --apply to write)');
  console.log(`Shop: ${process.env.SHOPIFY_STORE}  Auth: ${process.env.SHOPIFY_ADMIN_TOKEN ? 'fixed admin token' : 'client credentials'}  API: ${API_VERSION}`);

  const defs = await loadProductDefinitions();
  console.log('Product metafields:', Object.entries(defs).map(([r, d]) => `${r}=${d.namespace}.${d.key}`).join('  '));
  const products = await loadProducts(defs);
  const { batches, warnings } = aggregate(products);
  const entries = await loadEntries();
  console.log(`${products.length} active products, ${batches.size} batches from products, ${entries.length} yarn_batch entries`);

  const byBatch = new Map();
  for (const e of entries) {
    const k = normKey(e.fields.batch_id);
    if (!k) continue;
    if (byBatch.has(k)) warnings.push(`Duplicate yarn_batch entries for "${e.fields.batch_id}" (updating the first, check ${e.handle})`);
    else byBatch.set(k, e);
  }

  let created = 0, updated = 0, unchanged = 0, failed = 0;
  for (const [k, batch] of batches) {
    const entry = byBatch.get(k) || null;
    const fields = diffFields(batch, entry);
    const label = `${batch.batchId} | ${batch.kg} kg | ${batch.pieces} pcs | ${batch.products.length} products`;
    if (fields.length === 0) { unchanged++; continue; }
    console.log(`${entry ? 'UPDATE' : 'CREATE'} ${label}  [${fields.map((f) => f.key).join(', ')}]`);
    if (!apply) { entry ? updated++ : created++; continue; }
    const errs = await writeEntry(entry, batch, fields);
    if (errs.length) { failed++; console.error(`  FAILED: ${JSON.stringify(errs)}`); }
    else entry ? updated++ : created++;
  }

  const productBatchKeys = new Set(batches.keys());
  const untouched = entries.filter((e) => !productBatchKeys.has(normKey(e.fields.batch_id)));
  console.log(`\nCreated ${created}, updated ${updated}, unchanged ${unchanged}, failed ${failed}`);
  console.log(`${untouched.length} yarn_batch entries have no active product (history), left untouched`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
