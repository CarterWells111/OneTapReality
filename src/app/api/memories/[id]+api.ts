import { authenticateRequest } from "../../../server/auth/device-auth";
import { getServerDatabase } from "../../../server/db/client";
import { errorResponse, notFoundResponse, unauthorizedResponse } from "../../../server/http/errors";
import { deleteMemory, getMemory, updateMemory } from "../../../server/memories/repository";
import { parseCloudMemoryPayload } from "../../../server/validation";

type RouteContext = { id: string };

export async function GET(request: Request, { id }: RouteContext): Promise<Response> {
  try {
    const db = getServerDatabase();
    const device = await authenticateRequest(request, db);
    if (!device) return unauthorizedResponse();
    const memory = await getMemory(db, device.deviceId, id);
    return memory ? Response.json({ memory }) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { id }: RouteContext): Promise<Response> {
  try {
    const db = getServerDatabase();
    const device = await authenticateRequest(request, db);
    if (!device) return unauthorizedResponse();
    const memory = await updateMemory(db, device.deviceId, id, parseCloudMemoryPayload(await request.json()));
    return memory ? Response.json({ memory }) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { id }: RouteContext): Promise<Response> {
  try {
    const db = getServerDatabase();
    const device = await authenticateRequest(request, db);
    if (!device) return unauthorizedResponse();
    const deleted = await deleteMemory(db, device.deviceId, id);
    return deleted ? new Response(null, { status: 204 }) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
