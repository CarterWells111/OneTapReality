import { cityContent } from "../src/features/cities/city-content";
import { cities } from "../src/types/city";

describe("city content", () => {
  it("gives every city a dedicated nonempty discovery slogan separate from its subtitle", () => {
    expect(cities.every((city) => {
      const { discoverySlogan, subtitle } = cityContent[city];
      return discoverySlogan.trim().length > 0 && discoverySlogan !== subtitle;
    })).toBe(true);
  });
});
