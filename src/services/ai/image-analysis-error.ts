export type ImageAnalysisErrorCode =
  | "missing-api-key"
  | "missing-model"
  | "timeout"
  | "connection"
  | "rate-limit"
  | "server-error"
  | "empty-result"
  | "refusal"
  | "schema-validation"
  | "image-too-large"
  | "unsupported-format"
  | "authentication"
  | "permission"
  | "billing"
  | "invalid-image"
  | "unknown";

const publicMessages: Record<ImageAnalysisErrorCode, string> = {
  "missing-api-key": "真实模型尚未配置，已切换到 Mock 模式。",
  "missing-model": "视觉模型名称尚未配置，已切换到 Mock 模式。",
  timeout: "图片分析超时，请稍后重试。",
  connection: "暂时无法连接视觉分析服务，请稍后重试。",
  "rate-limit": "视觉分析请求较多，请稍后再试。",
  "server-error": "视觉分析服务暂时不可用。",
  "empty-result": "模型没有返回可用的结构化观察。",
  refusal: "模型无法分析这张图片，请更换图片或使用 Mock。",
  "schema-validation": "模型返回格式未通过严格校验，没有写入用户数据。",
  "image-too-large": "图片过大，请压缩后重试。",
  "unsupported-format": "图片格式不受支持，请使用 JPEG、PNG 或 WebP。",
  authentication: "视觉服务认证失败，请检查服务端配置。",
  permission: "当前 API 凭证没有使用该视觉模型的权限。",
  billing: "视觉服务账户余额不足或计费状态异常，请先在服务商控制台处理。",
  "invalid-image": "图片无法读取或不包含可分析内容。",
  unknown: "图片分析失败，未写入用户数据。",
};

export class ImageAnalysisError extends Error {
  constructor(
    public readonly code: ImageAnalysisErrorCode,
    public readonly retryable: boolean,
    options: { status?: number; cause?: unknown; details?: string[] } = {},
  ) {
    super(publicMessages[code], { cause: options.cause });
    this.name = "ImageAnalysisError";
    this.status = options.status;
    this.details = options.details;
  }

  readonly status?: number;
  readonly details?: string[];

  toPublicJSON() {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}

export function normalizeImageAnalysisError(error: unknown): ImageAnalysisError {
  if (error instanceof ImageAnalysisError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new ImageAnalysisError("timeout", true, { cause: error });
  if (error instanceof TypeError) return new ImageAnalysisError("connection", true, { cause: error });
  return new ImageAnalysisError("unknown", false, { cause: error });
}
