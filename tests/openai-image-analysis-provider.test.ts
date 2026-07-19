import test from "node:test";
import assert from "node:assert/strict";
import type { ImageAnalysisInput } from "../src/contracts/real-data";
import { isDevImageAnalysisEnabled } from "../src/features/image-analysis/dev-access";
import { ImageAnalysisError } from "../src/services/ai/image-analysis-error";
import { createImageAnalysisProvider } from "../src/services/ai/image-analysis-provider-factory";
import { MockImageAnalysisProvider } from "../src/services/ai/mock-image-analysis-provider";
import { OpenAIImageAnalysisProvider } from "../src/services/ai/openai-image-analysis-provider";

const input: ImageAnalysisInput = {
  imageId: "openai-test-image",
  imageUrl: "data:image/jpeg;base64,dGVzdA==",
  sourceType: "user-archive",
  expectedContent: "full-outfit",
};

async function validModelOutput() {
  return (await new MockImageAnalysisProvider().analyze(input)).analysis;
}

function apiResponse(output: unknown, status = 200) {
  return new Response(JSON.stringify({
    id: "resp-test",
    model: "vision-test-model",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
  }), { status, headers: { "content-type": "application/json" } });
}

test("OpenAI Provider 返回符合 V1 Schema 的结构化结果", async () => {
  const output = await validModelOutput();
  const provider = new OpenAIImageAnalysisProvider({
    apiKey: "test-key",
    model: "vision-test-model",
    fetcher: async () => apiResponse(output),
    inputCostPerMillion: 1,
    outputCostPerMillion: 2,
    now: (() => { let value = 100; return () => value += 10; })(),
  });
  const result = await provider.analyze(input);
  assert.equal(result.schemaVersion, "image-analysis-result-v1");
  assert.equal(result.providerMetadata.provider, "openai");
  assert.equal(result.providerMetadata.promptVersion, "image-analysis-prompt-v1");
  assert.equal(result.providerMetadata.usage.totalTokens, 300);
  assert.equal(result.providerMetadata.usage.estimatedCostUsd, 0.0005);
});

test("Schema 首次失败时只执行一次结构修复", async () => {
  const output = await validModelOutput();
  let calls = 0;
  const provider = new OpenAIImageAnalysisProvider({
    apiKey: "test-key", model: "vision-test-model", maxTransientRetries: 0,
    fetcher: async () => { calls += 1; return apiResponse(calls === 1 ? { invalid: true } : output); },
  });
  const result = await provider.analyze(input);
  assert.equal(calls, 2);
  assert.equal(result.providerMetadata.repairAttempted, true);
});

test("结构修复仍失败时抛出统一 schema-validation，且没有结果可写入会话", async () => {
  let calls = 0;
  const provider = new OpenAIImageAnalysisProvider({ apiKey: "test-key", model: "vision-test-model", maxTransientRetries: 0, fetcher: async () => { calls += 1; return apiResponse({ invalid: true }); } });
  await assert.rejects(provider.analyze(input), (error: unknown) => error instanceof ImageAnalysisError && error.code === "schema-validation");
  assert.equal(calls, 2);
});

test("Provider 可通过配置在 mock 与 openai 之间切换", () => {
  const fakeOpenAI = new MockImageAnalysisProvider();
  const openai = createImageAnalysisProvider({ requestedProvider: "openai", env: { OPENAI_API_KEY: "key", OPENAI_VISION_MODEL: "model" }, createOpenAIProvider: () => fakeOpenAI });
  const mock = createImageAnalysisProvider({ requestedProvider: "mock", env: {} });
  assert.equal(openai.effectiveProvider, "openai");
  assert.equal(openai.provider, fakeOpenAI);
  assert.equal(mock.effectiveProvider, "mock");
});

test("缺少 API Key 时安全回退到 Mock", async () => {
  const selection = createImageAnalysisProvider({ requestedProvider: "openai", env: { OPENAI_VISION_MODEL: "model" } });
  assert.equal(selection.effectiveProvider, "mock");
  assert.equal(selection.fallbackReason, "missing-api-key");
  assert.equal((await selection.provider.analyze(input)).providerMetadata.provider, "mock");
});

test("429 临时错误执行有限重试和指数退避", async () => {
  const output = await validModelOutput();
  let calls = 0;
  const delays: number[] = [];
  const provider = new OpenAIImageAnalysisProvider({
    apiKey: "test-key", model: "vision-test-model", maxTransientRetries: 2, sleep: async (delay) => { delays.push(delay); },
    fetcher: async () => { calls += 1; return calls === 1 ? new Response("rate limited", { status: 429 }) : apiResponse(output); },
  });
  await provider.analyze(input);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [250]);
});

