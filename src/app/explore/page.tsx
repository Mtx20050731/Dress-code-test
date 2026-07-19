import Link from "next/link";
import { JourneyOverview } from "@/components/journey-overview";

export const metadata = { title: "建立个人风格系统" };

export default function ExplorePage() {
  return (
    <div className="page-shell inner-page journey-page">
      <Link className="back-link" href="/">← BACK TO HOME</Link>
      <header className="journey-header"><p className="kicker">ADAPTIVE STYLE RESEARCH / 4 CONNECTED STEPS</p><h1>不是一次测试，<br />而是一套持续校正系统。</h1><p>从真实造型反应开始，用个人收藏验证，再在完整场景造型中测试边界。系统保留冲突和未知，不用固定风格类别替你下结论。</p></header>
      <JourneyOverview />
    </div>
  );
}
