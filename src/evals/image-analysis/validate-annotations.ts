import { validateAnnotationDataset } from "./annotation-validator";

const issues = validateAnnotationDataset();
const errors = issues.filter((issue) => issue.severity === "error");
const warnings = issues.filter((issue) => issue.severity === "warning");
const pendingImages = new Set(issues.filter((issue) => issue.severity === "pending").map((issue) => issue.imageId));

errors.forEach((issue) => process.stderr.write(`[error] ${issue.imageId} ${issue.path}: ${issue.message}\n`));
warnings.forEach((issue) => process.stdout.write(`[warning] ${issue.imageId} ${issue.path}: ${issue.message}\n`));
process.stdout.write(`标注校验：${errors.length} 个错误，${warnings.length} 个警告，${pendingImages.size} 张尚未准备。\n`);
if (errors.length) process.exitCode = 1;
