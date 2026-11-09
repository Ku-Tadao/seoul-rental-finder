import { DATA, S, type Chg, type Money3, type Row } from "@/lib/data"

// Money is stored in 만원 (₩10,000), as both sites give it. Other currencies use the day's rate, fetched the first time one is picked.
export const CUR = { KRW: ["₩", "Won"], EUR: ["€", "Euro"], USD: ["$", "US dollar"], RUB: ["₽", "Russian rouble"], UAH: ["₴", "Ukrainian hryvnia"] } as const
export type Cur = keyof typeof CUR

// Short term (33m2) prices a stay, not a month: the total for the chosen length with its discount and fees, shown per night, week or month.
export const STAYS: [number, string][] = [[1, "1 week"], [2, "2 weeks"], [4, "1 month"], [8, "2 months"], [12, "3 months"]]
export const UNITS: [number, string][] = [[1, "night"], [7, "week"], [28, "month"]] // 33m2 counts a month as 4 weeks

// ponytail: one formatting context for the whole page, set by App on each render, instead of threading currency and stay through every call.
export const fx = { cur: "KRW" as Cur, rates: null as Record<string, number> | null, W: 1, U: UNITS[0], rate: DATA.rate, penalty: DATA.penalty, places: [] as { name: string; at: [number, number] }[] }

const shownCur = () => (fx.rates ? fx.cur : "KRW")
const conv = (v: number) => v * 10000 * fx.rates![fx.cur.toLowerCase()]
export const money = (v: number) => {
  if (shownCur() === "KRW") return v >= 100 ? "₩" + +(v / 100).toFixed(2) + "M" : "₩" + Math.round(v * 10) + "k"
  const n = conv(v)
  return CUR[fx.cur][0] + (n >= 1e6 ? +(n / 1e6).toFixed(2) + "M" : n >= 1e4 ? Math.round(n / 1000) + "k" : Math.round(n).toLocaleString("en-US"))
}
export const perM2 = (v: number) => {
  if (shownCur() === "KRW") return "₩" + (v * 10).toFixed(1) + "k"
  const n = conv(v)
  return CUR[fx.cur][0] + n.toFixed(n < 10 ? 2 : n < 1000 ? 1 : 0)
}
export const ago = (t: number) => {
  const m = (Date.now() / 1000 - t) / 60
  return m < 60 ? Math.max(1, Math.round(m)) + " min ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"
}
// What a change changed, and whether the listing got cheaper (-1) or dearer (1) for it.
export function changeText(c: Chg): { text: string; dir: number } {
  if (c[1] === "n") return { text: "New", dir: 0 }
  const [, a, b] = c
  const price = (x: Money3) => (S ? money(x[1]) + " a week" : x[1] ? money(x[0]) + "/" + money(x[1]) : money(x[0]))
  const fee = (v: number | null) => (v == null ? "unknown" : money(v))
  const parts = [
    (S ? a[1] !== b[1] : a[0] !== b[0] || a[1] !== b[1]) && `Price ${price(a)} → ${price(b)}`,
    S && a[0] !== b[0] && `Deposit ${money(a[0])} → ${money(b[0])}`,
    a[2] !== b[2] && `Maintenance ${fee(a[2])} → ${fee(b[2])}`,
  ].filter(Boolean)
  const cost = (x: Money3) => x[1] + (x[2] ?? 0) + (S ? 0 : (x[0] * fx.rate) / 1200)
  return { text: parts.join(" · "), dir: Math.sign(cost(b) - cost(a)) }
}
export const won = (v: number) => money(v / 1e4)
export const dist = (m: number) => (m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m")
export const metres = (lat: number, lng: number, at: [number, number]) =>
  Math.hypot((at[0] - lat) * 111320, (at[1] - lng) * 111320 * Math.cos((lat * Math.PI) / 180))

// Hangul to Revised Romanization, syllable by syllable with the sound changes across syllables, so names read in English.
const ROM_I = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
const ROM_V = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
const ROM_F = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"]
const ROM_R: Record<string, [string, string]> = { k: ["ng", "n"], n: ["l", "l"], l: ["l", "l"], m: ["m", "n"], ng: ["ng", "n"], p: ["m", "n"], t: ["n", "n"] }
const romCache = new Map<string, string>()
export function rom(s: string) {
  const hit = romCache.get(s)
  if (hit !== undefined) return hit
  let out = "",
    end = ""
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00
    if (c < 0 || c > 11171) {
      out += end + ch
      end = ""
      continue
    }
    let on = ROM_I[(c / 588) | 0]
    if (end) {
      if (on === "") end = ({ k: "g", t: "d", l: "r", p: "b" } as Record<string, string>)[end] ?? end
      else if (on === "r") [end, on] = ROM_R[end]
      else if (on === "n" || on === "m") {
        end = end === "l" && on === "n" ? "l" : (({ k: "ng", t: "n", p: "m" } as Record<string, string>)[end] ?? end)
        if (end === "l" && on === "n") on = "l"
      }
    }
    out += end + on + ROM_V[((c % 588) / 28) | 0]
    end = ROM_F[c % 28]
  }
  out = (out + end).replace(/^./, (m) => m.toUpperCase())
  romCache.set(s, out)
  return out
}
export const stationName = (n: string) => rom(n.replace(/역$/, "")) + " Stn"
export const dongText = (d: string) => {
  const m = d.match(/^(.+?)(\d*)(동|읍|면|리|가)(\d+가)?$/)
  return m ? rom(m[1]) + (m[2] ? " " + m[2] : "") + "-" + rom(m[3]).toLowerCase() + (m[4] ? " " + m[4].replace("가", "-ga") : "") : rom(d)
}
export const districtText = (label: string) => (/[A-Za-z]/.test(label) ? label.split(" ")[0] : rom(label.replace(/[시군구]$/, "")))

