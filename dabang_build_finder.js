#!/usr/bin/env node
// Builds the finder site from the Dabang and Zigbang exports: index.html plus per-listing detail shards in data/d/. Run with --selftest for parser checks.
const fs = require('fs');
const assert = require('assert');

const YEAR = 2026;
const APT_USABLE_RATIO = 0.77; // only for the few listings with no exclusive area: median exclusive/supply area from 30 apartment detail pages
const SITE = '_site';
const AGE_PENALTY = 30; // % per 10 years of building age; a preference, adjustable on the page

const NAMES = {
  서울시: 'Seoul', 서울특별시: 'Seoul', 인천시: 'Incheon', 인천광역시: 'Incheon', 경기도: 'Gyeonggi',
  검단구: 'Geomdan', 서해구: 'Seohae', 제물포구: 'Jemulpo', 영종구: 'Yeongjong',
  종로구: 'Jongno', 중구: 'Jung', 용산구: 'Yongsan', 성동구: 'Seongdong', 광진구: 'Gwangjin', 동대문구: 'Dongdaemun', 중랑구: 'Jungnang', 성북구: 'Seongbuk', 강북구: 'Gangbuk', 도봉구: 'Dobong', 노원구: 'Nowon', 은평구: 'Eunpyeong', 서대문구: 'Seodaemun', 마포구: 'Mapo', 양천구: 'Yangcheon', 강서구: 'Gangseo', 구로구: 'Guro', 금천구: 'Geumcheon', 영등포구: 'Yeongdeungpo', 동작구: 'Dongjak', 관악구: 'Gwanak', 서초구: 'Seocho', 강남구: 'Gangnam', 송파구: 'Songpa', 강동구: 'Gangdong',
  동구: 'Dong', 미추홀구: 'Michuhol', 연수구: 'Yeonsu', 남동구: 'Namdong', 부평구: 'Bupyeong', 계양구: 'Gyeyang', 서구: 'Seo', 강화군: 'Ganghwa',
  수원시: 'Suwon', 성남시: 'Seongnam', 의정부시: 'Uijeongbu', 안양시: 'Anyang', 부천시: 'Bucheon', 광명시: 'Gwangmyeong', 평택시: 'Pyeongtaek', 동두천시: 'Dongducheon', 안산시: 'Ansan', 고양시: 'Goyang', 과천시: 'Gwacheon', 구리시: 'Guri', 남양주시: 'Namyangju', 오산시: 'Osan', 시흥시: 'Siheung', 군포시: 'Gunpo', 의왕시: 'Uiwang', 하남시: 'Hanam', 용인시: 'Yongin', 파주시: 'Paju', 이천시: 'Icheon', 안성시: 'Anseong', 김포시: 'Gimpo', 화성시: 'Hwaseong', 광주시: 'Gwangju', 양주시: 'Yangju', 포천시: 'Pocheon', 여주시: 'Yeoju', 연천군: 'Yeoncheon', 가평군: 'Gapyeong', 양평군: 'Yangpyeong',
};

// "4억1000" -> 41000, "4억" -> 40000, "9000" -> 9000 (만원)
function money(s) {
  const m = s.replace(/,/g, '').match(/^(?:(\d+)억)?(\d+)?$/);
  if (!m || (!m[1] && !m[2])) throw new Error('bad money: ' + s);
  return Number(m[1] ?? 0) * 10000 + Number(m[2] ?? 0);
}

// Rent for one room or a split-off part of a unit, but the size is still the whole unit, so these rank falsely high.
// ponytail: this loose rule only reads titles; descriptions get just the unambiguous phrase, and a one-room apartment of 70 m² or more is almost always a split unit
const PARTIAL = /방\s*(1|한)\s*(개|칸)(?!\s*(확장|더|추가))|분리형\s*원룸|세대\s*(별도\s*)?분리|주인\s*세대|주인과\s*함께|부분\s*임대|쉐어|셰어|룸메|하숙/;
const isPartial = r => PARTIAL.test(r.title) || /세대\s*분리형/.test(r.detail?.memo ?? '') || (!r.cat && r.beds === 1 && r.m2 >= 70);
// A jeonse under 100만원 is a typo: one Zigbang listing gave "11" for 11억. The next lowest real one is 2000만원 and up.
const mistyped = r => !r.monthly && r.deposit < 100;

