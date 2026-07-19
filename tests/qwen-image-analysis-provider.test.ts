import test from "node:test";
import assert from "node:assert/strict";
import type { ImageAnalysisInput } from "../src/contracts/real-data";
import { MockImageAnalysisProvider } from "../src/services/ai/mock-image-analysis-provider";
import { QwenImageAnalysisProvider } from "../src/services/ai/qwen-image-analysis-provider";
import { createImageAnalysisProvider } from "../src/services/ai/image-analysis-provider-factory";
import { ImageAnalysisError } from "../src/services/ai/image-analysis-error";

const input: ImageAnalysisInput = {
  imageId: "qwen-test-image",
  imageUrl: "data:image/jpeg;base64,dGVzdA==",
  sourceType: "user-archive",
  expectedContent: "full-outfit",
};

async function validModelOutput() {
  return (await new MockImageAnalysisProvider().analyze(input)).analysis;
}

function apiResponse(output: unknown, status = 200) {
  return new Response(JSON.stringify({
    id: "qwen-response-test",
    model: "qwen3-vl-plus",
    choices: [{ message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop", index: 0 }],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  }), { status, headers: { "content-type": "application/json" } });
}

test("Qwen Provider 返回符合V1 Schema的pending候选观察", async () => {
  const output = await validModelOutput();
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  const logs: unknown[] = [];
  const provider = new QwenImageAnalysisProvider({
    apiKey: "test-key",
    model: "qwen3-vl-plus",
    baseUrl: "https://example.test/compatible-mode/v1/",
    fetcher: async (url, init) => {
      requestUrl = String(url);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return apiResponse(output);
    },
    inputCostPerMillion: 1,
    outputCostPerMillion: 2,
    logger: (entry) => logs.push(entry),
    now: (() => { let value = 100; return () => value += 10; })(),
  });

  const result = await provider.analyze(input);
  assert.equal(result.providerMetadata.provider, "qwen");
  assert.equal(result.providerMetadata.model, "qwen3-vl-plus");
  assert.equal(result.providerMetadata.promptVersion, "image-analysis-prompt-v2");
  assert.equal(result.analysis.garments[0].category.reviewStatus, "pending");
  assert.equal(result.providerMetadata.usage.totalTokens, 200);
  assert.equal(result.providerMetadata.usage.estimatedCostUsd, 0.00028);
  assert.equal(requestUrl, "https://example.test/compatible-mode/v1/chat/completions");
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal(requestBody.enable_thinking, false);
  assert.equal(requestBody.max_tokens, 7_000);
  assert.equal("max_completion_tokens" in requestBody, false);
  assert.equal(JSON.stringify(logs).includes("base64"), false);
  assert.equal(JSON.stringify(logs).includes("test-key"), false);
});

test("Qwen Schema失败时最多执行一次结构修复", async () => {
  const output = await validModelOutput();
  let calls = 0;
  const provider = new QwenImageAnalysisProvider({
    apiKey: "test-key",
    model: "qwen3-vl-plus",
    maxTransientRetries: 0,
    fetcher: async () => {
      calls += 1;
      return apiResponse(calls === 1 ? { invalid: true } : output);
    },
  });
  const result = await provider.analyze(input);
  assert.equal(calls, 2);
  assert.equal(result.providerMetadata.repairAttempted, true);
});

test("Qwen结构修复仍失败时不产生可写入结果", async () => {
  let calls = 0;
  const provider = new QwenImageAnalysisProvider({
    apiKey: "test-key",
    model: "qwen3-vl-plus",
    maxTransientRetries: 0,
    fetcher: async () => {
      calls += 1;
      return apiResponse({ invalid: true });
    },
  });
  await assert.rejects(provider.analyze(input), (error: unknown) => error instanceof ImageAnalysisError && error.code === "schema-validation");
  assert.equal(calls, 2);
});

test("Provider工厂可切换Qwen，缺少密钥时安全回退Mock", async () => {
  const fakeQwen = new MockImageAnalysisProvider();
  const qwen = createImageAnalysisProvider({
    requestedProvider: "qwen",
    env: { DASHSCOPE_API_KEY: "key", QWEN_VISION_MODEL: "qwen3-vl-plus" },
    createQwenProvider: () => fakeQwen,
  });
  assert.equal(qwen.effectiveProvider, "qwen");
  assert.equal(qwen.provider, fakeQwen);

  const fallback = createImageAnalysisProvider({ requestedProvider: "qwen", env: { QWEN_VISION_MODEL: "qwen3-vl-plus" } });
  assert.equal(fallback.effectiveProvider, "mock");
  assert.equal(fallback.fallbackReason, "missing-api-key");
  assert.equal((await fallback.provider.analyze(input)).providerMetadata.provider, "mock");
});

test("Qwen临时错误有限重试，认证错误不重试", async () => {
  const output = await validModelOutput();
  let temporaryCalls = 0;
  const retrying = new QwenImageAnalysisProvider({
    apiKey: "test-key",
    model: "qwen3-vl-plus",
    maxTransientRetries: 1,
    sleep: async () => undefined,
    fetcher: async () => {
      temporaryCalls += 1;
      return temporaryCalls === 1 ? new Response("rate limited", { status: 429 }) : apiResponse(output);
    },
  });
  await retrying.analyze(input);
  assert.equal(temporaryCalls, 2);

  let authCalls = 0;
  const rejected = new QwenImageAnalysisProvider({
    apiKey: "test-key",
    model: "qwen3-vl-plus",
    fetcher: async () => {
      authCalls += 1;
      return new Response("unauthorized", { status: 401 });
    },
  });
  await assert.rejects(rejected.analyze({ ...input, imageId: "qwen-auth" }), (error: unknown) => error instanceof ImageAnalysisError && error.code === "authentication");
  assert.equal(authCalls, 1);
});

test("Qwen账户欠费会返回明确的billing错误且不重试", async () => {
  let calls = 0;
  const provider = new QwenImageAnalysisProvider({
    apiKey: "test-key",
    model: "qwen3-vl-flash",
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        error: {
          code: "Arrearage",
          type: "Arrearage",
          message: "provider-specific private message",
        },
      }), { status: 400, headers: { "content-type": "application/json" } });
    },
  });

  await assert.rejects(
    provider.analyze({ ...input, imageId: "qwen-billing" }),
    (error: unknown) => error instanceof ImageAnalysisError
      && error.code === "billing"
      && error.message === "视觉服务账户余额不足或计费状态异常，请先在服务商控制台处理。",
  );
  assert.equal(calls, 1);
});
