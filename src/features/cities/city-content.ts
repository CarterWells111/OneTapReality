import { cityRegistry, cities, type City } from "../../types/city";

type CityContent = { name: string; subtitle: string; souvenir: string; color: string; discoverySlogan: string };
type ExistingCityContent = Omit<CityContent, "discoverySlogan">;

const existingContent: Partial<Record<City, ExistingCityContent>> = {
  hangzhou: { name: "杭州", subtitle: "把西湖边的慢时光收进册页", souvenir: "西湖莲影纪念钥匙", color: "#DDEBDD" },
  shanghai: { name: "上海", subtitle: "把城市灯光留在两个人的夜晚", souvenir: "外滩天际线纪念钥匙", color: "#F3E1D8" },
  shenzhen: { name: "深圳", subtitle: "把海风和新鲜感装进下一次出发", souvenir: "海湾科技线纪念钥匙", color: "#DDEBF4" },
  hongkong: { name: "香港", subtitle: "把维港的晚风和霓虹收进下一页", souvenir: "维港叮叮车纪念", color: "#F3E1D8" },
  luoyang: { name: "洛阳", subtitle: "把千年的花开花落收进手心", souvenir: "洛·天香坠·唐三彩", color: "#F5E6D3" },
  suzhou: { name: "苏州", subtitle: "把江南的紫藤烟雨留在襟前", souvenir: "苏·紫藤坠·苏绣", color: "#E8E0F0" },
};

const discoverySlogans: Record<City, string> = {
  urumqi: "去天山脚下接住一片辽阔，把风也装进行囊。",
  harbin: "在松花江畔等一场雪，让冬天为你留一盏灯。",
  changchun: "沿着电影的光影慢慢走，遇见北国温柔的春天。",
  hohhot: "向草原借一整片天空，把自由写进下一页。",
  shenyang: "在红墙与烟火之间，听一座老城讲新的故事。",
  yinchuan: "穿过塞上清风，让黄河的月色陪你走远。",
  beijing: "去胡同拐角喝一杯热茶，把故事留给故宫的风。",
  tianjin: "沿海河慢慢散步，让相声和晚风一起入册。",
  lanzhou: "在黄河边等一碗热面，把西北的豪爽记下来。",
  shijiazhuang: "在太行山的晨光里，收下一段朴实又明亮的旅程。",
  taiyuan: "登上古城的高处，让晋阳的晚风带你回望时光。",
  jinan: "循着泉水的声音出发，把清凉藏进夏日的回忆。",
  xining: "去高原的蓝天之下，和云朵一起慢慢呼吸。",
  lhasa: "在日光与经幡之间，遇见心里安静而辽阔的远方。",
  luoyang: "等一朵牡丹盛开，把千年古都的春色带回家。",
  zhengzhou: "从黄河岸边启程，遇见中原最踏实的热烈。",
  xian: "走过城墙的暮色，把长安的月光折进信里。",
  nanjing: "沿梧桐树影慢慢走，让金陵的故事轻轻落笔。",
  wuhan: "去江边吹晚风，把热干面的香气和笑声都留住。",
  chengdu: "在茶馆坐一下午，让松弛的时光慢慢发芽。",
  chongqing: "穿过山城的灯火，把热烈与迷路都变成风景。",
  shanghai: "在弄堂与江风之间，遇见一场属于你的城市心跳。",
  hefei: "去巢湖边看日落，把温柔的湖光装进行李。",
  hangzhou: "沿着西湖的水光慢走，让一页江南替你按下暂停。",
  changsha: "在夜市的烟火里举杯，把快乐写得热气腾腾。",
  nanchang: "登上滕王阁远望，让赣江的晚霞为旅程盖章。",
  guiyang: "钻进清凉的山风里，遇见一座会呼吸的城市。",
  kunming: "把四季如春的花香收好，留给下一次想念。",
  fuzhou: "在榕树的浓荫下散步，让海风把心事吹轻。",
  taipei: "去巷口寻一盏灯，把细雨和人情味慢慢收藏。",
  guangzhou: "在早茶的蒸汽里醒来，把岭南的鲜活尝个遍。",
  nanning: "沿着绿城的树影前行，收下一段柔软的南方时光。",
  shenzhen: "去海边等一场日落，把敢出发的心留在这里。",
  hongkong: "坐上叮叮车穿过海风，把维港夜色收进下一册旅行记忆。",
  suzhou: "穿过园林的月洞门，让一场细雨把江南写进心里。",
  haikou: "踩着椰影去看海，把岛上的慢日子带回日常。",
};

const colorsByKind = {
  "autonomous-region-capital": "#E7E4F5",
  "legacy-city": "#DDEBF4",
  municipality: "#F3E1D8",
  "province-capital": "#DDEBDD",
} as const;

export const cityContent: Record<City, CityContent> = Object.fromEntries(cities.map((city) => {
  const entry = cityRegistry.find((candidate) => candidate.id === city)!;
  const content = existingContent[city] ?? {
    name: entry.name,
    subtitle: `把${entry.name}的旅行时光收进册页`,
    souvenir: `${entry.name}城市旅行纪念`,
    color: colorsByKind[entry.kind],
  };
  return [city, { ...content, discoverySlogan: discoverySlogans[city] }];
})) as Record<City, CityContent>;
