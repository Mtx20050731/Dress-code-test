import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-shell inner-page prose-page">
      <p className="eyebrow">404 / NOT IN THIS ARCHIVE</p>
      <header className="inner-heading"><h1>这一页还没有<br />被收藏。</h1><p>可能是地址发生了变化，也可能这张风格地图已经被删除。</p></header>
      <Link className="button button-primary" href="/">回到首页 <span>↗</span></Link>
    </div>
  );
}
