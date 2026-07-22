import { render } from "@testing-library/react-native";

import { ProfileAvatar } from "../src/components/profile-avatar";

describe("ProfileAvatar", () => {
  it("shows the first nickname character in an accessible fallback avatar", async () => {
    const screen = await render(<ProfileAvatar nickname="小林" avatarUri={null} />);

    expect(screen.getByLabelText("小林的头像")).toBeTruthy();
    expect(screen.getByText("小")).toBeTruthy();
  });

  it("renders the supplied avatar URI as an accessible image", async () => {
    const screen = await render(<ProfileAvatar nickname="小林" avatarUri="file://avatar.jpg" size={80} />);

    expect(screen.getByLabelText("小林的头像").props.source).toEqual({ uri: "file://avatar.jpg" });
  });

  it("uses the default nickname when the editing value is empty", async () => {
    const screen = await render(<ProfileAvatar nickname="" avatarUri={null} />);

    expect(screen.getByLabelText("旅忆用户的头像")).toBeTruthy();
    expect(screen.getByText("旅")).toBeTruthy();
  });
});
