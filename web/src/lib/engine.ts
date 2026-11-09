import { DATA, ROWS, S, GROUPS, type Row } from "@/lib/data"
import { CUR, HELP, PTYPES, UNITS, districtText, fx, hay, metres, money, perM2, sizeText, ageShort, stationName, stayText, type Cur } from "@/lib/text"

export const ANY = Infinity
const seq = (a: number, b: number, s: number) => {
  const o: number[] = []
  for (let i = a; i <= b; i += s) o.push(i)
  return o
}
const anyOr = (f: (v: number) => string) => (v: number) => (v === ANY ? "Any" : f(v))
const sizeFmt = (v: number) => v + " m² · " + Math.round(v / 3.3058) + "평"

export type SecKey = "currency" | "stay" | "budget" | "area" | "size" | "rooms" | "age" | "places" | "more"
type Slider = { sec: SecKey; label: string; help?: string; fmt: (v: number) => string; def: number; steps: number[] }

// Filters: each slider lives in a section, shown in the sidebar on desktop and in a bottom sheet on phones.
export const SLIDERS: Record<string, Slider> = {
  ...(S && { price: { sec: "budget", label: "Max price per night", fmt: anyOr((v) => money(v * fx.U[0])), def: ANY, steps: [1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 15, 20, ANY] } as Slider }), // 만원 a night
  deposit: { sec: "budget", label: "Max deposit", help: HELP.deposit, fmt: anyOr(money), def: ANY, steps: S ? [0, 10, 20, 30, 50, 70, 100, 200, ANY] : [0, 100, 300, 500, 1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 70000, 100000, ANY] },
  rent: { sec: "budget", label: "Max monthly rent", help: HELP.rent, fmt: anyOr(money), def: ANY, steps: [0, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 200, 250, 300, 400, 500, 700, 1000, ANY] },
  fee: { sec: "budget", label: "Max maintenance", help: HELP.fee, fmt: anyOr(money), def: ANY, steps: [0, 5, 10, 15, 20, 25, 30, 40, 50, 70, 100, ANY] },
  total: { sec: "budget", label: "Max real monthly cost", help: HELP.total, fmt: anyOr(money), def: ANY, steps: [30, 50, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300, 400, 500, 700, 1000, ANY] },
  minA: { sec: "size", label: "Min usable size", help: HELP.pyeong, fmt: sizeFmt, def: 0, steps: seq(0, 150, 5) },
  maxA: { sec: "size", label: "Max usable size", help: HELP.pyeong, fmt: anyOr(sizeFmt), def: ANY, steps: [...seq(10, 150, 5), 175, 200, ANY] },
  beds: { sec: "rooms", label: "Min rooms", fmt: (v) => (v ? v + "+" : "Any"), def: 0, steps: [0, 1, 2, 3, 4] },
  maxAge: { sec: "age", label: "Max building age", fmt: anyOr((v) => v + " years"), def: 30, steps: [...seq(0, 40, 5), ANY] },
  place0: { sec: "places", label: "Max distance", fmt: anyOr((v) => v + " km"), def: ANY, steps: [1, 2, 3, 5, 7, 10, 15, 20, 30, ANY] },
  place1: { sec: "places", label: "Max distance", fmt: anyOr((v) => v + " km"), def: ANY, steps: [1, 2, 3, 5, 7, 10, 15, 20, 30, ANY] },
  sub: { sec: "places", label: "Max distance to a subway station", fmt: anyOr((v) => (v >= 1000 ? v / 1000 + " km" : v + " m")), def: ANY, steps: [200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, ANY] },
  rate: { sec: "more", label: "Cost of locked-up money", fmt: (v) => v.toFixed(1) + "% a year", def: DATA.rate, steps: [...new Set([...seq(0, 100, 5).map((x) => x / 10), DATA.rate])].sort((a, b) => a - b) },
  penalty: { sec: "more", label: "Old-building penalty", fmt: (v) => (v ? "+" + v + "% per 10 yrs" : "Off"), def: DATA.penalty, steps: seq(0, 100, 5) },
}
// Short term has no rent, maintenance, total or formula: its price already includes them.
export const HIDDEN_SLIDERS = S ? new Set(["rent", "fee", "total", "rate", "penalty"]) : new Set<string>()

