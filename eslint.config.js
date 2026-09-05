const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "node_modules/",
      ".expo/",
      ".pnpm-store/",
      ".runtime/",
      ".tmp/",
      ".tmp-mapdata/",
      ".worktrees/",
      "app-store-previews/",
      "coverage/",
      "dist/",
      "output/",
      "%SystemDrive%/",
    ],
    settings: {
      "import/core-modules": ["@svg-maps/china", "expo-file-system/legacy", "expo-media-library"],
    },
    rules: {
      // SDK 57 enables React Compiler diagnostics in eslint-config-expo. The
      // existing app predates these lint rules; migrate each state/ref pattern
      // separately instead of mixing behavior rewrites into the SDK upgrade.
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["__tests__/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      // Jest module factories intentionally use small anonymous mock components.
      "react/display-name": "off",
    },
  },
]);
