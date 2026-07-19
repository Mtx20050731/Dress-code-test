import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="未定式首页">
        <span className="brand-mark">UNDEFINED</span>
        <span className="brand-cn">未定式</span>
      </Link>
      <nav className="nav-links" aria-label="主要导航">
        <Link href="/about">METHOD</Link>
        <Link href="/explore">MY JOURNEY</Link>
        <Link className="nav-cta" href="/explore">START <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
  );
}
