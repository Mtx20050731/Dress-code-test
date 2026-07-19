import { ArchiveDecodeExperience } from "@/components/exploration/archive-decode-experience";
import { ExplorationRouteGuard } from "@/components/exploration/exploration-route-guard";

export const metadata = { title: "收藏解剖" };
export default function ArchiveDecodePage() { return <ExplorationRouteGuard step="archive-decode"><ArchiveDecodeExperience /></ExplorationRouteGuard>; }
