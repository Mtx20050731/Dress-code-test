import type {
  ArchiveCluster,
  ArchiveImage,
  ArchiveObservation,
  AttributeDimension,
  AttributeToken,
  StyleDirection,
  TrendIntensity,
  TrendLook,
  TrendTheme,
} from "@/types/style";

export const attributeTokens: AttributeToken[] = [
  { id: "color-neutral-low", dimension: "color", label: "中性低饱和" },
  { id: "color-earth", dimension: "color", label: "自然土色" },
  { id: "color-accent", dimension: "color", label: "局部亮色" },
  { id: "color-high-saturation", dimension: "color", label: "高饱和色彩" },
  { id: "color-bright-contrast", dimension: "color", label: "大胆撞色" },
  { id: "color-pastel", dimension: "color", label: "柔和彩色" },
  { id: "color-monochrome", dimension: "color", label: "单色层次" },
  { id: "silhouette-clean", dimension: "silhouette", label: "清晰直线" },
  { id: "silhouette-structured-medium", dimension: "silhouette", label: "中低强度结构" },
  { id: "silhouette-dramatic-structure", dimension: "silhouette", label: "戏剧化强结构" },
  { id: "silhouette-soft", dimension: "silhouette", label: "柔软垂坠" },
  { id: "silhouette-volume", dimension: "silhouette", label: "放量廓形" },
  { id: "silhouette-fitted", dimension: "silhouette", label: "贴身收束" },
  { id: "material-crisp", dimension: "material", label: "挺括密实" },
  { id: "material-fluid", dimension: "material", label: "流动轻薄" },
  { id: "material-textured", dimension: "material", label: "可见纹理" },
  { id: "material-technical", dimension: "material", label: "机能科技感" },
  { id: "material-crochet", dimension: "material", label: "钩织与手工纹理" },
  { id: "proportion-long", dimension: "proportion", label: "纵向长比例" },
  { id: "proportion-short-long", dimension: "proportion", label: "上短下长" },
  { id: "proportion-balanced", dimension: "proportion", label: "平衡比例" },
  { id: "ornament-reduced", dimension: "ornament", label: "克制装饰" },
  { id: "ornament-crafted", dimension: "ornament", label: "手工细节" },
  { id: "ornament-print", dimension: "ornament", label: "图案与印花" },
  { id: "styling-layered", dimension: "stylingRelation", label: "多层叠穿" },
  { id: "styling-one-focus", dimension: "stylingRelation", label: "单一视觉重点" },
  { id: "styling-contrast", dimension: "stylingRelation", label: "软硬对比" },
  { id: "styling-color-block", dimension: "stylingRelation", label: "色块关系" },
  { id: "styling-sport-romance", dimension: "stylingRelation", label: "运动与柔意混搭" },
  { id: "styling-formal-footwear", dimension: "stylingRelation", label: "正式鞋型" },
  { id: "styling-relaxed-footwear", dimension: "stylingRelation", label: "低正式度鞋型" },
  { id: "accessory-quiet", dimension: "accessory", label: "低存在感配饰" },
  { id: "accessory-sculptural", dimension: "accessory", label: "雕塑感配饰" },
  { id: "accessory-bold", dimension: "accessory", label: "高存在感配饰" },
  { id: "mood-composed", dimension: "mood", label: "冷静有秩序" },
  { id: "mood-relaxed", dimension: "mood", label: "松弛自然" },
  { id: "mood-romantic", dimension: "mood", label: "现代柔和" },
  { id: "mood-playful", dimension: "mood", label: "轻巧玩味" },
];

const token = (id: string) => attributeTokens.find((item) => item.id === id)!;

const pexelsImage = (photoId: string) =>
  `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=1400`;

