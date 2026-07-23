import type {
  BackendErrorBody,
  CapabilitiesResponse,
  CloudMemory,
  CloudMemoryPayload,
  DeviceRegistrationResponse,
  HealthResponse,
} from "./contracts";

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

export function resolveBackendRequestUrl(
  path: string,
  origin = process.env.EXPO_PUBLIC_API_ORIGIN,
): string {
  const normalizedOrigin = origin?.replace(/\/+$/u, "");
  return normalizedOrigin ? `${normalizedOrigin}${path}` : path;
}

export class BackendApiClient {
  constructor(private readonly request: typeof fetch = fetch) {}

  private async send<T>(path: string, options?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.request(resolveBackendRequestUrl(path), options);
    } catch {
      throw new BackendApiError(0, "network_unavailable", "Network unavailable");
    }

    const body = await response.json().catch(() => null) as T | BackendErrorBody | null;
    if (!response.ok) {
      const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
      throw new BackendApiError(response.status, error?.code ?? "request_failed", error?.message ?? "Request failed");
    }
    return body as T;
  }

  getHealth(): Promise<HealthResponse> {
    return this.send<HealthResponse>("/api/health");
  }

  getCapabilities(): Promise<CapabilitiesResponse> {
    return this.send<CapabilitiesResponse>("/api/capabilities");
  }

  registerDevice(installationId: string): Promise<DeviceRegistrationResponse> {
    return this.send<DeviceRegistrationResponse>("/api/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId }),
    });
  }

  async listMemories(accessToken: string): Promise<CloudMemory[]> {
    const response = await this.send<{ items: CloudMemory[] }>("/api/memories", { headers: { Authorization: `Bearer ${accessToken}` } });
    return response.items;
  }

  async createMemory(accessToken: string, payload: CloudMemoryPayload): Promise<CloudMemory> {
    const response = await this.send<{ memory: CloudMemory }>("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    return response.memory;
  }

  async getMemory(accessToken: string, id: string): Promise<CloudMemory> {
    const response = await this.send<{ memory: CloudMemory }>(`/api/memories/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    return response.memory;
  }

  async updateMemory(accessToken: string, id: string, payload: CloudMemoryPayload): Promise<CloudMemory> {
    const response = await this.send<{ memory: CloudMemory }>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    return response.memory;
  }

  async deleteMemory(accessToken: string, id: string): Promise<void> {
    await this.send<null>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
