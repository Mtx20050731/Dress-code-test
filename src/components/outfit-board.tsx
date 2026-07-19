import { GarmentIllustration, type GarmentType } from "@/components/garment-illustration";

export function OutfitBoard({ index, title, note, pieces, tone }: { index: string; title: string; note: string; pieces: GarmentType[]; tone: "ink" | "bone" | "olive" | "wine" | "gray" | "clay" }) {
  return <article className="outfit-board"><span>{index}</span><div className="outfit-piece-stack">{pieces.map((piece, i) => <div key={`${piece}-${i}`}><GarmentIllustration type={piece} tone={tone} /></div>)}</div><div><small>COMPLETE LOOK</small><h3>{title}</h3><p>{note}</p></div></article>;
}
