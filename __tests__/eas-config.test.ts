import fs from "node:fs";
import path from "node:path";

describe("EAS production configuration", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "eas.json"), "utf8"),
  ) as {
    cli: {
      appVersionSource: string;
    };
    build: {
      preview: {
        env: Record<string, string>;
      };
      production: {
        autoIncrement: boolean;
        env: Record<string, string>;
      };
    };
  };

  it("points preview and production builds at the OneTapReality API", () => {
    expect(config.build.preview.env.EXPO_PUBLIC_API_ORIGIN).toBe(
      "https://api.onetapreality.com",
    );
    expect(config.build.production.env.EXPO_PUBLIC_API_ORIGIN).toBe(
      "https://api.onetapreality.com",
    );
  });

  it("does not expose server credentials", () => {
    expect(config.build.production.env).not.toHaveProperty("DATABASE_URL");
    expect(config.build.production.env).not.toHaveProperty("DEVICE_TOKEN_PEPPER");
  });

  it("uses remote app versions and increments TestFlight build numbers", () => {
    expect(config.cli.appVersionSource).toBe("remote");
    expect(config.build.production.autoIncrement).toBe(true);
  });
});
