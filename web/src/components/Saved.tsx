import { useState, type ReactNode } from "react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ListingCard } from "@/components/ListingCard"
import { FavButton, Photo, ValueBadge, termText } from "@/components/shared"
import { BY_KEY, S } from "@/lib/data"
import { totalText, type X } from "@/lib/engine"
import { coarse } from "@/lib/leaflet"
import { areaText, dist, fx, money, priceText, pyeong, rateText, roomsText, sizeText, subText, typeText } from "@/lib/text"

export type SavedItem = { x: X; gone: boolean; addr?: string }

export function SavedHead({ items, keys }: { items: SavedItem[]; keys: string[] }) {
  const label = "Send to another device"
  const [text, setText] = useState(label)
  const share = async () => {
    const url = location.origin + location.pathname + "#favs=" + keys.filter((k) => BY_KEY.has(k)).join(",")
    if (navigator.share && coarse()) {
      try {
        await navigator.share({ title: "Saved rentals", url })
      } catch {
        /* cancelled */
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setText("Link copied")
      setTimeout(() => setText(label), 2000)
    } catch {
      prompt("Copy this link", url)
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 className="text-[28px] font-semibold tracking-tight">{items.length === 1 ? "1 saved listing" : items.length + " saved listings"}</h2>
      {items.some((i) => !i.gone) && (
        <Button variant="outline" size="xl" onClick={share}>
          {text}
        </Button>
      )}
    </div>
  )
}

const Sub = ({ children }: { children: ReactNode }) => <small className="block text-sm font-normal text-muted-foreground">{children}</small>
const Big = ({ children }: { children: ReactNode }) => <b className="text-2xl font-semibold tracking-tight tabular-nums">{children}</b>

// Saved listings: cards on phones, a side-by-side comparison on desktop.
export function Saved({ items, wide }: { items: SavedItem[]; wide: boolean }) {
  if (!items.length)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Nothing saved yet</EmptyTitle>
          <EmptyDescription>{wide ? "Click" : "Tap"} the star on a listing to keep it here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  if (!wide)
    return (
      <div className="grid gap-4">
        {items.map((i) => (
          <ListingCard key={i.x.r.key} x={i.x} gone={i.gone} />
        ))}
      </div>
    )
  const rows: [string, (i: SavedItem) => ReactNode][] = [
    S
      ? ["Price", ({ x }) => (<><Big>{money(x.e)} {fx.U[1]}</Big><Sub>{totalText(x)}</Sub></>)]
      : ["Price", ({ x: { r } }) => (<><Big>{termText(r)} {priceText(r)}</Big>{r.deal ? <Sub>{r.dep ? money(r.dep) + " deposit" : "No deposit"}</Sub> : null}</>)],
    S
      ? ["Rating", ({ x: { r } }) => (<>{rateText(r)}<Sub>Rating and reviews</Sub></>)]
      : ["Real monthly cost", ({ x }) => (<><Big>{money(x.e)}</Big><Sub>Real monthly cost</Sub></>)],
    ["Size", ({ x: { r } }) => (<>{sizeText(r)} · {pyeong(r.m2)}평{roomsText(r) ? " · " + roomsText(r) : ""}<Sub>Usable size</Sub></>)],
    S
      ? ["Minimum stay", ({ x: { r } }) => (<>{r.minW + (r.minW > 1 ? " weeks" : " week")}<Sub>Minimum stay</Sub></>)]
      : ["Age", ({ x: { r } }) => (<>{r.age === null ? "Unknown" : r.age === 0 ? "New build" : r.age + (r.age > 1 ? " years old" : " year old")}<Sub>Building age</Sub></>)],
    ["Subway", ({ x: { r } }) => (<>{subText(r)} {dist(r.subM)}<Sub>Nearest subway</Sub></>)],
    ["Address", (i) => (<>{i.addr ?? areaText(i.x.r)}<Sub>{typeText(i.x.r)}</Sub></>)],
  ]
  const cell = "w-80 min-w-80 px-0 pr-6 py-2.5 align-top whitespace-normal text-base font-medium"
  return (
    <Table className="w-auto">
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          {items.map(({ x, gone }) => {
            const r = x.r
            return (
              <TableHead key={r.key} scope="col" className={cn(cell, "h-auto pt-0", gone && "opacity-55")}>
                <div className="flex flex-col gap-1">
                  <div className="relative mb-1.5">
                    <Photo r={r} gone={gone} className="aspect-4/3 rounded-2xl shadow-card ring-1 ring-foreground/8" />
                    <FavButton k={r.key} className="absolute top-2 right-2" />
                  </div>
                  {gone ? (
                    <>
                      <span className="text-xl font-bold [overflow-wrap:anywhere]">{r.complex}</span>
                      <Badge variant="none" size="lg">
                        No longer listed
                      </Badge>
                    </>
                  ) : (
                    <>
                      <a href={"#" + r.key} className="text-xl font-bold [overflow-wrap:anywhere] hover:underline">
                        {r.complex}
                      </a>
                      <Sub>{areaText(r)}</Sub>
                      <ValueBadge x={x} className="mt-1 self-start" />
                    </>
                  )}
                </div>
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([k, f]) => (
          <TableRow key={k} className="hover:bg-transparent">
            {items.map((i) => (
              <TableCell key={i.x.r.key} className={cn(cell, i.gone && "opacity-55")}>
                {f(i)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