function parseListing(l) {
  const [deposit, rent = '0'] = l.priceTitle.split('/');
  const [floor, size, fee] = l.roomDesc.split(', ');
  const feeText = fee.replace('관리비 ', '');
  return {
    deposit: money(deposit),
    rent: money(rent),
    floor,
    m2: parseFloat(size),
    // null = the listing says it can't be determined; "없음" = none
    fee: feeText === '확인 불가' ? null : feeText === '없음' ? 0 : parseFloat(feeText.replace(/,/g, '').replace('만', '')),
  };
}

// Market rate implied by jeonse and monthly offers for the same complex and size: rent×12 ÷ (jeonse − deposit)
function impliedRate(rows) {
  const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];
  const jeonse = new Map();
  for (const r of rows) if (!r.monthly) { const k = r.complex + '|' + r.m2; if (!jeonse.has(k)) jeonse.set(k, []); jeonse.get(k).push(r.deposit); }
  const rates = [];
  for (const r of rows) {
    if (!r.monthly) continue;
    const list = jeonse.get(r.complex + '|' + r.m2);
    if (!list) continue;
    const j = median(list);
    if (j > r.deposit && r.rent > 0) rates.push((r.rent * 12) / (j - r.deposit) * 100);
  }
  return { rate: median(rates), pairs: rates.length };
}

// Listings are published without agent details, so contact details typed into free text go too.
const scrub = s => (s ?? '')
  .replace(/(?:\+?82[-. ]?)?0?1[016789][-. )]*\d{3,4}[-. ]*\d{4}|\b0\d{1,2}[-. )]+\d{3,4}[-. ]+\d{4}|\b1[0-9]{3}-\d{4}\b/g, '[phone removed]')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email removed]')
  .replace(/https?:\/\/\S+|\bwww\.\S+/g, '[link removed]')
  .replace(/(카톡|카카오톡|카카오|kakao|오픈채팅)\s*(아이디|id|ID)?\s*[:：]\s*\S+/gi, '[contact removed]');

// "2019. 8", "20071129", "1987.08.24" -> years since; null when unknown
const ageFrom = (d, year = YEAR) => { const m = String(d ?? '').match(/^(19|20)\d\d/); return m ? Math.max(0, year - Number(m[0])) : null; };

// Same function in the page's script: which detail file holds a listing.
const shard = key => { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) & 255; return h.toString(16).padStart(2, '0'); };

function nearestStation(lat, lng, stations) {
  let best = null, bestM = Infinity;
  const k = Math.cos(lat * Math.PI / 180);
  stations.forEach((st, i) => {
    const m = Math.hypot((st.lat - lat) * 111320, (st.lng - lng) * 111320 * k);
    if (m < bestM) { bestM = m; best = i; }
  });
  return [Math.round(bestM), best];
}

const zigFloor = f => /^\d+$/.test(f ?? '') ? f + '층' : ({ 저: '저층', 중: '중층', 고: '고층' })[f] ?? f ?? '-';
const zigBeds = t => /쓰리|3/.test(t ?? '') ? 3 : /투룸|2/.test(t ?? '') ? 2 : /원룸|1/.test(t ?? '') ? 1 : null;
// Some apartment image URLs come doubled: https://ic.zigbang.com/ichttps://ic.zigbang.com/ic/...
const zigImg = u => u ? 'https://' + u.split('https://').pop() : null;

