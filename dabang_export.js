#!/usr/bin/env node
// Export Dabang (dabangapp.com) apartment listings to JSON, using the same API as the website's map.
//   node dabang_export.js --types LEASE,MONTHLY_RENT --deposit-max 30000 --rent-max 150 --limit 50
//   node dabang_export.js --count           (how many listings match, no export)
// Prices are in 만원 (10,000 KRW). Re-running with the same --out resumes and skips listings already saved.
const fs = require('fs');
const assert = require('assert');

const HEADERS = { accept: 'application/json, text/plain, */*', csrf: 'token', 'd-api-version': '5.0.0', 'd-app-version': '1', 'd-call-type': 'web', referer: 'https://dabangapp.com/map/apt', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36' };
const DELAY_MS = 1100;
// The API caps total at 10000 and rejects page 417+, so bigger areas get split into quadrants.
const MAX_RESULTS = 9000;
const SELLING = { 0: '월세', 1: '전세', 2: '매매' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const qs = o => new URLSearchParams(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]))).toString();

async function get(path) {
  const res = await fetch('https://dabangapp.com' + path, { headers: HEADERS });
  const text = await res.text();
  await sleep(DELAY_MS);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${path.slice(0, 80)}`), { status: res.status });
  return JSON.parse(text);
}
// Enrichment is optional per listing: one failing endpoint shouldn't lose the record.
const tryGet = (path, pick = j => j.result) => get(path).then(pick).catch(e => ({ error: e.message }));

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    a[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : (i++, next);
  }
  return a;
}

function buildFilters(a) {
  const range = (lo, hi) => ({ min: Number(a[lo] ?? 0), max: Number(a[hi] ?? 999999) });
  return {
    sellingTypeList: (a.types || 'MONTHLY_RENT,LEASE,SELL').split(','),
    tradeRange: range('sale-min', 'sale-max'),
    depositRange: range('deposit-min', 'deposit-max'),
    priceRange: range('rent-min', 'rent-max'),
    isIncludeMaintenance: false,
    pyeongRange: range('pyeong-min', 'pyeong-max'),
    useApprovalDateRange: range('age-min', 'age-max'), // building age in whole years
    dealTypeList: ['AGENT'],
    parkingNumRange: { min: 0, max: 999999 },
    isShortLease: false,
    // Each category's endpoint 400s on the other's filter fields.
    ...(category === 'officetel'
      ? { canParking: false, hasElevator: false, hasPano: false }
      : { householdNumRange: { min: 0, max: 999999 }, hasTakeTenant: false }),
    roomCountList: (a.rooms || 'ONE_ROOM,TWO_ROOM,THREE_ROOM,FOUR_ROOM').split(','),
  };
}

function parseBbox(s) {
  const [a, b, c, d] = s.split(',').map(Number);
  return { sw: { lat: a, lng: b }, ne: { lat: c, lng: d } };
}

function quadrants({ sw, ne }) {
  const lat = (sw.lat + ne.lat) / 2, lng = (sw.lng + ne.lng) / 2;
  return [
    { sw, ne: { lat, lng } },
    { sw: { lat, lng: sw.lng }, ne: { lat: ne.lat, lng } },
    { sw: { lat: sw.lat, lng }, ne: { lat, lng: ne.lng } },
    { sw: { lat, lng }, ne },
  ];
}

let category = 'apt'; // or officetel, set by --category
const listPage = (filters, bbox, page) => get(`/api/v5/room-list/category/${category}/bbox?${qs({ filters, bbox, zoom: 13, useMap: 'naver', page })}`).then(j => j.result);

// Yields every listing in the box, splitting areas the API can't page through.
async function* walk(filters, bbox) {
  const first = await listPage(filters, bbox, 1);
  if (first.total > MAX_RESULTS) {
    for (const q of quadrants(bbox)) yield* walk(filters, q);
    return;
  }
  yield* first.roomList;
  let r = first;
  while (r.hasMore) {
    r = await listPage(filters, bbox, r.page + 1);
    yield* r.roomList;
  }
}

// One readable block per listing; the untouched API responses stay alongside it.
function summarize(list, d) {
  const room = d.room, [first, second] = room.price_info?.[0] ?? [];
  const type = room.selling_type;
  const agent = d.agent ?? {};
  return {
    type: SELLING[type] ?? type,
    price_title: room.price_title,
    deposit_manwon: type === 2 ? null : first,
    monthly_rent_manwon: type === 0 ? second : null,
    sale_price_manwon: type === 2 ? first : null,
    maintenance_won: room.maintenance_cost ?? null,
    maintenance_text: room.maintenance_cost_str,
    title: room.title,
    description: room.memo,
    complex: d.complex?.complex_name ?? list.complexName,
    complex_id: room.complex_id,
    address_jibun: room.full_jibun_address_str,
    address_road: room.full_road_address_str,
    region: d.region?.full_name,
    lat: room.location?.[1],
    lng: room.location?.[0],
    exclusive_m2: room.room_size,
    supply_m2: room.provision_size,
    floor: room.room_floor_str,
    building_floors: room.building_floor_str,
    bedrooms: room.beds_num,
    bathrooms: room.bath_num,
    direction: room.direction_str,
    entrance: room.entrance_type_str,
    heating: room.heating,
    parking: room.parking_str,
    parking_per_household: room.parking_average,
    elevator: room.elevator_str,
    loan: room.loan_str,
    options: (room.room_options ?? []).map(o => o.name),
    tags: room.hash_tags,
    move_in: room.moving_date,
    built: room.building_approval_date_str,
    households: d.complex?.household_num,
    posted: room.saved_time_str,
    views_this_week: room.view_count_a_week,
    is_direct: room.is_direct,
    photos: (d.image_list ?? []).map(i => i.prefix_url + i.id),
    floor_plan: d.space?.layout_image ?? null,
    tour_3d: d.tour_3d?.is_show ? d.tour_3d.url : null,
    agent_office: agent.name,
    agent_name: agent.facename,
    agent_address: agent.address,
    agent_tel: agent.agent_tel,
    contact_phone: d.contact?.show_number,
  };
}

const complexCache = new Map();
async function complexData(complexId, spaceSeq) {
  const key = `${complexId}/${spaceSeq}`;
  if (complexCache.has(key)) return complexCache.get(key);
  // The API rejects windows longer than 35 months.
  const to = new Date(), from = new Date(to.getFullYear(), to.getMonth() - 35);
  const ym = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const history = async type => {
    const rows = [];
    for (let page = 1; ; page++) {
      const r = await tryGet(`/api/v5/real-price/complex/histories?${qs({ complexId, spaceSeq, fromDate: ym(from), toDate: ym(to), searchType: type, page, limit: 50 })}`);
      if (r.error) return r;
      rows.push(...r.list);
      if (!r.hasMore) return { list: rows };
    }
  };
  const data = {
    real_price_charts: await tryGet(`/api/v5/real-price/complex/charts?${qs({ complexId, spaceSeq })}`),
    real_price_sales: await history('SALE'),
    real_price_jeonse: await history('LEASE'),
    pet_places: await tryGet(`/api/v5/pet-places?${qs({ complexId })}`),
    resident_posts: await tryGet(`/api/v5/complex-posts/overview?${qs({ complexId })}`),
  };
  complexCache.set(key, data);
  return data;
}

async function enrich(list, level) {
  const id = list.id;
  const record = { id, seq: list.seq, category, url: `https://dabangapp.com/room/${id}`, list };
  if (level === 'list') return record;
  const detail = await get(`/api/3/new-room/detail?${qs({ room_id: id, api_version: '3.0.1', call_type: 'web', version: 1 })}`);
  record.summary = summarize(list, detail);
  record.detail = detail;
  if (level === 'detail') return record;
  record.nearby = await tryGet(`/api/v5/room/${id}/near`);
  record.transit = await tryGet(`/api/v5/transit/near/room?${qs({ roomId: id })}`);
  record.car_share = await tryGet(`/api/v5/public-data/room/car-share-zone?${qs({ roomId: id })}`);
  if (detail.room.complex_id) record.complex_data = await complexData(detail.room.complex_id, detail.space?.space_seq);
  return record;
}

