#!/usr/bin/env node
// Rewrites a .jsonl keeping only whole lines whose id is still listed: a run killed at its time limit can leave a torn last line, and removed listings would pile up.
//   node compact_jsonl.js dabang_details.jsonl dabang_rentals.json
const fs = require('fs');
const readline = require('readline');
const [file, idsFile] = process.argv.slice(2);
(async () => {
  if (!fs.existsSync(file) || !fs.existsSync(idsFile)) return;
  const ids = new Set(JSON.parse(fs.readFileSync(idsFile, 'utf8')).map(x => x.id ?? x));
  const out = fs.createWriteStream(file + '.tmp');
  let kept = 0, dropped = 0;
  for await (const l of readline.createInterface({ input: fs.createReadStream(file) })) {
    let id;
    try { id = JSON.parse(l).id; } catch {}
    if (ids.has(id)) { out.write(l + '\n'); kept++; } else dropped++;
  }
  await new Promise(r => out.end(r));
  fs.renameSync(file + '.tmp', file);
  console.log(JSON.stringify({ file, kept, dropped }));
})();