export const CHECKS = S
  ? ["hideLow", ...Object.keys(PTYPES).map((k) => "p_" + k)]
  : ["hideLow", "unknownFee", "unknownAge", "partial", "shortTerm", "lh", "t_apt", "t_off", "t_jeonse", "t_monthly", "t_dabang", "t_zigbang"]
const CHECK_DEFAULTS: Record<string, boolean> = { t_apt: true, t_off: true, t_jeonse: true, t_monthly: true, t_dabang: true, t_zigbang: true, unknownFee: true, ...Object.fromEntries(Object.keys(PTYPES).map((k) => ["p_" + k, true])) }

export type Place = { name: string; at: [number, number] }
export type Filters = { s: Record<string, number>; c: Record<string, boolean>; a: string[]; q: string; o: string; p: Place[]; u: Cur; w: number; n: number }

const SEC_FIELDS: Record<SecKey, (keyof Filters)[]> = { currency: ["u"], stay: ["w", "n"], budget: [], area: ["a", "q"], size: [], rooms: [], age: [], places: ["p"], more: ["c"] }
export function defaults(): Filters {
  return {
    s: Object.fromEntries(Object.entries(SLIDERS).map(([k, s]) => [k, s.def])),
    c: Object.fromEntries(CHECKS.map((c) => [c, !!CHECK_DEFAULTS[c]])),
    a: [],
    q: "",
    o: "v",
    p: [],
    u: "KRW",
    w: 1,
    n: 0,
  }
}
export function resetSection(f: Filters, sec: SecKey): Filters {
  const d = defaults()
  const out = { ...f, s: { ...f.s } }
  for (const [k, s] of Object.entries(SLIDERS)) if (s.sec === sec) out.s[k] = s.def
  for (const k of SEC_FIELDS[sec]) (out as Record<string, unknown>)[k] = d[k]
  return out
}
// A slider only holds one of its steps; anything else (an old save, a changed step list) falls back to its default.
export const snap = (k: string, v: number) => (SLIDERS[k].steps.includes(v) ? v : SLIDERS[k].def)

export const SORTS = S
  ? [["v", "Best value first"], ["e", "Lowest price"], ["r", "Top rated"], ["a", "Largest usable size"], ["d", "Lowest deposit"], ["c", "Latest changes"]]
  : [["v", "Best value first"], ["e", "Lowest real cost"], ["a", "Largest usable size"], ["n", "Newest building"], ["d", "Lowest deposit"], ["c", "Latest changes"]]
export const sortOptions = (p: Place[]) => [...SORTS, ...p.flatMap((pl, i) => [["w" + i, "Good value near " + pl.name], ["p" + i, "Closest to " + pl.name]])]
export const sortOf = (f: Filters) => (sortOptions(f.p).some(([v]) => v === f.o) ? f.o : "v")

