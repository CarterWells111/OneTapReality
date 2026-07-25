import { act, render, waitFor } from "@testing-library/react-native";
import * as React from "react";

const mockGetCurrentAuthUser = jest.fn();
const mockVerifyAuthEmailCode = jest.fn();
const mockLogoutAuthSession = jest.fn();
const mockLoadAuthSession = jest.fn();
const mockSaveAuthSession = jest.fn();
const mockClearAuthSession = jest.fn();
const mockLoadRememberedEmail = jest.fn();
const mockSaveRememberedEmail = jest.fn();
const mockClearRememberedEmail = jest.fn();
let auth: ReturnType<typeof import("../src/features/auth/auth-provider").useAuth> | undefined;

jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({
    getCurrentAuthUser: mockGetCurrentAuthUser,
    verifyAuthEmailCode: mockVerifyAuthEmailCode,
    logoutAuthSession: mockLogoutAuthSession,
    requestAuthEmailCode: jest.fn(),
  })),
}));
jest.mock("../src/features/auth/auth-storage", () => ({
  loadAuthSession: (...args: unknown[]) => mockLoadAuthSession(...args),
  saveAuthSession: (...args: unknown[]) => mockSaveAuthSession(...args),
  clearAuthSession: (...args: unknown[]) => mockClearAuthSession(...args),
  loadRememberedEmail: (...args: unknown[]) => mockLoadRememberedEmail(...args),
  saveRememberedEmail: (...args: unknown[]) => mockSaveRememberedEmail(...args),
  clearRememberedEmail: (...args: unknown[]) => mockClearRememberedEmail(...args),
}));

import { AuthProvider, useAuth } from "../src/features/auth/auth-provider";

function CaptureAuth() {
  auth = useAuth();
  return null;
}

describe("AuthProvider remembered account", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth = undefined;
    mockLoadAuthSession.mockResolvedValue(null);
    mockLoadRememberedEmail.mockResolvedValue("owner@example.com");
    mockSaveAuthSession.mockResolvedValue(undefined);
    mockClearAuthSession.mockResolvedValue(undefined);
    mockSaveRememberedEmail.mockResolvedValue(undefined);
    mockClearRememberedEmail.mockResolvedValue(undefined);
    mockLogoutAuthSession.mockResolvedValue(undefined);
  });

  it("loads the remembered email independently from the session", async () => {
    render(<AuthProvider><CaptureAuth /></AuthProvider>);

    await waitFor(() => expect(auth?.isAuthReady).toBe(true));
    expect(auth?.rememberedEmail).toBe("owner@example.com");
    expect(auth?.session).toBeNull();
  });

  it("remembers the normalized server identity only after verification succeeds", async () => {
    const session = {
      accessToken: "token",
      user: { id: "user-1", email: "viewer@example.com", isAdmin: false },
    };
    mockVerifyAuthEmailCode.mockResolvedValue(session);
    render(<AuthProvider><CaptureAuth /></AuthProvider>);
    await waitFor(() => expect(auth?.isAuthReady).toBe(true));

    await act(async () => auth?.verifyCode(" VIEWER@example.com ", "123456"));

    expect(mockSaveRememberedEmail).toHaveBeenCalledWith("viewer@example.com");
    expect(auth?.rememberedEmail).toBe("viewer@example.com");
  });

  it("keeps a successful login when optional email memory cannot be written", async () => {
    const session = {
      accessToken: "token",
      user: { id: "user-1", email: "viewer@example.com", isAdmin: false },
    };
    mockVerifyAuthEmailCode.mockResolvedValue(session);
    mockSaveRememberedEmail.mockRejectedValue(new Error("keychain unavailable"));
    render(<AuthProvider><CaptureAuth /></AuthProvider>);
    await waitFor(() => expect(auth?.isAuthReady).toBe(true));

    let result: unknown;
    await act(async () => {
      result = await auth?.verifyCode("viewer@example.com", "123456");
    });
    expect(result).toEqual(session);
    expect(auth?.session).toEqual(session);
  });

  it("clears remembered email only through the explicit forget action", async () => {
    render(<AuthProvider><CaptureAuth /></AuthProvider>);
    await waitFor(() => expect(auth?.isAuthReady).toBe(true));

    await act(async () => auth?.signOut());
    expect(mockClearRememberedEmail).not.toHaveBeenCalled();

    await act(async () => auth?.forgetRememberedEmail());
    expect(mockClearRememberedEmail).toHaveBeenCalledTimes(1);
    expect(auth?.rememberedEmail).toBeNull();
  });

  it("does not let delayed bootstrap restore overwrite a newly verified account", async () => {
    let resolveBootstrap: (user: { id: string; email: string; isAdmin: boolean }) => void = () => undefined;
    mockLoadAuthSession.mockResolvedValue({
      accessToken: "old-token",
      user: { id: "old-user", email: "old@example.com", isAdmin: false },
    });
    mockGetCurrentAuthUser.mockReturnValue(new Promise((resolve) => {
      resolveBootstrap = resolve;
    }));
    const nextSession = {
      accessToken: "new-token",
      user: { id: "new-user", email: "new@example.com", isAdmin: false },
    };
    mockVerifyAuthEmailCode.mockResolvedValue(nextSession);
    render(<AuthProvider><CaptureAuth /></AuthProvider>);
    await waitFor(() => expect(mockGetCurrentAuthUser).toHaveBeenCalledWith("old-token"));

    await act(async () => auth?.verifyCode("new@example.com", "123456"));
    await act(async () => resolveBootstrap({ id: "old-user", email: "old@example.com", isAdmin: false }));

    await waitFor(() => expect(auth?.isAuthReady).toBe(true));
    expect(auth?.session).toEqual(nextSession);
  });

  it("keeps a saved session during a temporary bootstrap network failure", async () => {
    const savedSession = {
      accessToken: "saved-token",
      user: { id: "user-1", email: "owner@example.com", isAdmin: false },
    };
    mockLoadAuthSession.mockResolvedValue(savedSession);
    mockGetCurrentAuthUser.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    render(<AuthProvider><CaptureAuth /></AuthProvider>);

    await waitFor(() => expect(auth?.isAuthReady).toBe(true));
    expect(auth?.session).toEqual(savedSession);
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  it("clears a saved session only when the server explicitly rejects it", async () => {
    mockLoadAuthSession.mockResolvedValue({
      accessToken: "expired-token",
      user: { id: "user-1", email: "owner@example.com", isAdmin: false },
    });
    mockGetCurrentAuthUser.mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));
    render(<AuthProvider><CaptureAuth /></AuthProvider>);

    await waitFor(() => expect(auth?.isAuthReady).toBe(true));
    expect(auth?.session).toBeNull();
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
  });

  it("keeps the current account visible when local sign-out storage cannot be cleared", async () => {
    const savedSession = {
      accessToken: "saved-token",
      user: { id: "user-1", email: "owner@example.com", isAdmin: false },
    };
    mockLoadAuthSession.mockResolvedValue(savedSession);
    mockGetCurrentAuthUser.mockResolvedValue(savedSession.user);
    mockClearAuthSession.mockRejectedValue(new Error("keychain unavailable"));
    render(<AuthProvider><CaptureAuth /></AuthProvider>);
    await waitFor(() => expect(auth?.session).toEqual(savedSession));

    await expect(auth?.signOut()).rejects.toThrow("keychain unavailable");
    expect(auth?.session).toEqual(savedSession);
    expect(mockLogoutAuthSession).not.toHaveBeenCalled();
  });
});