// Complex names in English. Brand names read better as the builders spell them; the rest is romanised, and an address reads like the area tag.
const BRAND: Record<string, string> = { 힐스테이트: "Hillstate", 푸르지오: "Prugio", 래미안: "Raemian", 더샵: "The Sharp", 아이파크: "IPark", 센트레빌: "Centreville", 롯데캐슬: "Lotte Castle", e편한세상: "e-Pyunhansesang", 데시앙: "Desian", 위브: "We've", 꿈에그린: "Kkumegreen", 자이: "Xi", 아크로: "Acro", 써밋: "Summit", 디에이치: "The H", 시그니처: "Signature", 퍼스트: "First", 스카이: "Sky", 센트럴: "Central", 파크: "Park", 포레스트: "Forest", 포레: "Foret", 타워: "Tower", 시티: "City", 오피스텔: "Officetel", 캐슬: "Castle", 팰리스: "Palace", 하이츠: "Heights", 리버: "River", 레이크: "Lake", 에코: "Eco", 비스타: "Vista", 뷰: "View", 그랜드: "Grand", 프리미어: "Premier", 빌리지: "Village", 어바니티: "Urbanity", 헤리티지: "Heritage", 스위트: "Suite", 타운: "Town", 월드: "World", 골드: "Gold", 그린: "Green", 엑스포: "Expo", 에디션: "Edition", 역: "Stn" }
// Longest first, so 포레스트 wins over 포레; 역 (station) only splits between two longer words, not inside 역삼.
const BRAND_RE = new RegExp(`(${Object.keys(BRAND).sort((x, y) => y.length - x.length).map((k) => (k === "역" ? "(?<=[가-힣]{2})역(?=[가-힣]{2})" : k)).join("|")})`)
const wordText = (w: string) =>
  /(동|읍|면|리|\d가)$/.test(w) ? dongText(w) : /..[시군구]$/.test(w) ? rom(w.slice(0, -1)) + "-" + rom(w.slice(-1)).toLowerCase() : w.split(BRAND_RE).filter(Boolean).map((p) => BRAND[p] ?? rom(p)).join(" ")
export const nameText = (r: Row) => (S ? r.complex : r.complex.replace(/\(.*?\)/g, "").replace(/(\d+)단지/g, " Complex $1 ").replace(/([\d,]+)차/g, " Phase $1 ").split(" ").filter(Boolean).map(wordText).join(" ") || r.complex)

