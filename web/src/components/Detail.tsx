import { useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Help } from "@/components/Help"
import { ChangeLine, DepSmall, FavButton, Photo, Term, ValueBadge } from "@/components/shared"
import { S, type Row } from "@/lib/data"
import { score, totalText, type Med } from "@/lib/engine"
import { loadShard, type Detail as D } from "@/lib/favs"
import { coarse, loadLeaflet, osmTiles } from "@/lib/leaflet"
import {
  COVERS, FACING, HEAT, HELP, LAYOUT, OPTS, ROOMS, TAGS, areaText, dist, floorText, fx, koDate, lineText, loanText, metres, money, moneyKo, perM2, priceText, pyeong, rateText, roomsText, sizeText, stationName, stayText, typeText, won,
} from "@/lib/text"

function factRows(r: Row, d: D) {
  const out: [string, string, string?][] = []
  const add = (k: string, v: unknown, help?: string | null) => {
    if (v !== "" && v != null) out.push([k, String(v), help ?? undefined])
  }
  const fact = (k: string) => d.facts.find((f) => f[0] === k)?.[1]
  const bath = fact("Bathrooms"),
    rooms = fact("Rooms")
  const roomText = rooms == null ? "" : (ROOMS[rooms] ?? (/^\d+$/.test(rooms) ? rooms + (+rooms > 1 ? " rooms" : " room") : rooms))
  add("Usable size", `${r.sizeEst ? "~" : ""}${+r.m2.toFixed(2)} m² · ${pyeong(r.m2)}평`, HELP.pyeong)
  for (const [k, v] of d.facts) {
    if (k === "Exclusive size" || k === "Rooms" || k === "Bathrooms") {
      if (k === "Rooms") add("Rooms and bathrooms", [roomText, bath && bath + (+bath > 1 ? " bathrooms" : " bathroom")].filter(Boolean).join(", "))
      continue
    }
    if (k === "Supply size") add(k, v, HELP.supply)
    else if (k === "Contract size") add(k, v, HELP.contract)
    else if (k === "Floor") {
      const m = String(v).match(/^(.+?) of (\d+)층$/)
      add(k, m ? `${floorText(m[1])} of ${m[2]}` : floorText(v))
    } else if (k === "Facing") add(k, FACING[v] ?? v)
    else if (k === "Layout") add(k, { stair: "Stairwell", corridor: "Corridor", mixed: "Mixed" }[LAYOUT[v]] ?? v, HELP[LAYOUT[v]])
    else if (k === "Heating") add(k, HEAT[v] ?? v)
    else if (k === "Parking") add(k, String(v).replace("불가능", "Not available").replace("가능", "Available"))
    else if (k === "Elevator") add(k, v === "있음" ? "Yes" : v === "없음" ? "No" : v)
    else if (k === "Loan") add("Existing loan", loanText(v), /미만/.test(v) ? null : HELP.loan)
    else if (k === "Fee covers")
      add(
        k,
        String(v)
          .split(", ")
          .map((x) => COVERS[x] ?? x)
          .join(", ")
          .replace(/^./, (m) => m.toUpperCase())
      )
    else if (k === "Move in") add(k, /즉시/.test(v) ? (/협의/.test(v) ? "Immediately, negotiable" : "Immediately") : /협의/.test(v) ? "Negotiable" : koDate(v))
    else if (k === "Maintenance") add(k, r.feeEst ? `about ${money(r.fee)} a month (estimated)` : r.fee ? money(r.fee) + " a month" : "None", HELP.fee)
    else if (k === "Approved") add("Building approved", koDate(v).replace(/^\d+ /, ""))
    else if (k === "Posted") add(k, koDate(v))
    else add(k, String(v))
  }
  if (!fact("Rooms") && bath) add("Bathrooms", bath)
  if (!S && !fact("Maintenance")) add("Maintenance", r.feeEst ? `about ${money(r.fee)} a month (estimated)` : money(r.fee) + " a month", HELP.fee)
  return out
}

const schoolKind = (n: string) => (/초등학교/.test(n) ? ", elementary school" : /중학교/.test(n) ? ", middle school" : /고등학교/.test(n) ? ", high school" : /대학교/.test(n) ? ", university" : "")

const Pairs = ({ rows }: { rows: [ReactNode, ReactNode][] }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 tabular-nums">
    {rows.map(([a, b], i) => (
      <div key={i} className="contents">
        <span>{a}</span>
        <span className="text-right">{b}</span>
      </div>
    ))}
  </div>
)
const H2 = ({ children }: { children: ReactNode }) => <h2 className="text-xl font-semibold">{children}</h2>
const H3 = ({ children }: { children: ReactNode }) => <h3 className="mt-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{children}</h3>
const ext = { target: "_blank", rel: "noopener" }

