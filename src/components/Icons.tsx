
interface IconProps {
  size?: number;
  className?: string;
}

function createIconProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
}

export function LayersIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 14 9 5 9-5" />
    </svg>
  );
}

export function PaperclipIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
    </svg>
  );
}

export function UnlockIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </svg>
  );
}

export function LockIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function DownloadIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  );
}

export function CopyIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function CheckIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

export function TrashIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M4 7h16" />
      <path d="M10 4h4" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function AlertIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

export function WavesIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M3 12h2l2.5-7 3 14 3-14 2.5 7h5" />
    </svg>
  );
}

export function MarkGlyph({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

export function SpinnerIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M21 12a9 9 0 1 1-4.5-7.8" />
    </svg>
  );
}

export function KeyIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <circle cx="8" cy="8" r="4.5" />
      <path d="m11.2 11.2 8.3 8.3" />
      <path d="m16 16 2-2" />
      <path d="m19 19 2-2" />
    </svg>
  );
}

export function EyeIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function EyeOffIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M4 4.5 20 20.5" />
      <path d="M9.6 6.2A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a18 18 0 0 1-3.4 4.2" />
      <path d="M6.4 8.1A17.6 17.6 0 0 0 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 3.6-.7" />
      <path d="M10.2 10.5a2.75 2.75 0 0 0 3.6 3.8" />
    </svg>
  );
}

export function GaugeIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...createIconProps(size)} className={className}>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 13 3.5-3.5" />
      <circle cx="12" cy="17" r="1.25" />
    </svg>
  );
}
