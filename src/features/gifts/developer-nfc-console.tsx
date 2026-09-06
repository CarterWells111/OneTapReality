import * as React from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle, Tag } from "../../components/ui";
import {
  AdminGiftCardApiClient,
  type AdminGiftCard,
  type AdminGiftCardDetail,
} from "../../services/backend/admin-gift-card-api-client";
import {
  BackendApiError,
  type AuthenticatedAccountSession,
} from "../../services/backend/api-client";
import {
  clearPendingGiftCard,
  loadPendingGiftCard,
  markPendingGiftCardWriteVerified,
  savePendingGiftCard,
  type PendingGiftCard,
} from "../../services/gifts/gift-card-pending";
import {
  createInternalNfcUrlPolicy,
  InternalNfcUrlPolicyError,
  type InternalNfcUrlPolicy,
} from "../../services/nfc/internal-nfc-url-policy";
import { createNfcUrlWriter, type NfcUrlWriter } from "../../services/nfc/nfc-url-writer";
import { useAuth } from "../auth/auth-provider";

type ConsoleClient = Pick<AdminGiftCardApiClient, "listAdminGiftCards" | "getAdminGiftCard" | "reserveGiftCard" | "updateAdminGiftCard" | "activateAdminGiftCard" | "retireAdminGiftCard">;
type AccessState = "checking" | "signedOut" | "noAccess" | "ready";
type PolicyResolution = {
  readonly error: unknown;
  readonly policy: InternalNfcUrlPolicy | null;
};
type OperationContext = {
  readonly accessToken: string;
  readonly contextKey: string;
  readonly generation: number;
  readonly ownerUserId: string;
  readonly urlPolicy: InternalNfcUrlPolicy;
};

/** Leaves enough time for one physical NFC write plus server activation. */
export const NFC_RESERVATION_SAFETY_WINDOW_MS = 2 * 60 * 1000;

function parseValidReservationExpiry(expiresAt: string): number | null {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;
  try {
    if (new Date(expiresAtMs).toISOString() !== expiresAt) return null;
  } catch {
    return null;
  }
  return expiresAtMs;
}

function safeToStartWrite(expiresAt: string, nowMs: number): boolean {
  const expiresAtMs = parseValidReservationExpiry(expiresAt);
  return Number.isFinite(nowMs)
    && expiresAtMs !== null
    && expiresAtMs > nowMs + NFC_RESERVATION_SAFETY_WINDOW_MS;
}

function safeToActivateWrittenCard(expiresAt: string, nowMs: number): boolean {
  const expiresAtMs = parseValidReservationExpiry(expiresAt);
  return Number.isFinite(nowMs)
    && expiresAtMs !== null
    && expiresAtMs > nowMs;
}

function canRetire(card: AdminGiftCard) {
  return card.state === "active" && card.giftStatus === "unclaimed";
}

function cardLabel(card: Pick<AdminGiftCard, "displayNumber">) {
  return `Card #${card.displayNumber}`;
}

function pendingCardLabel(card: PendingGiftCard) {
  return card.displayNumber ? `Card #${card.displayNumber}` : "the pending card";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return /\bCARD-[A-Za-z0-9-]+\b/u.test(error.message) ? fallback : error.message;
  }
  const nativeErrorName = typeof error === "object" && error
    ? (error as { constructor?: { name?: string } }).constructor?.name
    : undefined;
  if (nativeErrorName === "Timeout") return "NFC scan timed out. Tap again and hold the card against the top of the phone until verification finishes.";
  if (nativeErrorName === "UserCancel") return "NFC scanning was cancelled. Tap the action again when the card is ready.";
  if (nativeErrorName === "TagNotWritable") return "This NFC card is read-only and cannot be initialized.";
  if (nativeErrorName === "TagSizeTooSmall") return "This NFC card does not have enough capacity for the gift URL.";
  if (nativeErrorName === "SystemBusy") return "The iPhone NFC reader is still busy. Wait a moment and retry.";
  return fallback;
}

