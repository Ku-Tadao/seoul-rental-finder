// The build script injects the listings into index.html (see dabang_build_finder.js), so they arrive with the page.
export type Region = { key: string; province: string; label: string }
export type Data = {
  site?: "short"
  short?: boolean
  date: string
  rate: number
  penalty: number
  regions: Region[]
  stations: string[]
  stationAt: [number, number][]
  rows: unknown[][]
  foot?: string
}

export type Row = {
  key: string
  cat: number
  deal: number
  dep: number
  rent: number
  fee: number
  m2: number
  complex: string
  dong: string
  reg: number
  floor: string
  title: string
  short: number
  lh: number
  price: string
  partial: number
  age: number | null
  photo: string | null
  feeEst: number
  sizeEst: number
  beds: number | null
  subM: number
  sub: number
  also: number
  lat: number | null
  lng: number | null
  // Short term: weekly rent and fee, cleaning fee (won), min weeks, [weeks, % off], rating, reviews, property type.
  wRent: number
  wFee: number
  clean: number
  minW: number
  disc: [number, number][]
  rating: number | null
  nRev: number
  pt: string
  // Saved snapshots keep these instead of reg and sub, so a listing that leaves the data still reads right.
  areaText?: string
  subText?: string
  addr?: string
  hay?: string
}

function readData(): Data | null {
  try {
    return JSON.parse(document.getElementById("data")!.textContent!)
  } catch {
    return null // the dev server serves the raw template, with no data in it
  }
}

export const DATA = readData() ?? { date: "", rate: 0, penalty: 0, regions: [], stations: [], stationAt: [], rows: [] }
export const HAS_DATA = DATA.rows.length > 0
export const S = DATA.site === "short"

// Row arrays: see the build script for the order.
const COLS = ["key", "cat", "deal", "dep", "rent", "fee", "m2", "complex", "dong", "reg", "floor", "title", "short", "lh", "price", "partial", "age", "photo", "feeEst", "sizeEst", "beds", "subM", "sub", "also", "lat", "lng"]
const SHORT_COLS = ["wRent", "wFee", "clean", "minW", "disc", "rating", "nRev", "pt"]
const cols = S ? [...COLS, ...SHORT_COLS] : COLS
export const ROWS: Row[] = DATA.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])) as Row)
export const BY_KEY = new Map(ROWS.map((r) => [r.key, r]))

export const GROUPS = (() => {
  const g: Record<string, number[]> = {}
  DATA.regions.forEach((r, i) => (g[r.province] ??= []).push(i))
  return Object.entries(g)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([province, list]) => ({ province, list: list.sort((a, b) => DATA.regions[a].label.localeCompare(DATA.regions[b].label)) }))
})()
