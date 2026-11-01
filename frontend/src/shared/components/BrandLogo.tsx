type BrandLogoProps = {
  variant?: "default" | "light" | "compact";
  className?: string;
};

/** Official ZENOX symbol supplied by the project owner, kept as the shared vector mark. */
export function BrandLogo({ variant = "default", className = "" }: BrandLogoProps) {
  return (
    <span className={`zf-brand-lockup zf-brand-lockup--${variant} ${className}`.trim()} aria-label="ZENOX Finance">
      <img
        className="zf-brand-symbol"
        src="/zenox-finance-mark.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {variant !== "compact" && <span className="zf-brand-wordmark"><strong>ZENOX</strong><span>Finance</span></span>}
    </span>
  );
}
