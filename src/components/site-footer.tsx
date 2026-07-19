import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-intro">
        <p className="footer-brand">UNDEFINED / 未定式</p>
        <p>STYLE IS NOT A LABEL.<br />IT IS A LIVING SYSTEM.</p>
      </div>
      <div className="footer-column"><strong>EXPLORE</strong><Link href="/explore">开始或继续探索</Link><Link href="/explore/style-system">个人风格系统</Link><Link href="/studio/analyze-item">分析一件衣服</Link></div>
      <div className="footer-column"><strong>INFORMATION</strong><Link href="/about">产品方法</Link><Link href="/privacy">隐私说明</Link><Link href="/terms">使用条款</Link></div>
      <p className="footer-note">© 2026 UNDEFINED STYLE ARCHIVE — PERSONAL AESTHETIC, NEVER A FIXED DEFINITION.</p>
    </footer>
  );
}
