/** Frame-level inline icons (ui-layout carries no icon dependency). */

/**
 * 16px three-stroke hamburger for the compact drawer toggle.
 * @param props.size - square side in px (default 16).
 * @param props.className - extra svg class.
 * @returns the icon svg.
 */
export function IconMenuOutline16({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
