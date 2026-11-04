import { useSyncExternalStore } from "react"

export const useMedia = (q: string) =>
  useSyncExternalStore(
    (cb) => {
      const m = matchMedia(q)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => matchMedia(q).matches
  )
