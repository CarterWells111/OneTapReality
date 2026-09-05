import packageJson from "../package.json";

describe("Node and npm toolchain policy", () => {
  it("accepts supported toolchain versions at or above the minimum", () => {
    expect(packageJson).not.toHaveProperty("packageManager");
    expect(packageJson.engines).toEqual({
      node: ">=22.13.0",
      npm: ">=10.8.2",
    });
    expect(packageJson.devEngines).toEqual({
      runtime: {
        name: "node",
        version: ">=22.13.0",
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
    expect(packageJson.devDependencies["react-test-renderer"]).toBe("19.2.3");
  });

  it("pins dependency updates and patched transitive security floors", () => {
    expect(packageJson.dependencies["@aws-sdk/client-s3"]).toBe("^3.1127.0");
    expect(packageJson.dependencies["@aws-sdk/s3-request-presigner"]).toBe(
      "^3.1127.0",
    );
    expect(packageJson.dependencies.morgan).toBe("^1.12.0");
    expect(packageJson.dependencies.pg).toBe("^8.23.0");
    expect(packageJson.dependencies.resend).toBe("^6.26.0");
    expect(packageJson.dependencies.zod).toBe("^4.5.4");
    expect(packageJson.devDependencies["@types/pg"]).toBe("^8.23.1");
    expect(packageJson.overrides).toMatchObject({
      "@expo/plist": { "@xmldom/xmldom": "0.8.15" },
      plist: { "@xmldom/xmldom": "0.9.12" },
      "minimatch@3.1.5": { "brace-expansion": "1.1.18" },
      "minimatch@10.2.5": { "brace-expansion": "5.0.9" },
      "@eslint/eslintrc": { "js-yaml": "4.3.1" },
      "@istanbuljs/load-nyc-config": { "js-yaml": "3.15.1" },
      qs: "6.16.0",
      uuid: "11.1.1",
    });
  });
});