function selftest() {
  assert.strictEqual(scrub('전화 010-9075-1987 또는 01090751987 / 02-123-4567'), '전화 [phone removed] 또는 [phone removed] / [phone removed]');
  assert.strictEqual(scrub('카톡 아이디 : ji1987 메일 a.b@naver.com'), '[contact removed] 메일 [email removed]');
  assert.strictEqual(scrub('방3개, 84.73m², 2026.12.17 이후, 보증금 5000/50'), '방3개, 84.73m², 2026.12.17 이후, 보증금 5000/50');
  assert.deepStrictEqual([ageFrom('2019. 8'), ageFrom('20071129'), ageFrom('1987.08.24'), ageFrom(''), ageFrom(null)], [7, 19, 39, null, null]);
  assert.strictEqual(shard('d:abc').length, 2);
  assert.strictEqual(zigImg('https://ic.zigbang.com/ichttps://ic.zigbang.com/ic/x/y'), 'https://ic.zigbang.com/ic/x/y');
  assert.deepStrictEqual([zigFloor('6'), zigFloor('중'), zigBeds('투룸'), zigBeds('오픈형원룸'), zigBeds('쓰리룸+'), zigBeds(undefined)], ['6층', '중층', 2, 1, 3, null]);
  assert.deepStrictEqual(nearestStation(37.5, 127, [{ lat: 37.6, lng: 127 }, { lat: 37.501, lng: 127 }]), [111, 1]);
  const row = (key, lat, fee = 10) => ({ key, lat, lng: 127, monthly: true, deposit: 100, rent: 50, m2: 30, fee, reg: 0, cat: 0, detail: { link: [key, 'u'], imgs: [] } });
  const dd = dedupe([row('d:1', 37.5), row('z:1', 37.5), row('z:2', 37.5), row('d:2', 37.6)]);
  assert.deepStrictEqual(dd.map(r => r.key), ['d:1', 'd:2']);
  assert.deepStrictEqual(dd[0].also, ['z:2', 'u']);
  const fees = [row('a', 37, 30), row('b', 37, null)];
  estimateFees(fees);
  assert.deepStrictEqual([fees[1].fee, fees[1].feeEst], [30, true]);
  assert.deepStrictEqual([moneyText(41000), moneyText(40000), moneyText(9000)], ['4억1000', '4억', '9000']);
  assert.strictEqual(money('4억1000'), 41000);
  assert.strictEqual(money('4억'), 40000);
  assert.strictEqual(money('9000'), 9000);
  assert.strictEqual(money('1,000'), 1000);
  assert.throws(() => money('abc'));
  const a = parseListing({ priceTitle: '5억/300', roomDesc: '9층, 109.76m², 관리비 18만' });
  assert.deepStrictEqual(a, { deposit: 50000, rent: 300, floor: '9층', m2: 109.76, fee: 18 });
  assert.strictEqual(parseListing({ priceTitle: '4억', roomDesc: '고층, 80m², 관리비 없음' }).fee, 0);
  assert.strictEqual(parseListing({ priceTitle: '4억', roomDesc: '고층, 80m², 관리비 확인 불가' }).fee, null);
  assert.strictEqual(parseListing({ priceTitle: '100/50', roomDesc: '고층, 80m², 관리비 1,000만' }).fee, 1000);
  const { rate } = impliedRate([
    { monthly: false, complex: 'A', m2: 80, deposit: 30000, rent: 0 },
    { monthly: true, complex: 'A', m2: 80, deposit: 10000, rent: 100 }, // 1200/20000 = 6%
    { monthly: true, complex: 'B', m2: 80, deposit: 10000, rent: 999 }, // no jeonse pair, ignored
  ]);
  assert.strictEqual(rate, 6);
  for (const t of ['방1개쓰실분,여성분우대', 'M. 아파트34평 방1칸 사용', '세대 별도 분리형 원룸', '방 1개만 사용할 시 가격임', '전용25 주인세대와 분리']) assert.ok(PARTIAL.test(t), t);
  for (const t of ['거실.방1칸 확장, 올수리', '방3개,욕실2개', '일부수리 깨끗', '방1,거실']) assert.ok(!PARTIAL.test(t), t);
  assert.ok(isPartial({ title: '깨끗함', cat: 0, beds: 3, m2: 84, detail: { memo: '세대분리형 원룸 (26㎡)' } }));
  assert.ok(isPartial({ title: '깨끗함', cat: 0, beds: 1, m2: 84.99 }));
  assert.ok(!isPartial({ title: '깨끗함', cat: 1, beds: 1, m2: 84.99, detail: { memo: '카셰어링 가능' } }));
  assert.deepStrictEqual([mistyped({ monthly: false, deposit: 11 }), mistyped({ monthly: false, deposit: 2000 }), mistyped({ monthly: true, deposit: 0 })], [true, false, false]);
  console.log('selftest ok');
}