// Saved filters, separate per site, since both pages share an origin.
const STORE = "finder-filters-v2" + (DATA.site ? "-" + DATA.site : "")
export function saveFilters(f: Filters) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...f, s: Object.fromEntries(Object.entries(f.s).map(([k, v]) => [k, v === ANY ? "any" : v])) }))
  } catch {
    /* private mode */
  }
}
export const stationPlace = (n: string): Place | null => {
  const s = DATA.stations.indexOf(n)
  return s < 0 ? null : { name: stationName(n), at: DATA.stationAt[s] }
}
export function loadFilters(): Filters {
  const f = defaults()
  try {
    const st = JSON.parse(localStorage.getItem(STORE)!)
    if (!st) return f
    f.p = ((st.p ?? []) as (string | Place)[]).map((p) => (typeof p === "string" ? stationPlace(p) : p)).filter((p): p is Place => !!p?.at).slice(0, 2) // older saves hold station names
    for (const [k, v] of Object.entries(st.s ?? {})) if (SLIDERS[k]) f.s[k] = snap(k, v === "any" ? ANY : (v as number))
    for (const c of CHECKS) if (st.c && c in st.c) f.c[c] = !!st.c[c]
    const keys = new Set(DATA.regions.map((r) => r.key))
    f.a = (st.a ?? []).filter((k: string) => keys.has(k))
    f.q = st.q ?? ""
    f.o = st.o || "v"
    if (st.u in CUR) f.u = st.u
    if (STAYS_W.includes(st.w)) f.w = st.w
    if (UNITS[st.n]) f.n = st.n
  } catch {
    /* corrupt save: start fresh */
  }
  return f
}
const STAYS_W = [1, 2, 4, 8, 12]

// Each district is compared with itself and its surroundings: 60% its own listings, 30% the districts bordering it,
// 10% the ones bordering those. A district with few listings leans more on its neighbours.
// Borders aren't in the data, so two districts count as neighbours where their listings sit within about 600 m of each other.
const RINGS = (() => {
  const cells = new Map<string, Set<number>>(),
    pairs = new Map<number, number>(),
    at = DATA.regions.map(() => [0, 0, 0])
  for (const r of ROWS)
    if (r.lat != null && r.lng != null) {
      const k = Math.floor(r.lat / 0.006) + "," + Math.floor(r.lng / 0.0075)
      ;(cells.get(k) ?? cells.set(k, new Set()).get(k)!).add(r.reg)
      at[r.reg][0] += r.lat
      at[r.reg][1] += r.lng
      at[r.reg][2]++
    }
  for (const [k, ds] of cells) {
    const [a, b] = k.split(",").map(Number)
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const y of cells.get(a + i + "," + (b + j)) ?? []) for (const x of ds) if (x < y) pairs.set(x * 1000 + y, (pairs.get(x * 1000 + y) ?? 0) + 1)
  }
  const adj = DATA.regions.map(() => new Set<number>()),
    link = (x: number, y: number) => {
      adj[x].add(y)
      adj[y].add(x)
    }
  for (const [p, n] of pairs) if (n >= 3) link(Math.floor(p / 1000), p % 1000) // 3+ touching cells, so one misplaced pin doesn't make a border
  // A district with no detected border (few listings, or a gap of farmland) borrows its two nearest by centre.
  const c = at.map(([la, ln, n]) => (n ? [la / n, ln / n] : null))
  c.forEach((p, s) => {
    if (p && !adj[s].size)
      c.map((q, d) => [d, q && d !== s ? (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 : Infinity])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2)
        .forEach(([d]) => link(s, d))
  })
  return adj.map((one, s) => {
    const two = new Set<number>()
    for (const n of one) for (const m of adj[n]) if (m !== s && !one.has(m)) two.add(m)
    return [[s], [...one], [...two]]
  })
})()
const upTo = (a: Float64Array, t: number) => {
  let l = 0,
    h = a.length
  while (l < h) {
    const m = (l + h) >> 1
    if (a[m] <= t) l = m + 1
    else h = m
  }
  return l
}
// Weighted median over a district's rings, given each district's values sorted. Found by bisecting on the value.
function ringMedian(rings: number[][], sorted: Float64Array[]) {
  const n = rings.map((ds) => ds.reduce((t, d) => t + sorted[d].length, 0))
  const share = [(0.6 * n[0]) / (n[0] + 20), 0.3, 0.1].map((w, i) => (n[i] ? w / n[i] : 0))
  const parts = rings.flatMap((ds, i) => (share[i] ? ds.map((d) => [sorted[d], share[i]] as const) : []))
  if (!parts.length) return null
  let lo = Infinity,
    hi = -Infinity,
    total = 0
  for (const [a, w] of parts)
    if (a.length) {
      lo = Math.min(lo, a[0])
      hi = Math.max(hi, a[a.length - 1])
      total += w * a.length
    }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (parts.reduce((t, [a, w]) => t + w * upTo(a, mid), 0) >= total / 2) hi = mid
    else lo = mid
  }
  return hi
}