export const themeImageSets: Record<string, [string, string, string]> = {
  "quiet-structure": [
    "/images/style-v3/quiet-structure-daily-v1.png",
    "/images/style-v3/quiet-structure-expressive-v1.png",
    "/images/style-v3/quiet-structure-experimental-v1.png",
  ],
  "soft-utility": [pexelsImage("23602546"), pexelsImage("33761974"), pexelsImage("34225951")],
  "modern-romance": [pexelsImage("33034118"), pexelsImage("36849252"), pexelsImage("32506810")],
  "relaxed-tailoring": [pexelsImage("33401555"), pexelsImage("33402061"), pexelsImage("36752321")],
  "sculptural-mono": [pexelsImage("31042857"), pexelsImage("28455229"), pexelsImage("33798258")],
  "retro-color": [pexelsImage("28743379"), pexelsImage("31576817"), pexelsImage("30661120")],
  "crafted-layering": [pexelsImage("30039346"), pexelsImage("33231171"), pexelsImage("33744986")],
  "polished-sport": [pexelsImage("28774867"), pexelsImage("16122061"), pexelsImage("16122088")],
};

const images = Object.values(themeImageSets).flat();

export const trendIntensityGuide: Record<TrendIntensity, { label: string; badge: string; description: string }> = {
  daily: { label: "日常好穿版", badge: "好穿版", description: "单品和搭配更接近日常，主要判断你是否真的愿意穿。" },
  expressive: { label: "更有存在感版", badge: "吸睛版", description: "保留同一方向，但颜色、廓形或层次更明显。" },
  experimental: { label: "大胆尝试版", badge: "大胆版", description: "用更强烈的版本试探边界，不代表系统建议你照搬。" },
};

function makeTheme(
  id: string,
  name: string,
  englishName: string,
  description: string,
  attributes: string[],
  imageOffset: number,
  imageSet?: [string, string, string],
): TrendTheme {
  const intensities: TrendIntensity[] = ["daily", "expressive", "experimental"];
  const looks: TrendLook[] = intensities.map((intensity, index) => ({
    id: `${id}-${intensity}`,
    themeId: id,
    intensity,
    title: `${name} · ${trendIntensityGuide[intensity].label}`,
    imageSrc: imageSet?.[index] ?? images[(imageOffset + index) % images.length],
    imageAlt: `${name}的${trendIntensityGuide[intensity].label}完整人物穿搭参考`,
    attributes: attributes.map(token),
  }));
  return { id, name, englishName, description, looks };
}

export const trendThemes: TrendTheme[] = [
  makeTheme("quiet-structure", "安静结构", "QUIET STRUCTURE", "清晰线条与低饱和色共同建立秩序。", ["color-neutral-low", "silhouette-clean", "material-crisp", "ornament-reduced", "mood-composed"], 0, themeImageSets["quiet-structure"]),
  makeTheme("soft-utility", "柔软机能", "SOFT UTILITY", "工装、街头色彩与松弛比例共同降低功能服的攻击性。", ["color-accent", "silhouette-volume", "material-technical", "styling-layered", "mood-relaxed"], 2, themeImageSets["soft-utility"]),
  makeTheme("modern-romance", "现代柔意", "MODERN ROMANCE", "柔和彩色、流动面料与清晰长比例并存。", ["color-pastel", "silhouette-soft", "material-fluid", "proportion-long", "mood-romantic"], 4, themeImageSets["modern-romance"]),
  makeTheme("relaxed-tailoring", "松弛剪裁", "RELAXED TAILORING", "西装结构被放量轮廓、街头环境与轻松搭配软化。", ["color-accent", "silhouette-clean", "silhouette-volume", "material-crisp", "styling-contrast", "mood-relaxed"], 6, themeImageSets["relaxed-tailoring"]),
  makeTheme("sculptural-mono", "单色雕塑", "SCULPTURAL MONO", "用单色层次放大廓形和配饰的形体感。", ["color-monochrome", "silhouette-volume", "proportion-long", "accessory-sculptural", "mood-composed"], 8, themeImageSets["sculptural-mono"]),
  makeTheme("retro-color", "复古彩度", "RETRO COLOR", "撞色、印花与现代比例组合，而不是复刻单一年代。", ["color-bright-contrast", "material-textured", "ornament-print", "proportion-short-long", "styling-color-block", "mood-playful"], 10, themeImageSets["retro-color"]),
  makeTheme("crafted-layering", "手工叠层", "CRAFTED LAYERING", "钩织、图案和不完全对称形成具有手感的丰富层次。", ["color-bright-contrast", "material-crochet", "ornament-crafted", "ornament-print", "styling-layered", "accessory-bold"], 1, themeImageSets["crafted-layering"]),
  makeTheme("polished-sport", "精致运动", "POLISHED SPORT", "运动单品与亮色、柔软元素和整洁比例重新组合。", ["color-accent", "material-technical", "proportion-balanced", "styling-sport-romance", "mood-playful"], 5, themeImageSets["polished-sport"]),
];

