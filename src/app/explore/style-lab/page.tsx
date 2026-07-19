import { StyleLabExperience } from "@/components/exploration/style-lab-experience";
import { ExplorationRouteGuard } from "@/components/exploration/exploration-route-guard";

export const metadata = { title: "风格边界实验" };
export default function StyleLabPage() { return <ExplorationRouteGuard step="style-lab"><StyleLabExperience /></ExplorationRouteGuard>; }
