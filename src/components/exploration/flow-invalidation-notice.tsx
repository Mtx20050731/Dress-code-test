import Link from "next/link";
import type { FlowInvalidation } from "@/types/style";

const labels = {
  "visual-sampling": "视觉采样",
  "archive-decode": "收藏解剖",
  "style-lab": "风格实验",
  "style-system": "个人风格系统",
};

export function FlowInvalidationNotice({ invalidation }: { invalidation?: FlowInvalidation }) {
  if (!invalidation) return null;
  return (
    <aside className="journey-note" role="status">
      <strong>后续结果已重新开放验证</strong>
      <p>{invalidation.reason}。已失效步骤：{invalidation.invalidatedSteps.map((step) => labels[step]).join("、")}。</p>
      <Link className="text-link" href="/explore">查看当前进度</Link>
    </aside>
  );
}
