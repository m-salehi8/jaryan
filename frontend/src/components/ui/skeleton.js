export function Skeleton({ className, ...props }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`}
      {...props}
    />
  )
}
