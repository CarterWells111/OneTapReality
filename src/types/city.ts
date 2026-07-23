export type RelativeMapCoordinate = {
  readonly x: number;
  readonly y: number;
};

export type CityMapFocus = {
  readonly center: RelativeMapCoordinate;
  readonly zoom: number;
};

export type CityKind = "province-capital" | "autonomous-region-capital" | "municipality" | "legacy-city";

export type CityRegistryEntry = {
  readonly id: string;
  readonly name: string;
  readonly kind: CityKind;
  readonly region: string;
  readonly coordinate: RelativeMapCoordinate;
  readonly focus: CityMapFocus;
};

const location = (id: string, name: string, kind: CityKind, region: string, x: number, y: number, zoom = 2): CityRegistryEntry => ({
  id,
  name,
  kind,
  region,
  coordinate: Object.freeze({ x, y }),
  focus: Object.freeze({ center: Object.freeze({ x, y }), zoom }),
});

export const cityRegistry = Object.freeze([
  location("urumqi", "乌鲁木齐", "autonomous-region-capital", "新疆维吾尔自治区", 0.17, 0.25),
  location("harbin", "哈尔滨", "province-capital", "黑龙江省", 0.75, 0.18),
  location("changchun", "长春", "province-capital", "吉林省", 0.72, 0.26),
  location("hohhot", "呼和浩特", "autonomous-region-capital", "内蒙古自治区", 0.58, 0.29),
  location("shenyang", "沈阳", "province-capital", "辽宁省", 0.72, 0.34),
  location("yinchuan", "银川", "autonomous-region-capital", "宁夏回族自治区", 0.49, 0.39),
  location("beijing", "北京", "municipality", "北京市", 0.69, 0.39),
  location("tianjin", "天津", "municipality", "天津市", 0.72, 0.42),
  location("lanzhou", "兰州", "province-capital", "甘肃省", 0.45, 0.45),
  location("shijiazhuang", "石家庄", "province-capital", "河北省", 0.65, 0.46),
  location("taiyuan", "太原", "province-capital", "山西省", 0.59, 0.47),
  location("jinan", "济南", "province-capital", "山东省", 0.71, 0.49),
  location("xining", "西宁", "province-capital", "青海省", 0.38, 0.51),
  location("lhasa", "拉萨", "autonomous-region-capital", "西藏自治区", 0.30, 0.59),
  location("zhengzhou", "郑州", "province-capital", "河南省", 0.62, 0.53),
  location("xian", "西安", "province-capital", "陕西省", 0.53, 0.55),
  location("nanjing", "南京", "province-capital", "江苏省", 0.76, 0.59),
  location("wuhan", "武汉", "province-capital", "湖北省", 0.65, 0.61),
  location("chengdu", "成都", "province-capital", "四川省", 0.49, 0.62),
  location("chongqing", "重庆", "municipality", "重庆市", 0.55, 0.63),
  location("shanghai", "上海", "municipality", "上海市", 0.84, 0.62),
  location("hefei", "合肥", "province-capital", "安徽省", 0.72, 0.64),
  location("hangzhou", "杭州", "province-capital", "浙江省", 0.78, 0.68),
  location("changsha", "长沙", "province-capital", "湖南省", 0.62, 0.70),
  location("nanchang", "南昌", "province-capital", "江西省", 0.70, 0.70),
  location("guiyang", "贵阳", "province-capital", "贵州省", 0.53, 0.71),
  location("kunming", "昆明", "province-capital", "云南省", 0.42, 0.75),
  location("fuzhou", "福州", "province-capital", "福建省", 0.79, 0.77),
  location("taipei", "台北", "province-capital", "台湾省", 0.88, 0.78),
  location("guangzhou", "广州", "province-capital", "广东省", 0.68, 0.80),
  location("nanning", "南宁", "autonomous-region-capital", "广西壮族自治区", 0.58, 0.82),
  location("shenzhen", "深圳", "legacy-city", "广东省", 0.71, 0.84),
  location("haikou", "海口", "province-capital", "海南省", 0.54, 0.91),
] as const);

export type City = (typeof cityRegistry)[number]["id"];

export const cities: readonly City[] = Object.freeze(cityRegistry.map((city) => city.id));
