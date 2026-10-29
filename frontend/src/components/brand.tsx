import { Car } from "lucide-react"

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Car size={size * 0.6} />
    </span>
  )
}