function selftest() {
  assert.deepStrictEqual(parseArgs(['--limit', '5', '--count', '--types', 'LEASE']), { limit: '5', count: true, types: 'LEASE' });
  const q = quadrants({ sw: { lat: 0, lng: 0 }, ne: { lat: 2, lng: 4 } });
  assert.deepStrictEqual(q[0], { sw: { lat: 0, lng: 0 }, ne: { lat: 1, lng: 2 } });
  assert.deepStrictEqual(q[3], { sw: { lat: 1, lng: 2 }, ne: { lat: 2, lng: 4 } });
  const s = t => summarize({}, { room: { selling_type: t, price_info: [[5000, 200, t]], location: [127, 37] } });
  assert.deepStrictEqual([s(0).deposit_manwon, s(0).monthly_rent_manwon, s(0).sale_price_manwon], [5000, 200, null]);
  assert.deepStrictEqual([s(1).deposit_manwon, s(1).monthly_rent_manwon], [5000, null]);
  assert.deepStrictEqual([s(2).deposit_manwon, s(2).sale_price_manwon, s(2).lat], [null, 5000, 37]);
  console.log('selftest ok');
}

// Search results don't carry building age, but the search can filter by it: walk one age at a time for id -> age.
async function writeAges(a, bbox) {
  const out = a.out || 'dabang_ages.json', OLDEST = 41; // 41 means 41 or older
  const state = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { done: [], ages: {} };
  for (const c of ['apt', 'officetel']) {
    category = c;
    for (let age = 0; age <= OLDEST; age++) {
      const band = `${c}:${age}`;
      if (state.done.includes(band)) continue;
      const filters = buildFilters({ ...a, 'age-min': age, 'age-max': age === OLDEST ? 999999 : age });
      let n = 0;
      for await (const list of walk(filters, bbox)) { state.ages[list.id] = age; n++; }
      state.done.push(band);
      fs.writeFileSync(out + '.tmp', JSON.stringify(state));
      fs.renameSync(out + '.tmp', out);
      console.error(`${band} ${n} (total ${Object.keys(state.ages).length})`);
    }
  }
  console.log(JSON.stringify({ out, listings: Object.keys(state.ages).length }));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.selftest) return selftest();
  category = a.category || category;
  const filters = buildFilters(a);
  const bbox = parseBbox(a.bbox || '37.3386669,126.7693355,37.654093,127.3172787');

  if (a.count) {
    const r = await listPage(filters, bbox, 1);
    console.log(JSON.stringify({ total: r.total, capped: r.total >= 10000 }));
    return;
  }

  if (a.ages) return writeAges(a, bbox);

  const out = a.out || 'dabang_listings.json', level = a.level || 'full', limit = Number(a.limit ?? Infinity);
  const saved = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const seen = new Set(saved.map(r => r.id));
  const save = () => { fs.writeFileSync(out + '.tmp', JSON.stringify(saved, null, 2)); fs.renameSync(out + '.tmp', out); };
  let added = 0, lastSave = Date.now();
  try {
    for await (const list of walk(filters, bbox)) {
      if (added >= limit) break;
      if (seen.has(list.id)) continue;
      seen.add(list.id);
      try {
        saved.push(await enrich(list, level));
        added++;
      } catch (e) {
        // A listing can vanish between list and detail; throttling (403/429) should stop the run instead.
        if (e.status === 403 || e.status === 429) throw e;
        console.error(`skip ${list.id}: ${e.message}`);
      }
      if (Date.now() - lastSave > 60000) { save(); lastSave = Date.now(); }
      console.error(`${added} ${list.complexName ?? ''} ${list.priceTitle}`);
    }
  } finally {
    save();
    console.log(JSON.stringify({ out, added, total_in_file: saved.length }));
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
