import type { CSSProperties } from "react";

type BrandLogoProps = {
  variant?: "default" | "light" | "compact";
  className?: string;
};

export function BrandLogo({ variant = "default", className = "" }: BrandLogoProps) {
  const compact = variant === "compact";
  return (
    <span className={`zf-brand-lockup zf-brand-lockup--${variant} ${className}`.trim()} aria-label="ZENOX Finance">
      <svg className="zf-brand-symbol" viewBox="0 0 64 64" role="img" aria-hidden="true" style={{ "--logo-blue": "#2563eb" } as CSSProperties}>
        <defs>
          <linearGradient id="zenox-mark-gradient" x1="8" y1="5" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1687ff" />
            <stop offset="1" stopColor="#0754d8" />
          </linearGradient>
        </defs>
        <path fill="url(#zenox-mark-gradient)" d="M25.2 3.7c3.8-3.5 9.8-3.5 13.6 0l21.5 19.9c2.1 2 2.1 5.3 0 7.3L39.1 50.2 24.5 36.7l12.1-11.2-4.2-3.9-16.3 15.1L3.7 25.5c-2.1-2-2.1-5.3 0-7.3L25.2 3.7Z"/>
        <path fill="url(#zenox-mark-gradient)" d="m24.9 42.3 14.4 13.3c3.8 3.5 9.8 3.5 13.6 0l7.4-6.9c2.1-2 2.1-5.3 0-7.3L43.8 24.5 29.4 37.8l4.2 3.9-4.3 4-4.4-4.1Z"/>
        <path d="m16.1 36.7 16.2 15 11.5-10.7" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {!compact && <span className="zf-brand-wordmark"><strong>ZENOX</strong><span>Finance</span></span>}
    </span>
  );
}
