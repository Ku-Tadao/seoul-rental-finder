#!/usr/bin/env node
// Fetches the full detail record of every listing in dabang_rentals.json into dabang_details.jsonl (one JSON per line).
// Re-running resumes. Stops on 403/429 instead of hammering; agent data is dropped here so it never lands on disk twice.
const fs = require('fs');

const HEADERS = { accept: 'application/json, text/plain, */*', csrf: 'token', 'd-api-version': '5.0.0', 'd-app-version': '1', 'd-call-type': 'web', referer: 'https://dabangapp.com/map/apt', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36' };
const OUT = 'dabang_details.jsonl', WORKERS = 2, DELAY_MS = 250;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const done = new Set();
if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).id);
const todo = JSON.parse(fs.readFileSync('dabang_rentals.json', 'utf8')).filter(r => !done.has(r.id)).map(r => r.id);
const out = fs.createWriteStream(OUT, { flags: 'a' });
console.error(`done ${done.size}, todo ${todo.length}`);

let next = 0, ok = 0, gone = 0, stop = false;
async function worker() {
  while (!stop && next < todo.length) {
    const id = todo[next++];
    const res = await fetch(`https://dabangapp.com/api/3/new-room/detail?room_id=${id}&api_version=3.0.1&call_type=web&version=1`, { headers: HEADERS }).catch(e => ({ status: 0, e }));
    if (res.status === 403 || res.status === 429) { stop = true; console.error(`stopped: HTTP ${res.status} after ${ok}`); break; }
    if (res.status === 200) {
      const { room, space, spaces, complex, region, education, image_list, tour_3d } = await res.json();
      out.write(JSON.stringify({ id, room, space, spaces, complex, region, education, image_list, tour_3d }) + '\n');
      if (++ok % 200 === 0) console.error(`${ok} of ${todo.length}`);
    } else { gone++; out.write(JSON.stringify({ id, gone: res.status }) + '\n'); } // sold or removed since the export
    await sleep(DELAY_MS);
  }
}
Promise.all(Array.from({ length: WORKERS }, worker)).then(() => out.end(() => console.log(JSON.stringify({ ok, gone, stopped: stop }))));
