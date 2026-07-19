import Image from "next/image";
import Link from "next/link";
import { themeImageSets } from "@/data/style-exploration-mock";

const previewItems = [
  [themeImageSets["retro-color"][1], "COLOR BLOCK / RETRO"],
  [themeImageSets["crafted-layering"][2], "PATTERN / CRAFTED LAYER"],
  [themeImageSets["polished-sport"][1], "SPORT / BRIGHT CONTRAST"],
  [themeImageSets["modern-romance"][2], "FLUID / SOFT COLOR"],
] as const;

export default function Home() {
  return (
    <>
      <section className="new-hero">
        <div className="new-hero-copy">
          <p className="kicker">PERSONAL AESTHETIC RESEARCH / 2026</p>
          <h1>你的风格，<br />不该被一次选择<br />轻易定义。</h1>
          <p className="new-hero-lead">通过真实造型采样、收藏解剖、风格边界实验与持续穿着反馈，逐层验证你反复喜欢的东西。</p>
          <div className="button-row">
            <Link className="button button-primary" href="/explore">开始建立我的 STYLE MAP <span>↗</span></Link>
            <Link className="text-link" href="/about">HOW IT WORKS</Link>
          </div>
          <div className="hero-proof"><span>4</span><p>FOUR EVIDENCE LAYERS<br />不是一次测试，是一段校准过程</p></div>
        </div>
        <div className="new-hero-media">
          <div className="hero-circle" />
          <Image src={themeImageSets["retro-color"][1]} alt="复古彩度母题中的撞色与图案完整造型" fill priority unoptimized sizes="(max-width: 800px) 100vw, 56vw" />
          <div className="hero-image-note"><span>LOOK 01</span><strong>STRUCTURE<br />WITHOUT FORCE</strong></div>
          <div className="hero-side-index"><span>01</span><span>02</span><span>03</span><span>04</span></div>
        </div>
      </section>

      <section className="home-catalog page-shell section-space">
        <div className="catalog-heading">
          <p className="kicker">THE METHOD / 不是二选一</p>
          <h2>我们先提出假设，<br />再用更多证据推翻或确认。</h2>
          <p>每一步只贡献一部分观察。完成至少三层证据后，系统才会生成报告；新的输入会重新计算，而不是服从旧结论。</p>
        </div>
        <div className="method-rail">
          <article><span>01</span><strong>VISUAL SAMPLING</strong><h3>视觉趋势采样</h3><p>8—12 组自适应完整造型，区分想穿、欣赏、借元素与拒绝。</p></article>
          <article><span>02</span><strong>ARCHIVE DECODE</strong><h3>收藏解剖</h3><p>用 5—12 张真实收藏确认、否认或修改系统提出的观察。</p></article>
          <article><span>03</span><strong>STYLE LAB</strong><h3>风格边界实验</h3><p>在安全区、延伸区与实验区里替换单个造型变量。</p></article>
          <article><span>04</span><strong>STYLE SYSTEM</strong><h3>个人风格系统</h3><p>保留稳定审美、理想偏好、现实边界、当前兴趣与待探索问题。</p></article>
        </div>
      </section>

      <section className="editorial-breakdown section-space">
        <div className="page-shell breakdown-heading"><div><p className="kicker">FROM ONE LOOK TO MANY CLUES</p><h2>喜欢一套穿搭，<br />不等于喜欢它的全部。</h2></div><p>我们拆解的是肩线、比例、材质、色彩和装饰多少，然后观察哪些线索会跨图片重复出现。</p></div>
        <div className="editorial-mosaic">
          <div className="mosaic-main"><Image src={themeImageSets["crafted-layering"][2]} alt="图案、纹理与手工细节形成的丰富叠层造型" fill unoptimized sizes="55vw" /></div>
          <div className="mosaic-detail mosaic-detail-a"><Image src={themeImageSets["polished-sport"][1]} alt="亮色运动单品与整洁比例的混搭造型" fill unoptimized sizes="30vw" /></div>
          <div className="mosaic-copy"><span>ANALYSIS / 01</span><h3>整体吸引力</h3><p>姿态与造型感会先吸引你，但不直接等于真实穿着意愿。</p></div>
          <div className="mosaic-copy dark"><span>ANALYSIS / 02</span><h3>可迁移细节</h3><p>把大面积造型拆成可进入日常的结构、比例与一个局部重点。</p></div>
        </div>
      </section>

      <section className="item-preview section-space">
        <div className="page-shell">
          <div className="preview-title-row"><div><p className="kicker">STYLE LAB / NOT SHOPPING</p><h2>一次只替换一个变量，<br />确认什么真的改变穿着意愿。</h2></div><Link className="text-link" href="/explore">OPEN THE 4-STEP JOURNEY ↗</Link></div>
          <div className="preview-product-grid">
            {previewItems.map(([src, label], index) => <article key={label}><span className="product-index">0{index + 1}</span><div className="preview-look-image"><Image src={src} alt={`${label} 完整穿搭参考`} fill unoptimized sizes="25vw" /></div><div><strong>{label}</strong><small>WOULD WEAR / ADMIRE / BORROW / PASS</small></div></article>)}
          </div>
        </div>
      </section>

      <section className="home-final-cta">
        <p className="kicker">NO PERMANENT LABELS</p><h2>不是告诉你“你是谁”，<br />而是让你更清楚如何选择。</h2>
        <Link className="button button-light" href="/explore">BUILD MY STYLE MAP <span>↗</span></Link>
      </section>
    </>
  );
}