const readJsonl = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const moneyText = v => (v >= 10000 ? Math.floor(v / 10000) + '억' : '') + (v % 10000 || v < 10000 ? v % 10000 : '');
const clean = pairs => pairs.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '-');
const metres = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m';
const DIRECTIONS = { N: '북', S: '남', E: '동', W: '서', NE: '북동', NW: '북서', SE: '남동', SW: '남서' };
const POI = { 지하철역: 'Subway', 버스정류장: 'Bus stop', 편의점: 'Convenience store', 카페: 'Cafe', 약국: 'Pharmacy', 세탁소: 'Dry cleaner', 대형마트: 'Supermarket', 은행: 'Bank', 병원: 'Hospital', 공원: 'Park' };

function fromDabang(d, l, category) {
  const { room: r, space, complex, education, image_list } = d;
  const { deposit, rent, floor, m2: listed, fee } = parseListing(l);
  const exact = r.room_size > 0;
  const m2 = exact ? r.room_size : category === 'officetel' ? listed : Math.round(listed * APT_USABLE_RATIO * 100) / 100;
  const [lng, lat] = r.location;
  const schools = Object.values(education ?? {}).flat().filter(s => s?.name && s.distance != null && /학교/.test(s.name));
  return {
    key: 'd:' + d.id, cat: category === 'officetel' ? 1 : 0, monthly: l.priceTypeName === '월세', deposit, rent, fee, m2, sizeEst: !exact, complex: l.complexName, dong: l.dongName, gid: l.gid, floor,
    title: l.roomTitle, short: l.roomTypeName.includes('단기'), lh: !!l.isLhLease, price: l.priceTitle, age: ageFrom(r.building_approval_date_str), photo: l.imgUrlList?.[0]?.split('/').pop() ?? image_list?.[0]?.id ?? null, beds: r.beds_num || null, lat, lng,
    detail: {
      memo: scrub(r.memo), addr: r.full_road_address_str || r.full_jibun_address_str, jibun: r.full_jibun_address_str, lat, lng,
      imgs: (image_list ?? []).map(i => i.prefix_url + i.id),
      facts: clean([
        ['Exclusive size', exact ? r.room_size + ' m²' : null], ['Supply size', r.provision_size ? r.provision_size + ' m²' : null], ['Rooms', r.beds_num], ['Bathrooms', r.bath_num],
        ['Floor', r.building_floor_str ? `${r.room_floor_str} of ${r.building_floor_str}` : r.room_floor_str], ['Facing', r.direction_str], ['Layout', r.entrance_type_str ?? space?.entrance_type_str], ['Heating', r.heating],
        ['Parking', r.parking_average ? `${r.parking_str}, ${r.parking_average} per unit` : r.parking_str], ['Elevator', r.elevator_str], ['Loan', r.loan_str], ['Move in', r.moving_date], ['Maintenance', r.maintenance_cost_str],
        ['Approved', r.building_approval_date_str], ['Households', complex?.household_num ?? r.household_num_str], ['Posted', r.saved_time_str],
      ]),
      opts: (r.room_options ?? []).map(o => o.name), tags: r.hash_tags ?? [],
      near: schools.sort((a, b) => a.distance - b.distance).slice(0, 4).map(s => [s.name, metres(s.distance)]),
      link: ['Dabang', 'https://dabangapp.com/room/' + d.id],
    },
  };
}

