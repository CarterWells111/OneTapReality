import fs from "node:fs";
import path from "node:path";

describe("EAS build variant configuration", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "eas.json"), "utf8"),
  ) as {
    cli: { appVersionSource: string; requireCommit: boolean };
    build: Record<string, {
      distribution?: string;
      developmentClient?: boolean;
      environment?: string;
      autoIncrement?: boolean;
      env: Record<string, string>;
    }>;
    submit: Record<string, unknown>;
  };

  it("makes every build profile select exactly one validated variant", () => {
    expect(Object.fromEntries(
      Object.entries(config.build).map(([name, profile]) => [name, profile.env]),
    )).toEqual({
      development: { APP_VARIANT: "development-staging" },
      preview: { APP_VARIANT: "production" },
      alpha: { APP_VARIANT: "alpha-staging" },
      "staging-testflight": { APP_VARIANT: "staging-testflight" },
      "beta-external": { APP_VARIANT: "external-beta-staging" },
      production: { APP_VARIANT: "production" },
    });
  });

  it("defines a separately installable internal Development Build", () => {
    expect(config.build.development).toEqual(expect.objectContaining({
      developmentClient: true,
      distribution: "internal",
      env: { APP_VARIANT: "development-staging" },
    }));
    expect(config.submit.development).toBeUndefined();
  });

  it("keeps store-signed staging TestFlight on the approved internal profile", () => {
    expect(config.build["staging-testflight"]).toEqual({
      distribution: "store",
      environment: "preview",
      autoIncrement: true,
      env: { APP_VARIANT: "staging-testflight" },
    });
    expect(config.submit["staging-testflight"]).toBeDefined();
  });

  it("keeps the external Beta isolated from internal activation surfaces", () => {
    expect(config.build["beta-external"]).toEqual({
      distribution: "store",
      environment: "preview",
      autoIncrement: true,
      env: { APP_VARIANT: "external-beta-staging" },
    });
  });

  it("uses remote app versions and never exposes server credentials", () => {
    expect(config.cli).toEqual(expect.objectContaining({
      appVersionSource: "remote",
      requireCommit: true,
    }));
    expect(config.build.production.autoIncrement).toBe(true);
    const serialized = JSON.stringify(config.build);
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
      expect(serialized).not.toContain(key);
    }
  });
});
