import { backendContractVersion, type DeviceRegistrationResponse } from "../../../services/backend/contracts";
import { createAccessToken, hashAccessToken } from "../../../server/auth/device-auth";
import { getServerDatabase } from "../../../server/db/client";
import { errorResponse, ApiError } from "../../../server/http/errors";
import { createDevice, getDeviceByInstallationId, rotateDeviceToken } from "../../../server/memories/repository";
import { parseInstallationId } from "../../../server/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const pepper = process.env.DEVICE_TOKEN_PEPPER;
    if (!pepper) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    const installationId = parseInstallationId(await request.json());
    const db = getServerDatabase();
    const accessToken = createAccessToken();
    const tokenHash = await hashAccessToken(accessToken, pepper);
    const existing = await getDeviceByInstallationId(db, installationId);
    const deviceId = existing?.id ?? crypto.randomUUID();
    if (existing) {
      await rotateDeviceToken(db, deviceId, tokenHash);
    } else {
      await createDevice(db, { id: deviceId, installationId, tokenHash, createdAt: new Date().toISOString() });
    }
    const response: DeviceRegistrationResponse = { contractVersion: backendContractVersion, deviceId, accessToken };
    return Response.json(response, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
