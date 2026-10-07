import { Slot } from "expo-router";

import { AccountRouteGate } from "../../features/auth/account-route-gate";

/**
 * 回收站只需要账号就绪门禁，不需要自己的导航栈。
 * 使用 Slot 让 `recycle-bin/index` 留在根栈上，从而获得与「我的纪念品」
 * 等根屏一致的原生返回按钮；嵌套 Stack 会让它成为该栈的首屏而没有返回目标。
 */
export default function RecycleBinRoutesLayout() {
  return (
    <AccountRouteGate>
      <Slot />
    </AccountRouteGate>
  );
}
