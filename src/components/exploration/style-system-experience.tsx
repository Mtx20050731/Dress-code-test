"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { EvidenceInspector } from "@/components/exploration/evidence-inspector";
import { FlowInvalidationNotice } from "@/components/exploration/flow-invalidation-notice";
import { StatementCorrectionControls } from "@/components/exploration/statement-correction-controls";
import { FeedbackPanel } from "@/components/feedback-panel";
import { JourneyProgress } from "@/components/journey-progress";
import { generateStyleSystem, removeStyleStatementCorrection } from "@/features/exploration/mock-engine";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { completedSteps, readPersistentSession, saveSession } from "@/features/session/session-storage";
import type { ConfidenceLevel, EvidenceDirection, EvidenceSource, StyleSession, TasteStatement, UserIntent } from "@/types/style";

const confidenceLabels: Record<ConfidenceLevel, string> = {
  emerging: "刚刚出现",
  supported: "反复出现",
  stable: "目前很确定",
  unresolved: "还看不清",
};

const sourceLabels: Record<EvidenceSource, string> = {
  "visual-sampling": "看图选择",
  "archive-image": "你的收藏",
  "archive-confirmation": "你的确认",
  "style-lab": "搭配试穿",
  "outfit-check-in": "真实穿搭",
  "result-feedback": "你的结果修改",
};

const directionLabels: Record<EvidenceDirection, string> = {
  positive: "喜欢",
  negative: "不喜欢",
  neutral: "无明显感觉",
  aspirational: "欣赏",
  conditional: "有条件接受",
};

const intentLabels: Record<UserIntent, string> = {
  "want-to-wear": "愿意穿",
  "admire-only": "只欣赏",
  "borrow-element": "只借元素",
  uninterested: "无感",
  reject: "明确不喜欢",
};

const groups: {
  key: "coreTaste" | "aspirationalTaste" | "wearabilityBoundary" | "currentCuriosity";
  index: string;
  title: string;
  en: string;
  intro: string;
  accent: string;
}[] = [
  { key: "coreTaste", index: "01", title: "我真正会穿的", en: "WHAT FEELS LIKE ME", intro: "这些选择在不同环节里反复出现，也更接近你的日常。", accent: "#c8ff31" },
  { key: "aspirationalTaste", index: "02", title: "我会被什么吸引", en: "WHAT DRAWS ME IN", intro: "它们让你心动，但不等于你现在就想整套照穿。", accent: "#f1b7c7" },
  { key: "wearabilityBoundary", index: "03", title: "什么会让我退一步", en: "WHERE I DRAW THE LINE", intro: "不是否定一种风格，而是找出真正影响你穿着意愿的细节。", accent: "#141414" },
  { key: "currentCuriosity", index: "04", title: "我最近想试试的", en: "WHAT I WANT TO TRY", intro: "这是近期兴趣，不会被误写成长期不变的你。", accent: "#80a7ff" },
];

const entries = [
  { href: "/studio/analyze-item", no: "01", title: "看看一件衣服为什么吸引我", en: "ANALYZE AN ITEM" },
  { href: "/studio/translate-trend", no: "02", title: "把流行趋势变成我的版本", en: "TRANSLATE A TREND" },
  { href: "/studio/wardrobe-experiment", no: "03", title: "用现有衣服试一个新变化", en: "USE MY WARDROBE" },
  { href: "/studio/outfit-check-in", no: "04", title: "上传最近穿搭，继续修正结果", en: "OUTFIT CHECK-IN" },
];

function EvidenceCards({ statement, session }: { statement: TasteStatement; session: StyleSession }) {
  const evidence = session.styleSystem.output?.evidence.filter((item) => statement.evidenceIds.includes(item.id)).slice(0, 4) ?? [];
  return (
    <details className="statement-evidence-disclosure">
      <summary>为什么会有这个判断 <span>{evidence.length} 条依据</span></summary>
      <div className="statement-evidence">
        {evidence.length ? evidence.map((item) => <div key={item.id}>
          {item.imageSrc
            ? <span role="img" aria-label={item.context ?? directionLabels[item.direction]} style={{ backgroundImage: `url("${item.imageSrc}")` }} />
            : <span className="text-evidence">{sourceLabels[item.source]}</span>}
          <small>{sourceLabels[item.source]} · {directionLabels[item.direction]} · {intentLabels[item.intent]}</small>
        </div>) : <p>目前还没有足够依据，所以先不下结论。</p>}
      </div>
    </details>
  );
}