test("500/503 临时错误最多按配置重试", async () => {
  let calls = 0;
  const provider = new OpenAIImageAnalysisProvider({
    apiKey: "test-key", model: "vision-test-model", maxTransientRetries: 2, sleep: async () => undefined,
    fetcher: async () => { calls += 1; return new Response("unavailable", { status: 503 }); },
  });
  await assert.rejects(provider.analyze(input), (error: unknown) => error instanceof ImageAnalysisError && error.code === "server-error");
  assert.equal(calls, 3);
});

test("认证等非临时错误不重复请求", async () => {
  let calls = 0;
  const provider = new OpenAIImageAnalysisProvider({ apiKey: "test-key", model: "vision-test-model", fetcher: async () => { calls += 1; return new Response("unauthorized", { status: 401 }); } });
  await assert.rejects(provider.analyze(input), (error: unknown) => error instanceof ImageAnalysisError && error.code === "authentication");
  assert.equal(calls, 1);
});

test("不支持格式和图片过大错误不重试", async () => {
  for (const [status, code] of [[415, "unsupported-format"], [413, "image-too-large"]] as const) {
    let calls = 0;
    const provider = new OpenAIImageAnalysisProvider({ apiKey: "test-key", model: "vision-test-model", fetcher: async () => { calls += 1; return new Response("bad image", { status }); } });
    await assert.rejects(provider.analyze({ ...input, imageId: `${input.imageId}-${status}` }), (error: unknown) => error instanceof ImageAnalysisError && error.code === code);
    assert.equal(calls, 1);
  }
});

test("APIConnectionError 类型的网络失败会有限重试", async () => {
  const output = await validModelOutput();
  let calls = 0;
  const provider = new OpenAIImageAnalysisProvider({
    apiKey: "test-key", model: "vision-test-model", maxTransientRetries: 1, sleep: async () => undefined,
    fetcher: async () => { calls += 1; if (calls === 1) throw new TypeError("connection reset"); return apiResponse(output); },
  });
  await provider.analyze(input);
  assert.equal(calls, 2);
});

test("请求超时转换为统一 timeout 错误", async () => {
  const provider = new OpenAIImageAnalysisProvider({
    apiKey: "test-key", model: "vision-test-model", timeoutMs: 1, maxTransientRetries: 0,
    fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  });
  await assert.rejects(provider.analyze(input), (error: unknown) => error instanceof ImageAnalysisError && error.code === "timeout");
});

test("空结果和 refusal 不进入结构修复重试", async () => {
  let emptyCalls = 0;
  const empty = new OpenAIImageAnalysisProvider({ apiKey: "test-key", model: "vision-test-model", fetcher: async () => { emptyCalls += 1; return new Response(JSON.stringify({ id: "empty", output: [] }), { status: 200 }); } });
  await assert.rejects(empty.analyze(input), (error: unknown) => error instanceof ImageAnalysisError && error.code === "empty-result");
  assert.equal(emptyCalls, 1);

  let refusalCalls = 0;
  const refusal = new OpenAIImageAnalysisProvider({ apiKey: "test-key", model: "vision-test-model", fetcher: async () => { refusalCalls += 1; return new Response(JSON.stringify({ id: "refusal", output: [{ content: [{ type: "refusal", refusal: "no" }] }] }), { status: 200 }); } });
  await assert.rejects(refusal.analyze({ ...input, imageId: "refusal-image" }), (error: unknown) => error instanceof ImageAnalysisError && error.code === "refusal");
  assert.equal(refusalCalls, 1);
});

test("同一请求复用进行中的结果，防止重复提交", async () => {
  const output = await validModelOutput();
  let calls = 0;
  const provider = new OpenAIImageAnalysisProvider({ apiKey: "test-key", model: "vision-test-model", fetcher: async () => { calls += 1; return apiResponse(output); } });
  const [first, second] = await Promise.all([provider.analyze(input), provider.analyze(input)]);
  assert.equal(calls, 1);
  assert.equal(first.analysisId, second.analysisId);
});

test("生产环境无法启用 /dev/image-analysis", () => {
  assert.equal(isDevImageAnalysisEnabled("production"), false);
  assert.equal(isDevImageAnalysisEnabled("development"), true);
});
