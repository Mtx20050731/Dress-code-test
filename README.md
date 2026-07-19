# 未定式 / UNDEFINED STYLE

移动端优先的个人穿衣审美探索网站。V3 将固定测试重构为四个连续、可校正、可追溯的步骤：

1. Visual Sampling / 视觉趋势采样
2. Archive Decode / 收藏解剖
3. Style Lab / 风格边界实验
4. Style System / 个人风格系统

正式收藏页与四个持续入口会读取 `IMAGE_ANALYSIS_PROVIDER`，当前国内方案使用阿里云百炼 `qwen3-vl-flash`。缺少密钥或模型配置时安全降级为 Mock，并明确要求用户复核。真实模型观察始终先进入 pending，不会直接写入稳定审美或生成个人风格结论。

## V3 重点

- 8 个趋势母题，每个包含日常、表达和实验三种浓度。
- 自适应取样，不固定每个用户回答相同题目。
- 区分想穿、欣赏、借元素、无感和明确不喜欢。
- 收藏图片支持意图标签、局部标记和系统观察复核。
- 删除固定 16 件公共单品，改为根据前两步生成个性化完整造型。
- 记录哪个元素改变后，用户从“不愿穿”转为“愿意穿”。
- 分开保存稳定审美、理想偏好、现实边界与当前兴趣。
- 使用离散置信状态和证据引用，不生成虚假精确百分比。
- 结果后提供四个持续使用入口。

完整路由、组件、状态流转和数据模型见 [ARCHITECTURE_V3.md](./ARCHITECTURE_V3.md)。

本地证据方向、置信规则、冲突处理、Evidence Inspector 与测试说明见 [INFERENCE_ENGINE_V1.md](./INFERENCE_ENGINE_V1.md)。

真实图片、异步视觉分析、运行时校验、隐私和供应商适配边界见 [REAL_DATA_CONTRACT_V1.md](./REAL_DATA_CONTRACT_V1.md)。

真实视觉模型的开发入口、环境变量、错误回退和离线评估方法见 [REAL_VISION_VALIDATION_V1.md](./REAL_VISION_VALIDATION_V1.md)。

账号、云同步与正式部署的安全边界和待选项见 [docs/account-cloud-deployment.md](./docs/account-cloud-deployment.md)。

## 本地运行

```bash
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:3000`。

## 验证

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm test:browser
pnpm build
pnpm deploy:check
```

人工视觉评估：

```bash
npm run eval:validate-annotations
npm run eval:image-analysis
npm run eval:image-analysis:report
```
