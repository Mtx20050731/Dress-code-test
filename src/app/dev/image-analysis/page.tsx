import { notFound } from "next/navigation";
import { DevImageAnalysisExperience } from "@/components/exploration/dev-image-analysis-experience";
import { isDevImageAnalysisEnabled } from "@/features/image-analysis/dev-access";

export default function DevImageAnalysisPage() {
  if (!isDevImageAnalysisEnabled(process.env.NODE_ENV)) notFound();
  return <DevImageAnalysisExperience />;
}
