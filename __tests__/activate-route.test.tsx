import { render, screen } from "@testing-library/react-native";

import { ActivateScreen } from "../src/app/activate";

describe("NFC activation route", () => {
  it("shows an app-install-only message on the web", () => {
    render(<ActivateScreen platform="web" />);

    expect(screen.getByText("Open this NFC card in the One Tap Reality app")).toBeTruthy();
  });
});
