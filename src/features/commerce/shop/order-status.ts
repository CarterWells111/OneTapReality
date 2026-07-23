/**
 * 订购意向的演示物流状态：按提交时间与制作周期用纯函数推导，
 * 不采集地址、不接真实物流，仅用于把本机记录呈现为"像真实快递"的订单。
 */

const dayMs = 24 * 60 * 60 * 1000;

/** 寄出后到"送达"的演示天数。 */
const shippingDays = 3;

/** 旧记录缺少制作周期时的兜底天数。 */
export const defaultLeadTimeDays = 7;

export const orderStages = ["confirmed", "making", "shipped", "delivered"] as const;

export type OrderStage = (typeof orderStages)[number];

export const orderStageLabels: Record<OrderStage, string> = {
  confirmed: "已确认",
  making: "制作中",
  shipped: "已寄出",
  delivered: "已送达",
};

/** 每个阶段自下单起的天数偏移；制作周期再短也不会当天寄出。 */
function getStageDayOffsets(leadTimeDays: number): Record<OrderStage, number> {
  const shippedDay = Math.max(2, Math.floor(leadTimeDays));
  return {
    confirmed: 0,
    making: 1,
    shipped: shippedDay,
    delivered: shippedDay + shippingDays,
  };
}

export function getOrderStage(
  createdAt: string,
  leadTimeDays: number,
  now: Date
): OrderStage {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) {
    return "confirmed";
  }

  const elapsedDays = Math.floor((now.getTime() - createdMs) / dayMs);
  const offsets = getStageDayOffsets(leadTimeDays);
  if (elapsedDays >= offsets.delivered) return "delivered";
  if (elapsedDays >= offsets.shipped) return "shipped";
  if (elapsedDays >= offsets.making) return "making";
  return "confirmed";
}

export type OrderTimelineEntry = {
  stage: OrderStage;
  label: string;
  reached: boolean;
  /** 预计到达该阶段的日期（YYYY-MM-DD）；时间无法解析时为空字符串。 */
  expectedDate: string;
};

export function getOrderTimeline(
  createdAt: string,
  leadTimeDays: number,
  now: Date
): OrderTimelineEntry[] {
  const createdMs = new Date(createdAt).getTime();
  const offsets = getStageDayOffsets(leadTimeDays);
  const currentIndex = orderStages.indexOf(getOrderStage(createdAt, leadTimeDays, now));

  return orderStages.map((stage, index) => ({
    stage,
    label: orderStageLabels[stage],
    reached: index <= currentIndex,
    expectedDate: Number.isNaN(createdMs)
      ? ""
      : new Date(createdMs + offsets[stage] * dayMs).toISOString().slice(0, 10),
  }));
}

/** 个人主页的"拥有纪念品"件数：所有订购意向的数量合计。 */
export function countSouvenirItems(
  intents: readonly { quantity: number }[]
): number {
  return intents.reduce(
    (sum, intent) =>
      Number.isFinite(intent.quantity) && intent.quantity > 0
        ? sum + intent.quantity
        : sum,
    0
  );
}
