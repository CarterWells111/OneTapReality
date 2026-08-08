/** 城市打卡弹窗底图注册表：静态 require 供 Metro bundler 打包。
 *  每张图对应一个城市，用作足迹弹窗的背景地图。
 *
 *  图片与城市的对应关系由本地视觉模型（Qwen3-VL-4B）对 10 张手绘地图
 *  逐张识别地标后确定：
 *  - city-01 北京（鸟巢/天安门/故宫/长城）
 *  - city-02 上海（东方明珠/外滩/豫园）
 *  - city-03 成都（大熊猫基地/锦里/杜甫草堂）
 *  - city-04 杭州（西湖/灵隐寺）
 *  - city-05 广州（广州塔/沙面）
 *  - city-06 西安（兵马俑/城墙/大雁塔）
 *  - city-07 武汉（黄鹤楼/长江大桥）
 *  - city-08 深圳（地王大厦/深圳湾）
 *  - city-09 长沙（橘子洲/岳麓山）
 *  - city-10 重庆（洪崖洞/长江索道/朝天门）
 */

const cityCheckinImages: Record<string, ReturnType<typeof require>> = {
  beijing: require("../../../assets/city-checkin/city-01.png"),
  shanghai: require("../../../assets/city-checkin/city-02.png"),
  chengdu: require("../../../assets/city-checkin/city-03.png"),
  hangzhou: require("../../../assets/city-checkin/city-04.png"),
  guangzhou: require("../../../assets/city-checkin/city-05.png"),
  xian: require("../../../assets/city-checkin/city-06.png"),
  wuhan: require("../../../assets/city-checkin/city-07.png"),
  shenzhen: require("../../../assets/city-checkin/city-08.png"),
  changsha: require("../../../assets/city-checkin/city-09.png"),
  chongqing: require("../../../assets/city-checkin/city-10.png"),
};

/** 拥有打卡弹窗的城市列表 */
export const checkinCities = Object.keys(cityCheckinImages) as readonly string[];

export function getCityCheckinImage(city: string) {
  return cityCheckinImages[city] ?? null;
}
