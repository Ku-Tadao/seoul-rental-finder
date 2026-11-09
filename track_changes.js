#!/usr/bin/env node
// Notes what changed since the last run: new listings, and price or maintenance changes (from → to). Kept in changes.json, read by the site build.
//   node track_changes.js [--selftest]
// Log entries: [time in s, 'n'] for a new listing, [time, [deposit, rent, fee], [deposit, rent, fee]] for a change, in 만원 (33m2: rent and fee a week).
const fs = require('fs');
const assert = require('assert');
const { parseListing } = require('./dabang_build_finder.js');

const OUT = 'changes.json', KEEP_S = 30 * 86400, KEEP_N = 20;
const read = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const jsonl = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } }) : []);
const man = won => (won == null ? null : won / 1e4);

// Each site's live listings (null when its file is missing, so nothing is dropped) and today's price where known.
function snapshot() {
  const live = { d: null, z: null, m: null }, price = new Map();
  const dabang = read('dabang_rentals.json');
  if (dabang) {
    live.d = new Set(dabang.map(r => 'd:' + r.id));
    for (const r of dabang) try { const l = parseListing(r.list); price.set('d:' + r.id, [l.deposit, l.rent, l.fee]); } catch {}
  }
  const zids = read('zigbang_ids.json');
  if (zids) live.z = new Set(zids.map(id => 'z:' + id));
  for (const z of jsonl('zigbang_rentals.jsonl')) if (z.item?.price) price.set('z:' + z.id, [z.item.price.deposit ?? 0, z.item.price.rent ?? 0, z.item.manageCost?.amount ?? null]);
  if (fs.existsSync('33m2_details.jsonl')) {
    live.m = new Set();
    for (const d of jsonl('33m2_details.jsonl')) { live.m.add('m:' + d.rid); price.set('m:' + d.rid, [man(d.deposit), man(d.usingFee), man(d.mgmtFee)]); }
  }
  return { live, price };
}

function track(st, { live, price }, t) {
  const add = (k, e) => (st.log[k] ??= []).push(e);
  for (const [site, keys] of Object.entries(live)) {
    if (!keys) continue;
    const mine = Object.keys(st.seen).filter(k => k[0] === site), first = !mine.length; // a site's first run sets the baseline: nothing is new yet
    for (const k of mine) if (!keys.has(k)) { delete st.seen[k]; delete st.p[k]; delete st.log[k]; }
    for (const k of keys) if (!(k in st.seen)) { st.seen[k] = t; if (!first) add(k, [t, 'n']); }
  }
  for (const [k, p] of price) {
    if (!(k in st.seen)) continue;
    const o = st.p[k];
    if (o && o.some((v, i) => v !== p[i])) add(k, [t, o, p]);
    st.p[k] = p;
  }
  for (const [k, l] of Object.entries(st.log)) {
    const kept = l.filter(e => e[0] > t - KEEP_S).slice(-KEEP_N);
    if (kept.length) st.log[k] = kept; else delete st.log[k];
  }
  return st;
}

if (process.argv.includes('--selftest')) {
  const st = { seen: {}, p: {}, log: {} };
  track(st, { live: { d: new Set(['d:1', 'd:2']), z: null, m: null }, price: new Map([['d:1', [500, 50, 7]], ['d:2', [500, 60, 7]]]) }, 100);
  assert.deepStrictEqual(st.log, {}); // baseline
  track(st, { live: { d: new Set(['d:1', 'd:3']), z: new Set(['z:9']), m: null }, price: new Map([['d:1', [500, 45, 7]], ['d:3', [100, 40, null]], ['x:5', [1, 1, 1]]]) }, 200);
  assert.deepStrictEqual(st.log, { 'd:1': [[200, [500, 50, 7], [500, 45, 7]]], 'd:3': [[200, 'n']] });
  assert.ok(!('d:2' in st.seen) && !('x:5' in st.p) && st.seen['z:9'] === 200); // removed gone, unknown ignored, Zigbang's first run is a baseline
  track(st, { live: { d: new Set(['d:1', 'd:3']), z: null, m: null }, price: new Map() }, 200 + KEEP_S + 1);
  assert.deepStrictEqual(st.log, {}); // aged out
  console.log('selftest ok');
} else {
  const t = Math.round(Date.now() / 1000);
  const st = track(read(OUT) ?? { seen: {}, p: {}, log: {} }, snapshot(), t);
  fs.writeFileSync(OUT, JSON.stringify(st));
  console.log(JSON.stringify({ tracked: Object.keys(st.seen).length, changedNow: Object.values(st.log).filter(l => l.at(-1)[0] === t).length }));
}
