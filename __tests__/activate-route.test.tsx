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
});
