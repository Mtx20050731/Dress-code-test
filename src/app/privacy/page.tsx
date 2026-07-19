export const metadata = { title: "隐私说明" };

export default function PrivacyPage() {
  return (
    <div className="page-shell inner-page prose-page">
      <header className="inner-heading"><p className="eyebrow">PRIVACY FIRST</p><h1>你的收藏，<br />只属于这次理解。</h1></header>
      <p>当前前端 MVP 默认在浏览器本地生成图片预览，不会主动上传到服务器。关闭或刷新页面后，本地临时预览会失效。</p>
      <h2>未来接入真实服务时</h2>
      <ul><li>图片只用于用户发起的私人分析。</li><li>不会公开展示或加入其他用户的测试素材。</li><li>不会在未经允许的情况下用于商业素材库或模型训练。</li><li>用户可以删除原图、分析结果和分享记录。</li></ul>
      <h2>分享卡</h2><p>分享内容仅包含用户主动选择的一句话总结、少量关键词和风格维度，不默认包含原始图片或其他敏感数据。</p>
    </div>
  );
}