function Gallery({ r, d }: { r: Row; d?: D }) {
  const ref = useRef<HTMLDivElement>(null)
  const [i, setI] = useState(0)
  const box = "aspect-4/3 min-[720px]:aspect-2/1"
  if (!d) return r.photo ? <Photo r={r} eager className={box} /> : <div className={cn(box, "flex items-center justify-center bg-secondary text-sm text-muted-foreground")}>Loading…</div>
  if (!d.imgs.length) return <div className={cn(box, "flex items-center justify-center bg-secondary text-sm text-muted-foreground")}>No photos on this listing</div>
  const n = d.imgs.length
  const slide = (s: number) => ref.current?.scrollBy({ left: s * ref.current.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  return (
    <div className="relative bg-secondary">
      <div
        ref={ref}
        tabIndex={0}
        aria-label={`${n} photos`}
        className={cn(box, "no-scrollbar flex w-full snap-x snap-mandatory overflow-x-auto outline-none")}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {d.imgs.map((u, j) => (
          <img key={u} src={u} alt={`Photo ${j + 1} of ${n}`} loading={j ? "lazy" : undefined} referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} className="size-full flex-[0_0_100%] snap-start snap-always object-cover" />
        ))}
      </div>
      {n > 1 && (
        <>
          <Button variant="secondary" size="icon-xl" className="glass-card absolute top-1/2 left-3 -mt-5.5 rounded-full shadow-card ring-1 ring-foreground/8" aria-label="Previous photo" onClick={() => slide(-1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="secondary" size="icon-xl" className="glass-card absolute top-1/2 right-3 -mt-5.5 rounded-full shadow-card ring-1 ring-foreground/8" aria-label="Next photo" onClick={() => slide(1)}>
            <ChevronRightIcon />
          </Button>
          <span className="absolute right-3 bottom-3 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white tabular-nums ring-1 ring-white/15 backdrop-blur-md">
            {i + 1} / {n}
          </span>
        </>
      )}
    </div>
  )
}

// The listing's map: the same tiles as the map view with one pin. Scrolling the page past it doesn't zoom it.
function SpotMap({ at, label }: { at: [number, number]; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let m: import("leaflet").Map | null = null,
      live = true
    loadLeaflet()
      .then((L) => {
        if (!live || !ref.current) return
        m = L.map(ref.current, { scrollWheelZoom: false, dragging: !coarse() }).setView(at, 16)
        osmTiles(L, m)
        L.marker(at, { icon: L.divIcon({ className: "map-pin", iconSize: [16, 16] }), keyboard: false }).addTo(m)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      m?.remove()
    }
  }, [at[0], at[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} aria-label={"Map of " + label} className="relative isolate h-60 overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/8">
      {failed && <p className="p-4 text-muted-foreground">Couldn't load the map.</p>}
    </div>
  )
}

function Body({ r, d, failed, med }: { r: Row; d?: D; failed: boolean; med: (Med | null)[] }) {
  const x = score(r, fx.rate, fx.penalty, med)
  const { rate, penalty, U, W } = fx
  const pen = (penalty * (r.age ?? 0)) / 10
  const m = x.m
  const b = (s: ReactNode) => <b className="font-semibold">{s}</b>
  const how = (
    S
      ? [
          [`Weekly rent × ${W}`, won(r.wRent * W)],
          x.off ? [`Long-stay discount, ${x.off}% off rent`, "− " + won((r.wRent * W * x.off) / 100)] : null,
          r.wFee ? [`Management fee × ${W}`, won(r.wFee * W)] : null,
          r.clean ? ["Cleaning fee, once", won(r.clean)] : null,
          [b(`Total for ${stayText(W)}`), b(won(x.tot))],
          [`Per ${U[1]}`, money(x.e)],
          [`Per ${U[1]} per m² of usable space (${sizeText(r)})`, perM2(x.v * U[0])],
          m ? [b(`Median listing in ${m.name} and around`), b(perM2(m.v * U[0]))] : null,
          r.dep ? ["Deposit, refunded when you leave", money(r.dep)] : null,
        ]
      : [
          r.rent ? ["Monthly rent", money(r.rent)] : null,
          r.dep ? [`Deposit, ${money(r.dep)} at ${rate.toFixed(1)}% a year`, money((r.dep * rate) / 100 / 12)] : null,
          [r.feeEst ? "Maintenance (estimated)" : "Maintenance", r.fee ? money(r.fee) : "₩0"],
          [b("Real monthly cost"), b(money(x.e))],
          [`Per m² of usable space (${sizeText(r)})`, perM2(x.e / r.m2)],
          r.age === null ? ["Building age unknown, no penalty", perM2(x.v)] : pen ? [`With ${r.age}-year-old building penalty, +${+pen.toFixed(1)}%`, perM2(x.v)] : null,
          m ? [b(`Median listing in ${m.name} and around`), b(perM2(m.v))] : null,
        ]
  ).filter(Boolean) as [ReactNode, ReactNode][]
  const fact = (k: string) => d?.facts.find((f) => f[0] === k)?.[1]
  const bath = fact("Bathrooms")
  const of = String(fact("Floor") ?? "").match(/ of (\d+)층$/)?.[1]
  const approved = fact("Approved")
  const flr = floorText(r.floor).replace(" floor", "").replace("Floor ", "")
  const tiles: [ReactNode, string][] = [
    [sizeText(r), `Usable, ${pyeong(r.m2)}평`],
    [roomsText(r) || "–", bath ? bath + (+bath > 1 ? " bathrooms" : " bathroom") : "Rooms"],
    ...((S
      ? [
          [r.rating ? "★ " + r.rating.toFixed(2) : "New", r.nRev === 1 ? "1 review" : r.nRev + " reviews"],
          [r.minW + (r.minW > 1 ? " weeks" : " week"), "Minimum stay"],
        ]
      : [
          [flr || "–", "Floor" + (of ? ", of " + of : "")],
          [r.age === null ? "–" : r.age === 0 ? "New" : r.age + (r.age > 1 ? " yrs" : " yr"), approved ? "Built " + String(approved).slice(0, 4) : "Age"],
        ]) as [ReactNode, string][]),
  ]
  const head = (
    <section className="flex flex-col gap-2 tabular-nums">
      <ValueBadge x={x} className="self-start" />
      {S ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 text-3xl font-bold tracking-tight">
            <span>{money(x.e)}</span> <small className="text-[15px] font-medium tracking-normal text-muted-foreground">{U[1]}</small>
          </div>
          <div className="text-[17px] font-semibold">{totalText(x)}</div>
          <div className="text-muted-foreground">
            {areaText(r)} · {typeText(r)} · {rateText(r)}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 text-3xl font-bold tracking-tight">
            <Term r={r} /> <span title={moneyKo(r.price)}>{priceText(r)}</span> <DepSmall r={r} />
          </div>
          <div className="text-[17px] font-semibold">Real cost {money(x.e)} a month</div>
          <div className="text-muted-foreground">
            {areaText(r)} · {typeText(r)}
          </div>
        </>
      )}
      <Collapsible className="mt-2 rounded-2xl bg-muted px-4 py-3">
        <CollapsibleTrigger className="group flex min-h-7 w-full items-center justify-between font-semibold">
          How this is worked out
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-300 ease-out-soft group-data-panel-open:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2.5 text-[15px]">
          <Pairs rows={how} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
  const tileEl = (
    <section className="grid grid-cols-4 gap-2">
      {tiles.map(([v, l], i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1 rounded-2xl bg-muted px-3 py-3">
          <b className="text-[17px] font-semibold tracking-tight">{v}</b>
          <span className="text-xs leading-tight text-muted-foreground">{l}</span>
        </div>
      ))}
    </section>
  )
  const grid = "grid grid-cols-1 items-start gap-6 px-4 pt-4.5 pb-[max(24px,env(safe-area-inset-bottom))] min-[720px]:grid-cols-2 min-[720px]:gap-8 min-[720px]:px-8 min-[720px]:pt-6 min-[720px]:pb-8"
  const col = "flex min-w-0 flex-col gap-6"
  if (!d)
    return (
      <>
        <Gallery r={r} />
        <div className={grid}>
          <div className={col}>
            {head}
            {tileEl}
            <p className="text-muted-foreground">{failed ? "Couldn't load the details. Check your connection and open the listing again." : "Loading details…"}</p>
          </div>
        </div>
      </>
    )
  const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(r.complex.replace(/,/g, " "))},${d.lat},${d.lng}`
  const st = d.station[0].match(/^(.+?) \((.*)\)$/)
  const near: [string, string][] = [
    ...fx.places.map((p) => [`${p.name}, your place`, dist(metres(d.lat, d.lng, p.at))] as [string, string]),
    [st ? `${stationName(st[1])}, ${lineText(st[2])}` : d.station[0], d.station[1]],
    ...d.near.filter(([n]) => !/유치원/.test(n)).map(([n, m]) => [n + schoolKind(n), m] as [string, string]),
  ]
  const tagged = [...d.opts.map((o) => [o, OPTS[o]]), ...(d.tags ?? []).map((o) => [o, TAGS[o]])]
  const links = [d.link, d.also].filter((l): l is [string, string] => !!l)
  return (
    <>
      <Gallery r={r} d={d} />
      <div className={grid}>
        <div className={col}>
          {head}
          {tileEl}
          <section className="flex flex-col gap-2.5">
            <H2>Location</H2>
            <SpotMap at={[d.lat, d.lng]} label={r.complex} />
            <div>{d.addr}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="xl" nativeButton={false} render={<a href={kakao} {...ext} />}>
                Open in Kakao Map
              </Button>
              <Button variant="outline" size="xl" nativeButton={false} render={<a href={`https://map.naver.com/p/search/${encodeURIComponent(d.addr)}`} {...ext} />}>
                Open in Naver Map
              </Button>
            </div>
            <H3>Nearby</H3>
            <Pairs rows={near} />
          </section>
        </div>
        <div className={col}>
          {d.memo && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <H2>Description</H2>
                <Button variant="link" size="xl" className="px-0" nativeButton={false} render={<a href={"https://translate.google.com/?sl=ko&tl=en&op=translate&text=" + encodeURIComponent(d.memo.slice(0, 3000))} {...ext} />}>
                  Translate
                </Button>
              </div>
              <p lang="ko" className="whitespace-pre-line [overflow-wrap:anywhere]">
                {d.memo}
              </p>
            </section>
          )}
          <section className="flex flex-col gap-2.5">
            <H2>Full details</H2>
            <div>
              {factRows(r, d).map(([k, v, help]) => (
                <div key={k}>
                  <div className="flex justify-between gap-4 py-2.5">
                    <span className="flex-none text-muted-foreground">{k}</span>
                    {help ? (
                      <Help text={help} className="text-right font-medium [overflow-wrap:anywhere]">
                        {v}
                      </Help>
                    ) : (
                      <span className="text-right font-medium [overflow-wrap:anywhere]">{v}</span>
                    )}
                  </div>
                  <Separator />
                </div>
              ))}
            </div>
            {tagged.length > 0 && (
              <>
                <H3>Included</H3>
                <div className="flex flex-wrap gap-2">
                  {tagged.map(([o, en]) => (
                    <Help key={o} text={en ? o + " · " + en : o} icon={false} className="min-h-9 rounded-full border px-3 text-sm">
                      {o}
                    </Help>
                  ))}
                </div>
              </>
            )}
          </section>
          {!!d?.hist?.length && (
            <section className="flex flex-col gap-2.5">
              <H2>Changes, last 30 days</H2>
              {[...d.hist].reverse().map((c) => (
                <ChangeLine key={c[0]} c={c} className="text-base" />
              ))}
            </section>
          )}
          {links.map(([n, u], i) => (
            <Button key={u} variant={i ? "outline" : "default"} size="xl" className="h-13 w-full rounded-full text-base font-semibold" nativeButton={false} render={<a href={u} {...ext} />}>
              See this listing on {n}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}

// Listing page: a real URL (#d:id), so Back closes it and a listing can be linked.
export function Detail({ r, med, onClose, onLoaded }: { r: Row | null; med: (Med | null)[]; onClose: () => void; onLoaded: (key: string, d: D) => void }) {
  const [state, setState] = useState<{ key: string; d?: D; failed: boolean } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const key = r?.key
  useEffect(() => {
    if (!key) return
    let live = true
    setState({ key, failed: false })
    scroller.current?.scrollTo(0, 0)
    loadShard(key).then(
      (d) => {
        if (!live) return
        setState({ key, d, failed: false })
        if (d) onLoaded(key, d)
      },
      () => live && setState({ key, failed: true })
    )
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = state?.key === key ? state : null
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        ref={scroller}
        showCloseButton={false}
        className="top-0 left-0 block h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none bg-card p-0 text-base ring-0 sm:max-w-none min-[720px]:top-1/2 min-[720px]:left-1/2 min-[720px]:h-auto min-[720px]:max-h-[calc(100dvh-48px)] min-[720px]:w-[min(1040px,calc(100vw-48px))] min-[720px]:-translate-x-1/2 min-[720px]:-translate-y-1/2 min-[720px]:rounded-3xl min-[720px]:shadow-[0_40px_120px_-20px_rgb(0_0_0/0.55)] min-[720px]:ring-1 min-[720px]:ring-foreground/10"
      >
        {r && (
          <>
            <div className="glass-card sticky top-0 z-3 flex items-center gap-2 border-b border-border/60 px-2 pt-[max(6px,env(safe-area-inset-top))] pb-1.5">
              <Button variant="ghost" size="icon-xl" aria-label="Back to the list" onClick={onClose}>
                <ChevronLeftIcon className="size-6" />
              </Button>
              <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold">{r.complex}</DialogTitle>
              <FavButton k={r.key} className="bg-transparent shadow-none ring-0 backdrop-filter-none" />
            </div>
            <Body r={r} d={s?.d} failed={!!s?.failed} med={med} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
