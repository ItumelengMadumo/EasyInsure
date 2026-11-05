const PATHS: Record<string, string> = {
  vehicle: 'M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16M4 16h16v3h-2.5v-1.5h-11V19H4zM7.5 13h.01M16.5 13h.01',
  property: 'M3 11l9-7 9 7M5.5 9.5V20h13V9.5M10 20v-5h4v5',
  electronics: 'M5 6h14v9H5zM3 18h18M10 18l.5 1.5h3L14 18',
  furniture: 'M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 0 1 4 0v4H2v-4a2 2 0 0 1 2-2zM6 19v2M18 19v2',
  machinery: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
  marine: 'M4 18c1.5 1.5 3.5 1.5 5 0s3.5-1.5 5 0 3.5 1.5 5 0M6 18l1-9h8l2 9M10 9V4h3l2 3',
  motor_trade: 'M4 16l1.5-5.5A2 2 0 0 1 7.4 9h9.2a2 2 0 0 1 1.9 1.5L20 16M3 16h18v3h-2.5v-1.5h-11V19H3zM7 13h.01M17 13h.01M9 6h6',
  hcv: 'M3 8h10v8H3zM13 11h4l3 3v2h-7zM6 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
};

/** A line icon for an asset category, so cards are recognisable without photos. */
export function CategoryIcon({ type, size = 44 }: { type: string; size?: number }) {
  return <svg className="category-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[type] ?? PATHS.property} /></svg>;
}
