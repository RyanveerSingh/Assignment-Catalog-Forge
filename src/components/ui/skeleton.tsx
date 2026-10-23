import { cn } from "cn"

/** A shimmering placeholder block (the `skeleton` utility in globals.css carries the sweep). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton rounded-lg", className)}
      {...props}
    />
  )
}

export { Skeleton }
