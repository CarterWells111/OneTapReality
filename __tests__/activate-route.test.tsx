import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react-native";

import { ActivateScreen } from "../src/app/activate";

describe("NFC activation route", () => {
  it.each(["web", "ios"] as const)("shows the public gift-not-ready message on %s", (platform) => {
    render(<ActivateScreen platform={platform} />);

    expect(screen.getByText("礼品尚未准备好，请联系赠送者")).toBeTruthy();
    expect(screen.getByText("如需帮助，请联系 support@onetapreality.com")).toBeTruthy();
  });

  it("does not expose the developer card console on the web", () => {
    render(<ActivateScreen platform="web" />);

    expect(screen.queryByText(/制卡|写入 NFC|开发者/u)).toBeNull();
  });

  it("keeps the public route generic while the internal entry owns the developer console", () => {
    const routeSource = readFileSync(join(process.cwd(), "src/app/activate.tsx"), "utf8");
    const publicEntryPath = join(
      process.cwd(),
      "src/features/gifts/activate-entry.tsx",
    );
    const internalEntryPath = join(
      process.cwd(),
      "src/features/gifts/activate-entry.internal.tsx",
    );

    expect(routeSource).toContain("../features/gifts/activate-entry");
    expect(routeSource).not.toMatch(/DeveloperNfcConsole|developer-nfc-console/u);
    expect(existsSync(publicEntryPath)).toBe(true);
    expect(existsSync(internalEntryPath)).toBe(true);
    expect(readFileSync(publicEntryPath, "utf8")).not.toMatch(
      /DeveloperNfcConsole|developer-nfc-console/u,
    );
    expect(readFileSync(internalEntryPath, "utf8")).toMatch(
      /DeveloperNfcConsole|developer-nfc-console/u,
    );
    expect(readFileSync(
      join(process.cwd(), "src/features/gifts/developer-nfc-console.tsx"),
      "utf8",
    )).toContain('/login?returnTo=/activate');
  });
});
