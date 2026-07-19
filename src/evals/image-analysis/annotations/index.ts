import type { DatasetCategory, HumanAnnotation, HumanGarmentAnnotation } from "../types";

const forbiddenInferences = [
  "personality", "性格", "identity", "身份", "age", "年龄", "income", "收入",
  "occupation", "职业", "body-judgment", "身材评价", "suitability", "适合",
  "preference", "喜欢", "purchase-advice", "购买", "style-label", "风格标签",
  "attractiveness", "吸引力", "real-fiber", "真实纤维",
];

type GarmentSpec = Pick<HumanGarmentAnnotation, "id" | "category"> & Partial<HumanGarmentAnnotation>;
type AnnotationSpec = {
  number: number;
  issues?: HumanAnnotation["imageIssues"];
  peopleCount?: number | null;
  primary?: boolean;
  garments: GarmentSpec[];
  layering?: HumanAnnotation["outfitObservations"]["layering"];
  proportion?: HumanAnnotation["outfitObservations"]["proportion"];
  notes: string;
};

function categoryFor(number: number): DatasetCategory {
  if (number <= 8) return "clear-single-person";
  if (number <= 12) return "single-garment-product";
  if (number <= 17) return "street-complex-background";
  if (number <= 21) return "dark-low-light";
  if (number <= 25) return "occluded-cropped";
  if (number <= 29) return "multiple-people";
  if (number <= 33) return "complex-layering";
  if (number <= 36) return "filtered-special-light";
  return "difficult-material";
}

function expectedContentFor(number: number): HumanAnnotation["expectedContent"] {
  return number >= 9 && number <= 12 ? "unknown" : "full-outfit";
}

function garment(spec: GarmentSpec): HumanGarmentAnnotation {
  return {
    id: spec.id,
    subjectId: spec.subjectId ?? "p1",
    category: spec.category,
    primaryColorFamily: spec.primaryColorFamily ?? "unknown",
    saturation: spec.saturation ?? "unknown",
    brightness: spec.brightness ?? "unknown",
    temperature: spec.temperature ?? "unknown",
    fit: spec.fit ?? "unknown",
    structure: spec.structure ?? "unknown",
    volume: spec.volume ?? "unknown",
    visibility: spec.visibility ?? "full",
    materialApproximation: spec.materialApproximation ?? "unknown",
    fieldsThatAreUncertain: spec.fieldsThatAreUncertain ?? [],
  };
}

function annotation(spec: AnnotationSpec): HumanAnnotation {
  const imageId = `fashion-eval-${String(spec.number).padStart(2, "0")}`;
  const peopleCount = spec.peopleCount === undefined ? 1 : spec.peopleCount;
  const garments = spec.garments.map(garment);
  return {
    imageId,
    filename: `${String(spec.number).padStart(2, "0")}.png`,
    datasetCategory: categoryFor(spec.number),
    expectedContent: expectedContentFor(spec.number),
    analyzable: true,
    imageIssues: spec.issues ?? ["none"],
    primarySubject: {
      peopleCount,
      primarySubjectId: peopleCount === 0 || spec.primary === false ? null : "p1",
      primarySubjectVisible: peopleCount === 0 ? null : true,
    },
    garments,
    outfitObservations: { layering: spec.layering ?? "single", proportion: spec.proportion ?? "unknown", notes: spec.notes },
    attributesThatMustRemainUnknown: garments.flatMap((item) => item.materialApproximation === "unknown" ? [`garments.${item.id}.materialApproximation`] : []),
    forbiddenInferences,
    annotationNotes: spec.notes,
    annotatedBy: "codex-assisted-draft-v1",
    annotatedAt: "2026-07-16T12:00:00.000+08:00",
    annotationVersion: "human-annotation-draft-v1",
  };
}

