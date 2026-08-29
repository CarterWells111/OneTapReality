import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, bodyFont, colors } from "../../components/ui";
import {
  createGiftLinkScanner,
  type GiftLinkScanner,
  type GiftLinkScannerErrorCode,
} from "../../services/nfc/gift-link-scanner";

function errorCode(error: unknown): GiftLinkScannerErrorCode | undefined {
  return error && typeof error === "object" && "code" in error
    ? error.code as GiftLinkScannerErrorCode
    : undefined;
}

function scanErrorMessage(code: GiftLinkScannerErrorCode | undefined): string {
  if (code === "NFC_NATIVE_BUILD_REQUIRED") {
    return "Expo Go 不支持 NFC 扫描，请使用 TestFlight 版，或直接打开礼品链接。";
  }
  if (code === "NFC_UNAVAILABLE") {
    return "此 iPhone 暂时无法使用 NFC 扫描，请改用礼品链接。";
  }
  return "未识别到有效的 OneTapReality 礼品卡，请重试。";
}

export function GiftNfcScanner({ scanner: injectedScanner }: { scanner?: GiftLinkScanner }) {
  const router = useRouter();
  const scanner = React.useMemo(
    () => injectedScanner ?? createGiftLinkScanner(),
    [injectedScanner],
  );
  const mounted = React.useRef(true);
  const [isScanning, setIsScanning] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void scanner.cancel();
    };
  }, [scanner]);

  const startScan = async () => {
    setMessage("");
    setIsScanning(true);
    try {
      const result = await scanner.scan();
      if (mounted.current) router.push(result.pathname as never);
    } catch (error) {
      if (!mounted.current || errorCode(error) === "NFC_SCAN_CANCELLED") return;
      setMessage(scanErrorMessage(errorCode(error)));
    } finally {
      if (mounted.current) setIsScanning(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppButton
        label={isScanning ? "取消扫描" : "扫描礼品"}
        tone="secondary"
        onPress={() => {
          if (isScanning) void scanner.cancel();
          else void startScan();
        }}
      />
      <Text selectable style={styles.hint}>将礼品卡靠近 iPhone 顶部，或直接打开卡片中的礼品链接。</Text>
      {message ? <Text accessibilityLiveRegion="polite" selectable style={styles.error}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 7 },
  error: { color: colors.danger, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.muted, fontFamily: bodyFont, fontSize: 12.5, lineHeight: 19 },
});