function policyErrorMessage(error: unknown) {
  return error instanceof InternalNfcUrlPolicyError
    ? error.message
    : "NFC link validation failed. Stop and contact support.";
}

function createContextKey(
  session: AuthenticatedAccountSession,
  urlPolicy: InternalNfcUrlPolicy,
) {
  return JSON.stringify([
    session.user.id,
    session.user.email.trim().toLowerCase(),
    session.accessToken,
    urlPolicy.apiOrigin,
    urlPolicy.giftOrigin,
  ]);
}

function isMissingReservationError(error: unknown): boolean {
  return error instanceof BackendApiError
    && (
      error.status === 404
      || ["gift_card_not_found", "reservation_not_found"]
        .includes(error.code)
    );
}

function isConfirmedReservationDetail(
  value: unknown,
  reservation: PendingGiftCard,
): value is AdminGiftCardDetail {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdminGiftCardDetail>;
  if (!candidate.card || typeof candidate.card !== "object") return false;
  const card = candidate.card as Partial<AdminGiftCard & { expiresAt: string | null }>;
  const matchesCard = Array.isArray(candidate.events)
    && card.id === reservation.cardId
    && (reservation.displayNumber === undefined || card.displayNumber === reservation.displayNumber)
    && ["initializing", "active", "retired"].includes(card.state ?? "");
  if (!matchesCard) return false;
  return card.state !== "initializing"
    || (
      reservation.operationId === reservation.cardId
      && card.expiresAt === reservation.expiresAt
    );
}