// Korean terms, explained on hover and on tap.
export const HELP: Record<string, string> = {
  jeonse: "Deposit only: you pay one large deposit instead of monthly rent, and get it back when you move out. Koreans call this jeonse (전세).",
  wolse: "Rent: monthly rent plus a smaller deposit that you get back when you move out. Koreans call this wolse (월세).",
  deposit: "Deposit 보증금: money you hand over and get back when you move out.",
  rent: "Monthly rent 월세.",
  fee: "Maintenance 관리비: the monthly building fee.",
  total: "Rent, maintenance and what the locked-up deposit costs you each month.",
  pyeong: "평 (pyeong) is the Korean floor area unit. 1 평 is about 3.3 m².",
  supply: "Supply size 공급면적 includes shared stairs and corridors, so you can't use all of it.",
  contract: "Contract size 계약면적 includes shared areas such as stairs, corridors and parking, so you can't use all of it.",
  stair: "계단식: homes share a stairwell instead of a long corridor. Usually quieter and better ventilated.",
  corridor: "복도식: homes open onto a long shared corridor. Usually cheaper, with less privacy and airflow.",
  mixed: "복합식: a mix of stairwell and corridor access in one building.",
  loan: "A loan is secured on this home. Check how it gets paid off before paying a deposit, because a large loan puts your deposit at risk.",
}
export const RANK_HELP = S
  ? "Ranked by price per night per m² of usable space for your stay, with the long-stay discount, management fee and cleaning fee included, compared with the median listing in its district and the districts around it."
  : "Ranked by real monthly cost per m² of usable space, with a penalty for older buildings, compared with the median listing in its district and the districts around it. Real monthly cost is rent, maintenance and what the locked-up deposit costs you each month."
export const FACING: Record<string, string> = { 남: "South", 남동: "South-east", 남서: "South-west", 동: "East", 서: "West", 북: "North", 북동: "North-east", 북서: "North-west" }
export const LAYOUT: Record<string, string> = { 계단식: "stair", 복도식: "corridor", 복합식: "mixed" }
export const HEAT: Record<string, string> = { 개별난방: "Individual", 지역난방: "District", 중앙난방: "Central", "개별 냉난방": "Individual heating and cooling" }
export const ROOMS: Record<string, string> = { 오픈형원룸: "Open studio", 분리형원룸: "Split studio", 복층형원룸: "Duplex studio", 투룸: "Two rooms" }
export const TAGS: Record<string, string> = { 주차: "Parking", "보안/안전": "Security", "1층": "Ground floor", 풀옵션: "Fully furnished", 큰길가: "On a main road", 복층: "Duplex", "LH 전세임대": "LH jeonse lease", 신축: "New build", 분리형: "Split layout", 반려동물: "Pets OK", 추천: "Recommended" }
export const COVERS: Record<string, string> = { "일반(공용) 관리비": "Common fee", 전기: "electricity", 수도: "water", 가스: "gas", 난방: "heating", 인터넷: "internet", TV: "TV", "기타 관리비": "other" }
export const OPTS: Record<string, string> = { 옷장: "Wardrobe", 붙박이장: "Built-in closet", 신발장: "Shoe cabinet", 인덕션: "Induction hob", 전자레인지: "Microwave", 싱크대: "Sink", 비데: "Bidet", 욕조: "Bathtub", 샤워부스: "Shower booth", 천장형: "Ceiling air conditioning", 벽걸이형: "Wall air conditioning", 스탠드형: "Standing air conditioning", 에어컨: "Air conditioning", 베란다: "Veranda", 테라스: "Terrace", 마당: "Yard", 무인택배함: "Parcel lockers", 화재경보기: "Fire alarm", 가스레인지: "Gas stove", 가스오븐: "Gas oven", 냉장고: "Fridge", 세탁기: "Washing machine", 건조기: "Dryer", 식기세척기: "Dishwasher", 식탁: "Dining table", 책상: "Desk", 책장: "Bookcase", 침대: "Bed", 쇼파: "Sofa", 소파: "Sofa", TV: "TV" }
const LINES: Record<string, string> = { 경의중앙선: "Gyeongui-Jungang", 공항철도: "AREX", 신분당선: "Shinbundang", 수인분당선: "Suin-Bundang", 분당선: "Bundang", 경춘선: "Gyeongchun", 경강선: "Gyeonggang", 서해선: "Seohae", 우이신설선: "Ui-Sinseol", 신림선: "Sillim", 김포골드라인: "Gimpo Goldline", 의정부경전철: "Uijeongbu LRT", 에버라인: "Everline", 인천1호선: "Incheon 1", 인천2호선: "Incheon 2" }
export const lineText = (s: string) => s.split(",").map((l) => LINES[l] ?? l.replace(/^(\d+)호선$/, "Line $1")).join(", ")
const FLOORS: Record<string, string> = { 저층: "Low floor", 중층: "Mid floor", 고층: "High floor", 반지하: "Semi-basement", 옥탑방: "Rooftop", "-1": "Basement", "-": "" }
export const floorText = (f: string) => FLOORS[f] ?? (/^\d+층$/.test(f) ? "Floor " + parseInt(f) : f)
// Straight-line metres to a walk: streets add about a fifth, at 80 m a minute. Past 1.5 km it's not a walk.
export const walkText = (m: number) => (m <= 1500 ? `${Math.max(1, Math.round((m * 1.2) / 80))} min walk` : "")
export const koDate = (s: unknown) => {
  const m = String(s).match(/^(\d{4})\.?\s*(\d{1,2})(?:\.(\d{1,2}))?/)
  if (!m) return String(s)
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1]
  return (m[3] ? +m[3] + " " : "") + mon + " " + m[1]
}
export const moneyKo = (s: string) => {
  const [a, b] = String(s).split("/")
  const f = (x: string) => x.replace(/억(\d+)/, (_, n) => "억 " + (+n).toLocaleString("en-US")).replace(/^(\d+)$/, (_, n) => (+n).toLocaleString("en-US")) + (/억$/.test(x) ? "원" : "만원")
  return b ? f(a) + " / " + f(b) : f(a)
}
export const loanText = (v: unknown) => {
  const m = String(v).match(/^(?:(\d+)억)?(\d*)$/)
  return m ? money((+m[1] || 0) * 10000 + (+m[2] || 0)) : /30%\s*미만/.test(String(v)) ? "Under 30% of market value" : /30%\s*이상/.test(String(v)) ? "30% or more of market value" : String(v)
}

