export const metadata = { title: "使用条款" };

export default function TermsPage() {
  return (
    <div className="page-shell inner-page prose-page">
      <header className="inner-heading"><p className="eyebrow">TERMS OF USE</p><h1>保持好奇，<br />保留判断。</h1></header>
      <p>本产品提供的是基于视觉输入的个人偏好观察和穿搭灵感，不构成医疗、身体评估或专业形象诊断。</p>
      <h2>用户上传内容</h2><p>请只上传你有权用于私人分析的内容，不要将含有敏感个人信息或未经允许的私人照片用于测试。</p>
      <h2>AI 结果</h2><p>AI 可能误解图片、场景或穿着意愿。结果应作为探索线索，而不是必须遵从的决定。</p>
    </div>
  );
}
