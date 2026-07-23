const provinceIds = [
  "anhui", "beijing", "chongqing", "fujian", "gansu", "guangdong", "guangxi", "guizhou", "hainan", "hebei", "heilongjiang",
  "henan", "hong-kong", "hubei", "hunan", "jiangsu", "jiangxi", "jilin", "liaoning", "macau", "nei-mongol", "ningxia-hui",
  "qinghai", "shaanxi", "shandong", "shanghai", "shanxi", "sichuan", "tianjin", "xinjiang-uygur", "xizang", "yunnan", "zhejiang",
] as const;

export default {
  label: "Map of China",
  locations: provinceIds.map((id, index) => ({ id, name: id, path: `M ${index} 0 h 1 v 1 h -1 z` })),
  viewBox: "0 0 774 569",
};
