# 人工评估标注

`index.ts` 与 `dataset.ts` 共同定义第一批40张评估图片。初始值全部为 `null`，表示“尚未标注”，不代表图片中没有服装或属性。

操作顺序：

1. 把已获内部测试授权的图片放入 `../fixtures/01.png` 至 `40.png`。
2. 参照 `docs/image-analysis-annotation-guide.md` 完成人工判断。
3. 把 `humanAnnotations` 中对应 imageId 的 `null` 替换为符合 `HumanAnnotation` 的对象。
4. 对看不清的字段填写 `unknown`，并在需要时加入 `fieldsThatAreUncertain` 或 `attributesThatMustRemainUnknown`。
5. 运行 `npm run eval:validate-annotations`。

不要使用用户上传图片自动补充评估集，也不要从互联网自动下载版权状态不明的图片。