export type Med = { v: number; e: number; a: number; age: number | null; name: string }
export type X = { r: Row; a: number; e: number; v: number; tot: number; off: number; night: number; pd: (number | null)[]; m: Med | null }

function districtMedians(xs: X[]): (Med | null)[] {
  const by: X[][] = DATA.regions.map(() => [])
  for (const x of xs) by[x.r.reg].push(x)
  const col = (f: (x: X) => number | null) => by.map((g) => Float64Array.from(g.map(f).filter((v): v is number => v != null)).sort())
  const v = col((x) => x.v),
    e = col((x) => x.e),
    a = col((x) => x.a),
    age = col((x) => x.r.age)
  return RINGS.map((rings, s) => {
    const mv = ringMedian(rings, v)
    if (mv === null) return null
    const ma = ringMedian(rings, age)
    return { v: mv, e: ringMedian(rings, e)!, a: ringMedian(rings, a)!, age: ma === null ? null : Math.round(ma), name: districtText(DATA.regions[s].label) }
  })
}

export function score(r: Row, rate: number, penalty: number, med: (Med | null)[] = []): X {
  const m = med[r.reg] ?? null
  if (S) {
    // e: price per chosen unit and v: per night per m², both in 만원 like the long-term figures
    const W = fx.W
    const off = Math.max(0, ...r.disc.filter(([w]) => w <= W).map((d) => d[1]))
    const tot = (r.wRent * (1 - off / 100) + r.wFee) * W + r.clean,
      night = tot / (W * 7)
    return { r, a: r.m2, tot, off, night, e: (night * fx.U[0]) / 1e4, v: night / 1e4 / r.m2, pd: [null, null], m }
  }
  const e = r.rent + r.fee + (r.dep * rate) / 100 / 12
  return { r, a: r.m2, e, v: (e / r.m2) * (1 + ((penalty / 100) * (r.age ?? 0)) / 10), tot: 0, off: 0, night: 0, pd: [null, null], m }
}

const isLow = (f: string) => f === "저층" || (/^\d+층$/.test(f) && parseInt(f) <= 2)
const near = (x: X, i: number) => (x.pd[i] == null ? Infinity : Math.max(0.5, x.v / (x.m?.v ?? x.v)) * (1 + x.pd[i]! / 1000))