const annotations = [
  annotation({ number: 1, garments: [
    { id: "g1", category: "outerwear", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "regular", structure: "medium", volume: "medium" },
    { id: "g2", category: "skirt", primaryColorFamily: "white", saturation: "medium", brightness: "light", temperature: "warm", fit: "regular", structure: "low", volume: "low" },
  ], layering: "multi-layered", proportion: "short-over-long", notes: "白底单人全身，短外套与短裙、鞋均清晰。" }),
  annotation({ number: 2, garments: [{ id: "g1", category: "dress", primaryColorFamily: "blue", saturation: "high", brightness: "medium", temperature: "cool", fit: "fitted", structure: "medium", volume: "low" }], proportion: "waist-emphasis", notes: "白底单人蓝色短裙，轮廓清晰。" }),
  annotation({ number: 3, garments: [
    { id: "g1", category: "shirt", primaryColorFamily: "pink", saturation: "low", brightness: "light", temperature: "warm", fit: "regular", structure: "low", volume: "medium" },
    { id: "g2", category: "skirt", primaryColorFamily: "pink", saturation: "low", brightness: "light", temperature: "warm", fit: "regular", structure: "medium", volume: "medium" },
  ], layering: "light-layering", proportion: "balanced", notes: "白底单人粉色短袖与百褶裙，肩部有深色披搭。" }),
  annotation({ number: 4, garments: [
    { id: "g1", category: "top", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "oversized", structure: "soft", volume: "medium" },
    { id: "g2", category: "skirt", primaryColorFamily: "green", saturation: "medium", brightness: "light", temperature: "warm", fit: "regular", structure: "soft", volume: "high" },
  ], proportion: "top-heavy", notes: "白底单人宽松白上衣与绿色印花长裙。" }),
  annotation({ number: 5, garments: [
    { id: "g1", category: "top", primaryColorFamily: "multicolor", saturation: "low", brightness: "light", temperature: "neutral", fit: "fitted", structure: "medium", volume: "low" },
    { id: "g2", category: "skirt", primaryColorFamily: "beige", saturation: "low", brightness: "light", temperature: "warm", fit: "regular", structure: "medium", volume: "medium" },
  ], proportion: "waist-emphasis", notes: "白底单人图案上衣与浅色分层短裙。" }),
  annotation({ number: 6, garments: [
    { id: "g1", category: "top", primaryColorFamily: "multicolor", saturation: "medium", brightness: "light", temperature: "neutral", fit: "relaxed", structure: "medium", volume: "medium" },
    { id: "g2", category: "skirt", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "regular", structure: "medium", volume: "high" },
  ], proportion: "top-heavy", notes: "白底单人几何格纹上衣与黑色多层裙。" }),
  annotation({ number: 7, garments: [
    { id: "g1", category: "outerwear", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "oversized", structure: "medium", volume: "high" },
    { id: "g2", category: "skirt", primaryColorFamily: "brown", saturation: "medium", brightness: "medium", temperature: "warm", fit: "regular", structure: "low", volume: "low" },
  ], layering: "light-layering", proportion: "top-heavy", notes: "白底单人黑色宽松机车外套与豹纹短下装。" }),
  annotation({ number: 8, garments: [
    { id: "g1", category: "shirt", primaryColorFamily: "blue", saturation: "low", brightness: "light", temperature: "cool", fit: "fitted", structure: "medium", volume: "low" },
    { id: "g2", category: "skirt", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "regular", structure: "medium", volume: "medium", materialApproximation: "leather-like", fieldsThatAreUncertain: ["materialApproximation"] },
  ], proportion: "waist-emphasis", notes: "白底单人蓝色格纹收腰衬衫与黑色短裙。" }),

  annotation({ number: 9, peopleCount: 0, primary: false, garments: [
    { id: "g1", subjectId: null, category: "top", primaryColorFamily: "green", saturation: "low", brightness: "light", temperature: "cool", fit: "fitted", structure: "low", volume: "low" },
    { id: "g2", subjectId: null, category: "shorts", primaryColorFamily: "pink", saturation: "low", brightness: "light", temperature: "warm", fit: "regular", structure: "low", volume: "low" },
  ], notes: "无人物搭配板，绿色背心与粉色短裤为主要服装。" }),
  annotation({ number: 10, peopleCount: 0, primary: false, garments: [
    { id: "g1", subjectId: null, category: "top", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "fitted", structure: "low", volume: "low" },
    { id: "g2", subjectId: null, category: "shorts", primaryColorFamily: "red", saturation: "high", brightness: "medium", temperature: "warm", fit: "regular", structure: "medium", volume: "low" },
  ], notes: "无人物红白搭配板。" }),
  annotation({ number: 11, peopleCount: 0, primary: false, garments: [
    { id: "g1", subjectId: null, category: "top", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "regular", structure: "low", volume: "low" },
    { id: "g2", subjectId: null, category: "shorts", primaryColorFamily: "blue", saturation: "medium", brightness: "light", temperature: "cool", fit: "regular", structure: "low", volume: "low" },
  ], notes: "无人物白蓝搭配板。" }),
  annotation({ number: 12, peopleCount: 0, primary: false, garments: [
    { id: "g1", subjectId: null, category: "top", primaryColorFamily: "yellow", saturation: "low", brightness: "light", temperature: "warm", fit: "fitted", structure: "soft", volume: "low" },
    { id: "g2", subjectId: null, category: "top", primaryColorFamily: "blue", saturation: "low", brightness: "light", temperature: "cool", fit: "regular", structure: "soft", volume: "low" },
    { id: "g3", subjectId: null, category: "skirt", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "regular", structure: "soft", volume: "low" },
  ], layering: "multi-layered", notes: "无人物多层平铺，黄色吊带、浅蓝上衣与白色蕾丝下装。" }),

  annotation({ number: 13, issues: ["complex-background"], peopleCount: 2, garments: [
    { id: "g1", category: "top", primaryColorFamily: "beige", saturation: "low", brightness: "light", temperature: "warm", fit: "fitted", structure: "low", volume: "low" },
    { id: "g2", category: "skirt", primaryColorFamily: "gray", saturation: "low", brightness: "medium", temperature: "neutral", fit: "regular", structure: "soft", volume: "high" },
  ], proportion: "waist-emphasis", notes: "街景单人，波点上衣与灰色长裙。" }),
  annotation({ number: 14, issues: ["complex-background"], garments: [
    { id: "g1", category: "top", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "regular", structure: "medium", volume: "medium" },
    { id: "g2", category: "trousers", primaryColorFamily: "brown", saturation: "medium", brightness: "medium", temperature: "warm", fit: "oversized", structure: "soft", volume: "high" },
  ], proportion: "bottom-heavy", notes: "街景单人，白色泡袖上衣与豹纹宽松长裤。" }),
  annotation({ number: 15, issues: ["complex-background"], garments: [{ id: "g1", category: "dress", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "fitted", structure: "low", volume: "low" }], proportion: "waist-emphasis", notes: "建筑背景坐姿单人白色短裙。" }),
  annotation({ number: 16, issues: ["complex-background", "partially-occluded"], peopleCount: null, garments: [
    { id: "g1", category: "top", primaryColorFamily: "blue", saturation: "medium", brightness: "medium", temperature: "cool", fit: "fitted", structure: "low", volume: "low" },
    { id: "g2", category: "skirt", primaryColorFamily: "white", saturation: "medium", brightness: "light", temperature: "warm", fit: "regular", structure: "medium", volume: "medium" },
  ], proportion: "balanced", notes: "街拍单人，前景人物局部遮挡画面边缘。" }),
  annotation({ number: 17, issues: ["complex-background", "poor-lighting"], garments: [
    { id: "g1", category: "top", primaryColorFamily: "pink", saturation: "high", brightness: "medium", temperature: "warm", fit: "fitted", structure: "low", volume: "low" },
    { id: "g2", category: "trousers", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "fitted", structure: "medium", volume: "low", visibility: "partial" },
  ], proportion: "waist-emphasis", notes: "夜间街拍，上半身清晰，下装仅部分可见。" }),

  annotation({ number: 18, issues: ["poor-lighting"], garments: [
    { id: "g1", category: "top", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "fitted", structure: "low", volume: "low" },
    { id: "g2", category: "trousers", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "relaxed", structure: "soft", volume: "high" },
  ], proportion: "bottom-heavy", notes: "逆光公园单人，全黑上衣与阔腿裤。" }),
  annotation({ number: 19, issues: ["poor-lighting", "cropped", "complex-background"], peopleCount: 2, garments: [{ id: "g1", category: "shirt", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "regular", structure: "low", volume: "medium", visibility: "partial" }], proportion: "unknown", notes: "暗色复杂背景，含一名模糊背景人物；主体上半身裁切，黑色衬衫可见。" }),
  annotation({ number: 20, issues: ["poor-lighting", "complex-background"], garments: [{ id: "g1", category: "outerwear", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "oversized", structure: "strong", volume: "high" }], proportion: "vertical-elongation", notes: "暗色街景单人，长款强结构黑色外套。" }),
  annotation({ number: 21, issues: ["poor-lighting"], garments: [
    { id: "g1", category: "top", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "fitted", structure: "low", volume: "low" },
    { id: "g2", category: "skirt", primaryColorFamily: "black", saturation: "medium", brightness: "dark", temperature: "warm", fit: "regular", structure: "soft", volume: "medium" },
  ], layering: "light-layering", proportion: "vertical-elongation", notes: "室内低照度单人，黑色上衣与深色印花长裙。" }),

  annotation({ number: 22, issues: ["partially-occluded", "complex-background"], garments: [{ id: "g1", category: "outerwear", primaryColorFamily: "gray", saturation: "low", brightness: "medium", temperature: "cool", fit: "regular", structure: "strong", volume: "medium", materialApproximation: "wool-like", fieldsThatAreUncertain: ["materialApproximation"] }], proportion: "vertical-elongation", notes: "前景光斑遮挡下半部分，灰色长外套主体仍可见。" }),
  annotation({ number: 23, issues: ["heavily-occluded", "cropped", "poor-lighting"], garments: [{ id: "g1", category: "outerwear", primaryColorFamily: "blue", saturation: "low", brightness: "dark", temperature: "unknown", visibility: "heavily-occluded" }], proportion: "unknown", notes: "车辆与反光严重遮挡，仅上半身蓝色外套局部可见。" }),
  annotation({ number: 24, issues: ["partially-occluded", "complex-background"], garments: [{ id: "g1", category: "dress", primaryColorFamily: "red", saturation: "high", brightness: "medium", temperature: "warm", fit: "regular", structure: "soft", volume: "medium", visibility: "partial" }], proportion: "vertical-elongation", notes: "大型番茄道具遮挡腰臀，红黑条纹长裙边缘可见。" }),
  annotation({ number: 25, issues: ["blur", "cropped", "multiple-people", "heavily-occluded"], peopleCount: null, primary: false, garments: [
    { id: "g1", subjectId: "p1", category: "top", primaryColorFamily: "blue", saturation: "medium", brightness: "light", temperature: "unknown", visibility: "heavily-occluded" },
    { id: "g2", subjectId: "p2", category: "top", primaryColorFamily: "red", saturation: "high", brightness: "medium", temperature: "warm", visibility: "partial" },
    { id: "g3", subjectId: "p3", category: "outerwear", primaryColorFamily: "beige", saturation: "low", brightness: "light", temperature: "warm", visibility: "partial" },
  ], proportion: "unknown", notes: "三人奔跑，运动模糊、裁切和相互遮挡明显，无唯一主人物。" }),

  annotation({ number: 26, issues: ["multiple-people", "complex-background"], peopleCount: 3, garments: [
    { id: "g1", subjectId: "p1", category: "outerwear", primaryColorFamily: "blue", saturation: "medium", brightness: "medium", temperature: "cool", fit: "oversized", structure: "medium", volume: "high" },
    { id: "g2", subjectId: "p2", category: "top", primaryColorFamily: "brown", saturation: "low", brightness: "medium", temperature: "warm", fit: "fitted", structure: "low", volume: "low" },
  ], layering: "multi-layered", proportion: "unknown", notes: "街拍三人，右侧蓝色外套人物为主要主体。" }),
  annotation({ number: 27, issues: ["multiple-people", "complex-background"], peopleCount: 3, garments: [
    { id: "g1", subjectId: "p1", category: "shirt", primaryColorFamily: "blue", saturation: "low", brightness: "light", temperature: "cool", fit: "oversized", structure: "low", volume: "high" },
    { id: "g2", subjectId: "p1", category: "trousers", primaryColorFamily: "brown", saturation: "low", brightness: "medium", temperature: "warm", fit: "oversized", structure: "medium", volume: "high" },
    { id: "g3", subjectId: "p2", category: "top", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "fitted", structure: "low", volume: "low" },
  ], layering: "light-layering", proportion: "top-heavy", notes: "双人街拍，前景浅蓝宽松衬衫人物为主要主体。" }),
  annotation({ number: 28, issues: ["multiple-people", "complex-background", "partially-occluded"], peopleCount: 4, primary: false, garments: [
    { id: "g1", subjectId: "p1", category: "outerwear", primaryColorFamily: "green", saturation: "medium", brightness: "light", temperature: "cool", fit: "oversized", structure: "soft", volume: "high" },
    { id: "g2", subjectId: "p2", category: "outerwear", primaryColorFamily: "beige", saturation: "low", brightness: "light", temperature: "warm", fit: "relaxed", structure: "soft", volume: "medium" },
    { id: "g3", subjectId: "p3", category: "outerwear", primaryColorFamily: "blue", saturation: "low", brightness: "light", temperature: "cool", fit: "relaxed", structure: "soft", volume: "medium" },
  ], layering: "multi-layered", proportion: "unknown", notes: "四人动态群像，相互遮挡，无唯一主人物。" }),
  annotation({ number: 29, issues: ["multiple-people", "complex-background", "partially-occluded"], peopleCount: 4, primary: false, garments: [
    { id: "g1", subjectId: "p1", category: "outerwear", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "relaxed", structure: "medium", volume: "medium" },
    { id: "g2", subjectId: "p2", category: "top", primaryColorFamily: "red", saturation: "high", brightness: "medium", temperature: "warm", fit: "regular", structure: "low", volume: "low" },
    { id: "g3", subjectId: "p3", category: "outerwear", primaryColorFamily: "black", saturation: "low", brightness: "dark", temperature: "neutral", fit: "relaxed", structure: "medium", volume: "medium" },
  ], proportion: "unknown", notes: "咖啡馆四人群像，桌椅与人物相互遮挡，无唯一主人物。" }),

  annotation({ number: 30, issues: ["cropped"], garments: [
    { id: "g1", category: "top", primaryColorFamily: "green", saturation: "low", brightness: "medium", temperature: "warm", fit: "regular", structure: "low", volume: "low", visibility: "partial" },
    { id: "g2", category: "top", primaryColorFamily: "beige", saturation: "low", brightness: "light", temperature: "warm", fit: "fitted", structure: "medium", volume: "low", materialApproximation: "sheer-like", fieldsThatAreUncertain: ["materialApproximation"] },
  ], layering: "multi-layered", proportion: "unknown", notes: "上半身裁切，图案T恤外叠浅色蕾丝吊带。" }),
  annotation({ number: 31, issues: ["collage", "multiple-people"], peopleCount: 2, primary: false, garments: [
    { id: "g1", subjectId: "p1", category: "knitwear", primaryColorFamily: "green", saturation: "medium", brightness: "medium", temperature: "cool", fit: "oversized", structure: "soft", volume: "high" },
    { id: "g2", subjectId: "p1", category: "skirt", primaryColorFamily: "green", saturation: "medium", brightness: "medium", temperature: "warm", fit: "regular", structure: "medium", volume: "medium" },
    { id: "g3", subjectId: "p2", category: "top", primaryColorFamily: "blue", saturation: "medium", brightness: "light", temperature: "cool", fit: "regular", structure: "low", volume: "low" },
  ], layering: "multi-layered", proportion: "unknown", notes: "双栏拼图，两套复杂叠穿，无唯一主人物。" }),
  annotation({ number: 32, issues: ["cropped"], garments: [
    { id: "g1", category: "shirt", primaryColorFamily: "gray", saturation: "low", brightness: "light", temperature: "neutral", fit: "regular", structure: "medium", volume: "low", visibility: "partial" },
    { id: "g2", category: "dress", primaryColorFamily: "white", saturation: "low", brightness: "light", temperature: "neutral", fit: "regular", structure: "soft", volume: "medium", materialApproximation: "sheer-like", fieldsThatAreUncertain: ["materialApproximation"] },
  ], layering: "multi-layered", proportion: "unknown", notes: "身体裁切，格纹衬衫外叠白色蕾丝服装与多条领带。" }),
  annotation({ number: 33, garments: [
    { id: "g1", category: "outerwear", primaryColorFamily: "brown", saturation: "low", brightness: "dark", temperature: "warm", fit: "oversized", structure: "strong", volume: "high" },
    { id: "g2", category: "shirt", primaryColorFamily: "blue", saturation: "low", brightness: "light", temperature: "cool", fit: "regular", structure: "medium", volume: "low" },
    { id: "g3", category: "skirt", primaryColorFamily: "brown", saturation: "low", brightness: "medium", temperature: "warm", fit: "regular", structure: "soft", volume: "medium" },
  ], layering: "multi-layered", proportion: "vertical-elongation", notes: "单人完整复杂叠穿，外套、衬衫、针织层和蕾丝裙层清晰。" }),

  annotation({ number: 34, issues: ["filter-color-shift", "complex-background"], peopleCount: null, garments: [{ id: "g1", category: "jumpsuit", primaryColorFamily: "pink", saturation: "high", brightness: "medium", temperature: "warm", fit: "relaxed", structure: "medium", volume: "medium", fieldsThatAreUncertain: ["primaryColorFamily", "saturation", "brightness", "temperature"] }], proportion: "waist-emphasis", notes: "高饱和彩色画面，背景人物数量不可可靠确定；粉色短款连体服颜色可能受处理影响。" }),
  annotation({ number: 35, issues: ["special-lighting", "filter-color-shift", "cropped"], garments: [{ id: "g1", category: "dress", primaryColorFamily: "green", saturation: "medium", brightness: "light", temperature: "warm", fit: "fitted", structure: "soft", volume: "medium", visibility: "partial", fieldsThatAreUncertain: ["primaryColorFamily", "saturation", "brightness", "temperature"] }], proportion: "unknown", notes: "强烈逆光和柔焦，上半身绿色裙装，原始颜色与材质不确定。" }),
  annotation({ number: 36, issues: ["filter-color-shift", "cropped"], garments: [
    { id: "g1", category: "top", primaryColorFamily: "blue", saturation: "high", brightness: "medium", temperature: "cool", fit: "fitted", structure: "low", volume: "low", fieldsThatAreUncertain: ["primaryColorFamily", "saturation", "brightness", "temperature"] },
    { id: "g2", category: "skirt", primaryColorFamily: "blue", saturation: "high", brightness: "medium", temperature: "cool", fit: "fitted", structure: "medium", volume: "low", visibility: "partial", fieldsThatAreUncertain: ["primaryColorFamily", "saturation", "brightness", "temperature"] },
  ], proportion: "waist-emphasis", notes: "高颗粒高饱和滤镜，蓝色上衣与短裙，颜色等级保留不确定。" }),

  annotation({ number: 37, issues: ["cropped"], garments: [
    { id: "g1", category: "shirt", primaryColorFamily: "yellow", saturation: "medium", brightness: "medium", temperature: "warm", fit: "regular", structure: "low", volume: "low", visibility: "partial" },
    { id: "g2", category: "knitwear", primaryColorFamily: "purple", saturation: "medium", brightness: "medium", temperature: "warm", fit: "fitted", structure: "medium", volume: "low", visibility: "partial", materialApproximation: "knit-like" },
    { id: "g3", category: "trousers", primaryColorFamily: "beige", saturation: "low", brightness: "light", temperature: "warm", fit: "regular", structure: "medium", volume: "medium", visibility: "partial" },
  ], layering: "multi-layered", proportion: "unknown", notes: "秀场局部裁切，花衬衫、针织背心和格纹下装叠穿；除针织层外真实材质未知。" }),
  annotation({ number: 38, peopleCount: null, garments: [
    { id: "g1", category: "top", primaryColorFamily: "gray", saturation: "low", brightness: "light", temperature: "neutral", fit: "oversized", structure: "medium", volume: "high", materialApproximation: "unknown", fieldsThatAreUncertain: ["materialApproximation"] },
    { id: "g2", category: "skirt", primaryColorFamily: "metallic", saturation: "low", brightness: "medium", temperature: "neutral", fit: "regular", structure: "medium", volume: "medium", materialApproximation: "unknown", fieldsThatAreUncertain: ["materialApproximation"] },
  ], layering: "light-layering", proportion: "top-heavy", notes: "秀场单人，亮片刺绣上衣与反光透明感下装，真实材质不可确定。" }),
  annotation({ number: 39, issues: ["cropped"], garments: [
    { id: "g1", category: "top", primaryColorFamily: "multicolor", saturation: "low", brightness: "dark", temperature: "neutral", fit: "oversized", structure: "soft", volume: "high", visibility: "partial", materialApproximation: "unknown", fieldsThatAreUncertain: ["materialApproximation"] },
    { id: "g2", category: "skirt", primaryColorFamily: "brown", saturation: "medium", brightness: "medium", temperature: "warm", fit: "regular", structure: "medium", volume: "high", visibility: "partial", materialApproximation: "unknown", fieldsThatAreUncertain: ["materialApproximation"] },
  ], layering: "multi-layered", proportion: "top-heavy", notes: "秀场身体裁切，毛绒视觉上衣与大型透明片下装，真实成分必须unknown。" }),
  annotation({ number: 40, peopleCount: null, garments: [
    { id: "g1", category: "top", primaryColorFamily: "brown", saturation: "low", brightness: "medium", temperature: "warm", fit: "fitted", structure: "soft", volume: "low", materialApproximation: "sheer-like", fieldsThatAreUncertain: ["materialApproximation"] },
    { id: "g2", category: "skirt", primaryColorFamily: "brown", saturation: "medium", brightness: "medium", temperature: "warm", fit: "regular", structure: "medium", volume: "medium", materialApproximation: "unknown", fieldsThatAreUncertain: ["materialApproximation"] },
  ], layering: "multi-layered", proportion: "vertical-elongation", notes: "秀场单人，透明感棕色上衣叠浅色蕾丝与反光片下装，真实材质成分不可确定。" }),
];

export const humanAnnotations: Record<string, HumanAnnotation | null> = Object.fromEntries(annotations.map((item) => [item.imageId, item]));
