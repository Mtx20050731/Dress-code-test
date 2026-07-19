"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-shell inner-page prose-page">
      <p className="eyebrow">SOMETHING FELT OUT OF PLACE</p>
      <header className="inner-heading"><h1>刚才的理解<br />暂时中断了。</h1><p>你的选择仍留在当前浏览器里，可以重新尝试。</p></header>
      <button className="button button-primary" type="button" onClick={reset}>重新尝试 <span>↗</span></button>
    </div>
  );
}
