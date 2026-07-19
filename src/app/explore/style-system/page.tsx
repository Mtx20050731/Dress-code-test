import { StyleSystemExperience } from "@/components/exploration/style-system-experience";
import { ExplorationRouteGuard } from "@/components/exploration/exploration-route-guard";

export const metadata = { title: "个人风格系统" };
export default function StyleSystemPage() { return <ExplorationRouteGuard step="style-system"><StyleSystemExperience /></ExplorationRouteGuard>; }
