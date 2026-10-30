type BrandLogoProps = {
  variant?: "default" | "light" | "compact";
  className?: string;
};

/** Official ZENOX symbol, vector-traced from the original logo supplied by the project owner. */
export function BrandLogo({ variant = "default", className = "" }: BrandLogoProps) {
  return (
    <span className={`zf-brand-lockup zf-brand-lockup--${variant} ${className}`.trim()} aria-label="ZENOX Finance">
      <svg className="zf-brand-symbol" viewBox="0 0 612 508" role="img" aria-hidden="true" focusable="false">
        <path fill="#004773" d="M 239,62 47,254 239,446 310,375 263,328 239,352 141,254 239,156 383,300 385,300 431,254 Z"/>
        <path fill="#0093DD" d="M 383,62 312,133 359,180 383,156 481,254 383,352 238,207 191,254 383,446 575,254 Z"/>
      </svg>
      {variant !== "compact" && <span className="zf-brand-wordmark"><strong>ZENOX</strong><span>Finance</span></span>}
    </span>
  );
}