export const archiveIntentLabels = {
  "want-to-wear": "真的想穿",
  "borrow-element": "只喜欢元素",
  "atmosphere-only": "只喜欢图片氛围",
  "ideal-self": "理想中的自己",
} as const;

export const dimensionLabels: Record<AttributeDimension, string> = {
  color: "颜色",
  silhouette: "版型轮廓",
  material: "材质",
  proportion: "长短比例",
  ornament: "装饰细节",
  stylingRelation: "怎么搭",
  accessory: "配饰",
  mood: "整体感觉",
};

export function makeSampleArchive(createdAt = "2026-01-01T00:00:00.000Z"): ArchiveImage[] {
  const localSamples = Array.from({ length: 6 }, (_, index) => `/images/style-v3/look-${String(index + 1).padStart(2, "0")}.png`);
  return localSamples.map((previewSrc, index) => ({
    id: `archive-${index + 1}`,
    name: `收藏参考 ${String(index + 1).padStart(2, "0")}`,
    previewSrc,
    intent: index < 3 ? "want-to-wear" : index < 5 ? "borrow-element" : "ideal-self",
    focusMarks: [],
    attributeIds: index % 2
      ? ["color-neutral-low", "silhouette-volume", "material-textured"]
      : ["silhouette-clean", "proportion-long", "ornament-reduced"],
    createdAt,
  }));
}

export function mockDecodeArchive(imagesToDecode: ArchiveImage[]): {
  clusters: ArchiveCluster[];
  observations: ArchiveObservation[];
} {
  const ids = imagesToDecode.map((image) => image.id);
  return {
    clusters: [
      { id: "cluster-structure", title: "清晰外轮廓", imageIds: ids.filter((_, index) => index % 2 === 0), attributeIds: ["silhouette-clean", "proportion-long"] },
      { id: "cluster-softness", title: "放量与纹理", imageIds: ids.filter((_, index) => index % 2 === 1), attributeIds: ["silhouette-volume", "material-textured"] },
    ],
    observations: [
      { id: "obs-color", dimension: "color", title: "中性低饱和反复出现", description: "系统在多张收藏中观察到黑、米白、烟灰和自然土色。", attributeIds: ["color-neutral-low", "color-earth"], imageIds: ids.slice(0, 4), verdict: "pending" },
      { id: "obs-shape", dimension: "silhouette", title: "轮廓有空间，但边界清楚", description: "偏好的宽松并不是软塌，而是保留肩线或纵向线条。", attributeIds: ["silhouette-clean", "silhouette-volume"], imageIds: ids.slice(1, 5), verdict: "pending" },
      { id: "obs-material", dimension: "material", title: "可见纹理比光泽更稳定", description: "针织、斜纹和有重量的面料比亮面材质出现得更多。", attributeIds: ["material-textured", "material-crisp"], imageIds: ids.slice(0, 5), verdict: "pending" },
      { id: "obs-relation", dimension: "stylingRelation", title: "常用一个重点组织全身", description: "画面通常只有一个显著轮廓、颜色或配饰重点。", attributeIds: ["styling-one-focus", "ornament-reduced"], imageIds: ids.slice(2, 6), verdict: "pending" },
      { id: "obs-mood", dimension: "mood", title: "冷静与松弛同时存在", description: "这是一条待确认的张力，不被归入任何固定风格类别。", attributeIds: ["mood-composed", "mood-relaxed"], imageIds: ids, verdict: "pending" },
    ],
  };
}

