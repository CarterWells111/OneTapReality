/**
 * 行程节点整理：地点与日期完全由用户手填，
 * 不依赖定位、地图 SDK、地理编码或相册扫描。
 */

export type ItineraryNodeInput = {
  /** 用户手填的地点名。 */
  place: string;
  /** 用户手填的日期，格式 YYYY-MM-DD。 */
  date: string;
  note?: string;
};

export type ItineraryNode = ItineraryNodeInput & {
  id: string;
  /** 用户手动排序的位置，连续 0..n-1。 */
  position: number;
};

export type TimelineItem = {
  id: string;
  date: string;
  place: string;
  note?: string;
  /** 时间线上的连续位置 0..n-1。 */
  position: number;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** 校验用户输入；返回 null 表示合法，否则返回错误说明。 */
export function validateItineraryInput(input: ItineraryNodeInput): string | null {
  if (!input.place.trim()) {
    return "地点不能为空";
  }
  if (!datePattern.test(input.date)) {
    return "日期格式必须是 YYYY-MM-DD";
  }
  return null;
}

/** 按当前数组顺序重编连续 position（不重新排序）。 */
function renumber(nodes: readonly ItineraryNode[]): ItineraryNode[] {
  return nodes.map((node, index) => ({ ...node, position: index }));
}

function normalize(nodes: readonly ItineraryNode[]): ItineraryNode[] {
  return renumber([...nodes].sort((a, b) => a.position - b.position));
}

/** 新增节点（追加到末尾）。输入不合法或 id 重复时返回标准化后的原列表。 */
export function addItineraryNode(
  nodes: readonly ItineraryNode[],
  id: string,
  input: ItineraryNodeInput
): ItineraryNode[] {
  const normalized = normalize(nodes);
  if (validateItineraryInput(input) !== null || normalized.some((node) => node.id === id)) {
    return normalized;
  }
  const node: ItineraryNode = {
    id,
    place: input.place.trim(),
    date: input.date,
    position: normalized.length,
  };
  if (input.note !== undefined) {
    node.note = input.note;
  }
  return [...normalized, node];
}

/** 编辑节点内容。找不到 id 或新内容不合法时返回标准化后的原列表。 */
export function updateItineraryNode(
  nodes: readonly ItineraryNode[],
  id: string,
  input: ItineraryNodeInput
): ItineraryNode[] {
  const normalized = normalize(nodes);
  if (validateItineraryInput(input) !== null) {
    return normalized;
  }
  if (!normalized.some((node) => node.id === id)) {
    return normalized;
  }
  return normalized.map((node) => {
    if (node.id !== id) {
      return node;
    }
    const next: ItineraryNode = {
      id: node.id,
      position: node.position,
      place: input.place.trim(),
      date: input.date,
    };
    if (input.note !== undefined) {
      next.note = input.note;
    }
    return next;
  });
}

/** 删除节点并重编位置。 */
export function removeItineraryNode(
  nodes: readonly ItineraryNode[],
  id: string
): ItineraryNode[] {
  return normalize(normalize(nodes).filter((node) => node.id !== id));
}

/** 手动上下移动节点。越界或找不到 id 时返回标准化后的原列表。 */
export function moveItineraryNode(
  nodes: readonly ItineraryNode[],
  id: string,
  direction: -1 | 1
): ItineraryNode[] {
  const normalized = normalize(nodes);
  const index = normalized.findIndex((node) => node.id === id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= normalized.length) {
    return normalized;
  }
  const next = [...normalized];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return renumber(next);
}

/**
 * 输出稳定的时间线：先按日期升序，同日期保持用户手动顺序，
 * position 重编为连续 0..n-1。相同输入永远得到相同输出。
 */
export function buildTimeline(nodes: readonly ItineraryNode[]): TimelineItem[] {
  return normalize(nodes)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.position - b.position))
    .map((node, index) => {
      const item: TimelineItem = {
        id: node.id,
        date: node.date,
        place: node.place,
        position: index,
      };
      if (node.note !== undefined) {
        item.note = node.note;
      }
      return item;
    });
}
