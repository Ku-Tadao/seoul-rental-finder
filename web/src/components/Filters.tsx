import { useState, type ReactNode } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Help } from "@/components/Help"
import { DATA, GROUPS, S } from "@/lib/data"
import { ANY, HIDDEN_SLIDERS, SLIDERS, chipText, defaults, resetSection, stationPlace, type Filters, type Place, type SecKey } from "@/lib/engine"
import { CUR, PTYPES, STAYS, UNITS, districtText, fx, rom, stationName, type Cur } from "@/lib/text"

export type Set = (fn: (f: Filters) => Filters) => void
export const TITLES: Record<SecKey, string> = { currency: "Currency", stay: "Your stay", budget: "Budget", area: "Area", size: "Size", rooms: "Rooms", age: "Building age", places: "Your places", more: "More filters" }
export const SECS = (Object.keys(TITLES) as SecKey[]).filter((k) => (S ? k !== "age" : k !== "stay"))

function SliderRow({ k, f, set, label }: { k: string; f: Filters; set: Set; label?: string }) {
  const s = SLIDERS[k]
  const text = label ?? (k === "price" ? "Max price per " + fx.U[1] : s.label)
  const i = Math.max(0, s.steps.indexOf(f.s[k]))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        {s.help ? (
          <Help text={s.help} className="font-medium">
            {text}
          </Help>
        ) : (
          <span className="font-medium">{text}</span>
        )}
        <output className="font-semibold whitespace-nowrap tabular-nums">{s.fmt(f.s[k])}</output>
      </div>
      <Slider
        min={0}
        max={s.steps.length - 1}
        step={1}
        value={[i]}
        onValueChange={(v) => {
          const n = s.steps[Array.isArray(v) ? v[0] : v]
          set((f) => ({ ...f, s: { ...f.s, [k]: n } }))
        }}
        getAriaLabel={() => text}
        getAriaValueText={() => s.fmt(f.s[k])}
        className="py-2"
      />
    </div>
  )
}
const sliders = (sec: SecKey, f: Filters, set: Set) =>
  Object.entries(SLIDERS)
    .filter(([k, s]) => s.sec === sec && !HIDDEN_SLIDERS.has(k) && !k.startsWith("place"))
    .map(([k]) => <SliderRow key={k} k={k} f={f} set={set} />)

const Note = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>

function Check({ id, f, set, children }: { id: string; f: Filters; set: Set; children: ReactNode }) {
  return (
    <Field orientation="horizontal" className="items-start">
      <Checkbox id={"c_" + id} checked={!!f.c[id]} onCheckedChange={(on) => set((f) => ({ ...f, c: { ...f.c, [id]: on } }))} className="mt-0.5" />
      <FieldLabel htmlFor={"c_" + id} className="text-base font-normal">
        {children}
      </FieldLabel>
    </Field>
  )
}

