import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDownIcon, HouseIcon, StarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Detail } from "@/components/Detail"
import { Aside, ChipBar, Sheet, type SecProps } from "@/components/Filters"
import { Help } from "@/components/Help"
import { ListingCard } from "@/components/ListingCard"
import { MapView } from "@/components/MapView"
import { Saved, SavedHead, type SavedItem } from "@/components/Saved"
import { FavsCtx } from "@/components/shared"
import { useMedia } from "@/hooks/use-media"
import { BY_KEY, DATA, ROWS } from "@/lib/data"
import { compute, loadFilters, saveFilters, score, sortOf, sortOptions, type Filters, type SecKey } from "@/lib/engine"
import { SHARED, loadFavs, loadShard, mine, saveFavs, snapshot, type Detail as D, type Favs } from "@/lib/favs"
import { RANK_HELP, UNITS, fx, koDate } from "@/lib/text"

const PAGE = 60
const isListing = () => /^#[dzm]:/.test(location.hash)
const listingKey = () => (isListing() ? decodeURIComponent(location.hash.slice(1)) : null)

// Other currencies use the day's rate, fetched the first time one is picked. No retry: reload to try again.
type Rates = { rates: Record<string, number> | null; note: string | null }
let ratesLoading: Promise<Rates> | null = null
const loadRates = () =>
  (ratesLoading ??= fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/krw.min.json")
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status))
      return res.json()
    })
    .then((j) => ({ rates: j.krw, note: `Converted at the rate of ${koDate(j.date.replace(/-/g, "."))}. Listings are priced in won, so other currencies are approximate.` }))
    .catch(() => ({ rates: null, note: "Couldn't load exchange rates, so prices stay in won. Reload the page to try again." })))

const FOOT =
  DATA.foot ??
  `${ROWS.length.toLocaleString("en-US")} apartment and officetel rentals in Seoul and nearby cities, from Dabang and Zigbang. Usable size is the exclusive area (전용면적) from the listing, and age comes from the building's approval date. Zigbang publishes no maintenance figure for apartments, so those fees and any others missing are estimated from the median per m² of the same type in the same district. Distances are straight lines, not walking routes. Single rooms are detected from listing text and room counts, so some will slip through: if a price looks too good for the size, read the listing. Agent details aren't shown here, so use the link in a listing to contact them. Listings are a snapshot and may already be gone.`

type View = "list" | "map" | "saved"

