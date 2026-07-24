import type { City } from "../../types/city";

export type CityCheckinIcon =
  | "bridge"
  | "city"
  | "flower"
  | "food"
  | "garden"
  | "gate"
  | "market"
  | "mountain"
  | "museum"
  | "temple"
  | "tower"
  | "water";

export type CityCheckinSpot = {
  readonly icon: CityCheckinIcon;
  readonly name: string;
  readonly note: string;
};

export type CityCheckinGuide = {
  readonly routeName: string;
  readonly routeHint: string;
  readonly spots: readonly [CityCheckinSpot, CityCheckinSpot, CityCheckinSpot];
};

export const cityCheckinGuides: Record<City, CityCheckinGuide> = {
  beijing: {
    routeName: "古都中轴线",
    routeHint: "从红墙晨光走到胡同晚风",
    spots: [
      { icon: "gate", name: "故宫", note: "红墙与琉璃瓦" },
      { icon: "garden", name: "景山公园", note: "俯看中轴线" },
      { icon: "water", name: "什刹海", note: "胡同边的水色" },
    ],
  },
  changchun: {
    routeName: "光影慢游线",
    routeHint: "把电影记忆和城市绿意串起来",
    spots: [
      { icon: "museum", name: "长影旧址", note: "老胶片的温度" },
      { icon: "garden", name: "南湖公园", note: "湖畔散步" },
      { icon: "gate", name: "伪满皇宫", note: "旧城档案" },
    ],
  },
  changsha: {
    routeName: "湘江烟火线",
    routeHint: "从山水走进夜市热气",
    spots: [
      { icon: "mountain", name: "岳麓山", note: "山路与书院" },
      { icon: "water", name: "橘子洲", note: "江心长岛" },
      { icon: "food", name: "坡子街", note: "夜色小吃" },
    ],
  },
  chengdu: {
    routeName: "茶馆闲游线",
    routeHint: "把慢生活盖成一枚印章",
    spots: [
      { icon: "market", name: "宽窄巷子", note: "青砖院落" },
      { icon: "temple", name: "武侯祠", note: "锦官古意" },
      { icon: "garden", name: "人民公园", note: "盖碗茶时光" },
    ],
  },
  chongqing: {
    routeName: "山城灯火线",
    routeHint: "沿坡道、索道和江风打卡",
    spots: [
      { icon: "market", name: "洪崖洞", note: "吊脚楼夜景" },
      { icon: "bridge", name: "长江索道", note: "越江视角" },
      { icon: "city", name: "解放碑", note: "山城中心" },
    ],
  },
  fuzhou: {
    routeName: "榕城古厝线",
    routeHint: "在巷陌和江边收集清风",
    spots: [
      { icon: "gate", name: "三坊七巷", note: "坊巷人文" },
      { icon: "mountain", name: "鼓山", note: "石径云影" },
      { icon: "water", name: "闽江公园", note: "江边晚风" },
    ],
  },
  guangzhou: {
    routeName: "岭南早茶线",
    routeHint: "从老城烟火走向珠江夜色",
    spots: [
      { icon: "tower", name: "广州塔", note: "城市天际" },
      { icon: "market", name: "永庆坊", note: "骑楼街巷" },
      { icon: "food", name: "上下九", note: "早茶与小食" },
    ],
  },
  guiyang: {
    routeName: "山水清凉线",
    routeHint: "把瀑布、水岸和夜市连成一页",
    spots: [
      { icon: "water", name: "黔灵山公园", note: "山林湖光" },
      { icon: "bridge", name: "甲秀楼", note: "南明河地标" },
      { icon: "food", name: "青云市集", note: "夜色烟火" },
    ],
  },
  haikou: {
    routeName: "海岛慢日线",
    routeHint: "沿骑楼、火山和海风出发",
    spots: [
      { icon: "market", name: "骑楼老街", note: "南洋街景" },
      { icon: "mountain", name: "火山口公园", note: "熔岩地貌" },
      { icon: "water", name: "假日海滩", note: "椰影海风" },
    ],
  },
  hangzhou: {
    routeName: "西湖留白线",
    routeHint: "从桥影走到茶香，把江南慢慢收起",
    spots: [
      { icon: "bridge", name: "断桥", note: "湖面晨光" },
      { icon: "water", name: "三潭印月", note: "月色水印" },
      { icon: "garden", name: "龙井村", note: "茶田小路" },
    ],
  },
  hongkong: {
    routeName: "维港霓虹线",
    routeHint: "坐叮叮车穿过海风和灯影",
    spots: [
      { icon: "water", name: "维多利亚港", note: "海风夜色" },
      { icon: "tower", name: "太平山顶", note: "俯看霓虹" },
      { icon: "market", name: "中环街巷", note: "叮叮车铃声" },
    ],
  },
  harbin: {
    routeName: "冰城童话线",
    routeHint: "从欧式街景走到江畔雪色",
    spots: [
      { icon: "gate", name: "中央大街", note: "面包石路" },
      { icon: "temple", name: "圣索菲亚教堂", note: "穹顶剪影" },
      { icon: "water", name: "松花江畔", note: "冬日江风" },
    ],
  },
  hefei: {
    routeName: "巢湖新城线",
    routeHint: "在湖光、古镇和公园里放慢脚步",
    spots: [
      { icon: "water", name: "巢湖岸线", note: "湖畔日落" },
      { icon: "garden", name: "逍遥津", note: "城中绿意" },
      { icon: "gate", name: "三河古镇", note: "青石水巷" },
    ],
  },
  hohhot: {
    routeName: "青城草原线",
    routeHint: "从寺院金顶走向辽阔草场",
    spots: [
      { icon: "temple", name: "大召寺", note: "金顶与香火" },
      { icon: "museum", name: "内蒙古博物院", note: "草原记忆" },
      { icon: "mountain", name: "敕勒川草原", note: "天地辽阔" },
    ],
  },
  jinan: {
    routeName: "泉城清响线",
    routeHint: "跟着泉水声穿过老城",
    spots: [
      { icon: "water", name: "趵突泉", note: "泉眼翻涌" },
      { icon: "garden", name: "大明湖", note: "湖柳荷风" },
      { icon: "mountain", name: "千佛山", note: "登高望城" },
    ],
  },
  kunming: {
    routeName: "春城花影线",
    routeHint: "把湖风、街巷和花色带走",
    spots: [
      { icon: "water", name: "滇池", note: "湖面远山" },
      { icon: "market", name: "翠湖周边", note: "街巷闲逛" },
      { icon: "flower", name: "斗南花市", note: "鲜花成海" },
    ],
  },
  lanzhou: {
    routeName: "黄河风味线",
    routeHint: "沿河桥与夜市走一圈",
    spots: [
      { icon: "bridge", name: "中山桥", note: "黄河铁桥" },
      { icon: "mountain", name: "白塔山", note: "俯望河谷" },
      { icon: "food", name: "正宁路夜市", note: "西北烟火" },
    ],
  },
  lhasa: {
    routeName: "日光朝圣线",
    routeHint: "在宫殿、街道与湖色间安静前行",
    spots: [
      { icon: "gate", name: "布达拉宫", note: "日光之城" },
      { icon: "temple", name: "大昭寺", note: "转经路口" },
      { icon: "water", name: "纳木措", note: "高原湖色" },
    ],
  },
  luoyang: {
    routeName: "牡丹古都线",
    routeHint: "从石窟到花城，收一段盛唐春色",
    spots: [
      { icon: "temple", name: "龙门石窟", note: "伊水石壁" },
      { icon: "flower", name: "牡丹园", note: "花开成章" },
      { icon: "gate", name: "洛邑古城", note: "灯影古街" },
    ],
  },
  nanchang: {
    routeName: "赣江楼阁线",
    routeHint: "把江风和楼影连成旅程",
    spots: [
      { icon: "tower", name: "滕王阁", note: "楼阁霞光" },
      { icon: "water", name: "赣江两岸", note: "江边夜色" },
      { icon: "museum", name: "八一起义纪念馆", note: "城市记忆" },
    ],
  },
  nanjing: {
    routeName: "金陵梧桐线",
    routeHint: "在城墙、湖水与林荫里慢行",
    spots: [
      { icon: "gate", name: "明城墙", note: "砖色长线" },
      { icon: "water", name: "玄武湖", note: "湖面风光" },
      { icon: "mountain", name: "钟山风景区", note: "林间古意" },
    ],
  },
  nanning: {
    routeName: "绿城清风线",
    routeHint: "从青山走到老街夜色",
    spots: [
      { icon: "mountain", name: "青秀山", note: "绿意高处" },
      { icon: "water", name: "邕江边", note: "江风步道" },
      { icon: "food", name: "中山路夜市", note: "南方小吃" },
    ],
  },
  shanghai: {
    routeName: "海派天际线",
    routeHint: "从外滩风景走进弄堂灯火",
    spots: [
      { icon: "city", name: "外滩", note: "江岸万国建筑" },
      { icon: "tower", name: "陆家嘴", note: "天际线剪影" },
      { icon: "market", name: "田子坊", note: "弄堂小店" },
    ],
  },
  shenyang: {
    routeName: "盛京旧城线",
    routeHint: "把宫墙、老街和雪色串起来",
    spots: [
      { icon: "gate", name: "沈阳故宫", note: "盛京红墙" },
      { icon: "museum", name: "张氏帅府", note: "民国院落" },
      { icon: "market", name: "中街", note: "老街烟火" },
    ],
  },
  shenzhen: {
    routeName: "海湾新鲜线",
    routeHint: "从公园绿意跑向城市海岸",
    spots: [
      { icon: "water", name: "深圳湾公园", note: "海岸慢跑" },
      { icon: "city", name: "平安金融中心", note: "云端城市" },
      { icon: "market", name: "南头古城", note: "新旧街巷" },
    ],
  },
  shijiazhuang: {
    routeName: "太行古韵线",
    routeHint: "从古城门到山间石桥",
    spots: [
      { icon: "gate", name: "正定古城", note: "城门与寺塔" },
      { icon: "bridge", name: "赵州桥", note: "千年石拱" },
      { icon: "mountain", name: "西柏坡", note: "山村记忆" },
    ],
  },
  suzhou: {
    routeName: "园林水巷线",
    routeHint: "穿过月洞门，再沿运河慢慢走",
    spots: [
      { icon: "garden", name: "拙政园", note: "园林花窗" },
      { icon: "water", name: "平江路", note: "水巷人家" },
      { icon: "bridge", name: "山塘街", note: "灯影河桥" },
    ],
  },
  taipei: {
    routeName: "雨巷人情线",
    routeHint: "从老街香气走到城市高处",
    spots: [
      { icon: "tower", name: "台北 101", note: "城市高度" },
      { icon: "market", name: "迪化街", note: "老街商号" },
      { icon: "food", name: "士林夜市", note: "夜市热气" },
    ],
  },
  taiyuan: {
    routeName: "晋阳古建线",
    routeHint: "沿古祠、老街和河岸散步",
    spots: [
      { icon: "temple", name: "晋祠", note: "古木泉声" },
      { icon: "market", name: "钟楼街", note: "老城街景" },
      { icon: "water", name: "汾河公园", note: "河岸晚风" },
    ],
  },
  tianjin: {
    routeName: "海河洋楼线",
    routeHint: "在桥影与老街里收集津味",
    spots: [
      { icon: "bridge", name: "解放桥", note: "海河桥影" },
      { icon: "gate", name: "五大道", note: "洋楼街区" },
      { icon: "food", name: "古文化街", note: "津味小吃" },
    ],
  },
  urumqi: {
    routeName: "天山辽阔线",
    routeHint: "从市集烟火走向山脚湖色",
    spots: [
      { icon: "market", name: "国际大巴扎", note: "丝路市集" },
      { icon: "mountain", name: "天山天池", note: "雪山湖色" },
      { icon: "museum", name: "新疆博物馆", note: "西域记忆" },
    ],
  },
  wuhan: {
    routeName: "江城过桥线",
    routeHint: "从楼阁、长桥到湖光",
    spots: [
      { icon: "tower", name: "黄鹤楼", note: "登楼望江" },
      { icon: "bridge", name: "长江大桥", note: "跨江视角" },
      { icon: "water", name: "东湖", note: "湖畔骑行" },
    ],
  },
  xian: {
    routeName: "长安城墙线",
    routeHint: "从古城暮色走到烟火街巷",
    spots: [
      { icon: "gate", name: "西安城墙", note: "城门暮色" },
      { icon: "temple", name: "大雁塔", note: "唐风塔影" },
      { icon: "food", name: "回民街", note: "街巷小吃" },
    ],
  },
  xining: {
    routeName: "高原晴空线",
    routeHint: "把寺院、湖色和山风留在册页",
    spots: [
      { icon: "temple", name: "塔尔寺", note: "金瓦经院" },
      { icon: "water", name: "青海湖", note: "高原蓝色" },
      { icon: "market", name: "莫家街", note: "西北味道" },
    ],
  },
  yinchuan: {
    routeName: "塞上黄河线",
    routeHint: "沿王陵、湖岸和酒庄慢行",
    spots: [
      { icon: "gate", name: "西夏陵", note: "王朝遗迹" },
      { icon: "water", name: "沙湖", note: "芦苇水影" },
      { icon: "mountain", name: "贺兰山岩画", note: "山石记号" },
    ],
  },
  zhengzhou: {
    routeName: "中原溯源线",
    routeHint: "从黄河岸边走向古都记忆",
    spots: [
      { icon: "water", name: "黄河风景区", note: "大河岸线" },
      { icon: "temple", name: "少林寺", note: "嵩山古刹" },
      { icon: "museum", name: "河南博物院", note: "中原器物" },
    ],
  },
};