export function mockStyleDirections(evidenceIds: string[]): StyleDirection[] {
  const base = [
    { id: "direction-structure", title: "清晰轮廓 × 松弛内部", rationale: "来自视觉采样中的结构线索，以及收藏中反复出现的放量比例。", scene: "通勤 / 见朋友", images: [images[0], images[5], images[8]] },
    { id: "direction-texture", title: "低饱和 × 可见纹理", rationale: "保留中性色的可重复性，用材质而不是装饰增加信息量。", scene: "约会 / 看展", images: [images[3], images[6], images[10]] },
  ];
  return base.map((direction) => ({
    id: direction.id,
    title: direction.title,
    rationale: direction.rationale,
    sourceEvidenceIds: evidenceIds,
    variants: (["safe", "extension", "experiment"] as const).map((zone, index) => ({
      id: `${direction.id}-${zone}`,
      zone,
      title: zone === "safe" ? "现在就会穿" : zone === "extension" ? "多试一点" : "大胆看看",
      imageSrc: direction.images[index],
      imageAlt: `${direction.title}${zone}完整人物造型`,
      scene: direction.scene,
      attributes: {
        color: index === 2 ? "局部酸性色" : "中性低饱和",
        silhouette: index === 0 ? "清晰直线" : "放量廓形",
        material: index === 0 ? "挺括棉质" : "可见纹理",
        proportion: index === 2 ? "上短下长" : "纵向长比例",
        ornament: index === 2 ? "一处装饰重点" : "克制装饰",
        stylingRelation: index === 0 ? "单一重点" : "软硬对比",
        accessory: index === 2 ? "雕塑感配饰" : "低存在感配饰",
        mood: index === 0 ? "冷静有秩序" : "松弛自然",
      },
      attributeKeys: {
        color: index === 2 ? "color-accent" : "color-neutral-low",
        silhouette: index === 0 ? "silhouette-structured-medium" : "silhouette-volume",
        material: index === 0 ? "material-crisp" : "material-textured",
        proportion: index === 2 ? "proportion-short-long" : "proportion-long",
        ornament: index === 2 ? "ornament-crafted" : "ornament-reduced",
        stylingRelation: index === 0 ? "styling-one-focus" : "styling-contrast",
        accessory: index === 2 ? "accessory-sculptural" : "accessory-quiet",
        mood: index === 0 ? "mood-composed" : "mood-relaxed",
      },
      wearingIntent: "pending",
    })),
    swapOptions: [
      { id: `${direction.id}-color`, dimension: "color", elementKey: "color", label: "颜色换成烟灰", value: "烟灰中性色", attributeKey: "color-neutral-low", limitingFactor: "色彩强度" },
      { id: `${direction.id}-shape`, dimension: "silhouette", elementKey: "silhouette", label: "廓形减少一档", value: "微宽松直线", attributeKey: "silhouette-structured-medium", limitingFactor: "廓形强度" },
      { id: `${direction.id}-bottom`, dimension: "proportion", elementKey: "bottom", label: "下装改为熟悉直筒", value: "直筒下装", attributeKey: "proportion-balanced", limitingFactor: "下装比例" },
      { id: `${direction.id}-shoe`, dimension: "stylingRelation", elementKey: "shoe", label: "鞋改为低存在感", value: "轻量平底鞋", attributeKey: "styling-relaxed-footwear", limitingFactor: "正式度" },
      { id: `${direction.id}-bag`, dimension: "accessory", elementKey: "bag", label: "包改为软结构", value: "柔软肩背包", attributeKey: "accessory-quiet", limitingFactor: "配饰存在感" },
      { id: `${direction.id}-material`, dimension: "material", elementKey: "material", label: "材质降低光泽", value: "哑光纹理", attributeKey: "material-textured", limitingFactor: "材质光泽" },
      { id: `${direction.id}-accessory`, dimension: "ornament", elementKey: "accessory", label: "移除显眼配饰", value: "无装饰重点", attributeKey: "ornament-reduced", limitingFactor: "装饰强度" },
    ],
  }));
}
