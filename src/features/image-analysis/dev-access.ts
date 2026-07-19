export function isDevImageAnalysisEnabled(environment: string | undefined): boolean {
  return environment === "development";
}
