import { MockRealDataGateway } from "@/services/integration/mock-real-data-gateway";
import type { StyleAnalysisProvider } from "./style-analysis-provider";

export const mockStyleAnalysisProvider: StyleAnalysisProvider = new MockRealDataGateway();
