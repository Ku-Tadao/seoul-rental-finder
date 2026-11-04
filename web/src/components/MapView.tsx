import { useEffect, useRef, useState } from "react"
import type * as Leaflet from "leaflet"

import { Card } from "@/components/ui/card"
import { Photo, termText } from "@/components/shared"
import { S } from "@/lib/data"
import { badgeText, belowOf, median, shade, totalText, type Med, type X } from "@/lib/engine"
import { coarse, loadLeaflet, osmTiles } from "@/lib/leaflet"
import { fx, money, photoUrl, priceText, rateText, sizeText } from "@/lib/text"

const esc = (s: string) => s.replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]!)
type M = Leaflet.Marker & { listings: number; below: number | null }

function Mini({ x }: { x: X }) {
  const r = x.r
  return (
    <div className="relative flex gap-3 border-t p-3">
      <Photo r={r} alt="" text="No photo" className="h-21 w-28 flex-none rounded-lg [&_svg]:hidden" />
      <a href={"#" + r.key} aria-label={"Open " + r.complex} className="absolute inset-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        {S ? (
          <>
            <div className="flex items-baseline gap-1.5 text-base font-bold">
              {money(x.e)} <small className="font-medium text-muted-foreground">{fx.U[1]}</small>
              <span className="ml-auto text-xs font-medium">{rateText(r)}</span>
            </div>
            <div className="font-semibold">{totalText(x)}</div>
          </>
        ) : (
          <>
            <div className="text-base font-bold">
              {termText(r)} {priceText(r)}
            </div>
            <div className="font-semibold">Real cost {money(x.e)} a month</div>
          </>
        )}
        <div className="truncate">{r.complex}</div>
        <div className="text-muted-foreground">
          {badgeText(x)} · {sizeText(r)}
        </div>
      </div>
    </div>
  )
}

// OpenStreetMap with one tile per building, clustered. It stays mounted once opened, so coming back is instant.
export function MapView({ results, med, shown, picking, onPick }: { results: X[]; med: (Med | null)[]; shown: boolean; picking: boolean; onPick: (at: [number, number]) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const el = useRef<HTMLDivElement>(null)
  const lf = useRef<{ L: typeof Leaflet; map: Leaflet.Map; cluster: Leaflet.MarkerClusterGroup; fitted: boolean } | null>(null)
  const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
  const [mini, setMini] = useState<X[] | null>(null)
  const [top, setTop] = useState(0)
  const pick = useRef({ picking, onPick })
  useEffect(() => {
    pick.current = { picking, onPick }
  })

  useEffect(() => {
    if (!shown) return
    setTop(box.current!.getBoundingClientRect().top + window.scrollY)
    if (lf.current) {
      lf.current.map.invalidateSize()
      return
    }
    let live = true
    setState("loading")
    loadLeaflet().then(
      (L) => {
        if (!live || lf.current) return
        const map = L.map(el.current!, { zoomControl: !coarse() }).setView([37.55, 126.99], 11)
        osmTiles(L, map)
        const cluster = L.markerClusterGroup({
          chunkedLoading: true,
          showCoverageOnHover: false,
          spiderfyDistanceMultiplier: 3.5,
          maxClusterRadius: (z: number) => (z >= 17 ? 40 : 70), // about a tile wide, tighter close in so buildings show where they are
          // Sized by how many listings it holds, coloured by how its typical building compares with the median.
          iconCreateFunction: (c) => {
            const ms = c.getAllChildMarkers() as M[],
              n = ms.reduce((t, m) => t + m.listings, 0),
              s = Math.round(28 + 10 * Math.log10(n))
            const b = median(ms.map((m) => m.below).filter((b): b is number => b !== null))
            return L.divIcon({ html: n.toLocaleString("en-US"), className: "map-cluster" + (b !== null ? " " + shade(b) : ""), iconSize: [s, s] })
          },
        })
        map.addLayer(cluster)
        map.on("click", (e) => {
          setMini(null)
          if (pick.current.picking) pick.current.onPick([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)])
        })
        lf.current = { L, map, cluster, fitted: false }
        setState("ready")
      },
      () => live && setState("failed")
    )
    return () => {
      live = false
    }
  }, [shown])

  // Repaint the pins when the results change. The sites give every listing in a building the same point, so a building is one tile showing its best value that has a photo.
  useEffect(() => {
    const m = lf.current
    if (state !== "ready" || !m || !shown) return
    setMini(null)
    m.cluster.clearLayers()
    const spots = new Map<string, X[]>()
    for (const x of results)
      if (x.r.lat != null) {
        const at = x.r.lat + "," + x.r.lng
        ;(spots.get(at) ?? spots.set(at, []).get(at)!).push(x)
      }
    const ms = [...spots.values()].map((xs) => {
      xs.sort((a, b) => a.v - b.v)
      const best = xs.find((x) => x.r.photo) ?? xs[0],
        r = best.r
      const html =
        `<div class="tphoto">${r.photo ? `<img src="${esc(photoUrl(r))}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith('No photo')">` : "No photo"}</div>` +
        `<div class="tprice">${S ? money(best.e) + ({ night: "", week: "/wk", month: "/mo" } as Record<string, string>)[fx.U[1]] : priceText(r)}</div>` +
        (xs.length > 1 ? `<span class="tcount">${xs.length}</span>` : "")
      const icon = m.L.divIcon({ className: "map-tile" + (best.m ? " " + shade(belowOf(best)) : ""), iconSize: [84, 84], iconAnchor: [42, 91], html })
      const mk = m.L.marker([r.lat!, r.lng!], { icon, title: r.complex, alt: r.complex, riseOnHover: true }) as M
      mk.listings = xs.length
      mk.below = median(xs.filter((x) => x.m).map(belowOf))
      mk.on("click", () => (xs.length === 1 ? (location.hash = r.key) : setMini(xs)))
      return mk
    })
    m.cluster.addLayers(ms)
    if (!m.fitted && ms.length) {
      m.fitted = true
      m.map.fitBounds(m.L.latLngBounds(ms.map((x) => x.getLatLng())), { padding: [24, 24] }) // the cluster has no bounds until its chunks finish
    }
  }, [results, med, state, shown])

  return (
    <div ref={box} hidden={!shown} className="relative isolate min-h-80 overflow-hidden rounded-xl bg-muted" style={{ height: `calc(100dvh - ${top}px - 16px)` }}>
      {state !== "ready" && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-muted-foreground">{state === "failed" ? "Couldn't load the map. Check your connection and try again." : "Loading the map…"}</p>}
      <div ref={el} className="size-full" />
      {mini && (
        <Card className="absolute right-3 bottom-3 left-3 z-1000 max-h-[60%] max-w-105 gap-0 overflow-y-auto py-0">
          <div className="px-3 py-2.5 font-semibold">{mini.length} listings here, best value first</div>
          {mini.map((x) => (
            <Mini key={x.r.key} x={x} />
          ))}
        </Card>
      )}
      {picking && <div className="absolute top-3 left-1/2 z-1000 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-md">Tap the map where your place is</div>}
    </div>
  )
}
