import { notFound } from "next/navigation";
import { ContinuousToolExperience } from "@/components/exploration/continuous-tool-experience";

const tools = {
  "analyze-item": { title: "分析一件衣服", en: "ANALYZE AN ITEM", description: "上传或选择一件衣服，检查它与当前审美内核、穿着边界和现有衣橱的关系。" },
  "translate-trend": { title: "把趋势翻译成我的版本", en: "TRANSLATE A TREND", description: "把趋势拆解为颜色、廓形、材质、比例和搭配关系，再生成低风险个人版本。" },
  "wardrobe-experiment": { title: "使用现有衣服完成风格实验", en: "USE MY WARDROBE", description: "从现有衣服出发，一次只替换一个变量，记录什么改变真正提高了穿着意愿。" },
  "outfit-check-in": { title: "上传近期穿搭并修正画像", en: "OUTFIT CHECK-IN", description: "把真实穿着反馈加入证据层，更新稳定偏好、现实边界与当前兴趣。" },
} as const;

export default async function StudioToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const item = tools[tool as keyof typeof tools];
  if (!item) notFound();
  return <ContinuousToolExperience tool={tool as keyof typeof tools} />;
}
