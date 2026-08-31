export type MaintenanceWorkerEnvironment = {
  MAINTENANCE_ENDPOINT?: string;
  MAINTENANCE_SECRET?: string;
  STAGING_MAINTENANCE_ENDPOINT?: string;
  STAGING_MAINTENANCE_SECRET?: string;
};

type WorkerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ScheduledController = { noRetry: () => void };

type MaintenanceTarget = {
  label: "production" | "staging";
  endpoint: string | undefined;
  secret: string | undefined;
};

class MaintenanceTargetFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function getMaintenanceTargets(
  environment: MaintenanceWorkerEnvironment,
): MaintenanceTarget[] {
  return [
    {
      label: "production",
      endpoint: environment.MAINTENANCE_ENDPOINT,
      secret: environment.MAINTENANCE_SECRET,
    },
    {
      label: "staging",
      endpoint: environment.STAGING_MAINTENANCE_ENDPOINT,
      secret: environment.STAGING_MAINTENANCE_SECRET,
    },
  ];
}

async function runMaintenanceTarget(
  target: MaintenanceTarget,
  fetcher: WorkerFetch,
): Promise<void> {
  const endpoint = target.endpoint?.trim();
  const secret = target.secret?.trim();
  if (!endpoint) throw new MaintenanceTargetFailure("missing_endpoint");
  if (!secret) throw new MaintenanceTargetFailure("missing_secret");

  try {
    if (new URL(endpoint).protocol !== "https:") {
      throw new MaintenanceTargetFailure("invalid_endpoint");
    }
  } catch (error) {
    if (error instanceof MaintenanceTargetFailure) throw error;
    throw new MaintenanceTargetFailure("invalid_endpoint");
  }

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "x-gift-maintenance-secret": secret },
    });
  } catch {
    throw new MaintenanceTargetFailure("network_error");
  }

  try {
    if (!response.ok) {
      throw new MaintenanceTargetFailure(`http_${response.status}`);
    }
  } finally {
    try {
      await response.body?.cancel();
    } catch {
      // Response cleanup must not expose or replace the maintenance result.
    }
  }
}

export async function runScheduledMaintenance(
  environment: MaintenanceWorkerEnvironment,
  fetcher: WorkerFetch = fetch,
): Promise<void> {
  const failures: string[] = [];

  for (const target of getMaintenanceTargets(environment)) {
    try {
      await runMaintenanceTarget(target, fetcher);
    } catch (error) {
      const code =
        error instanceof MaintenanceTargetFailure
          ? error.code
          : "unexpected_error";
      failures.push(`${target.label}=${code}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Maintenance targets failed: ${failures.join(", ")}`);
  }
}

const worker = {
  async scheduled(
    controller: ScheduledController,
    environment: MaintenanceWorkerEnvironment,
  ): Promise<void> {
    controller.noRetry();
    await runScheduledMaintenance(environment);
  },
};

export default worker;
