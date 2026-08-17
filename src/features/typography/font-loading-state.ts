export type FontLoadStatus = "queued" | "loading" | "loaded" | "failed";

export type FontDefinition = {
  id: string;
  family: string;
  label: string;
  source: number;
  byteSize: number;
};

export type FontLoadingSnapshot = {
  activeFontId?: string;
  completedBytes: number;
  statuses: Record<string, FontLoadStatus>;
  totalBytes: number;
};

export function createFontLoadingController(
  definitions: readonly FontDefinition[],
  load: (font: FontDefinition) => Promise<void>,
) {
  const byId = new Map(definitions.map((font) => [font.id, font]));
  const statuses: Record<string, FontLoadStatus> = Object.fromEntries(
    definitions.map((font) => [font.id, "queued"]),
  );
  const listeners = new Set<() => void>();
  let queue: string[] = [];
  let activeFontId: string | undefined;
  let started = false;

  const notify = () => listeners.forEach((listener) => listener());
  const getSnapshot = (): FontLoadingSnapshot => ({
    activeFontId,
    completedBytes: definitions.reduce(
      (sum, font) => sum + (statuses[font.id] === "loaded" ? font.byteSize : 0),
      0,
    ),
    statuses: { ...statuses },
    totalBytes: definitions.reduce((sum, font) => sum + font.byteSize, 0),
  });

  const pump = () => {
    if (activeFontId) return;
    const nextId = queue.shift();
    if (!nextId) return;
    const font = byId.get(nextId);
    if (!font) return pump();
    activeFontId = nextId;
    statuses[nextId] = "loading";
    notify();
    void load(font)
      .then(() => { statuses[nextId] = "loaded"; })
      .catch(() => { statuses[nextId] = "failed"; })
      .finally(() => {
        activeFontId = undefined;
        notify();
        pump();
      });
  };

  const enqueueFirst = (id: string) => {
    if (!byId.has(id) || statuses[id] === "loaded" || activeFontId === id) return;
    queue = [id, ...queue.filter((queuedId) => queuedId !== id)];
    statuses[id] = "queued";
    notify();
    pump();
  };

  return {
    getSnapshot,
    request: enqueueFirst,
    retry: enqueueFirst,
    start() {
      if (started) return;
      started = true;
      queue = definitions.map((font) => font.id);
      notify();
      pump();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
