import type { CloudCapability } from "@/contracts/cloud-sync";

export function getCloudCapability(env: Record<string, string | undefined> = process.env): CloudCapability {
  const accountProvider = env.ACCOUNT_PROVIDER?.trim() || "disabled";
  const syncProvider = env.CLOUD_SYNC_PROVIDER?.trim() || "disabled";
  if (accountProvider === "disabled" && syncProvider === "disabled") {
    return { accountEnabled: false, syncEnabled: false, provider: "disabled", reason: "当前仍使用本地设备会话；尚未选择账号与云存储供应商。" };
  }
  return { accountEnabled: false, syncEnabled: false, provider: "unconfigured", reason: "检测到云端配置意图，但项目尚未安装并授权对应供应商适配器。" };
}
