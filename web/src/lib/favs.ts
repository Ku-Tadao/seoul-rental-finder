import { BY_KEY, S, type Row } from "@/lib/data"
import { areaText, subText } from "@/lib/text"

// Saved listings live in this browser with a snapshot, so one that disappears from the data still shows what it was.
export const SHARED = /^#favs=/.test(location.hash) // read before loadFavs clears it
const FAV_STORE = "finder-favourites-v2"
export type Favs = Map<string, Row>

export const snapshot = (r: Row): Row => {
  const { hay: _h, reg: _r, sub: _s, ...rest } = r
  return { ...rest, areaText: areaText(r), subText: subText(r) } as Row
}
export function saveFavs(f: Favs) {
  try {
    localStorage.setItem(FAV_STORE, JSON.stringify([...f]))
  } catch {
    /* private mode */
  }
}
export function loadFavs(): Favs {
  const favs: Favs = new Map()
  try {
    for (const [k, s] of JSON.parse(localStorage.getItem(FAV_STORE)!) ?? []) favs.set(k, s)
  } catch {
    /* none yet */
  }
  try {
    for (const k of JSON.parse(localStorage.getItem("finder-favourites-v1")!) ?? []) if (!favs.has(k) && BY_KEY.has(k)) favs.set(k, snapshot(BY_KEY.get(k)!))
  } catch {
    /* none */
  }
  for (const k of favs.keys()) if (BY_KEY.has(k)) favs.set(k, { addr: favs.get(k)!.addr, ...snapshot(BY_KEY.get(k)!) })
  // A link from another device: #favs=key1,key2
  const shared = location.hash.match(/^#favs=(.+)/)
  if (shared) {
    for (const k of decodeURIComponent(shared[1]).split(",")) if (BY_KEY.has(k)) favs.set(k, snapshot(BY_KEY.get(k)!))
    history.replaceState(null, "", location.pathname + location.search)
  }
  saveFavs(favs)
  return favs
}
export const mine = (k: string) => (k[0] === "m") === S // both tabs share saved listings; each shows its own

// Listing details sit in 256 shards next to the page, fetched when a listing opens.
export type Detail = {
  facts: [string, string][]
  imgs: string[]
  lat: number
  lng: number
  addr: string
  station: [string, string]
  near: [string, string][]
  opts: string[]
  tags?: string[]
  memo?: string
  link?: [string, string]
  also?: [string, string]
}
export const shardOf = (key: string) => {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) & 255
  return h.toString(16).padStart(2, "0")
}
const shards = new Map<string, Promise<Record<string, Detail>>>()
export const loadShard = (key: string) => {
  const s = shardOf(key)
  if (!shards.has(s))
    shards.set(
      s,
      fetch(`data/d/${s}.json`)
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status))
          return res.json()
        })
        .catch((e) => {
          shards.delete(s)
          throw e
        })
    )
  return shards.get(s)!.then((o) => o[key])
}
