import * as React from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle, Tag } from "../../components/ui";
import { BackendApiClient, BackendApiError, type AdminGiftCard, type AdminGiftCardDetail } from "../../services/backend/api-client";
import { clearPendingGiftCard, loadPendingGiftCard, savePendingGiftCard, type PendingGiftCard } from "../../services/gifts/gift-card-pending";
import { createNfcUrlWriter, type NfcUrlWriter } from "../../services/nfc/nfc-url-writer";
import { useAuth } from "../auth/auth-provider";

const activationUrl = "https://onetapreality.com/activate";
type ConsoleClient = Pick<BackendApiClient, "listAdminGiftCards" | "getAdminGiftCard" | "reserveGiftCard" | "activateAdminGiftCard" | "retireAdminGiftCard">;
type AccountSession = { accessToken: string };
type AccessState = "checking" | "signedOut" | "noAccess" | "ready";

function canRetire(card: AdminGiftCard) {
  return card.state === "active" && card.giftStatus === "unclaimed";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
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

export function DeveloperNfcConsole({ client: injectedClient, writer: injectedWriter }: { client?: ConsoleClient; writer?: NfcUrlWriter }) {
  const router = useRouter();
  const { isAuthReady, session } = useAuth();
  const client = React.useMemo(() => injectedClient ?? new BackendApiClient(), [injectedClient]);
  const writer = React.useMemo(() => injectedWriter ?? createNfcUrlWriter(), [injectedWriter]);
  const [access, setAccess] = React.useState<AccessState>("checking");
  const [cards, setCards] = React.useState<AdminGiftCard[]>([]);
  const [detail, setDetail] = React.useState<AdminGiftCardDetail | null>(null);
  const [pending, setPending] = React.useState<PendingGiftCard | null>(null);
  const [note, setNote] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [message, setMessage] = React.useState("Checking developer access...");
  const [busy, setBusy] = React.useState(false);

  const loadCards = React.useCallback(async (activeSession: AccountSession, filters?: { state?: AdminGiftCard["state"]; code?: string; note?: string }) => {
    try {
      setCards(await client.listAdminGiftCards(activeSession.accessToken, filters));
      setAccess("ready");
      setMessage("Developer access confirmed. Prepare blank cards, then initialize each card with a unique gift URL.");
    } catch (error) {
      setCards([]);
      setDetail(null);
      if (error instanceof BackendApiError && (error.status === 401 || error.status === 403)) {
        setAccess("noAccess");
        setMessage("This email does not have developer NFC access.");
      } else {
        setAccess("checking");
        setMessage("Unable to read card inventory. Check the network and retry.");
      }
    }
  }, [client]);

  const recoverPending = React.useCallback(async (activeSession: AccountSession) => {
    const saved = await loadPendingGiftCard();
    if (!saved) return;
    try {
      const current = await client.getAdminGiftCard(activeSession.accessToken, saved.cardId);
      if (current.card.state !== "initializing") {
        await clearPendingGiftCard();
        return;
      }
      setPending(saved);
    } catch {
      // Keep the local reservation so a transient network failure never creates another card.
      setPending(saved);
    }
  }, [client]);

  React.useEffect(() => {
    if (!isAuthReady) return;
    if (!session) {
      setAccess("signedOut");
      setMessage("Sign in with a developer allow-list email to continue.");
      return;
    }
    void loadCards(session);
    void recoverPending(session);
  }, [isAuthReady, loadCards, recoverPending, session]);

  const prepareBlankCard = async () => {
    try {
      setBusy(true);
      await writer.replaceHttpsUrl(null, activationUrl);
      setMessage("Blank card is ready. It now opens the developer activation screen.");
    } catch (error) { setMessage(errorMessage(error, "Unable to prepare this NFC card. Keep it against the top of the phone and retry.")); }
    finally { setBusy(false); }
  };

  const initializeCard = async () => {
    if (!session || pending) return;
    try {
      setBusy(true);
      const reservation = await client.reserveGiftCard(session.accessToken, note);
      await savePendingGiftCard(reservation);
      setPending(reservation);
      try {
        setCards(await client.listAdminGiftCards(session.accessToken));
      } catch {
        // The saved reservation remains retryable even if the inventory refresh fails.
      }
      await writePending(reservation);
    } catch (error) {
      setMessage(`Unable to reserve this gift card. ${errorMessage(error, "Check the network and retry.")}`.trim());
    } finally { setBusy(false); }
  };

  const writePending = async (reservation = pending) => {
    if (!session || !reservation || reservation.writeVerified) return;
    try {
      setBusy(true);
      await writer.replaceHttpsUrl(activationUrl, reservation.giftUrl);
      const verifiedReservation = { ...reservation, writeVerified: true };
      await savePendingGiftCard(verifiedReservation);
      setPending(verifiedReservation);
      await activatePending(verifiedReservation);
    } catch (error) {
      setMessage(`NFC write failed. The initializing record is saved for 15 minutes. ${errorMessage(error, "Keep the card against the top of the phone and retry.")}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const activatePending = async (reservation = pending) => {
    if (!session || !reservation?.writeVerified) return;
    try {
      setBusy(true);
      await client.activateAdminGiftCard(session.accessToken, reservation.cardId);
      await clearPendingGiftCard();
      setPending(null);
      setNote("");
      await loadCards(session);
      setMessage(`Card ${reservation.cardCode} is active and ready for customer claim.`);
    } catch (error) {
      setMessage(`Activation was not confirmed. Retry activation for ${reservation.cardCode}; do not write the card again. ${errorMessage(error, "")}`.trim());
    } finally { setBusy(false); }
  };

  const showDetail = async (cardId: string) => {
    if (!session) return;
    try { setBusy(true); setDetail(await client.getAdminGiftCard(session.accessToken, cardId)); }
    catch (error) { setMessage(errorMessage(error, "Unable to read card details.")); }
    finally { setBusy(false); }
  };

  const retire = async (card: AdminGiftCard) => {
    if (!session || !canRetire(card)) return;
    try {
      setBusy(true);
      await client.retireAdminGiftCard(session.accessToken, card.id);
      setDetail(null);
      await loadCards(session);
      setMessage(`Card ${card.code} is retired.`);
    } catch (error) { setMessage(errorMessage(error, "Unable to retire this card.")); }
    finally { setBusy(false); }
  };

  const retryOrFilter = async () => {
    if (!session) return;
    setBusy(true);
    const validStates: AdminGiftCard["state"][] = ["initializing", "active", "retired"];
    const state = validStates.includes(stateFilter as AdminGiftCard["state"]) ? stateFilter as AdminGiftCard["state"] : undefined;
    await loadCards(session, { state, code: search || undefined, note: search || undefined });
    setBusy(false);
  };

  if (access === "signedOut") return <ScrollView contentContainerStyle={styles.screen}><PaperCard tone="paper" style={styles.card}><ScreenTitle title="Developer NFC Console" caption="DEVELOPER ONLY" /><Text style={styles.message}>{message}</Text><AppButton disabled={busy} label="Sign in" onPress={() => router.push("/login?returnTo=/activate" as never)} /></PaperCard></ScrollView>;

  if (access === "checking" || access === "noAccess") return <ScrollView contentContainerStyle={styles.screen}><PaperCard tone="paper" style={styles.card}><ScreenTitle title="Developer NFC Console" caption="DEVELOPER ONLY" /><Text style={styles.message}>{message}</Text>{access === "checking" ? <AppButton disabled={busy} label="Retry" onPress={() => void retryOrFilter()} /> : null}</PaperCard></ScrollView>;

  return <ScrollView contentContainerStyle={styles.screen} style={{ backgroundColor: colors.background }}>
    <ScreenTitle title="Developer NFC Console" caption="DEVELOPER ONLY" />
    <Text style={styles.message}>{message}</Text>
    <PaperCard tone="paper" style={styles.card}>
      <Text style={styles.heading}>Initialize NFC cards</Text>
      <Text style={styles.hint}>Each action uses one NFC scan. After tapping, hold the card against the top of the phone until verification finishes.</Text>
      <AppButton disabled={busy || Boolean(pending)} label="Prepare blank card" onPress={() => void prepareBlankCard()} />
      <TextInput accessibilityLabel="Card note" onChangeText={setNote} placeholder="Optional batch, order, or note" style={styles.input} value={note} />
      <AppButton disabled={busy || Boolean(pending)} label="Initialize current blank card" tone="warm" onPress={() => void initializeCard()} />
      {pending && !pending.writeVerified ? <AppButton disabled={busy} label="Retry NFC write" tone="warm" onPress={() => void writePending()} /> : null}
      {pending?.writeVerified ? <AppButton disabled={busy} label="Retry activation" tone="warm" onPress={() => void activatePending()} /> : null}
    </PaperCard>
    <PaperCard style={styles.card}>
      <Text style={styles.heading}>Card inventory</Text>
      <TextInput accessibilityLabel="Card state filter" onChangeText={setStateFilter} placeholder="initializing / active / retired" style={styles.input} value={stateFilter} />
      <TextInput accessibilityLabel="Search cards" onChangeText={setSearch} placeholder="Card code or note" style={styles.input} value={search} />
      <AppButton disabled={busy} label="Filter and refresh" tone="secondary" onPress={() => void retryOrFilter()} />
      {cards.map((card) => <Pressable accessibilityRole="button" key={card.id} onPress={() => void showDetail(card.id)} style={styles.cardRow}><View style={{ flex: 1, gap: 3 }}><Text style={styles.code}>{card.code}</Text><Text style={styles.hint}>{card.note || "No note"}</Text><Text style={styles.hint}>Gift: {card.giftStatus || "unlinked"}</Text></View><Tag label={card.state} tone={card.state === "active" ? "blue" : "warm"} /></Pressable>)}
    </PaperCard>
    {detail ? <PaperCard tone="paper" style={styles.card}><Text style={styles.heading}>Card details: {detail.card.code}</Text><Text style={styles.hint}>State: {detail.card.state}; gift: {detail.card.giftStatus || "none"}</Text><Text style={styles.hint}>Events: {detail.events.map((event) => event.kind).join(", ") || "none"}</Text>{canRetire(detail.card) ? <AppButton disabled={busy} label="Retire unclaimed card" tone="danger" onPress={() => void retire(detail.card)} /> : null}</PaperCard> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { gap: 14, padding: 20 }, card: { gap: 12 }, message: { color: colors.muted, lineHeight: 22 }, heading: { color: colors.ink, fontSize: 18, fontWeight: "800" }, hint: { color: colors.muted, fontSize: 13, lineHeight: 19 }, input: { borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, padding: 10 }, cardRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 12, paddingVertical: 12 }, code: { color: colors.ink, fontWeight: "800" },
});
