import { Tabs } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { colors } from "../../components/ui";

type TabName = "memory" | "city" | "shop" | "profile";

/** 手绘描边风格的底部标签图标，随应用打包，不依赖图标库。 */
function TabGlyph({ name, color }: { name: TabName; color: string }) {
  return (
    <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
      {name === "memory" ? (
        <>
          <Path
            d="M12 6.5C10.4 5.2 8.4 4.7 5.5 4.9 4.9 5 4.5 5.4 4.5 6v11c0 .6.5 1 1.1.9 2.6-.2 4.5.3 6.4 1.6 1.9-1.3 3.8-1.8 6.4-1.6.6.1 1.1-.3 1.1-.9V6c0-.6-.4-1-1-1.1-2.9-.2-4.9.3-6.5 1.6z"
            stroke={color}
            strokeLinejoin="round"
            strokeWidth={1.6}
          />
          <Path d="M12 6.5V19" stroke={color} strokeLinecap="round" strokeWidth={1.6} />
        </>
      ) : name === "city" ? (
        <>
          <Path d="M12 3.5V21" stroke={color} strokeLinecap="round" strokeWidth={1.6} />
          <Path
            d="M5 6.5h9l2 2-2 2H5z"
            stroke={color}
            strokeLinejoin="round"
            strokeWidth={1.6}
          />
          <Path
            d="M19 12.5h-9l-2 2 2 2h9z"
            stroke={color}
            strokeLinejoin="round"
            strokeWidth={1.6}
          />
        </>
      ) : name === "shop" ? (
        <>
          <Path
            d="M6 8h12l-1 11.5c0 .8-.6 1.5-1.5 1.5h-7c-.9 0-1.5-.7-1.5-1.5z"
            stroke={color}
            strokeLinejoin="round"
            strokeWidth={1.6}
          />
          <Path
            d="M9 9.5V7a3 3 0 0 1 6 0v2.5"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.6}
          />
        </>
      ) : (
        <>
          <Circle cx={12} cy={8.5} r={3.3} stroke={color} strokeWidth={1.6} />
          <Path
            d="M5.5 20c.6-3.6 3.1-5.5 6.5-5.5s5.9 1.9 6.5 5.5"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.6}
          />
        </>
      )}
    </Svg>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.warmAccent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.line,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "记忆",
          tabBarIcon: ({ color }) => <TabGlyph color={color} name="memory" />,
        }}
      />
      <Tabs.Screen
        name="cities"
        options={{
          title: "城市",
          tabBarIcon: ({ color }) => <TabGlyph color={color} name="city" />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "商店",
          tabBarIcon: ({ color }) => <TabGlyph color={color} name="shop" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          tabBarIcon: ({ color }) => <TabGlyph color={color} name="profile" />,
        }}
      />
    </Tabs>
  );
}
