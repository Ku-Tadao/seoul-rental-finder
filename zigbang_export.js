#!/usr/bin/env node
// Exports Zigbang apartment and officetel rentals around Seoul to zigbang_rentals.jsonl (one JSON per line), same area as the Dabang export.
//   node zigbang_export.js --selftest
// Re-running resumes: ids go to zigbang_ids.json first (rebuilt each run, a few minutes), then details are appended. Stops on 403/429. Agent data is never stored.
const fs = require('fs');
const assert = require('assert');

const HEADERS = { accept: 'application/json', referer: 'https://www.zigbang.com/', zigbangostype: 'web', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36' };
const API = 'https://apis.zigbang.com';
const BBOX = { s: 37.12, w: 126.6, n: 37.8, e: 127.4 }; // bounds of the Dabang export
const IDS = 'zigbang_ids.json', DANJIS = 'zigbang_danjis.json', OUT ='zigbang_rentals.jsonl', WORKERS = 2, DELAY_MS = 250;
const MAX_ID_AGE_MS = 30 * 60e3; // the id pass takes minutes, so every hourly run rebuilds it
const PROVINCES = ['11', '28', '41']; // Seoul, Incheon, Gyeonggi: every district the box touches
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  const res = await fetch(API + path, { headers: HEADERS });
  await sleep(DELAY_MS);
  if (res.status === 403 || res.status === 429) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
  if (!res.ok) return null;
  return res.json();
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(lat, lng, len) {
  let [la, lo] = [[-90, 90], [-180, 180]], bits = 0, out = '', ch = 0, even = true;
  while (out.length < len) {
    const r = even ? lo : la, v = even ? lng : lat, mid = (r[0] + r[1]) / 2;
    ch = ch * 2 + (v >= mid ? 1 : 0);
    if (v >= mid) r[0] = mid; else r[1] = mid;
    even = !even;
    if (++bits === 5) { out += BASE32[ch]; bits = 0; ch = 0; }
  }
  return out;
}
// 5-character cells are about 4.9 × 4.9 km, small enough that no response is cut off.
function cells({ s, w, n, e }) {
  const out = new Set();
  for (let lat = s; lat <= n + 0.02; lat += 0.02) for (let lng = w; lng <= e + 0.02; lng += 0.02) out.add(geohash(lat, lng, 5));
  return [...out];
}

async function collectIds() {
  if (fs.existsSync(IDS) && Date.now() - fs.statSync(IDS).mtimeMs < MAX_ID_AGE_MS) return JSON.parse(fs.readFileSync(IDS, 'utf8'));
  const ids = new Set(), list = cells(BBOX);
  const inBox = o => o.lat >= BBOX.s && o.lat <= BBOX.n && o.lng >= BBOX.w && o.lng <= BBOX.e;
  for (const [i, c] of list.entries()) {
    const off = await get(`/house/property/v1/items/officetels?geohash=${c}&salesPriceMin=0&depositMin=0&rentMin=0`);
    for (const it of off?.items ?? []) if (inBox(it)) ids.add(it.id);
    if (i % 50 === 0) console.error(`cell ${i} of ${list.length}: ${ids.size} officetels`);
  }
  // Apartments come a whole district at a time (the site's own district list, 20 per page at most), grouped by complex.
  const itemsOf = new Map();
  for (const p of PROVINCES) for (const { code } of (await get(`/apt/locals/local2?code=${p}`))?.results ?? []) {
    for (let offset = 0; ; offset += 20) {
      const r = await get(`/apt/locals/${code}/item-catalogs?tranTypeIn=rental&tranTypeIn=charter&offset=${offset}&limit=20`);
      if (!r) throw new Error(`district ${code} failed at ${offset}`); // a partial list would drop live listings
      for (const it of r.list) for (const x of it.itemIdList ?? []) if (x.itemSource === 'zigbang') {
        if (!itemsOf.has(it.areaDanjiId)) itemsOf.set(it.areaDanjiId, new Set());
        itemsOf.get(it.areaDanjiId).add(x.itemId);
      }
      if (offset + 20 >= r.count) break;
    }
  }
  // Item details don't name their complex, so complexes are kept alongside; their details are cached across runs since they barely change. The office phone is left out.
  const cached = new Map(fs.existsSync(DANJIS) ? JSON.parse(fs.readFileSync(DANJIS, 'utf8')).filter(d => d.lat != null).map(d => [d.id, d]) : []);
  const out = [];
  let fetched = 0;
  for (const [id, items] of itemsOf) {
    let d = cached.get(id);
    if (!d) {
      const x = await get(`/apt/danjis/${id}`);
      if (!x) continue;
      d = { id, name: x.name, approve: x.사용승인일, households: x.총세대수, buildings: x.총동수, topFloor: x.최고층수, parking: x.가구당주차대수, heating: x.난방방식, road: x.roadAddress, lat: x.lat, lng: x.lng };
      if (++fetched % 200 === 0) console.error(`${fetched} new complexes`);
    }
    // Complexes outside the box stay in the file with no items, so they aren't looked up again.
    d = { ...d, items: inBox(d) ? [...items] : [] };
    out.push(d);
    if (inBox(d)) for (const i of items) ids.add(i);
    // A first run looks up thousands of complexes and can hit the time limit: keep what it found so the next run carries on.
    if (!cached.has(id)) { cached.set(id, d); if (fetched % 200 === 0) fs.writeFileSync(DANJIS, JSON.stringify([...cached.values()])); }
  }
  console.error(`${ids.size} ids, ${out.filter(d => d.items.length).length} complexes in the box (${fetched} newly looked up)`);
  fs.writeFileSync(DANJIS, JSON.stringify(out));
  const arr = [...ids];
  fs.writeFileSync(IDS, JSON.stringify(arr));
  return arr;
}

async function fetchDetails(ids) {
  const done = new Set();
  if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).id);
  const todo = ids.filter(id => !done.has(id)), out = fs.createWriteStream(OUT, { flags: 'a' });
  console.error(`details: done ${done.size}, todo ${todo.length}`);
  let next = 0, ok = 0, skipped = 0, stop = null;
  const worker = async () => {
    while (!stop && next < todo.length) {
      const id = todo[next++];
      const d = await get(`/v3/items/${id}?version=&domain=zigbang`).catch(e => { stop = e; return undefined; });
      if (d === undefined) break;
      // Sales are kept out here: the officetel search can't exclude them.
      if (d?.item && d.item.salesType !== '매매') { const { item, danji, subways, tags } = d; out.write(JSON.stringify({ id, item, danji, subways, tags }) + '\n'); if (++ok % 200 === 0) console.error(`${ok} of ${todo.length}`); }
      else { skipped++; out.write(JSON.stringify({ id, skip: d?.item?.salesType ?? 'gone' }) + '\n'); }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  await new Promise(r => out.end(r));
  if (stop) throw stop;
  console.log(JSON.stringify({ ok, skipped }));
}

if (process.argv.includes('--selftest')) {
  assert.strictEqual(geohash(37.5116, 127.0354, 5), 'wydm6');
  assert.strictEqual(geohash(37.5630, 126.9897, 4), 'wydm');
  const c = cells({ s: 37.5, w: 127, n: 37.52, e: 127.02 });
  assert.ok(c.includes(geohash(37.51, 127.01, 5)));
  console.log('selftest ok');
} else collectIds().then(fetchDetails).catch(e => { console.error(e.message); process.exit(1); });
