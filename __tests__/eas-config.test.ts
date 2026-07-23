import fs from "node:fs";
import path from "node:path";

describe("EAS production configuration", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "eas.json"), "utf8"),
  ) as {
    build: {
      production: {
        env: Record<string, string>;
      };
    };
  };

  it("points production builds at the Railway API", () => {
    expect(config.build.production.env.EXPO_PUBLIC_API_ORIGIN).toBe(
      "https://onetapserver-production.up.railway.app",
    );
  });

  it("does not expose server credentials", () => {
    expect(config.build.production.env).not.toHaveProperty("DATABASE_URL");
    expect(config.build.production.env).not.toHaveProperty("DEVICE_TOKEN_PEPPER");
  });
});