export function compute(f: Filters): { out: X[]; med: (Med | null)[] } {
  const v = f.s,
    c = f.c,
    W = fx.W
  const regKeys = new Set(f.a)
  const regs = new Set(DATA.regions.flatMap((r, i) => (regKeys.has(r.key) ? [i] : [])))
  const q = f.q.trim().toLowerCase()
  const max = [v.place0 * 1000, v.place1 * 1000]
  const night = S ? v.price * 1e4 : ANY
  const out: X[] = []
  rows: for (const r of ROWS) {
    if (S) {
      if (!c["p_" + r.pt] || r.minW > W) continue
    } else {
      if (!(r.cat ? c.t_off : c.t_apt) || !(r.deal ? c.t_monthly : c.t_jeonse)) continue
      if (!(r.also ? c.t_dabang || c.t_zigbang : r.key[0] === "d" ? c.t_dabang : c.t_zigbang)) continue
      if (r.partial && !c.partial) continue
      if (r.short && !c.shortTerm) continue
      if (r.lh && !c.lh) continue
      if (r.feeEst && !c.unknownFee) continue
      if (r.age === null ? !c.unknownAge : r.age > v.maxAge) continue
    }
    if (c.hideLow && isLow(r.floor)) continue
    if (regs.size && !regs.has(r.reg)) continue
    if (r.dep > v.deposit || (!S && (r.rent > v.rent || r.fee > v.fee))) continue
    if (r.m2 < v.minA || r.m2 > v.maxA) continue
    if (r.subM > v.sub) continue
    if (r.beds !== null && r.beds < v.beds) continue // rooms unknown (many Zigbang apartments): kept
    const x = score(r, v.rate, v.penalty)
    if ((!S && x.e > v.total) || (S && x.night > night)) continue
    if (q && !hay(r).includes(q)) continue
    for (let i = 0; i < 2; i++)
      if (f.p[i] && r.lat != null && r.lng != null) {
        x.pd[i] = metres(r.lat, r.lng, f.p[i].at)
        if (x.pd[i]! > max[i]) continue rows
      }
    out.push(x)
  }
  const med = districtMedians(out) // before sorting: best value is measured against each district's median
  for (const x of out) x.m = med[x.r.reg]
  const by: Record<string, (x: X) => number> = {
    v: (x) => x.v / (x.m?.v ?? 1),
    e: (x) => x.e,
    a: (x) => -x.a,
    d: (x) => x.r.dep,
    r: (x) => -(x.r.rating ?? 0) * 1e4 - x.r.nRev,
    n: (x) => x.r.age ?? 99,
    c: (x) => -(x.r.chg?.[0] ?? 0),
    p0: (x) => x.pd[0] ?? Infinity,
    p1: (x) => x.pd[1] ?? Infinity,
    // Near and good value: each km away weighs like costing double the district median, so a bargain a bit further out can beat an average place next door.
    // Value counts no better than half the median, so a too-good-to-be-true outlier can't jump across the city.
    w0: (x) => near(x, 0),
    w1: (x) => near(x, 1),
  }
  const key = by[sortOf(f)]
  out.sort((x, y) => key(x) - key(y) || x.v - y.v)
  return { out, med }
}

export const belowOf = (x: X) => Math.round((1 - x.v / x.m!.v) * 100)
export type Shade = "value3" | "value2" | "value1" | "above"
export const shade = (b: number): Shade => (b >= 60 ? "value3" : b >= 30 ? "value2" : b >= 0 ? "value1" : "above")
export const badgeText = (x: X) => {
  const b = x.m ? belowOf(x) : 0
  return b > 0 ? b + "% below median" : b < 0 ? -b + "% above median" : "At the median"
}
export const median = (a: number[]) => {
  if (!a.length) return null
  const s = Float64Array.from(a).sort()
  return s[s.length >> 1]
}

// What puts a listing above or below the median, for the badge's hover: what's good, what's bad, and what to double-check.
export type Why = { good: string[]; bad: string[]; notes: string[]; area: string }
export function whyText(x: X, rate: number, penalty: number): Why {
  const r = x.r,
    good: string[] = [],
    bad: string[] = [],
    notes: string[] = [],
    { v: medV, e: medE, a: medA, age: medAge, name } = x.m!
  const k = S ? fx.U[0] : 1,
    per = S ? "a " + fx.U[1] : "a month"
  const vs = (a: string, b: string) => `${a} vs ${b}`
  ;(x.v <= medV ? good : bad).push(`${x.v <= medV ? "Cheaper" : "Pricier"} per m²: ${vs(perM2(x.v * k), perM2(medV * k))} ${per}`)
  const cmp = (v: number, m: number, hi: [string[], string], lo: [string[], string], show: string) => {
    if (!m) return
    const [list, label] = v >= m * 1.15 ? hi : v <= m * 0.85 ? lo : [null, ""]
    list?.push(`${label}: ${show}`)
  }
  cmp(r.m2, medA, [good, "Bigger than most"], [bad, "Smaller than most"], vs(sizeText(r), Math.round(medA) + " m²"))
  cmp(x.e, medE, [bad, `Costs more ${per}`], [good, `Costs less ${per}`], vs(money(x.e), money(medE)))
  if (penalty && !S) {
    const pct = +((penalty * (r.age ?? 0)) / 10).toFixed(1)
    if (r.age === null) good.push("Building age unknown, so no age penalty")
    else if (medAge !== null && r.age <= medAge - 5) good.push(`Newer than most: ${vs(ageShort(r.age), medAge + " yrs")} (+${pct}% age penalty)`)
    else if (medAge !== null && r.age >= medAge + 5) bad.push(`Older than most: ${vs(ageShort(r.age), medAge + " yrs")} (+${pct}% age penalty)`)
  }
  if (belowOf(x) >= 80) notes.push("Far cheaper than usual. Check it isn’t one room of a shared unit or a mistyped price.")
  if (!S && r.dep && (r.dep * rate) / 1200 > x.e * 0.6) notes.push(`Most of the real cost is the deposit, counted at ${rate.toFixed(1)}% a year`)
  if (r.feeEst) notes.push("Maintenance is estimated from the district median")
  if (r.sizeEst) notes.push("Usable size is estimated")
  return { good, bad, notes, area: name }
}

