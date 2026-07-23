import packageJson from "../package.json";

describe("Node and npm toolchain policy", () => {
  it("keeps Railway, npm, and contributor constraints aligned", () => {
    expect(packageJson.packageManager).toBe("npm@10.8.2");
    expect(packageJson.engines.node).toBe(">=20.19.0 <21");
    expect(packageJson.devEngines).toEqual({
      runtime: {
        name: "node",
        version: ">=20.19.0 <21",
        onFail: "error",
      },
      packageManager: {
        name: "npm",
        version: "10.8.2",
        onFail: "error",
      },
    });
    expect(packageJson.devDependencies["@testing-library/react-native"]).toBe(
      "13.3.3",
    );
    expect(packageJson.devDependencies["react-test-renderer"]).toBe("19.1.0");
  });
});
