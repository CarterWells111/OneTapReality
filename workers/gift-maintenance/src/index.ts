export type MaintenanceWorkerEnvironment = {
  MAINTENANCE_ENDPOINT: string;
  MAINTENANCE_SECRET: string;
};

type WorkerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ScheduledController = { noRetry: () => void };

export async function runScheduledMaintenance(
  environment: MaintenanceWorkerEnvironment,
  fetcher: WorkerFetch = fetch,
): Promise<void> {
  const response = await fetcher(environment.MAINTENANCE_ENDPOINT, {
    method: "POST",
    headers: { "x-gift-maintenance-secret": environment.MAINTENANCE_SECRET },
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Maintenance endpoint returned ${response.status}`);
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
