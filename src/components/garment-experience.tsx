"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useState } from "react";

export function GarmentExperience() {
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setResult(false);
  }

  return (
    <>
      {!preview ? (
        <label className="upload-zone">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} />
          <span className="upload-plus" aria-hidden="true">＋</span>
          <strong>上传商品截图或衣柜照片</strong>
          <small>我们会结合刚才的风格地图解释，不只给一个适合度分数</small>
        </label>
      ) : (
        <div className="garment-layout">
          <div className="garment-preview"><Image src={preview} alt="待分析的服装" fill unoptimized /></div>
          <div className="garment-controls">
            {!result ? (
              <><p className="eyebrow">READY TO COMPARE</p><h2>这件衣服会如何进入你的风格地图？</h2><p className="muted">演示模式会使用预设的结构化结果，未来可替换为真实多模态分析服务。</p><button className="button button-primary" type="button" onClick={() => setResult(true)}>查看模拟分析 <span>↗</span></button></>
            ) : (
              <div className="garment-result">
                <p className="eyebrow">GARMENT NOTES / MOCK</p>
          <h2>颜色和轮廓很接近你，但装饰细节是否过多还需要确认。</h2>
                <div className="result-block"><strong>与你匹配的部分</strong><p>低饱和颜色、清晰外轮廓和有重量感的材质，延续了你偏爱的“安静结构感”。</p></div>
                <div className="result-block"><strong>可能产生冲突</strong><p>局部装饰明显高于你的日常舒适区，如果同时加入复杂配饰，容易失去你喜欢的留白。</p></div>
                <div className="result-block"><strong>降低试错成本</strong><p>先用你已有的深色直筒裤和简洁鞋型搭配，让这件衣服成为全身唯一的视觉重点。</p></div>
                <div className="tag-row"><span className="tag">通勤</span><span className="tag">看展</span><span className="tag">周末聚会</span></div>
              </div>
            )}
            <label className="text-link" style={{ cursor: "pointer" }}>换一张图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} hidden /></label>
          </div>
        </div>
      )}
    </>
  );
}
