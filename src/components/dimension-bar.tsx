import type { StyleDimension } from "@/types/style";

export function DimensionBar({ dimension, index }: { dimension: StyleDimension; index: number }) {
  return (
    <article className="dimension-row">
      <div className="dimension-heading">
        <span className="dimension-index">0{index + 1}</span>
        <h3>{dimension.label}</h3>
        <strong>{dimension.value}</strong>
      </div>
      <div className="dimension-track" aria-label={`${dimension.label} ${dimension.value}分`}>
        <span style={{ width: `${dimension.value}%` }} />
      </div>
      <p>{dimension.description}</p>
    </article>
  );
}
