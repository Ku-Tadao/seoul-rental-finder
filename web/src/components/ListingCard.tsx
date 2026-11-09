import { useState, type ReactNode } from "react"
import { BedDoubleIcon, Building2Icon, BuildingIcon, CalendarClockIcon, CheckIcon, DoorOpenIcon, HouseIcon, InfoIcon, LayersIcon, MapPinIcon, NavigationIcon, RulerIcon, SparklesIcon, StoreIcon, TrainFrontIcon, TriangleAlertIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ChangeLine, DepSmall, FavButton, Photo, Term, ValueBadge, distParts, termText } from "@/components/shared"
import { S, type Row } from "@/lib/data"
import { totalText, type X } from "@/lib/engine"
import { areaKo, areaText, dist, floorText, fx, money, priceText, rateText, roomsText, sizeText, typeText, walkText } from "@/lib/text"

const TYPE_ICON: Record<string, LucideIcon> = { OFFICETEL: BuildingIcon, STUDIO: DoorOpenIcon, APARTMENT: Building2Icon, VILLA: HouseIcon, DETACHED: HouseIcon, MIXED_USE: StoreIcon, GOSIWON: DoorOpenIcon, SHARE_HOUSE: UsersIcon }
const typeIcon = (r: Row) => (S ? (TYPE_ICON[r.pt] ?? DoorOpenIcon) : r.cat ? BuildingIcon : Building2Icon)

function Fact({ icon: Icon, children, hi }: { icon: LucideIcon; children: ReactNode; hi?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", hi ? "bg-value-3 text-on-value" : "bg-muted text-foreground/80")}>
      <Icon aria-hidden className="size-3.5 flex-none" />
      {children}
    </span>
  )
}
const Line = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) => (
  <div className="flex gap-1.5">
    <Icon aria-hidden className="mt-0.5 size-3.5 flex-none" />
    <span className="min-w-0">{children}</span>
  </div>
)

// Some in-app browsers refuse the clipboard API; the old select-and-copy still works there.
async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    const el = Object.assign(document.createElement("textarea"), { value: t })
    document.body.append(el)
    el.select()
    const ok = document.execCommand("copy")
    el.remove()
    return ok
  }
}

// The area sits on the photo; a click copies it in Korean, ready to paste into a map app.
function AreaTag({ r }: { r: Row }) {
  const [copied, setCopied] = useState(false)
  const ko = areaKo(r)
  return (
    <button
      type="button"
      title={"Copy " + ko}
      aria-label={copied ? "Copied" : "Copy the area: " + ko}
      onClick={() =>
        copyText(ko).then((ok) => {
          if (!ok) return
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
      className="absolute top-2.5 left-2.5 z-2 flex max-w-[calc(100%-3.75rem)] animate-in cursor-copy items-center gap-1.5 overflow-hidden rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm duration-300 fade-in slide-in-from-top-3 hover:bg-black/65 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span key={String(copied)} className="flex min-w-0 animate-in items-center gap-1.5 duration-200 fade-in zoom-in-90">
        {copied ? <CheckIcon aria-hidden className="size-3.5 flex-none text-green-400" /> : <MapPinIcon aria-hidden className="size-3.5 flex-none" />}
        <span className="truncate">{copied ? "Copied " + ko : areaText(r)}</span>
      </span>
    </button>
  )
}

// The whole card opens the listing (a link under everything); the term, badge and star sit above it.
export function ListingCard({ x, gone }: { x: X; gone?: boolean }) {
  const r = x.r
  const flags = (
    S
      ? [r.minW > 1 && `Minimum ${r.minW} weeks`, r.dep ? money(r.dep) + " deposit, refunded" : "No deposit"]
      : [r.feeEst && "Maintenance estimated", r.partial && "Might be one room of a unit", r.short && "Short-term", r.lh && "LH public housing"]
  )
    .filter(Boolean)
    .join(" · ")
  const near = distParts(r, x.pd)
  return (
    <Card className={cn("relative isolate min-w-0 gap-0 py-0", gone && "opacity-55")}>
      {/* No photo: a short strip, grown to match a photo card beside it in the grid. */}
      <div className={cn("relative flex flex-col", !r.photo && "grow")}>
        <Photo r={r} gone={gone} className="aspect-4/3 has-[span]:aspect-auto has-[span]:min-h-24 has-[span]:grow [&>span]:hidden" />
        <AreaTag r={r} />
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
        <div className="flex flex-wrap gap-1">
          <Fact icon={typeIcon(r)}>{typeText(r)}</Fact>
          <Fact icon={RulerIcon}>{sizeText(r)}</Fact>
          {r.beds ? <Fact icon={BedDoubleIcon}>{roomsText(r)}</Fact> : null}
          {floorText(r.floor) && <Fact icon={LayersIcon}>{floorText(r.floor)}</Fact>}
          {!S && r.age !== null && (r.age === 0 ? <Fact icon={SparklesIcon} hi>New build</Fact> : <Fact icon={CalendarClockIcon}>{r.age + (r.age === 1 ? " yr" : " yrs")}</Fact>)}
        </div>
        <div className="flex flex-col gap-0.5 text-sm leading-snug [overflow-wrap:anywhere] text-muted-foreground">
          {near.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {near.map(([n, m, mine]) => (
                <Line key={n} icon={mine ? NavigationIcon : TrainFrontIcon}>
                  {n} <span className="font-medium text-foreground/80">{dist(m)}</span>
                  {walkText(m) && " · " + walkText(m)}
                </Line>
              ))}
            </div>
          )}
          {flags && <Line icon={S ? InfoIcon : TriangleAlertIcon}>{flags}</Line>}
        </div>
      </div>
    </Card>
  )
}