export function App() {
  const [f, setF] = useState<Filters>(loadFilters)
  const [rates, setRates] = useState<Rates>({ rates: null, note: null })
  const [favs, setFavs] = useState<Favs>(loadFavs)
  const [view, setViewState] = useState<View>(SHARED ? "saved" : "list")
  const [hashKey, setHashKey] = useState(listingKey)
  const [sheet, setSheet] = useState<SecKey | null>(null)
  const [picking, setPicking] = useState(false)
  const [placeQ, setPlaceQ] = useState("")
  const [shown, setShown] = useState(PAGE)
  const [mapOpened, setMapOpened] = useState(view === "map")
  const navigated = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const wide = useMedia("(min-width: 900px)")

  // The formatting context every component reads; set before any child renders.
  Object.assign(fx, { cur: f.u, rates: rates.rates, W: f.w, U: UNITS[f.n], rate: f.s.rate, penalty: f.s.penalty, places: f.p })

  const { out: results, med } = useMemo(() => compute(f), [f])
  useEffect(() => saveFilters(f), [f])
  useEffect(() => setShown(PAGE), [results])
  useEffect(() => {
    if (f.u !== "KRW") loadRates().then(setRates)
  }, [f.u])
  useEffect(() => {
    if (wide) setSheet(null)
  }, [wide])

  const set = useCallback((fn: (f: Filters) => Filters) => setF(fn), [])
  const setView = (v: View) => {
    setViewState(v)
    if (v !== "map") setPicking(false)
    if (v === "map") setMapOpened(true)
    scrollTo(0, 0)
  }

  // A listing is a real URL (#d:id), so Back closes it and it can be linked.
  useEffect(() => {
    const on = () => {
      navigated.current = true
      setHashKey(listingKey())
    }
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])
  const detailRow = hashKey ? (BY_KEY.get(hashKey) ?? null) : null
  useEffect(() => {
    if (hashKey && !BY_KEY.has(hashKey)) location.hash = ""
  }, [hashKey])
  const closeDetail = () => {
    setHashKey(null)
    if (!isListing()) return
    if (navigated.current) history.back()
    else history.replaceState(null, "", location.pathname + location.search)
  }

  // Saved listings.
  const favApi = useMemo(
    () => ({
      has: (k: string) => favs.has(k),
      toggle: (k: string) => {
        const next = new Map(favs)
        if (next.has(k)) next.delete(k)
        else {
          const r = BY_KEY.get(k)
          if (!r) return
          next.set(k, snapshot(r))
          loadShard(k)
            .then((d) => d?.addr && onLoaded(k, d))
            .catch(() => {})
        }
        saveFavs(next)
        setFavs(next)
      },
    }),
    [favs]
  )
  const onLoaded = (k: string, d: D) =>
    setFavs((fv) => {
      if (!fv.has(k) || !d.addr || fv.get(k)!.addr === d.addr) return fv
      const next = new Map(fv).set(k, { ...fv.get(k)!, addr: d.addr })
      saveFavs(next)
      return next
    })
  const myKeys = [...favs.keys()].filter(mine)
  const savedItems: SavedItem[] = myKeys
    .map((k) => {
      const r = BY_KEY.get(k),
        s = favs.get(k)!
      return { x: score(r ?? s, f.s.rate, f.s.penalty, med), gone: !r, addr: s.addr }
    })
    .sort((a, b) => +a.gone - +b.gone || a.x.v - b.x.v)

  // The list grows 60 at a time as you scroll.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setShown((n) => n + PAGE), { rootMargin: "1200px" })
    io.observe(el)
    return () => io.disconnect()
  }, [view])

  const startPick = () => {
    setSheet(null)
    setView("map")
    setPicking(true)
  }
  const onPick = (at: [number, number]) => {
    setPicking(false)
    const n = f.p.length
    if (n >= 2) return
    setF((f) => ({ ...f, p: [...f.p, { name: placeQ.trim().split(",")[0] || "Pinned place", at }], s: { ...f.s, ["place" + n]: Infinity }, o: f.o === "v" ? "w" + n : f.o }))
    setPlaceQ("")
  }

  const curNote = f.u === "KRW" ? "Prices are in won, as listed." : (rates.note ?? "Loading exchange rates…")
  const secProps: SecProps = { f, set, curNote, placeQ, setPlaceQ, onPick: startPick }
  const n = results.length
  const countText = `${n.toLocaleString("en-US")} listing${n === 1 ? "" : "s"}, updated ${DATA.date}`
  const sort = sortOf(f)
  const opts = sortOptions(f.p)
  const tabs = !!(DATA.site || DATA.short) // no short-term data yet, so no page to switch to

  const seg = (
    <ToggleGroup aria-label="View" value={[view === "map" ? "map" : "list"]} onValueChange={(v: string[]) => v[0] && setView(v[0] as View)} className="flex-none rounded-xl bg-secondary p-1" spacing={0}>
      {(["list", "map"] as const).map((v) => (
        <ToggleGroupItem key={v} value={v} size="lg" className="h-9.5 rounded-[9px]! px-4 aria-pressed:bg-card aria-pressed:font-semibold">
          {v === "list" ? "List" : "Map"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
  const sortEl = (
    <div className="flex min-w-0 items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="xl" className="min-w-0 px-0.5 font-semibold hover:bg-transparent" aria-label="Sort listings" />}>
          <span className="truncate">{opts.find(([v]) => v === sort)?.[1]}</span>
          <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuRadioGroup value={sort} onValueChange={(o: string) => setF((f) => ({ ...f, o }))}>
            {opts.map(([v, l]) => (
              <DropdownMenuRadioItem key={v} value={v} className="min-h-11">
                {l}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Help text={RANK_HELP} label="How the ranking works" className="h-11 w-8 justify-center" />
      {wide && <span className="ml-2.5 truncate text-sm text-muted-foreground">{countText}</span>}
    </div>
  )

  return (
    <FavsCtx.Provider value={favApi}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 lg:flex-nowrap lg:px-6">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <HouseIcon aria-hidden className="size-6 flex-none text-value-3" />
          Seoul Rental Value Finder
        </h1>
        {tabs && (
          <nav aria-label="Rental length" className="order-3 flex w-full rounded-xl bg-secondary p-1 lg:order-none lg:w-auto">
            {(["long", "short"] as const).map((t) => {
              const here = t === (DATA.site ?? "long")
              return (
                <a
                  key={t}
                  href={here ? "./" : DATA.site ? "../" : t + "/"} // relative, so it works under a GitHub Pages project path
                  aria-current={here ? "page" : undefined}
                  className="flex h-9.5 flex-1 items-center justify-center rounded-[9px] px-4 text-sm font-medium whitespace-nowrap aria-[current=page]:bg-card aria-[current=page]:font-semibold"
                >
                  {t === "long" ? "Long term" : "Short term"}
                </a>
              )
            })}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {wide && seg}
          <Button variant={view === "saved" ? "default" : "outline"} size="xl" className="rounded-full" aria-pressed={view === "saved"} onClick={() => setView(view === "saved" ? "list" : "saved")}>
            <StarIcon data-icon="inline-start" className="fill-current" />
            Saved {myKeys.length}
          </Button>
        </div>
      </header>
      {!wide && view !== "saved" && (
        <div className="sticky top-0 z-5 bg-background px-4">
          <ChipBar f={f} onOpen={setSheet} />
        </div>
      )}
      <div className="flex items-start gap-6 px-4 pb-8 lg:px-6">
        {wide && view !== "saved" && <Aside {...secProps} />}
        <main className="flex min-w-0 flex-1 flex-col gap-3">
          {view === "saved" && <SavedHead items={savedItems} keys={[...favs.keys()]} />}
          {view !== "saved" && (
            <>
              <div className="sticky top-[60px] z-4 flex items-center justify-between gap-3 bg-background lg:static">
                {sortEl}
                {!wide && seg}
              </div>
              {!wide && <div className="text-sm text-muted-foreground">{countText}</div>}
            </>
          )}
          {mapOpened && <MapView results={results} med={med} shown={view === "map"} picking={picking} onPick={onPick} />}
          {view === "list" &&
            (n ? (
              <div className="grid gap-4 lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] lg:gap-4.5">
                {results.slice(0, shown).map((x) => (
                  <ListingCard key={x.r.key} x={x} />
                ))}
              </div>
            ) : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle>No listings match</EmptyTitle>
                  <EmptyDescription>Raise a budget limit or clear the area filter.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ))}
          {view === "saved" && <Saved items={savedItems} wide={wide} />}
          {view === "list" && <div ref={sentinel} />}
          {view === "list" && <p className="mt-3 max-w-[78ch] text-[13px] leading-normal text-muted-foreground">{FOOT}</p>}
        </main>
      </div>
      {!wide && <Sheet {...secProps} sec={sheet} onClose={() => setSheet(null)} count={n} />}
      <Detail r={detailRow} med={med} onClose={closeDetail} onLoaded={onLoaded} />
    </FavsCtx.Provider>
  )
}
