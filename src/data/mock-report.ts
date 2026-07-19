import type { StyleReport } from "@/types/style";

export const mockReport: StyleReport = {
  id: "demo",
  summary:
    "你偏爱的不是普通基础款，而是克制、有秩序，同时藏着一点不寻常细节的穿搭。",
  descriptors: ["清晰轮廓", "自然低饱和", "安静的存在感"],
  dimensions: [
    {
      key: "structure",
      label: "结构感",
      value: 76,
      description: "常被干净肩线、直线剪裁与有分量的外轮廓吸引。",
    },
    {
      key: "relaxation",
      label: "松弛感",
      value: 58,
      description: "喜欢留有活动空间，但不倾向完全软塌和失去形状。",
    },
    {
      key: "colorExpression",
      label: "色彩表达",
      value: 34,
      description: "色彩不是主角，更重视材质与比例产生的层次。",
    },
    {
      key: "decoration",
      label: "装饰程度",
      value: 29,
      description: "更接受一处经过思考的细节，而不是大面积堆叠。",
    },
    {
      key: "vintage",
      label: "复古倾向",
      value: 63,
      description: "偏爱有时间感的颜色与材质，但整体保持现代。",
    },
    {
      key: "experimentation",
      label: "实验度",
      value: 45,
      description: "愿意探索新鲜结构，前提是它仍能进入日常生活。",
    },
  ],
  keywords: [
    {
      name: "克制的设计感",
      explanation: "细节值得靠近才发现，不急着在第一眼证明特别。",
    },
    {
      name: "清晰但不强硬",
      explanation: "轮廓有边界和秩序，同时保留身体活动的余地。",
    },
    {
      name: "自然低饱和",
      explanation: "苔绿、烟灰、燕麦与酒红比明亮纯色更容易让你停留。",
    },
    {
      name: "局部不对称",
      explanation: "你对偏襟、错位门襟和不规则下摆有稳定兴趣。",
    },
  ],
  evidence: [
    { metric: "78%", observation: "参考画面使用中低饱和或自然色配色。" },
    { metric: "71%", observation: "外轮廓清晰，但很少出现夸张硬朗的肩部。" },
    { metric: "65%", observation: "视觉重点集中在局部结构，而非大面积装饰。" },
    { metric: "6 / 8", observation: "宽松选择仍保留腰线、肩线或面料重量。" },
  ],
  zones: [
    {
      type: "comfort",
      eyebrow: "01 / 最自然",
      title: "安静的结构感",
      summary: "这是你目前最容易穿得自在，也最能稳定复用的区域。",
      suggestions: ["短款结构外套", "直筒或微宽裤装", "哑光、有重量感的面料"],
    },
    {
      type: "extension",
      eyebrow: "02 / 向外一步",
      title: "柔和的复古秩序",
      summary: "保留清晰轮廓，增加旧色调、纹理或一件有年代感的配饰。",
      suggestions: ["暗酒红或烟草棕", "细条纹与旧金属", "简化后的复古鞋型"],
    },
    {
      type: "experiment",
    eyebrow: "03 / 降低强度",
      title: "局部先锋",
      summary: "你欣赏实验性，但现实穿着更重视不突兀；从一个变量开始更合适。",
      suggestions: ["异形小包", "不对称针织", "特殊材质与熟悉下装组合"],
    },
  ],
  palette: [
    { name: "燕麦", hex: "#D8CCBA" },
    { name: "苔绿", hex: "#747A67" },
    { name: "烟灰", hex: "#777570" },
    { name: "酒红", hex: "#744D52" },
    { name: "炭黑", hex: "#262522" },
  ],
  shoppingFilters: {
    prioritize: ["清晰肩线", "中低饱和色", "有重量感的面料", "局部结构细节", "直线或轻微宽松廓形"],
    beCarefulWith: ["大面积复杂印花", "完全软塌的长上衣", "只能单一场景使用的造型款", "难与现有衣物组合的潮流单品"],
  },
  searchKeywords: ["结构感短夹克", "低饱和直筒裤", "哑光皮质单鞋", "不对称针织上衣", "极简复古通勤"],
  firstExperiment:
    "先保留你熟悉的深色下装，只把普通上衣换成肩线更清晰、材质更有重量感的版本。一次只改变一个变量。",
};
