#!/usr/bin/env node
// Every 33m2 listing (logged out): page through the rooms list, then fetch each room's detail with a few requests at once. Appends to 33m2_details.jsonl and skips rooms already there, so a blocked or interrupted run can resume.
const fs = require('fs');
const API = 'https://web.33m2.co.kr/v1/use-auth/rooms';
const OUT = '33m2_details.jsonl';
const WORKERS = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const j = await res.json();
      if (j.code === 'SCSS_001') return j.data;
      last = j.code;
    } catch (e) { last = e.message; }
    await sleep(2000 * (i + 1));
  }
  throw new Error(`${url}: ${last}`);
}

async function main() {
  const ids = new Map(); // rid -> its list row, which carries the current price
  for (let page = 1; ; page++) {
    const { rooms } = await get(`${API}?size=100&sortBy=RECOMMEND&page=${page}`);
    for (const r of rooms.content) ids.set(r.rid, r);
    if (rooms.last || rooms.content.length === 0) break;
    await sleep(500);
  }

  // Keep one whole line per room still listed: a run killed at its time limit can leave a torn last line, and removed rooms would pile up.
  // A room whose price or fee changed is fetched again.
  const have = new Map();
  if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) { try { const d = JSON.parse(l), r = ids.get(d.rid); if (r && r.usingFee === d.usingFee && r.mgmtFee === d.mgmtFee) have.set(d.rid, l); } catch {} }
  fs.writeFileSync(OUT, [...have.values()].map(l => l + '\n').join(''));

  const todo = [...ids.keys()].filter(id => !have.has(id));
  console.error(`${ids.size} listings, ${todo.length} to fetch`);
  let failed = 0, n = 0;
  const worker = async () => {
    while (todo.length) {
      const id = todo.shift();
      try {
        fs.appendFileSync(OUT, JSON.stringify(await get(`${API}/${id}`)) + '\n');
        n++;
        if (n % 200 === 0) console.error(`${n} fetched`);
      } catch (e) {
        failed++;
        console.error(e.message);
      }
      await sleep(300);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log(JSON.stringify({ listings: ids.size, fetched: n, failed }));
}

main().catch(e => { console.error(e.message); process.exit(1); });