function fromZigbang(z, danji) {
  const i = z.item, a = i.addressOrigin ?? {};
  const isApt = i.serviceType === '아파트';
  const { lat, lng } = i.location;
  const dong = a.local3 || '';
  const beds = zigBeds(i.roomType) ?? (Number((i.description ?? '').match(/방\s*([1-6])\s*(?:개|칸|\/|,|\s|$)/)?.[1]) || null);
  const fee = i.manageCost?.amount ?? null;
  const images = (i.images ?? []).map(zigImg).filter(Boolean);
  const jibun = [a.local1, i.jibunAddress].filter(Boolean).join(' ');
  return {
    key: 'z:' + z.id, cat: isApt ? 0 : 1, monthly: i.salesType === '월세', deposit: i.price.deposit ?? 0, rent: i.price.rent ?? 0, fee, m2: i.area.전용면적M2, sizeEst: false,
    complex: danji?.name || (i.jibunAddress ?? '').split(' ').slice(1).join(' ') || dong, dong, region: [a.local1, a.local2], floor: zigFloor(i.floor?.floor),
    title: i.title ?? '', short: false, lh: false, price: moneyText(i.price.deposit ?? 0) + (i.price.rent ? '/' + i.price.rent : ''), age: ageFrom(i.approveDate ?? danji?.approve), photo: images[0]?.replace('https://ic.zigbang.com/', '') ?? null, beds, lat, lng,
    detail: {
      memo: scrub(i.description), addr: danji?.road || jibun, jibun, lat, lng, imgs: images.map(u => u + '?w=1024'), // the image server answers 400 without a size
      facts: clean([
        ['Exclusive size', i.area.전용면적M2 + ' m²'], ['Contract size', i.area.계약면적M2 ? i.area.계약면적M2 + ' m²' : null], ['Rooms', i.roomType ?? beds], ['Bathrooms', i.bathroomCount],
        ['Floor', i.floor?.allFloors ? `${zigFloor(i.floor.floor)} of ${i.floor.allFloors}층` : zigFloor(i.floor?.floor)], ['Facing', DIRECTIONS[i.roomDirection] ?? i.roomDirection], ['Heating', danji?.heating],
        ['Parking', [i.parkingAvailableText, i.parkingCountText].filter(Boolean).join(', ')], ['Elevator', i.elevator === true ? '있음' : i.elevator === false ? '없음' : null], ['Move in', i.moveinDate],
        ['Maintenance', fee != null ? fee + '만원' : null], ['Fee covers', i.manageCost?.includes?.join(', ')], ['Approved', i.approveDate ?? danji?.approve], ['Households', danji?.households], ['Posted', i.updatedAt?.slice(0, 10)],
      ]),
      opts: i.options ?? [], tags: (z.tags ?? []).map(t => t.name ?? t).filter(s => typeof s === 'string'),
      near: (i.neighborhoods?.nearbyPois ?? []).filter(p => p.exists && p.poiType !== '지하철역').sort((x, y) => x.distance - y.distance).map(p => [POI[p.poiType] ?? p.poiType, metres(p.distance)]),
      link: ['Zigbang', `https://www.zigbang.com/home/${isApt ? 'apt' : 'officetel'}/items/${z.id}`],
    },
  };
}

// The same flat advertised on both sites: same spot (about 100 m), deal, price and size. The first stays and links to both.
function dedupe(rows) {
  const seen = new Map(), out = [];
  for (const r of rows) {
    const k = [r.lat.toFixed(3), r.lng.toFixed(3), r.monthly, r.deposit, r.rent, Math.round(r.m2)].join('|');
    const first = seen.get(k);
    if (first && first.key[0] !== r.key[0]) { first.also = r.detail.link; if (!first.detail.imgs.length) first.detail.imgs = r.detail.imgs; continue; }
    if (!first) seen.set(k, r);
    out.push(r);
  }
  return out;
}

// Zigbang gives no maintenance for apartments, and some Dabang listings don't either. Estimate those from the median per m² of the same type in the same district.
function estimateFees(rows) {
  const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
  const perM2 = new Map();
  const add = (k, v) => { if (!perM2.has(k)) perM2.set(k, []); perM2.get(k).push(v); };
  for (const r of rows) if (r.fee > 0) { add(r.reg + '|' + r.cat, r.fee / r.m2); add(String(r.cat), r.fee / r.m2); }
  for (const r of rows) if (r.fee === null) { r.fee = Math.round(r.m2 * med(perM2.get(r.reg + '|' + r.cat) ?? perM2.get(String(r.cat)) ?? [0])); r.feeEst = true; }
}

// 33m2 is the Short term tab, built from 33m2_details.jsonl (see 33m2_export.js). Rows carry its weekly prices in won; the page turns them into a total for the stay and a price per night, week or month.
const won10k = weekly => Math.round(weekly * 52 / 12 / 10000);

