# 图片分析人工标注指南 V1

本指南用于40张内部评估图片。人工标注描述的是“图片里能验证什么”，不是对人物或用户的风格分析。看不清时填写 `unknown`，存在合理但不确定的判断时同时加入 `fieldsThatAreUncertain`。

## 1. 可见事实

可见事实必须能由另一位标注者仅凭当前图片复核，例如：画面中人数、外套可见、颜色大类、衣长相对位置、明显的宽松程度、遮挡和裁切。

以下不属于可见事实：真实纤维成分、价格、品牌真伪、穿着舒适度、人物身份、职业、收入、年龄、性格、审美偏好、是否适合某个人。

## 2. 必须保持 unknown 的情况

- 属性区域不在画面中或被完全遮挡；
- 低清、运动模糊或压缩导致边界不可辨认；
- 滤镜或彩色灯光使原始色相无法判断；
- 材质只能靠触摸、标签或成分表确定；
- 拼图中同一人物或同一件衣服的对应关系不明确；
- 图片只显示局部，无法判断整件廓形、体积或搭配比例。

把必须保持未知的字段写入 `attributesThatMustRemainUnknown`，路径示例：`garments.g1.materialApproximation`。

## 3. 主人物

主人物是画面组织上最主要、服装信息最完整的人，而不是最有吸引力的人。判断依据依次为：主体占画面面积、位置、清晰度和穿搭展示完整度。如果多人同等重要或无法区分，`primarySubjectId` 填 `null`；不要强行选择。

## 4. 多人和拼图

多人图片为每个可区分人物使用独立 `subjectId`。只标注能够可靠关联到对应人物的服装。拼图如果包含多个独立画面，在 `imageIssues` 加入 `collage`；无法确认是否同一人物或同一服装时不要合并服装记录。

## 5. relaxed 与 oversized

- `relaxed`：有明显活动余量，但肩线、衣长和整体体积仍接近常规比例。
- `oversized`：宽度、肩线、袖长、衣长或整体体积被有意放大，至少一个比例明显超出常规范围。

只看到局部衣摆或袖口时，二者通常应标 `unknown`。

## 6. 结构感

- `soft`：自然垂坠，几乎不维持硬挺外形。
- `low`：有轻微轮廓，但主体仍随身体或重力变化。
- `medium`：肩部、领型、腰部或外缘形成清晰可重复的形状。
- `strong`：夸张肩线、硬挺几何边缘或明显建筑式体积。

结构感描述服装在画面中的形态，不等于正式度，也不能由“西装”类别直接推导。

## 7. 材质只标视觉近似

只使用 `cotton-like`、`denim-like`、`knit-like`、`wool-like`、`leather-like`、`silk-like`、`sheer-like`、`technical-like`、`unknown`。它们代表视觉表面，不代表真实纤维。

例如有光泽的薄面料可以是 `silk-like`，但不能标“真丝”；无法区分涂层棉、皮革或合成材料时应为 `unknown`。

## 8. 滤镜颜色

如果仍能可靠判断大色系，可以标大色系并在 `fieldsThatAreUncertain` 加入相关颜色字段。如果滤镜改变了整体色相，例如蓝色舞台光覆盖所有物体，则颜色、明暗、冷暖应标 `unknown`，并添加 `filter-color-shift` 或 `special-lighting`。

## 9. 遮挡和裁切

使用 `visibility` 区分：

- `full`：服装主要边界基本可见；
- `partial`：部分被遮挡或裁掉，但若干属性仍可判断；
- `heavily-occluded`：大部分不可见；
- `out-of-frame`：关键区域在画面外；
- `unknown`：无法确定可见范围。

严重遮挡时不得具体填写 fit、structure、volume、temperature 或 material，除非该字段明确列入 uncertain，且标注说明中写明可见依据。

## 10. 禁止推断

每张标注必须带非空 `forbiddenInferences`，至少覆盖：人物性格、身份、年龄、收入、职业、身材评价、适合度、偏好、购买建议、固定网络风格标签、吸引力和不可见属性。禁止推断既适用于模型结果，也适用于人工注释。

## 标注示例

### 示例1：清晰单人完整穿搭

画面中一人，外套、长裤和鞋完整可见。标注 `peopleCount: 1`，选择主人物；外套可标 gray、regular、medium structure。若看不出外套表面，材质填 `unknown`，不要因为外套像西装就写 wool-like。

### 示例2：白底单件商品图

没有人物，只有一件牛仔裤。`peopleCount: 0`、`primarySubjectId: null`；服装类别为 trousers 或 denim（依受控词表和图片主体选择），材质可标 denim-like。人物相关字段不适用，不应判为错误。

### 示例3：夜间街拍

人物可见但黑色上衣与背景融在一起。加入 `poor-lighting`；如果只能确定是深色上装，颜色可以 black，但结构、材质和装饰填 unknown。不要通过街景或姿态推断职业与生活方式。

### 示例4：两人同等重要

两人面积、清晰度和穿搭展示程度相近。`peopleCount: 2`，`primarySubjectId: null`。分别标注可关联的服装；无法判断某只包属于谁时 `subjectId: null`，并在 notes 说明。

### 示例5：上半身裁切与强滤镜

图片只有胸部以上且覆盖紫色灯光。加入 `cropped`、`filter-color-shift`。外套类别可能可见，但整体 fit、volume、原始 color family、temperature、下装和搭配比例保持 unknown；不要根据露出的领口补全整套服装。

### 示例6：复杂叠穿

能看到衬衫领、针织层和外套，但中间层边界不完整。可以标三件服装并把中间层 visibility 标 partial；outfit layering 为 multi-layered。每层材质若不清楚分别填 unknown，不要用“秋冬穿搭”推断羊毛。

## 复核建议

第一轮由主标注者完成，第二位复核者重点检查 unknown、主人物、多人物归属、严重遮挡和材质。意见不一致时优先保留 unknown，并把分歧写入 `annotationNotes`，不要用投票制造虚假的确定性。