// A row of options that filter in or out (multi) or pick one (single), as chips.
function Chips({ items, on, onChange, label, multiple }: { items: [string, ReactNode, string?][]; on: string[]; onChange: (v: string[]) => void; label: string; multiple?: boolean }) {
  return (
    <ToggleGroup aria-label={label} multiple={multiple} value={on} onValueChange={(v: string[]) => (multiple || v.length) && onChange(v)} variant="chip" size="xl" className="w-auto flex-wrap">
      {items.map(([v, l, title]) => (
        <ToggleGroupItem key={v} value={v} title={title}>
          {l}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
const checkChips = (items: [string, string][], f: Filters, set: Set, label: string) => (
  <Chips
    label={label}
    multiple
    items={items}
    on={items.map(([k]) => k).filter((k) => f.c[k])}
    onChange={(v) => set((f) => ({ ...f, c: { ...f.c, ...Object.fromEntries(items.map(([k]) => [k, v.includes(k)])) } }))}
  />
)

// Addresses go through OpenStreetMap's geocoder. It reads Korean road names best romanized with a hyphen (Hangang-daero 372), so that is tried first;
// a unit or postcode after a comma is dropped. You pick from what it finds, since a near miss can land on the wrong street.
async function geocode(q: string) {
  const first = q.split(",")[0].trim()
  const roman = first.replace(/[가-힣]+/g, (w) => {
    const m = w.match(/^(.+?)(대로|로|길)$/)
    return m ? rom(m[1]) + "-" + rom(m[2]).toLowerCase() : rom(w)
  })
  for (const t of [...new Set([roman, first, q])]) {
    const res = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&countrycodes=kr&q=" + encodeURIComponent(t))
    const hits: { lat: string; lon: string; display_name: string }[] = res.ok ? await res.json() : []
    if (hits.length) return { hits, name: first }
    await new Promise((r) => setTimeout(r, 1100)) // their limit is one request a second
  }
  return { hits: [], name: first }
}

const hitBtn = "h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal"
function Places({ f, set, placeQ, setPlaceQ, onPick }: { f: Filters; set: Set; placeQ: string; setPlaceQ: (q: string) => void; onPick: () => void }) {
  const [found, setFound] = useState<null | "busy" | (Place & { label: string })[]>(null)
  const add = (p: Place) => {
    setPlaceQ("")
    setFound(null)
    set((f) => {
      const n = f.p.length
      return { ...f, p: [...f.p, p], s: { ...f.s, ["place" + n]: ANY }, o: f.o === "v" ? "w" + n : f.o } // you added it to see what's near it
    })
  }
  const remove = (i: number) =>
    set((f) => ({ ...f, p: f.p.filter((_, j) => j !== i), s: { ...f.s, place0: i === 0 ? f.s.place1 : f.s.place0, place1: ANY }, o: /^[pw]\d/.test(f.o) ? "v" : f.o }))
  const find = async () => {
    setFound("busy")
    let r: Awaited<ReturnType<typeof geocode>>
    try {
      r = await geocode(placeQ.trim())
    } catch {
      r = { hits: [], name: "" }
    }
    setFound(r.hits.map((h) => ({ name: r.name, at: [+h.lat, +h.lon] as [number, number], label: h.display_name.split(", ").slice(0, -1).reverse().join(" ") }))) // Korean order, country dropped
  }
  const q = placeQ.trim().toLowerCase()
  const hits = q
    ? [...new Set(DATA.stations)]
        .filter((n) => !f.p.some((p) => p.name === stationName(n)) && (n.includes(q) || stationName(n).toLowerCase().includes(q)))
        .sort((a, b) => stationName(a).toLowerCase().indexOf(q) - stationName(b).toLowerCase().indexOf(q))
        .slice(0, 6)
    : []
  const pickBtn = (
    <Button variant="ghost" size="xl" className={hitBtn} onClick={onPick}>
      Pick it on the map instead
    </Button>
  )
  return (
    <>
      {f.p.map((p, i) => (
        <div key={i} className="flex flex-col gap-4">
          <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-secondary py-1 pr-1 pl-3 font-semibold">
            <span className="min-w-0 truncate">{p.name}</span>
            <Button variant="ghost" size="xl" onClick={() => remove(i)}>
              Remove
            </Button>
          </div>
          <SliderRow k={"place" + i} f={f} set={set} label={"Max distance to " + p.name} />
        </div>
      ))}
      {f.p.length < 2 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="placeQ" className="text-sm text-muted-foreground">
            {f.p.length ? "Add a second place" : "Add a place, like work or family: a station or an address"}
          </label>
          <Input
            id="placeQ"
            type="search"
            autoComplete="off"
            placeholder="Search a station"
            className="h-11 text-base"
            value={placeQ}
            onChange={(e) => {
              setPlaceQ(e.target.value)
              setFound(null)
            }}
            onKeyDown={(e) => e.key === "Enter" && placeQ.trim() && find()}
          />
          {q && (
            <div className="flex flex-col">
              {found === "busy" ? (
                <Note>Looking up the address…</Note>
              ) : found ? (
                <>
                  <Note>{found.length ? "Pick the right one:" : "Couldn’t find that address. Try it romanized, like Hangang-daero 372, or pick it on the map."}</Note>
                  {found.map((h, i) => (
                    <Button key={i} variant="ghost" size="xl" className={hitBtn} onClick={() => add(h)}>
                      {h.label}
                    </Button>
                  ))}
                  {pickBtn}
                </>
              ) : (
                <>
                  {hits.map((n) => (
                    <Button key={n} variant="ghost" size="xl" className={hitBtn} onClick={() => add(stationPlace(n)!)}>
                      {stationName(n)} <small className="text-muted-foreground">{n}</small>
                    </Button>
                  ))}
                  <Button variant="ghost" size="xl" className={hitBtn} onClick={find}>
                    Find the address “{placeQ.trim()}”
                  </Button>
                  {pickBtn}
                </>
              )}
            </div>
          )}
        </div>
      )}
      <SliderRow k="sub" f={f} set={set} />
    </>
  )
}

export type SecProps = { f: Filters; set: Set; curNote: string; placeQ: string; setPlaceQ: (q: string) => void; onPick: () => void }

export function Section({ sec, ...p }: SecProps & { sec: SecKey }) {
  const { f, set } = p
  switch (sec) {
    case "currency":
      return (
        <>
          <Chips label="Currency" items={Object.entries(CUR).map(([c, [s, name]]) => [c, `${s} ${c}`, name])} on={[f.u]} onChange={(v) => set((f) => ({ ...f, u: v[0] as Cur }))} />
          <Note>{p.curNote}</Note>
        </>
      )
    case "stay":
      return (
        <>
          <Chips label="Your stay" items={STAYS.map(([w, l]) => [String(w), l])} on={[String(f.w)]} onChange={(v) => set((f) => ({ ...f, w: +v[0] }))} />
          <Note>Show prices per</Note>
          <Chips label="Show prices per" items={UNITS.map(([, l], i) => [String(i), l[0].toUpperCase() + l.slice(1)])} on={[String(f.n)]} onChange={(v) => set((f) => ({ ...f, n: +v[0] }))} />
        </>
      )
    case "area":
      return <Areas {...p} />
    case "places":
      return <Places {...p} />
    case "more":
      return (
        <>
          {checkChips(S ? Object.entries(PTYPES).map(([k, l]) => ["p_" + k, l]) : [["t_apt", "Apartments"], ["t_off", "Officetels"]], f, set, "Building types")}
          {!S && checkChips([["t_monthly", "Monthly rent"], ["t_jeonse", "Deposit only, no rent"]], f, set, "How you pay")}
          {!DATA.site && (
            <>
              <Note>Listing sites</Note>
              {checkChips([["t_dabang", "Dabang"], ["t_zigbang", "Zigbang"]], f, set, "Listing sites")}
            </>
          )}
          <Check id="hideLow" f={f} set={set}>
            Hide low floors (1st and 2nd)
          </Check>
          {!S && (
            <>
              <Check id="unknownFee" f={f} set={set}>
                Listings with no maintenance figure (estimated from the district median)
              </Check>
              <Check id="unknownAge" f={f} set={set}>
                Listings with unknown building age (no age penalty)
              </Check>
              <Check id="partial" f={f} set={set}>
                Single rooms in a shared or split unit (their size is misleading)
              </Check>
              <Check id="shortTerm" f={f} set={set}>
                Short-term rentals
              </Check>
              <Check id="lh" f={f} set={set}>
                LH public housing (has eligibility rules)
              </Check>
              <Collapsible>
                <CollapsibleTrigger className="group flex min-h-7 items-center gap-1.5 font-semibold">
                  Adjust the formula
                  <ChevronDownIcon className="size-4 transition-transform group-data-panel-open:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-5 pt-3">
                  {sliders("more", f, set)}
                  <Note>
                    Value = (rent + maintenance + deposit × rate ÷ 12) ÷ usable m² × (1 + penalty × age ÷ 10). Lower is better. You get a deposit back, so only the cost of having that money locked up counts. The default rate is what the listings themselves imply.
                  </Note>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </>
      )
    default:
      return <>{sliders(sec, f, set)}</>
  }
}

// Each province folds away, so the district chips don't make the list endless. Chips show the English name; the Korean is in the tooltip.
function Areas({ f, set }: SecProps) {
  const on = new Set(f.a)
  return (
    <>
      <Input type="search" placeholder="Search name, neighbourhood, station" aria-label="Search listings" className="h-11 text-base" value={f.q} onChange={(e) => set((f) => ({ ...f, q: e.target.value }))} />
      {GROUPS.map(({ province, list }, gi) => {
        const keys = list.map((i) => DATA.regions[i].key)
        const n = keys.filter((k) => on.has(k)).length
        const all = n === keys.length
        return (
          <Collapsible key={province} defaultOpen={n > 0 || (gi === 0 && !on.size)} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <CollapsibleTrigger className="group flex min-h-9 items-center gap-1.5 text-base font-bold">
                {province}
                <span className="text-sm font-medium text-muted-foreground">{n ? `${n} of ${keys.length}` : keys.length}</span>
                <ChevronDownIcon className="size-4 transition-transform group-data-panel-open:rotate-180" />
              </CollapsibleTrigger>
              <Button variant="ghost" size="sm" onClick={() => set((f) => ({ ...f, a: all ? f.a.filter((k) => !keys.includes(k)) : [...new Set([...f.a, ...keys])] }))}>
                {all ? "Clear" : "Select all"}
              </Button>
            </div>
            <CollapsibleContent>
              <Chips
                label={province}
                multiple
                items={list.map((i) => [DATA.regions[i].key, districtText(DATA.regions[i].label), DATA.regions[i].label])}
                on={keys.filter((k) => on.has(k))}
                onChange={(v) => set((f) => ({ ...f, a: [...f.a.filter((k) => !keys.includes(k)), ...v] }))}
              />
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </>
  )
}

// Desktop: every section in a sticky sidebar, folded to one line that shows its current value. Budget and anything you've changed start open.
function Sec({ title, value, open, children }: { title: string; value: string; open: boolean; children: ReactNode }) {
  return (
    <Collapsible defaultOpen={open} className="border-t pt-3">
      <CollapsibleTrigger className="group flex min-h-9 w-full items-center justify-between gap-3 text-left">
        <h3 className="text-base font-bold">{title}</h3>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">{value}</span>
          <ChevronDownIcon className="size-4 flex-none transition-transform group-data-panel-open:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 pt-3 pb-1">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function Aside(p: SecProps) {
  const vals = new Map(chipText(p.f).map(([k, , v, active]) => [k, { v, active }]))
  const [opened] = useState(() => new Set(SECS.filter((k) => k === "budget" || vals.get(k)?.active)))
  const value = (k: SecKey) => {
    const v = vals.get(k)?.v
    return k === "more" ? (v ? v + " changed" : "Defaults") : k === "places" ? (v ?? "None") : (v ?? "Any")
  }
  return (
    <aside className="sticky top-[76px] flex max-h-[calc(100dvh-92px)] w-75 flex-none flex-col gap-3 overflow-y-auto rounded-2xl border bg-card p-5 [scrollbar-width:thin]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Filters</h2>
        <Button variant="ghost" size="xl" onClick={() => p.set((f) => ({ ...defaults(), u: f.u }))}>
          Reset
        </Button>
      </div>
      {SECS.map((k) => (
        <Sec key={k} title={TITLES[k]} value={value(k)} open={opened.has(k)}>
          <Section sec={k} {...p} />
        </Sec>
      ))}
    </aside>
  )
}

// Phones: a chip per section, each opening it in a bottom sheet.
export function ChipBar({ f, onOpen }: { f: Filters; onOpen: (k: SecKey) => void }) {
  return (
    <nav aria-label="Filters" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-2">
      {chipText(f).map(([k, l, v, active]) => (
        <Button key={k} variant={active ? "default" : "outline"} size="xl" className="flex-none rounded-full" onClick={() => onOpen(k)}>
          {k === "more" && v == null ? l : l + ": " + (v ?? (k === "places" ? "Add" : "Any"))}
        </Button>
      ))}
    </nav>
  )
}

export function Sheet({ sec, onClose, count, ...p }: SecProps & { sec: SecKey | null; onClose: () => void; count: number }) {
  const [last, setLast] = useState<SecKey>("budget")
  if (sec && sec !== last) setLast(sec) // keep the content while it slides away
  const k = sec ?? last
  return (
    <Drawer open={!!sec} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[88dvh] text-base">
        <DrawerHeader className="flex-row items-center justify-between">
          <DrawerTitle className="text-lg font-bold">{TITLES[k]}</DrawerTitle>
          <Button variant="ghost" size="xl" onClick={() => p.set((f) => resetSection(f, k))}>
            Reset
          </Button>
        </DrawerHeader>
        <div className={cn("flex min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-2 select-text")}>
          <Section sec={k} {...p} />
        </div>
        <DrawerFooter>
          <Note>Your filters stay saved on this device.</Note>
          <Button size="xl" className="h-12 text-base" onClick={onClose}>
            {count ? `Show ${count.toLocaleString("en-US")} listing${count === 1 ? "" : "s"}` : "No listings match"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
