import { NextResponse } from "next/server";
import { getCloudCapability } from "@/services/cloud/cloud-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getCloudCapability());
}
