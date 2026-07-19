import Link from "next/link";
import type { ExplorationStep } from "@/types/style";

export const explorationStages = [
  { id: "visual-sampling", index: "01", label: "看图选感觉", en: "LOOK & FEEL", href: "/explore/visual-sampling" },
  { id: "archive-decode", index: "02", label: "看看我的收藏", en: "MY SAVED LOOKS", href: "/explore/archive-decode" },
  { id: "style-lab", index: "03", label: "试试怎么搭", en: "TRY IT MY WAY", href: "/explore/style-lab" },
  { id: "style-system", index: "04", label: "我的风格总结", en: "MY STYLE FILE", href: "/explore/style-system" },
] as const;

export function JourneyProgress({ active, completed = [] }: { active: ExplorationStep; completed?: ExplorationStep[] }) {
  return (
    <nav className="journey-progress" aria-label="风格探索进度">
      {explorationStages.map((stage) => {
        const isActive = stage.id === active;
        const isDone = completed.includes(stage.id);
        const stageIndex = explorationStages.findIndex((item) => item.id === stage.id);
        const unlocked = stageIndex === 0 || explorationStages.slice(0, stageIndex).every((item) => completed.includes(item.id));
        const content = <>
            <span>{isDone ? "✓" : stage.index}</span>
            <div><strong>{stage.label}</strong><small>{stage.en}</small></div>
          </>;
        return <Link className={`${isActive ? "active" : ""} ${isDone ? "done" : ""} ${unlocked ? "" : "locked"}`} href={stage.href} aria-label={unlocked ? stage.label : `预览${stage.label}，完成前一步后可操作`} key={stage.id}>{content}</Link>;
      })}
    </nav>
  );
}
