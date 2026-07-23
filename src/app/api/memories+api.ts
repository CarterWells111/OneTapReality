import { backendContractVersion } from "../../services/backend/contracts";
import { authenticateRequest } from "../../server/auth/device-auth";
import { getServerDatabase } from "../../server/db/client";
import { errorResponse, unauthorizedResponse } from "../../server/http/errors";
import { createMemory, listMemories } from "../../server/memories/repository";
import { parseCloudMemoryPayload } from "../../server/validation";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getServerDatabase();
    const device = await authenticateRequest(request, db);
    if (!device) return unauthorizedResponse();
    return Response.json({ contractVersion: backendContractVersion, items: await listMemories(db, device.deviceId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getServerDatabase();
    const device = await authenticateRequest(request, db);
    if (!device) return unauthorizedResponse();
    const memory = await createMemory(db, device.deviceId, parseCloudMemoryPayload(await request.json()));
    return Response.json({ contractVersion: backendContractVersion, memory }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
