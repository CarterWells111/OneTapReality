import packageJson from "../package.json";

describe("Node and npm toolchain policy", () => {
  it("accepts supported toolchain versions at or above the minimum", () => {
    expect(packageJson).not.toHaveProperty("packageManager");
    expect(packageJson.engines).toEqual({
      node: ">=20.19.0",
      npm: ">=10.8.2",
    });
    expect(packageJson.devEngines).toEqual({
      runtime: {
        name: "node",
        version: ">=20.19.0",
        onFail: "error",
      },
      packageManager: {
        name: "npm",
        version: ">=10.8.2",
        onFail: "error",
      },
    });
    expect(packageJson.devDependencies["@testing-library/react-native"]).toBe(
      "13.3.3",
    );
    expect(packageJson.devDependencies["react-test-renderer"]).toBe("19.1.0");
  });
});
