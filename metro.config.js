const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const worktreeBlockList = /(?:^|[\\/])\.worktrees(?:[\\/].*)?$/u;

config.resolver.blockList = new RegExp(
  `${config.resolver.blockList.source}|${worktreeBlockList.source}`,
  config.resolver.blockList.flags,
);

module.exports = config;
