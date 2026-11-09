import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ChangeLine, DepSmall, FavButton, Photo, Term, ValueBadge, distLine, termText } from "@/components/shared"
import { S } from "@/lib/data"
import { totalText, type X } from "@/lib/engine"
import { ageShort, areaText, fx, money, priceText, rateText, roomsText, sizeText, typeText } from "@/lib/text"

// The whole card opens the listing (a link under everything); the term, badge and star sit above it.
export function ListingCard({ x, gone }: { x: X; gone?: boolean }) {
  const r = x.r
  const facts = [typeText(r), sizeText(r), roomsText(r), S ? "" : ageShort(r.age)].filter(Boolean).join(" · ")
  const flags = (
    S
      ? [r.minW > 1 && `Minimum ${r.minW} weeks`, r.dep ? money(r.dep) + " deposit, refunded" : "No deposit"]
      : [r.feeEst && "Maintenance estimated", r.partial && "Might be one room of a unit", r.short && "Short-term", r.lh && "LH public housing"]
  )
    .filter(Boolean)
    .join(" · ")
  const meta = [areaText(r), facts, distLine(r, x.pd), flags].filter(Boolean)
  return (
    <Card className={cn("relative isolate min-w-0 gap-0 py-0", gone && "opacity-55")}>
      <div className="relative">
        <Photo r={r} gone={gone} className="aspect-4/3 max-lg:has-[span]:aspect-auto max-lg:has-[span]:h-28 max-lg:has-[span]:items-start max-lg:has-[span]:justify-start max-lg:has-[span]:p-4 max-lg:[&_svg]:hidden" />
        {gone ? (
          <Badge variant="none" size="lg" className="absolute bottom-3 left-3 z-2">
            No longer listed
          </Badge>
        ) : (
          <ValueBadge x={x} className="absolute bottom-3 left-3 z-2" />
        )}
      </div>
      {!gone && <a href={"#" + r.key} aria-label={"Open " + r.complex} className="absolute inset-0 z-1 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}
      <FavButton k={r.key} className="absolute top-2 right-2 z-2" />
      <div className="flex min-w-0 flex-col gap-1.5 p-3.5">
        {S ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-xl font-bold tracking-tight">
              <span>{money(x.e)}</span>
              <small className="text-sm font-medium tracking-normal text-muted-foreground">{fx.U[1]}</small>
              <span className="ml-auto text-sm font-medium tracking-normal whitespace-nowrap">{rateText(r)}</span>
            </div>
            <div className="font-semibold">{totalText(x)}</div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-xl font-bold tracking-tight">
              {gone ? termText(r) : <Term r={r} />} <span>{priceText(r)}</span> <DepSmall r={r} />
            </div>
            <div className="font-semibold">Real cost {money(x.e)} a month</div>
          </>
        )}
        {r.chg && <ChangeLine c={r.chg} />}
        <div className="mt-1 truncate font-medium">{r.complex}</div>
        <div className="text-sm leading-snug [overflow-wrap:anywhere] text-muted-foreground">
          {meta.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      </div>
    </Card>
  )
}
