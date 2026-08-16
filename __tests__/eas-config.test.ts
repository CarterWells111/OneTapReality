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
      "staging-testflight": {
        distribution: string;
        environment: string;
        autoIncrement: boolean;
        env: Record<string, string>;
      };
      production: {
        autoIncrement: boolean;
        env: Record<string, string>;
      };
    };
    submit: {
      "staging-testflight": {
        ios: {
          ascAppId: string;
          groups: string[];
        };
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

  it("provides a store-signed TestFlight profile isolated to staging", () => {
    const profile = config.build["staging-testflight"];

    expect(profile).toEqual({
      distribution: "store",
      environment: "preview",
      autoIncrement: true,
      env: {
        EXPO_PUBLIC_API_ORIGIN: "https://api-staging.onetapreality.com",
      },
    });
    expect(config.submit["staging-testflight"].ios.ascAppId).toBe("6794186067");
    expect(config.submit["staging-testflight"].ios.groups).toEqual([
      "OneTapReality Staging NFC",
    ]);

    for (const key of [
      "DATABASE_URL",
      "PGPASSWORD",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "RESEND_API_KEY",
      "GIFT_TOKEN_PEPPER",
      "GIFT_AUTH_PEPPER",
      "GIFT_CARD_CLEANUP_SECRET",
    ]) {
      expect(profile.env).not.toHaveProperty(key);
    }
  });
});
