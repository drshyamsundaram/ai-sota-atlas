const DISCLAIMER_TEXT =
  "Disclaimer: This site is for informational purposes only. Model rankings, usage data, pricing, capabilities and hardware results change frequently and may vary by benchmark, provider and workload. Verify current source data, licensing, security, privacy, compliance and deployment requirements before making production or purchasing decisions.";

/** Site-wide disclaimer shown directly below the header on every page. */
export function Disclaimer({
  inset = "max-w-7xl",
  className = "pt-3",
}: {
  inset?: string;
  className?: string;
}) {
  return (
    <p
      role="note"
      aria-label="Site disclaimer"
      className={`${inset} mx-auto px-6 ${className} text-xs leading-relaxed text-muted-foreground`}
    >
      {DISCLAIMER_TEXT}
    </p>
  );
}
