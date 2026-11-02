#!/usr/bin/env node
// Builds _site from the local template and the live site's data, so the design can be worked on without any scraped data.
//   node preview.js   then serve _site. Re-run after editing the template; shards already downloaded are kept.
const fs = require('fs');
const LIVE = 'https://ku-tadao.github.io/seoul-rental-finder/';
const get = async path => { const r = await fetch(LIVE + path); if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`); return r.text(); };
(async () => {
  const template = fs.readFileSync('dabang_finder.template.html', 'utf8');
  const [pre, post] = template.split('\n').find(l => l.includes('__DATA__')).trim().split('__DATA__');
  const line = (await get('?v=' + Date.now())).split('\n').map(l => l.trim()).find(l => l.startsWith(pre));
  const data = line.slice(pre.length, line.length - post.length);
  fs.mkdirSync('_site/data/d', { recursive: true });
  const names = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
  for (let i = 0; i < names.length; i += 16) await Promise.all(names.slice(i, i + 16).map(async n => {
    const f = `_site/data/d/${n}.json`;
    if (!fs.existsSync(f)) fs.writeFileSync(f, await get(`data/d/${n}.json`).catch(() => '{}'));
  }));
  // The live site may predate these fields; the real build sets them itself.
  const d = JSON.parse(data), shards = {};
  const shardOf = key => { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) & 255; return h.toString(16).padStart(2, '0'); };
  for (const r of d.rows) if (r[24] === undefined) {
    const s = shardOf(r[0]);
    const o = (shards[s] ??= JSON.parse(fs.readFileSync(`_site/data/d/${s}.json`, 'utf8')))[r[0]];
    r[24] = o?.lat ?? null; r[25] = o?.lng ?? null;
  }
  d.stationAt ??= JSON.parse(fs.readFileSync('zigbang_subway.json', 'utf8')).filter(s => s.subway_area === '수도권' && s.lat).map(s => [s.lat, s.lng]);
  fs.writeFileSync('_site/index.html', template.replace('__DATA__', () => JSON.stringify(d).replace(/</g, '\\u003c')));
  console.log(`_site ready, ${d.rows.length} listings`);
})();
