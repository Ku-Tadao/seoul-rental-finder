import type * as Leaflet from "leaflet"

// Leaflet loads the first time a map shows, so the list doesn't wait for it.
let loading: Promise<typeof Leaflet> | null = null
export const loadLeaflet = () =>
  (loading ??= (async () => {
    const L = (await import("leaflet")).default
    await import("leaflet/dist/leaflet.css")
    ;(window as unknown as { L: typeof Leaflet }).L = L // markercluster extends the global L
    await import("leaflet.markercluster")
    return L
  })().catch((e) => {
    loading = null // let the next open try again
    throw e
  }))

export const osmTiles = (L: typeof Leaflet, m: Leaflet.Map) =>
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m)

export const coarse = () => matchMedia("(pointer: coarse)").matches