function from33m2(d) {
  const pic = d.pictures?.[0] ?? null;
  return {
    key: 'm:' + d.rid, cat: d.propertyType === 'OFFICETEL' ? 1 : 0, deposit: Math.round(d.deposit / 10000), rent: won10k(d.usingFee), fee: won10k(d.mgmtFee), m2: d.squareMeterSize, sizeEst: false, feeEst: false,
    complex: scrub(d.roomName), dong: d.town, region: [d.state, d.province], floor: '', title: scrub(d.roomName), short: false, lh: false, price: `${Math.round(d.deposit / 10000)}/${won10k(d.usingFee)}`, partial: false, age: null,
    photo: pic, beds: d.roomCnt || null, lat: d.lat, lng: d.lng,
    // weekly rent and management fee, one-off cleaning fee (won), minimum weeks, [weeks, % off rent] discounts, rating, reviews, property type
    stay: [d.usingFee, d.mgmtFee ?? 0, d.cleanFee ?? 0, d.minimumContractWeeks || 1, (d.longTermDiscounts ?? []).map(x => [x.weeks, x.discountRate]), d.reviewScore ? +d.reviewScore.toFixed(2) : null, d.reviewList?.length ?? 0, d.propertyType],
    detail: {
      memo: scrub([d.description, d.additionalDescription].filter(Boolean).join('\n\n')), addr: d.addrStreet, jibun: d.addrLot, lat: d.lat, lng: d.lng,
      imgs: (d.pictures ?? []).map(p => 'https://d1pviohoskiraj.cloudfront.net/' + p + '?b=samsamm2&d=720x480'),
      facts: clean([
        ['Rooms', d.roomCnt], ['Bathrooms', d.bathroomCnt], ['Elevator', d.hasElevator ? 'Yes' : 'No'],
        ['Utilities included', [d.includeElectricity && 'electricity', d.includeWater && 'water', d.includeGas && 'gas'].filter(Boolean).join(', ') || 'None'], ['Pets', d.petAllowed ? 'Allowed' : 'Not allowed'],
        ['Parking', { FREE_LEEWAY: 'Free', FREE_FIRST_COME: 'Free, first come first served', PAID: 'Paid', NONE: 'None' }[d.parkingType]],
        ['Cancellation', { SOFT: 'Flexible', MIDDLE: 'Moderate', STRONG: 'Strict' }[d.refundPolicy]], ['Check in early', (d.earlyCheckinDiscounts ?? []).length ? 'Discount for booking ahead' : null],
      ]),
      opts: [...(d.basicOptions ?? []), ...(d.additionalOptions ?? [])].map(o => o.toLowerCase().replace(/_/g, ' ')),
      tags: [], near: [], link: ['33m2', d.roomUrl],
    },
  };
}

// The page is the web/ app's build (npm --prefix web run build) with the data inlined. Its scripts and styles go to _site/assets, shared by both tabs.
function page(data, up) {
  const html = fs.readFileSync('web/dist/index.html', 'utf8');
  assert.ok(html.includes('__DATA__'), 'web/dist/index.html has no __DATA__ placeholder; build web/ first');
  fs.cpSync('web/dist/assets', SITE + '/assets', { recursive: true });
  return html.replaceAll('./assets/', up + 'assets/').replace('__DATA__', () => JSON.stringify(data).replace(/</g, '\\u003c'));
}

