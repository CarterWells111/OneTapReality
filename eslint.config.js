const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["node_modules/", ".expo/", "coverage/"],
    settings: {
      "import/core-modules": ["@svg-maps/china", "expo-file-system/legacy"],
    },
  },
]);