export const PTYPES: Record<string, string> = { OFFICETEL: "Officetel", STUDIO: "Studio", APARTMENT: "Apartment", VILLA: "Villa", DETACHED: "House", MIXED_USE: "Mixed-use building", GOSIWON: "Gosiwon", SHARE_HOUSE: "Share house" }
export const stayText = (w: number) => STAYS.find((s) => s[0] === w)?.[1] ?? w + " weeks"
export const rateText = (r: Row) => (r.rating ? `★ ${r.rating.toFixed(2)} (${r.nRev})` : "★ New")

export const areaText = (r: Row) => r.areaText ?? `${dongText(r.dong)}, ${districtText(DATA.regions[r.reg].label)}`
// Korean, so it pastes straight into Naver or Kakao Map: the saved full address, or district and neighbourhood.
export const areaKo = (r: Row) => r.addr ?? (r.reg != null && DATA.regions[r.reg] ? DATA.regions[r.reg].label.split(" ").pop() + " " + r.dong : areaText(r))
export const subText = (r: Row) => r.subText ?? stationName(DATA.stations[r.sub])
export const hay = (r: Row) =>
  (r.hay ??= [r.complex, r.dong, dongText(r.dong), r.title, DATA.regions[r.reg].label, DATA.stations[r.sub], stationName(DATA.stations[r.sub])].join(" ").toLowerCase())

export const priceText = (r: Row) => (r.deal ? money(r.rent) + "/mo" : money(r.dep))
export const ageShort = (a: number | null) => (a === null ? "" : a === 0 ? "new build" : a === 1 ? "1 yr old" : a + " yrs old")
export const typeText = (r: Row) => (S ? (PTYPES[r.pt] ?? "Room") : r.cat ? "Officetel" : "Apartment")
export const sizeText = (r: Row) => `${r.sizeEst ? "~" : ""}${Math.round(r.m2)} m²`
export const roomsText = (r: Row) => (r.beds ? r.beds + (r.beds > 1 ? " rooms" : " room") : "")
export const pyeong = (m2: number) => Math.round(m2 / 3.3058)

const PHOTO: Record<string, (p: string) => string> = {
  d: (p) => "https://d1774jszgerdmk.cloudfront.net/512/" + p,
  m: (p) => "https://d1pviohoskiraj.cloudfront.net/" + p + "?b=samsamm2&d=720x480",
  z: (p) => "https://ic.zigbang.com/" + p + "?w=400",
}
export const photoUrl = (r: Row) => PHOTO[r.key[0]](r.photo!)
