type EditorialVisualProps = {
  variant: "sage" | "wine" | "stone" | "ink" | "oat" | "clay";
  label?: string;
  className?: string;
};

export function EditorialVisual({ variant, label, className = "" }: EditorialVisualProps) {
  return (
    <div className={`editorial-visual visual-${variant} ${className}`} role="img" aria-label={label ?? "抽象服装廓形示意图"}>
      <span className="visual-grain" />
      <span className="silhouette silhouette-main" />
      <span className="silhouette silhouette-detail" />
      <span className="visual-index">{variant.toUpperCase()} / 26</span>
    </div>
  );
}
