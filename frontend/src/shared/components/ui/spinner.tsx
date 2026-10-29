import { LoaderCircle } from "lucide-react"

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <output aria-label={label} className="inline-flex">
      <LoaderCircle className="animate-spin" />
    </output>
  )
}
