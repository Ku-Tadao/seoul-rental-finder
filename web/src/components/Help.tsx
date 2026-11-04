import type { ReactNode } from "react"
import { InfoIcon } from "lucide-react"
import { cn } from "cn"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Tap or hover help for Korean terms and figures. A small (i) marks anything that explains itself.
export function Help({ text, children, className, icon = true, label }: { text: ReactNode; children?: ReactNode; className?: string; icon?: boolean; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={100} aria-label={label} className={cn("inline-flex cursor-help items-center gap-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm", className)}>
        {children}
        {icon && <InfoIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[min(340px,calc(100vw-32px))] whitespace-pre-line">{text}</PopoverContent>
    </Popover>
  )
}
