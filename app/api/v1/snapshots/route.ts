import { handleCreateSnapshot } from "./_handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCreateSnapshot(request);
}
