import { VisualSamplingExperience } from "@/components/exploration/visual-sampling-experience";
import { ExplorationRouteGuard } from "@/components/exploration/exploration-route-guard";

export const metadata = { title: "视觉趋势采样" };
export default function VisualSamplingPage() { return <ExplorationRouteGuard step="visual-sampling"><VisualSamplingExperience /></ExplorationRouteGuard>; }
