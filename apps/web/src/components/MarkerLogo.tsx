export function MarkerLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Airbag mark"
      focusable="false"
    >
      <circle cx="32" cy="32" r="30" fill="#0F1114" stroke="#FFD21F" strokeWidth="2" />
      <path d="M32 32 L32 2 A30 30 0 0 1 62 32 Z" fill="#FFD21F" />
      <path d="M32 32 L32 62 A30 30 0 0 1 2 32 Z" fill="#FFD21F" />
      <path d="M32 32 L62 32 A30 30 0 0 1 32 62 Z" fill="#2E3541" />
      <path d="M32 32 L2 32 A30 30 0 0 1 32 2 Z" fill="#2E3541" />
      <circle cx="32" cy="32" r="3" fill="#0F1114" stroke="#FFD21F" strokeWidth="1.5" />
    </svg>
  );
}
