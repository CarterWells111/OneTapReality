import { backendContractVersion, type CapabilitiesResponse } from "../../services/backend/contracts";

export function GET(_request?: Request): Response {
  const response: CapabilitiesResponse = {
    contractVersion: backendContractVersion,
    features: {
      deviceRegistration: true,
      memoryCrud: true,
      automaticSync: false,
      photoUpload: false,
    },
  };
  return Response.json(response);
}