function build33m2() {
  const OUT = SITE + '/short', DIR = OUT + '/data/d';
  const rooms = readJsonl('33m2_details.jsonl').map(from33m2);
  assert.ok(rooms.length > 100, `only ${rooms.length} 33m2 rooms, not publishing`);
  const stations = JSON.parse(fs.readFileSync('zigbang_subway.json', 'utf8')).filter(s => s.subway_area === '수도권' && s.lat);
  const regions = [], regionIdx = new Map();
  const regionOf = (province, district) => {
    const prov = NAMES[province] ?? province, dist = (district ?? '?').split(' ')[0];
    const key = prov + ' ' + dist;
    if (!regionIdx.has(key)) { regionIdx.set(key, regions.length); regions.push({ key, province: prov, label: NAMES[dist] ? `${NAMES[dist]} ${dist}` : dist }); }
    return regionIdx.get(key);
  };
  const rows = rooms.map(r => {
    r.reg = regionOf(r.region[0], r.region[1]);
    const [subM, sub] = nearestStation(r.lat, r.lng, stations);
    r.detail.station = [`${stations[sub].name} (${stations[sub].description})`, metres(subM)];
    return [r.key, r.cat, 1, r.deposit, r.rent, r.fee, r.m2, r.complex, r.dong, r.reg, r.floor, r.title, 0, 0, r.price, 0, null, r.photo, 0, 0, r.beds, subM, sub, 0, +r.lat.toFixed(5), +r.lng.toFixed(5), ...r.stay];
  });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const shards = new Map(), log = changeLog();
  for (const r of rooms) { const s = shard(r.key); if (!shards.has(s)) shards.set(s, {}); shards.get(s)[r.key] = { ...r.detail, also: 0, hist: log[r.key] }; }
  for (const [s, o] of shards) fs.writeFileSync(`${DIR}/${s}.json`, JSON.stringify(o));
  const date = new Date(fs.statSync('33m2_details.jsonl').mtime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const foot = `${rows.length.toLocaleString('en-US')} furnished short stays from 33m2, booked by the week. Prices include the long-stay discount for your stay length, the management fee and the one-off cleaning fee, so the price per night, week or month is what you actually pay. The deposit comes back when you leave and isn't counted. Usable size is the room's own m² from the listing. Distances are straight lines, not walking routes. Listings are a snapshot and may already be gone.`;
  const data = { site: 'short', foot, date, rate: 5.5, penalty: 0, regions, stations: stations.map(s => s.name), stationAt: stations.map(s => [+s.lat.toFixed(5), +s.lng.toFixed(5)]), rows, chg: latest(log, rooms.map(r => r.key)) };
  const html = page(data, '../');
  fs.writeFileSync(OUT + '/index.html', html);
  console.log({ short: rooms.length, regions: regions.length, shards: shards.size, kb: Math.round(html.length / 1024), date });
  assert.strictEqual(rooms.filter(r => /01[016789][-. ]?\d{3,4}[-. ]?\d{4}/.test(r.detail.memo + r.title)).length, 0, 'phone numbers left in 33m2 descriptions');
}

// What changed lately (see track_changes.js): each listing's latest change rides with the page, its full history with the details.
const changeLog = () => (fs.existsSync('changes.json') ? JSON.parse(fs.readFileSync('changes.json', 'utf8')).log : {});
const latest = (log, keys) => Object.fromEntries(keys.filter(k => log[k]).map(k => [k, log[k].at(-1)]));

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--short')) return build33m2();
  const regionNames = JSON.parse(fs.readFileSync('dabang_regions.json', 'utf8'));
  const regions = [], regionIdx = new Map();
  const regionOf = (province, district) => {
    const prov = NAMES[province] ?? province, dist = (district ?? '?').split(' ')[0];
    const key = prov + ' ' + dist;
    if (!regionIdx.has(key)) {
      regionIdx.set(key, regions.length);
      regions.push({ key, province: prov, label: NAMES[dist] ? `${NAMES[dist]} ${dist}` : dist });
    }
    return regionIdx.get(key);
  };

  const lists = new Map(JSON.parse(fs.readFileSync('dabang_rentals.json', 'utf8')).map(r => [r.id, r]));
  const danjiOf = new Map();
  if (fs.existsSync('zigbang_danjis.json')) for (const d of JSON.parse(fs.readFileSync('zigbang_danjis.json', 'utf8'))) for (const id of d.items) danjiOf.set(id, d);
  const dabang = readJsonl('dabang_details.jsonl').filter(d => d.room && d.room.selling_type !== 2 && lists.has(d.id)).map(d => { const r = lists.get(d.id); return fromDabang(d, r.list, r.category); });
  const zigbang = readJsonl('zigbang_rentals.jsonl').filter(z => z.item && ['전세', '월세'].includes(z.item.salesType) && z.item.location && z.item.area?.전용면적M2 > 0).map(z => fromZigbang(z, danjiOf.get(z.id)));
  const merged = dedupe([...dabang, ...zigbang].filter(r => !mistyped(r)));
  assert.ok(merged.length > 2000, `only ${merged.length} listings, not publishing`); // a blocked run must not wipe the site
  for (const r of merged) {
    if (r.region) { r.reg = regionOf(r.region[0], r.region[1]); continue; }
    const parts = (regionNames[r.gid] || r.detail.jibun || '').split(' ');
    r.reg = regionOf(parts[0] || '?', parts.length > 2 ? parts[1] : '?');
  }
  const feeUnknown = merged.filter(r => r.fee === null).length;
  estimateFees(merged);

  const stations = JSON.parse(fs.readFileSync('zigbang_subway.json', 'utf8')).filter(s => s.subway_area === '수도권' && s.lat);
  const { rate, pairs } = impliedRate(merged);
  const rows = merged.map(r => {
    const [subM, sub] = nearestStation(r.lat, r.lng, stations);
    r.detail.station = [`${stations[sub].name} (${stations[sub].description})`, metres(subM)];
    return [r.key, r.cat, r.monthly ? 1 : 0, r.deposit, r.rent, r.fee, r.m2, r.complex, r.dong, r.reg, r.floor, r.title, r.short ? 1 : 0, r.lh ? 1 : 0, r.price, isPartial(r) ? 1 : 0, r.age, r.photo, r.feeEst ? 1 : 0, r.sizeEst ? 1 : 0, r.beds, subM, sub, r.also ? 1 : 0, +r.lat.toFixed(5), +r.lng.toFixed(5)];
  });

  // Details load per listing on click; the page itself only carries what the filters need.
  const DIR = SITE + '/data/d';
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const shards = new Map(), log = changeLog();
  for (const r of merged) {
    const s = shard(r.key);
    if (!shards.has(s)) shards.set(s, {});
    shards.get(s)[r.key] = { ...r.detail, also: r.also, hist: log[r.key] };
  }
  for (const [s, o] of shards) fs.writeFileSync(`${DIR}/${s}.json`, JSON.stringify(o));

  const date = new Date(fs.statSync('dabang_details.jsonl').mtime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const data = { short: fs.existsSync('33m2_details.jsonl'), date, rate: Math.round((rate ?? 5.5) * 10) / 10, penalty: AGE_PENALTY, regions, stations: stations.map(s => s.name), stationAt: stations.map(s => [+s.lat.toFixed(5), +s.lng.toFixed(5)]), rows, chg: latest(log, merged.map(r => r.key)) };
  const html = page(data, './');
  fs.writeFileSync(SITE + '/index.html', html);

  // Sanity output: what the default view ranks first, and anything suspicious.
  const score = r => (r.rent + r.fee + r.deposit * data.rate / 1200) / r.m2 * (1 + AGE_PENALTY / 100 * (r.age ?? 0) / 10);
  const pool = merged.filter(r => r.age !== null && r.age <= 30 && !r.lh && !r.short && !isPartial(r)).sort((a, b) => score(a) - score(b));
  console.log({ dabang: dabang.length, zigbang: zigbang.length, merged: merged.length, bothSites: merged.filter(r => r.also).length, regions: regions.length, unnamed: regions.filter(g => !/[A-Za-z]/.test(g.label)).map(g => g.key), impliedRate: rate, pairs, kb: Math.round(html.length / 1024), shardKb: Math.round([...shards.values()].reduce((n, o) => n + JSON.stringify(o).length, 0) / 1024), feeUnknown, sizeEst: merged.filter(r => r.sizeEst).length, ageUnknown: merged.filter(r => r.age === null).length, defaultPool: pool.length, noPhoto: merged.filter(r => !r.photo).length });
  console.log('best', pool.slice(0, 10).map(r => `${r.key[0]} ${r.price} ${r.m2}m² fee${r.fee}${r.feeEst ? '~' : ''} age${r.age} ${r.complex} ${(score(r) * 10).toFixed(1)}k`));
  console.log('worst', pool.slice(-3).map(r => `${r.price} ${r.m2}m² fee${r.fee} ${r.complex} ${(score(r) * 10).toFixed(1)}k`));
  console.log('tiny sizes', merged.filter(r => r.m2 < 10).length, 'huge fees', merged.filter(r => r.fee > 200).map(r => r.complex + ' ' + r.price).slice(0, 5));
  assert.strictEqual(merged.filter(r => /01[016789][-. ]?\d{3,4}[-. ]?\d{4}/.test(r.detail.memo)).length, 0, 'phone numbers left in descriptions');
  if (fs.existsSync('33m2_details.jsonl')) build33m2(); // the Short term tab
}

if (require.main === module) main();
module.exports = { parseListing }; // for track_changes.js