function StatementArticle({ statement, index, session, onSessionChange }: { statement: TasteStatement; index: number; session: StyleSession; onSessionChange: (next: StyleSession) => void }) {
  return <article className={index === 0 ? "featured" : ""}>
    <div className="statement-number">{String(index + 1).padStart(2, "0")}</div>
    <div className="statement-copy">
      <span className={`confidence ${statement.confidence}`}>{confidenceLabels[statement.confidence]}</span>
      <h3>{statement.title}</h3>
      <p>{statement.summary}</p>
      <EvidenceCards statement={statement} session={session} />
      <StatementCorrectionControls session={session} statement={statement} onSessionChange={onSessionChange} />
    </div>
  </article>;
}

export function StyleSystemExperience() {
  const [session, setSession] = useState<StyleSession | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void readPersistentSession().then((current) => {
        const next = current.styleSystem.output ? current : generateStyleSystem(current);
        setSession(saveSession(next));
        if (!current.styleSystem.output) appendAnalysisEvent({ eventName: "style_system_generated", sessionId: current.id, step: "style-system", payload: { evidenceCount: next.styleSystem.output?.evidence.length ?? 0, tensionCount: next.styleSystem.output?.styleTensions.length ?? 0 } });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!session?.styleSystem.output) return <div className="page-shell inner-page"><p>正在把你的选择整理成一份个人风格档案…</p></div>;

  const output = session.styleSystem.output;
  const primaryTension = output.styleTensions[0];
  const coreLead = output.coreTaste[0];
  const aspirationLead = output.aspirationalTaste[0];
  const boundaryLead = output.wearabilityBoundary[0];

  return (
    <div className="style-system-page">
      <div className="page-shell inner-page">
        <JourneyProgress active="style-system" completed={completedSteps(session)} />
        <FlowInvalidationNotice invalidation={session.flow.lastInvalidation} />

        <header className="system-editorial-cover">
          <div className="system-issue-line"><span>YOUR STYLE FILE</span><span>ISSUE 01</span><span>{new Date(output.generatedAt).toLocaleDateString("zh-CN")}</span></div>
          <div className="system-cover-grid">
            <div className="system-cover-title">
              <p className="kicker">STEP 04 · PERSONAL STYLE SYSTEM</p>
              <h1>不是一个标签，<br />是你的<span>穿衣方法。</span></h1>
            </div>
            <aside className="system-cover-note">
              <small>先看这一句</small>
              <strong>{coreLead?.title ?? "还需要更多真实选择"}</strong>
              <p>{coreLead?.summary ?? "目前资料还不够，未知部分会继续保留。"}</p>
            </aside>
          </div>
          <div className="system-cover-footer">
            <p>{primaryTension?.interpretation ?? "结果会随着你的新选择继续变化，不会把一次测试当成永久定义。"}</p>
            <div><span>已参考</span><strong>{output.evidence.length}</strong><small>次选择与确认</small></div>
            <div><span>还想了解</span><strong>{output.unresolvedQuestions.length}</strong><small>个问题</small></div>
          </div>
        </header>

        <section className="system-at-a-glance" aria-label="风格重点摘要">
          <div className="system-section-label"><span>00</span><small>AT A GLANCE</small><h2>先看重点</h2></div>
          <div className="system-glance-grid">
            <article className="glance-primary"><small>日常最像你</small><h3>{coreLead?.title ?? "还在观察"}</h3><p>{coreLead?.summary ?? "完成更多真实穿着反馈后，这里会更清楚。"}</p></article>
            <article><small>会让你心动</small><h3>{aspirationLead?.title ?? "暂时没有明显方向"}</h3><p>{aspirationLead?.summary ?? "只欣赏但不一定穿的部分，会单独放在这里。"}</p></article>
            <article className="glance-dark"><small>最需要留意</small><h3>{boundaryLead?.title ?? "边界还不清楚"}</h3><p>{boundaryLead?.summary ?? "系统不会在证据不足时替你猜。"}</p></article>
          </div>
        </section>

        <div className="taste-stories">
          {groups.map((group) => {
            const statements = output[group.key];
            const visibleStatements = statements.slice(0, 3);
            const moreStatements = statements.slice(3);
            return <section className={`taste-story taste-story-${group.key}`} key={group.key} style={{ "--story-accent": group.accent } as CSSProperties}>
              <header className="taste-story-heading"><span>{group.index}</span><div><small>{group.en}</small><h2>{group.title}</h2><p>{group.intro}</p></div></header>
              <div className="taste-story-list">
                {visibleStatements.length ? visibleStatements.map((statement, index) => <StatementArticle key={statement.id} statement={statement} index={index} session={session} onSessionChange={setSession} />) : <div className="empty-story"><strong>这里暂时留白。</strong><p>不是没有风格，而是目前还没有足够的真实选择支持结论。</p></div>}
                {moreStatements.length > 0 && <details className="more-statements"><summary>展开另外 {moreStatements.length} 个细节</summary><div>{moreStatements.map((statement, index) => <StatementArticle key={statement.id} statement={statement} index={index + 3} session={session} onSessionChange={setSession} />)}</div></details>}
              </div>
            </section>;
          })}
        </div>

        {output.styleTensions.length > 0 && <section className="system-tension-feature">
          <header><p className="kicker">TWO THINGS CAN BE TRUE</p><h2>你不必只选一边。</h2><p>有些看似矛盾的选择，其实是在不同场合表达不同需要。</p></header>
          <div>{output.styleTensions.slice(0, 2).map((tension) => <article key={tension.id}><div className="tension-sides"><span>{tension.sideA.title}</span><b>×</b><span>{tension.sideB.title}</span></div><h3>{tension.title}</h3><p>{tension.interpretation}</p><strong>可以这样穿：{tension.practicalTranslation}</strong></article>)}{output.styleTensions.length > 2 && <p className="section-overflow-note">另外 {output.styleTensions.length - 2} 组矛盾线索先不展开，之后会通过真实穿搭继续确认。</p>}</div>
        </section>}

        {output.unresolvedQuestions.length > 0 && <section className="system-open-questions">
          <div><p className="kicker">TO BE CONTINUED</p><h2>还没看清的地方</h2><p>这里不填假答案。下一次真实选择，会让它更清楚。</p></div>
          <ol>{output.unresolvedQuestions.slice(0, 4).map((question) => <li key={question.id}><span>?</span><div><strong>{question.question}</strong><p>{question.reason}</p></div></li>)}{output.unresolvedQuestions.length > 4 && <li className="section-overflow-note"><span>+</span><div><strong>还有 {output.unresolvedQuestions.length - 4} 个细节留到以后</strong><p>它们不会在证据不足时被强行写成结论。</p></div></li>}</ol>
        </section>}

        {session.styleSystem.corrections.length > 0 && <section className="system-corrections"><p className="kicker">YOU HAVE THE LAST WORD</p><h2>你已经改过的内容</h2>{session.styleSystem.corrections.map((correction) => <article key={correction.id}><h3>{correction.verdict === "denied" ? "这条不符合我" : `我认为更准确的是：${correction.editedTitle}`}</h3><button className="text-link" type="button" onClick={() => setSession(saveSession(removeStyleStatementCorrection(session, correction.statementId)))}>撤销这次修改</button></article>)}</section>}

        <nav className="revision-links" aria-label="返回修改来源"><span>想改前面的选择？</span><Link href="/explore/visual-sampling">回到看图选择</Link><Link href="/explore/archive-decode">回到收藏分析</Link><Link href="/explore/style-lab">回到搭配试验</Link></nav>

        <section className="system-trend-stories">
          <div className="system-section-label"><span>05</span><small>TREND, YOUR WAY</small><h2>流行可以这样变成你的版本</h2></div>
          <div className="trend-story-grid">{output.trendTranslations.map((translation, index) => <article key={translation.trendName}><span>0{index + 1}</span><small>本季灵感</small><h3>{translation.trendName}</h3><p>{translation.personalVersion}</p><strong>{translation.lowRiskMove}</strong><details><summary>它原本包含什么</summary><p>{translation.sourceAttributes.join(" / ")}</p></details></article>)}</div>
        </section>

        <section className="system-practical-guide">
          <article className="guide-priority"><small>SHOP WITH CLARITY</small><h3>买衣服时，先看这些</h3>{output.shoppingFilters.prioritize.map((item) => <p key={item}>+ {item}</p>)}</article>
          <article><small>DON&apos;T RUSH TO CONCLUDE</small><h3>这些先别急着下结论</h3>{output.shoppingFilters.avoidAssuming.map((item) => <p key={item}>— {item}</p>)}</article>
          <article><small>WORDS TO SEARCH</small><h3>可以直接搜的词</h3><div className="search-tags">{output.searchKeywords.map((item) => <span key={item}>{item}</span>)}</div></article>
          <article className="guide-try"><small>START SMALL</small><h3>下一次，从小变化开始</h3>{output.lowRiskExperiments.map((item) => <p key={item}>→ {item}</p>)}</article>
        </section>

        <section className="continuous-loop"><div><p className="kicker">YOUR NEXT ISSUE</p><h2>这不是结论，<br />是下一次选择的起点。</h2></div><div>{entries.map((entry) => <Link href={entry.href} key={entry.href}><span>{entry.no}</span><div><small>{entry.en}</small><strong>{entry.title}</strong></div><b>→</b></Link>)}</div></section>
        <section className="report-feedback"><FeedbackPanel /></section>
        <EvidenceInspector output={output} />
      </div>
    </div>
  );
}