export const totalText = (x: X) => `${money(x.tot / 1e4)} total for ${stayText(fx.W)}${x.off ? `, ${x.off}% long-stay discount` : ""}`

// Chips show the current value of each filter: [section, label, value or null, highlighted].
export function chipText(f: Filters): [SecKey, string, string | null, boolean][] {
  const v = f.s
  const lim = (k: string, fmt: (n: number) => string) => (v[k] === SLIDERS[k].def ? null : fmt(v[k]))
  const budget = (S ? lim("price", (n) => "≤ " + money(n * fx.U[0]) + " a " + fx.U[1]) : null) ?? (S ? null : (lim("total", (n) => "≤ " + money(n)) ?? lim("rent", (n) => money(n) + "/mo"))) ?? lim("deposit", (n) => "≤ " + money(n) + " dep.") ?? (S ? null : lim("fee", (n) => "fee ≤ " + money(n)))
  const on = new Set(f.a)
  const full = GROUPS.filter((g) => g.list.every((i) => on.has(DATA.regions[i].key)))
  const area = f.q.trim() ? "“" + f.q.trim() + "”" : !on.size ? null : full.length === 1 && on.size === full[0].list.length ? full[0].province : on.size === 1 ? districtText(DATA.regions.find((r) => on.has(r.key))!.label) : on.size + " districts"
  const lo = v.minA,
    hi = v.maxA
  const size = lo && hi !== ANY ? `${lo}–${hi} m²` : lo ? `≥ ${lo} m²` : hi !== ANY ? `≤ ${hi} m²` : null
  const d = defaults()
  const off = CHECKS.filter((c) => f.c[c] !== d.c[c]).length + (!S && v.rate !== DATA.rate ? 1 : 0) + (!S && v.penalty !== DATA.penalty ? 1 : 0)
  const chips: [SecKey, string, string | null, boolean][] = [
    ...(S ? [["stay", "Stay", `${stayText(f.w)}, per ${UNITS[f.n][1]}`, f.w !== 1 || f.n !== 0] as [SecKey, string, string, boolean]] : []),
    ["budget", "Budget", budget, budget != null],
    ["area", "Area", area, area != null],
    ["size", "Size", size, size != null],
    ["rooms", "Rooms", v.beds ? v.beds + "+" : null, !!v.beds],
    ...(S ? [] : [["age", "Age", v.maxAge === ANY ? "Any" : "≤ " + v.maxAge + " yrs", v.maxAge !== 30] as [SecKey, string, string, boolean]]),
    ["places", "Places", f.p.length ? f.p.map((p) => p.name).join(", ") : null, f.p.length > 0],
    ["more", "More", off ? String(off) : null, off > 0],
    ["currency", "Currency", CUR[f.u][0] + " " + f.u, f.u !== "KRW"],
  ]
  return chips
}