export function DeveloperNfcConsole({
  client: injectedClient,
  now: injectedNow,
  urlPolicy: injectedUrlPolicy,
  writer: injectedWriter,
}: {
  client?: ConsoleClient;
  now?: () => number;
  urlPolicy?: InternalNfcUrlPolicy;
  writer?: NfcUrlWriter;
}) {
  const router = useRouter();
  const { isAuthReady, session } = useAuth();
  const client = React.useMemo(
    () => injectedClient ?? new AdminGiftCardApiClient(),
    [injectedClient],
  );
  const writer = React.useMemo(() => injectedWriter ?? createNfcUrlWriter(), [injectedWriter]);
  const now = injectedNow ?? Date.now;
  const policyResolution = React.useMemo<PolicyResolution>(() => {
    if (injectedUrlPolicy) return { error: null, policy: injectedUrlPolicy };
    try {
      return {
        error: null,
        policy: createInternalNfcUrlPolicy({
          apiOrigin: process.env.EXPO_PUBLIC_API_ORIGIN,
          giftOrigin: process.env.EXPO_PUBLIC_GIFT_ORIGIN,
        }),
      };
    } catch (error) {
      return { error, policy: null };
    }
  }, [injectedUrlPolicy]);
  const urlPolicy = policyResolution.policy;
  const currentAccessToken = session?.accessToken ?? null;
  const currentOwnerUserId = session?.user.id ?? null;
  const contextKey = isAuthReady && session && urlPolicy
    ? createContextKey(session, urlPolicy)
    : null;
  const [access, setAccess] = React.useState<AccessState>("checking");
  const [cards, setCards] = React.useState<AdminGiftCard[]>([]);
  const [detail, setDetail] = React.useState<AdminGiftCardDetail | null>(null);
  const [pending, setPending] = React.useState<PendingGiftCard | null>(null);
  const [note, setNote] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [message, setMessage] = React.useState("Checking developer access...");
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editNote, setEditNote] = React.useState("");
  const [recoveryComplete, setRecoveryComplete] = React.useState(false);
  const mountedRef = React.useRef(false);
  const generationRef = React.useRef(0);
  const activeContextRef = React.useRef<OperationContext | null>(null);

  const cancelWriter = React.useCallback(() => {
    try {
      void (writer as Partial<NfcUrlWriter>).cancel?.().catch(() => undefined);
    } catch {
      // There is no user-facing action for a best-effort native cancellation.
    }
  }, [writer]);

  React.useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      activeContextRef.current = null;
    };
  }, []);

  React.useLayoutEffect(() => {
    generationRef.current += 1;
    activeContextRef.current = null;
    setCards([]);
    setDetail(null);
    setEditing(false);
    setEditName("");
    setEditNote("");
    setPending(null);
    setNote("");
    setStateFilter("");
    setSearch("");
    setBusy(false);
    setRecoveryComplete(false);
    setAccess("checking");
    setMessage("Checking developer access...");
  }, [contextKey]);

  const isCurrentContext = React.useCallback((context: OperationContext) => (
    mountedRef.current
    && generationRef.current === context.generation
    && activeContextRef.current === context
  ), []);

  const loadCards = React.useCallback(async (
    context: OperationContext,
    filters?: { state?: AdminGiftCard["state"]; search?: string },
  ): Promise<boolean> => {
    if (!isCurrentContext(context)) return false;
    try {
      const nextCards = await client.listAdminGiftCards(context.accessToken, filters);
      if (!isCurrentContext(context)) return false;
      setCards(nextCards);
      setAccess("ready");
      setMessage("Developer access confirmed. Prepare blank cards, then initialize each card with a unique gift URL.");
      return true;
    } catch (error) {
      if (!isCurrentContext(context)) return false;
      setCards([]);
      setDetail(null);
      if (error instanceof BackendApiError && (error.status === 401 || error.status === 403)) {
        setAccess("noAccess");
        setMessage("This email does not have developer NFC access.");
      } else {
        setAccess("checking");
        setMessage("Unable to read card inventory. Check the network and retry.");
      }
      return false;
    }
  }, [client, isCurrentContext]);

  const recoverPending = React.useCallback(async (
    context: OperationContext,
  ): Promise<boolean> => {
    const failTransientRecovery = () => {
      setCards([]);
      setDetail(null);
      setPending(null);
      setRecoveryComplete(false);
      setAccess("checking");
      setMessage("Unable to confirm the saved NFC reservation. Check the network and retry.");
      return false;
    };
    const clearRecoveredReservation = async (saved: PendingGiftCard) => {
      try {
        const cleared = await clearPendingGiftCard(
          context.ownerUserId,
          saved.operationId,
        );
        if (!isCurrentContext(context)) return false;
        if (!cleared) return failTransientRecovery();
        setPending(null);
        return true;
      } catch {
        if (!isCurrentContext(context)) return false;
        return failTransientRecovery();
      }
    };
    const clearUnsafeRecoveredReservation = async (saved: PendingGiftCard) => {
      if (!await clearRecoveredReservation(saved) || !isCurrentContext(context)) return false;
      setMessage("The saved NFC reservation is too close to expiry. Start a new reservation.");
      return true;
    };
    const preserveExpiredWrittenReservation = (saved: PendingGiftCard) => {
      setPending(saved);
      setRecoveryComplete(false);
      setMessage("This NFC card was written, but its reservation expired before activation. Do not rewrite it; contact support.");
      return false;
    };

    if (!isCurrentContext(context)) return false;
    const saved = await loadPendingGiftCard(context.ownerUserId);
    if (!isCurrentContext(context)) return false;
    if (!saved) return true;
    try {
      context.urlPolicy.validateGiftUrl(saved.giftUrl);
    } catch (error) {
      if (!isCurrentContext(context)) return false;
      if (!await clearRecoveredReservation(saved) || !isCurrentContext(context)) return false;
      setMessage(policyErrorMessage(error));
      return true;
    }
    if (saved.writeVerified) {
      if (!safeToActivateWrittenCard(saved.expiresAt, now())) {
        return preserveExpiredWrittenReservation(saved);
      }
    } else if (!safeToStartWrite(saved.expiresAt, now())) {
      return clearUnsafeRecoveredReservation(saved);
    }
    try {
      if (!isCurrentContext(context)) return false;
      const current = await client.getAdminGiftCard(context.accessToken, saved.cardId);
      if (!isCurrentContext(context)) return false;
      if (!isConfirmedReservationDetail(current, saved)) {
        return failTransientRecovery();
      }
      if (saved.writeVerified && current.card.state === "retired") {
        return preserveExpiredWrittenReservation(saved);
      }
      if (current.card.state !== "initializing") {
        return clearRecoveredReservation(saved);
      }
      if (saved.writeVerified) {
        if (!safeToActivateWrittenCard(saved.expiresAt, now())) {
          return preserveExpiredWrittenReservation(saved);
        }
      } else if (!safeToStartWrite(saved.expiresAt, now())) {
        return clearUnsafeRecoveredReservation(saved);
      }
      setPending(saved);
      return true;
    } catch (error) {
      if (!isCurrentContext(context)) return false;
      if (error instanceof BackendApiError && (error.status === 401 || error.status === 403)) {
        setCards([]);
        setDetail(null);
        setPending(null);
        setRecoveryComplete(false);
        setAccess("noAccess");
        setMessage("This email does not have developer NFC access.");
        return false;
      }
      if (isMissingReservationError(error)) {
        return clearRecoveredReservation(saved);
      }
      // Retain the owner-scoped record, but never make it physically actionable
      // until the same session confirms the initializing server reservation.
      return failTransientRecovery();
    }
  }, [client, isCurrentContext, now]);

  React.useEffect(() => {
    if (!isAuthReady) return;
    if (!urlPolicy) {
      setAccess("noAccess");
      setMessage(policyErrorMessage(policyResolution.error));
      return;
    }
    if (!currentAccessToken || !currentOwnerUserId || !contextKey) {
      setAccess("signedOut");
      setMessage("Sign in with a developer allow-list email to continue.");
      return;
    }
    const context: OperationContext = {
      accessToken: currentAccessToken,
      contextKey,
      generation: generationRef.current,
      ownerUserId: currentOwnerUserId,
      urlPolicy,
    };
    activeContextRef.current = context;
    void (async () => {
      try {
        if (!await loadCards(context) || !isCurrentContext(context)) return;
        if (!await recoverPending(context) || !isCurrentContext(context)) return;
        setRecoveryComplete(true);
      } catch {
        if (!isCurrentContext(context)) return;
        setMessage("Unable to check the saved NFC reservation. Restart the app before initializing another card.");
      }
    })();
    return () => {
      if (activeContextRef.current === context) activeContextRef.current = null;
      cancelWriter();
    };
  }, [cancelWriter, contextKey, currentAccessToken, currentOwnerUserId, isAuthReady, isCurrentContext, loadCards, policyResolution.error, recoverPending, urlPolicy]);

  const getCurrentContext = () => {
    const context = activeContextRef.current;
    return context
      && contextKey
      && context.contextKey === contextKey
      && isCurrentContext(context)
      && isAuthReady
      && currentAccessToken
      && currentOwnerUserId
      ? context
      : null;
  };

  const getReadyContext = (reservation?: PendingGiftCard | null) => {
    const context = getCurrentContext();
    if (
      !context
      || access !== "ready"
      || !recoveryComplete
      || busy
      || (reservation && (
        reservation.ownerUserId !== context.ownerUserId
        || pending?.operationId !== reservation.operationId
      ))
    ) return null;
    return context;
  };

  const activatePendingForContext = async (
    context: OperationContext,
    reservation: PendingGiftCard,
    manageBusy: boolean,
  ) => {
    if (
      !isCurrentContext(context)
      || reservation.ownerUserId !== context.ownerUserId
      || !reservation.writeVerified
    ) return;
    try {
      if (manageBusy) setBusy(true);
      if (!safeToActivateWrittenCard(reservation.expiresAt, now())) {
        setPending(reservation);
        setRecoveryComplete(false);
        setMessage("This NFC card was written, but its reservation expired before activation. Do not rewrite it; contact support.");
        return;
      }
      if (!isCurrentContext(context)) return;
      await client.activateAdminGiftCard(context.accessToken, reservation.cardId);
      if (!isCurrentContext(context)) return;
      const cleared = await clearPendingGiftCard(
        context.ownerUserId,
        reservation.operationId,
      );
      if (!isCurrentContext(context)) return;
      if (!cleared) {
        setPending(null);
        setRecoveryComplete(false);
        setMessage("Activation succeeded, but the saved NFC reservation changed. Restart the app before handling another card.");
        return;
      }
      setPending(null);
      setNote("");
      if (!await loadCards(context) || !isCurrentContext(context)) return;
      setMessage(`${pendingCardLabel(reservation)} is active and ready for customer claim.`);
    } catch (error) {
      if (!isCurrentContext(context)) return;
      setMessage(`Activation was not confirmed. Retry activation for ${pendingCardLabel(reservation)}; do not write the card again. ${errorMessage(error, "")}`.trim());
    } finally {
      if (manageBusy && isCurrentContext(context)) setBusy(false);
    }
  };

  const writePendingForContext = async (
    context: OperationContext,
    reservation: PendingGiftCard,
    manageBusy: boolean,
  ) => {
    if (
      !isCurrentContext(context)
      || reservation.ownerUserId !== context.ownerUserId
      || reservation.writeVerified
    ) return;
    try {
      if (manageBusy) setBusy(true);
      if (!safeToStartWrite(reservation.expiresAt, now())) {
        const cleared = await clearPendingGiftCard(
          context.ownerUserId,
          reservation.operationId,
        );
        if (!isCurrentContext(context)) return;
        if (!cleared) {
          setPending(null);
          setRecoveryComplete(false);
          setMessage("The saved NFC reservation changed. Restart the app before handling another card.");
          return;
        }
        setPending(null);
        setMessage("The saved NFC reservation is too close to expiry. Start a new reservation.");
        return;
      }
      let giftUrl: string;
      try {
        giftUrl = context.urlPolicy.validateReplacement(
          context.urlPolicy.activationUrl,
          reservation.giftUrl,
        );
      } catch (error) {
        if (!isCurrentContext(context)) return;
        const cleared = await clearPendingGiftCard(
          context.ownerUserId,
          reservation.operationId,
        );
        if (!isCurrentContext(context)) return;
        if (!cleared) {
          setPending(null);
          setRecoveryComplete(false);
          setMessage("The saved NFC reservation changed. Restart the app before handling another card.");
          return;
        }
        setPending(null);
        setMessage(policyErrorMessage(error));
        return;
      }
      if (!isCurrentContext(context)) return;
      await writer.replaceHttpsUrl(context.urlPolicy.activationUrl, giftUrl);
      if (!isCurrentContext(context)) {
        try {
          await markPendingGiftCardWriteVerified(
            context.ownerUserId,
            reservation.operationId,
          );
        } catch {
          // The owner can recover the server-side initializing record after it expires.
        }
        return;
      }
      const verifiedReservation = await markPendingGiftCardWriteVerified(
        context.ownerUserId,
        reservation.operationId,
      );
      if (!isCurrentContext(context)) return;
      if (!verifiedReservation) {
        setPending(null);
        setRecoveryComplete(false);
        setMessage("NFC verification could not be matched to the saved reservation. Restart the app before handling another card.");
        return;
      }
      setPending(verifiedReservation);
      await activatePendingForContext(context, verifiedReservation, false);
    } catch (error) {
      if (!isCurrentContext(context)) return;
      setMessage(`NFC write failed. The initializing record is saved for 15 minutes. ${errorMessage(error, "Keep the card against the top of the phone and retry.")}`.trim());
    } finally {
      if (manageBusy && isCurrentContext(context)) setBusy(false);
    }
  };

  const prepareBlankCard = async () => {
    const context = getReadyContext();
    if (!context) return;
    try {
      setBusy(true);
      if (!isCurrentContext(context)) return;
      await writer.replaceHttpsUrl(null, context.urlPolicy.activationUrl);
      if (!isCurrentContext(context)) return;
      setMessage("Blank card is ready. It now opens the developer activation screen.");
    } catch (error) {
      if (isCurrentContext(context)) {
        setMessage(errorMessage(error, "Unable to prepare this NFC card. Keep it against the top of the phone and retry."));
      }
    } finally {
      if (isCurrentContext(context)) setBusy(false);
    }
  };

  const initializeCard = async () => {
    const context = getReadyContext(pending);
    if (!context || pending) return;
    try {
      setBusy(true);
      if (!isCurrentContext(context)) return;
      const reservation = await client.reserveGiftCard(context.accessToken, note);
      if (!isCurrentContext(context)) return;
      const giftUrl = context.urlPolicy.validateGiftUrl(reservation.giftUrl);
      if (!safeToStartWrite(reservation.expiresAt, now())) {
        setMessage("The new NFC reservation does not leave enough time. Request another reservation.");
        return;
      }
      const validatedReservation: PendingGiftCard = {
        ownerUserId: context.ownerUserId,
        operationId: reservation.cardId,
        revision: 1,
        cardId: reservation.cardId,
        displayNumber: reservation.displayNumber,
        cardCode: reservation.cardCode,
        giftUrl,
        expiresAt: reservation.expiresAt,
      };
      const saved = await savePendingGiftCard(
        context.ownerUserId,
        validatedReservation,
      );
      if (!isCurrentContext(context)) return;
      if (!saved) {
        setPending(null);
        setRecoveryComplete(false);
        setMessage("Another NFC reservation is already saved for this account. Restart the app and recover it before handling another card.");
        return;
      }
      setPending(validatedReservation);
      try {
        if (!isCurrentContext(context)) return;
        const nextCards = await client.listAdminGiftCards(context.accessToken);
        if (!isCurrentContext(context)) return;
        setCards(nextCards);
      } catch {
        if (!isCurrentContext(context)) return;
        // The owner-scoped reservation remains retryable when refresh fails.
      }
      if (!isCurrentContext(context)) return;
      await writePendingForContext(context, validatedReservation, false);
    } catch (error) {
      if (!isCurrentContext(context)) return;
      const detail = error instanceof InternalNfcUrlPolicyError
        ? policyErrorMessage(error)
        : errorMessage(error, "Check the network and retry.");
      setMessage(`Unable to reserve this gift card. ${detail}`.trim());
    } finally {
      if (isCurrentContext(context)) setBusy(false);
    }
  };

  const writePending = async (reservation = pending) => {
    const context = getReadyContext(reservation);
    if (!context || !reservation) return;
    await writePendingForContext(context, reservation, true);
  };

  const activatePending = async (reservation = pending) => {
    const context = getReadyContext(reservation);
    if (!context || !reservation) return;
    await activatePendingForContext(context, reservation, true);
  };

  const showDetail = async (cardId: string) => {
    const context = getReadyContext();
    if (!context) return;
    try {
      setBusy(true);
      if (!isCurrentContext(context)) return;
      const nextDetail = await client.getAdminGiftCard(context.accessToken, cardId);
      if (!isCurrentContext(context)) return;
      setDetail(nextDetail);
      setEditing(false);
      setEditName(nextDetail.card.name || "");
      setEditNote(nextDetail.card.note || "");
    } catch (error) {
      if (isCurrentContext(context)) setMessage(errorMessage(error, "Unable to read card details."));
    } finally {
      if (isCurrentContext(context)) setBusy(false);
    }
  };

  const retire = async (card: AdminGiftCard) => {
    const context = getReadyContext();
    if (!context || !canRetire(card)) return;
    try {
      setBusy(true);
      if (!isCurrentContext(context)) return;
      await client.retireAdminGiftCard(context.accessToken, card.id);
      if (!isCurrentContext(context)) return;
      setDetail(null);
      if (!await loadCards(context) || !isCurrentContext(context)) return;
      setMessage(`${cardLabel(card)} is retired.`);
    } catch (error) {
      if (isCurrentContext(context)) setMessage(errorMessage(error, "Unable to retire this card."));
    } finally {
      if (isCurrentContext(context)) setBusy(false);
    }
  };

  const retryOrFilter = async () => {
    const context = getCurrentContext();
    if (!context || busy) return;
    setBusy(true);
    const validStates: AdminGiftCard["state"][] = ["initializing", "active", "retired"];
    const state = validStates.includes(stateFilter as AdminGiftCard["state"])
      ? stateFilter as AdminGiftCard["state"]
      : undefined;
    const ready = await loadCards(context, {
      state,
      search: search || undefined,
    });
    if (!isCurrentContext(context)) return;
    if (ready && !recoveryComplete) {
      try {
        if (await recoverPending(context) && isCurrentContext(context)) {
          setRecoveryComplete(true);
        }
      } catch {
        if (isCurrentContext(context)) {
          setMessage("Unable to check the saved NFC reservation. Restart the app before initializing another card.");
        }
      }
    }
    if (isCurrentContext(context)) setBusy(false);
  };

  const beginEditing = () => {
    if (!detail) return;
    setEditName(detail.card.name || "");
    setEditNote(detail.card.note || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    if (!detail) return;
    setEditName(detail.card.name || "");
    setEditNote(detail.card.note || "");
    setEditing(false);
  };

  const saveMetadata = async () => {
    const context = getReadyContext();
    if (!context || !detail) return;
    try {
      setBusy(true);
      const cardId = detail.card.id;
      await client.updateAdminGiftCard(context.accessToken, cardId, {
        name: editName.trim() || null,
        note: editNote.trim() || null,
      });
      if (!isCurrentContext(context)) return;
      const [nextCards, nextDetail] = await Promise.all([
        client.listAdminGiftCards(context.accessToken),
        client.getAdminGiftCard(context.accessToken, cardId),
      ]);
      if (!isCurrentContext(context)) return;
      setCards(nextCards);
      setDetail(nextDetail);
      setEditName(nextDetail.card.name || "");
      setEditNote(nextDetail.card.note || "");
      setEditing(false);
      setMessage(`${cardLabel(nextDetail.card)} metadata saved.`);
    } catch (error) {
      if (isCurrentContext(context)) setMessage(errorMessage(error, "Unable to save card metadata."));
    } finally {
      if (isCurrentContext(context)) setBusy(false);
    }
  };

  if (access === "signedOut") return <ScrollView contentContainerStyle={styles.screen}><PaperCard tone="paper" style={styles.card}><ScreenTitle title="Developer NFC Console" caption="DEVELOPER ONLY" /><Text style={styles.message}>{message}</Text><AppButton disabled={busy} label="Sign in" onPress={() => router.push("/login?returnTo=/activate" as never)} /></PaperCard></ScrollView>;

  if (access === "checking" || access === "noAccess") return <ScrollView contentContainerStyle={styles.screen}><PaperCard tone="paper" style={styles.card}><ScreenTitle title="Developer NFC Console" caption="DEVELOPER ONLY" /><Text style={styles.message}>{message}</Text>{access === "checking" ? <AppButton disabled={busy} label="Retry" onPress={() => void retryOrFilter()} /> : null}</PaperCard></ScrollView>;

  return <ScrollView contentContainerStyle={styles.screen} style={{ backgroundColor: colors.background }}>
    <ScreenTitle title="Developer NFC Console" caption="DEVELOPER ONLY" />
    <Text style={styles.message}>{message}</Text>
    <PaperCard tone="paper" style={styles.card}>
      <Text style={styles.heading}>Initialize NFC cards</Text>
      <Text style={styles.hint}>Each action uses one NFC scan. After tapping, hold the card against the top of the phone until verification finishes.</Text>
      <AppButton disabled={busy || !recoveryComplete || Boolean(pending)} label="Prepare blank card" onPress={() => void prepareBlankCard()} />
      <TextInput accessibilityLabel="Card note" maxLength={240} onChangeText={setNote} placeholder="Optional batch, order, or note" style={styles.input} value={note} />
      <AppButton disabled={busy || !recoveryComplete || Boolean(pending)} label="Initialize current blank card" tone="warm" onPress={() => void initializeCard()} />
      {pending && !pending.writeVerified ? <AppButton disabled={busy || !recoveryComplete} label="Retry NFC write" tone="warm" onPress={() => void writePending()} /> : null}
      {pending?.writeVerified ? <AppButton disabled={busy || !recoveryComplete} label="Retry activation" tone="warm" onPress={() => void activatePending()} /> : null}
    </PaperCard>
    <PaperCard style={styles.card}>
      <Text style={styles.heading}>Card inventory</Text>
      <TextInput accessibilityLabel="Card state filter" onChangeText={setStateFilter} placeholder="initializing / active / retired" style={styles.input} value={stateFilter} />
      <TextInput accessibilityLabel="Search cards" onChangeText={setSearch} placeholder="Card number, name, or note" style={styles.input} value={search} />
      <AppButton disabled={busy} label="Filter and refresh" tone="secondary" onPress={() => void retryOrFilter()} />
      {cards.map((card) => <Pressable accessibilityRole="button" key={card.id} onPress={() => void showDetail(card.id)} style={styles.cardRow}><View style={{ flex: 1, gap: 3 }}><Text style={styles.code}>{cardLabel(card)}</Text><Text style={styles.hint}>{card.name || "Unnamed card"}</Text><Text style={styles.hint}>{card.note || "No note"}</Text><Text style={styles.hint}>Status: {card.state}</Text></View><Tag label={card.state} tone={card.state === "active" ? "blue" : "warm"} /></Pressable>)}
    </PaperCard>
    {detail ? <PaperCard tone="paper" style={styles.card}>
      <Text style={styles.heading}>{cardLabel(detail.card)}</Text>
      <Text style={styles.hint}>Status: {detail.card.state}</Text>
      {editing ? <>
        <TextInput accessibilityLabel="Card name" maxLength={80} onChangeText={setEditName} placeholder="Optional card name" style={styles.input} value={editName} />
        <TextInput accessibilityLabel="Card details note" maxLength={240} multiline onChangeText={setEditNote} placeholder="Optional note" style={styles.input} value={editNote} />
        <AppButton disabled={busy} label="Save changes" tone="warm" onPress={() => void saveMetadata()} />
        <AppButton disabled={busy} label="Cancel editing" tone="secondary" onPress={cancelEditing} />
      </> : <>
        <Text style={styles.hint}>Name: {detail.card.name || "Unnamed card"}</Text>
        <Text style={styles.hint}>Note: {detail.card.note || "No note"}</Text>
        <AppButton disabled={busy} label="Edit name and note" tone="secondary" onPress={beginEditing} />
      </>}
      <Text style={styles.hint}>Events: {detail.events.map((event) => event.kind).join(", ") || "none"}</Text>
      {canRetire(detail.card) ? <AppButton disabled={busy} label="Retire unclaimed card" tone="danger" onPress={() => void retire(detail.card)} /> : null}
    </PaperCard> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { gap: 14, padding: 20 }, card: { gap: 12 }, message: { color: colors.muted, lineHeight: 22 }, heading: { color: colors.ink, fontSize: 18, fontWeight: "800" }, hint: { color: colors.muted, fontSize: 13, lineHeight: 19 }, input: { borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, padding: 10 }, cardRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 12, paddingVertical: 12 }, code: { color: colors.ink, fontWeight: "800" },
});
