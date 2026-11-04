import { createContext, useContext, useState } from "react"
import { HouseIcon, StarIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Help } from "@/components/Help"
import { S, type Row } from "@/lib/data"
import { badgeText, belowOf, shade, whyText, type X } from "@/lib/engine"
import { HELP, dist, fx, metres, money, photoUrl, subText } from "@/lib/text"

// Saved listings: which keys are starred, and the toggle. App provides it.
export const FavsCtx = createContext<{ has: (k: string) => boolean; toggle: (k: string) => void }>({ has: () => false, toggle: () => {} })

export function FavButton({ k, className, size = "icon-xl" }: { k: string; className?: string; size?: "icon-xl" | "icon-lg" }) {
  const favs = useContext(FavsCtx)
  const on = favs.has(k)
  return (
    <Button type="button" variant="secondary" size={size} aria-pressed={on} aria-label="Save this listing" className={cn("rounded-full", className)} onClick={() => favs.toggle(k)}>
      <StarIcon className={cn("size-5", on && "fill-current")} />
    </Button>
  )
}

// A listing photo, or a house outline when there is none or it fails to load.
export function Photo({ r, className, alt = r.complex, eager, gone, text = "No photo on this listing" }: { r: Row; className?: string; alt?: string; eager?: boolean; gone?: boolean; text?: string }) {
  const [failed, setFailed] = useState(false)
  const ok = r.photo && !failed
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-secondary text-sm text-muted-foreground", className)}>
      {ok ? (
        <img src={photoUrl(r)} alt={alt} loading={eager ? undefined : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn("size-full object-cover", gone && "grayscale")} />
      ) : (
        <span className="flex flex-col items-center gap-2 text-center">
          <HouseIcon aria-hidden className="size-9 opacity-60" strokeWidth={1.5} />
          {text}
        </span>
      )}
    </div>
  )
}

// How the listing compares with its district median; hover or tap for why.
export function ValueBadge({ x, className }: { x: X; className?: string }) {
  if (!x.m)
    return (
      <Badge variant="none" size="lg" className={className}>
        Not compared
      </Badge>
    )
  return (
    <Help text={whyText(x, fx.rate, fx.penalty)} icon={false} className={className}>
      <Badge variant={shade(belowOf(x))} size="lg">
        {badgeText(x)}
      </Badge>
    </Help>
  )
}

export const termText = (r: Row) => (r.deal ? "Rent" : "Deposit only")
export const Term = ({ r }: { r: Row }) => (
  <Help text={r.deal ? HELP.wolse : HELP.jeonse} className="relative z-2">
    {termText(r)}
  </Help>
)
export const DepSmall = ({ r }: { r: Row }) => (r.deal ? <small className="text-sm font-medium tracking-normal text-muted-foreground">{r.dep ? "+ " + money(r.dep) + " deposit" : "no deposit"}</small> : null)

// Nearest station, then your places, as on the card.
export function distLine(r: Row, pd: (number | null)[] = []) {
  const parts = S && r.subM > 3000 ? [] : [`${subText(r)} ${dist(r.subM)}`] // short term is nationwide, beyond the subway
  fx.places.forEach((p, i) => {
    if (r.lat == null || r.lng == null || p.name === subText(r)) return
    parts.push(`${p.name} ${dist(pd[i] ?? metres(r.lat, r.lng, p.at))}`)
  })
  return parts.join(" · ")
}
