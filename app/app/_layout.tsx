import { Stack } from "expo-router";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";

// Proporção de celular (iPhone 14/15: 390 x 844, ~9:19,5)
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const PAGE_BG = "#000000";

export default function RootLayout() {
  const { width, height } = useWindowDimensions();

  const app = <Stack screenOptions={{ headerShown: false }} />;

  // No celular de verdade (ou em janela estreita) o app ocupa a tela toda.
  // No navegador do PC, ele aparece dentro de uma "moldura" no formato de celular.
  const isDesktopWeb = Platform.OS === "web" && width > PHONE_WIDTH + 40;
  if (!isDesktopWeb) return app;

  const frameHeight = Math.min(PHONE_HEIGHT, height - 32);
  const frameWidth = Math.min(PHONE_WIDTH, Math.round(frameHeight * (PHONE_WIDTH / PHONE_HEIGHT)));

  return (
    <View style={styles.page}>
      <View style={[styles.phone, { width: frameWidth, height: frameHeight }]}>{app}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PAGE_BG,
  },
  phone: {
    // "overflow: hidden" + borderRadius força o navegador a recortar a cada quadro do scroll.
    // "contain" + camada própria de GPU mantém o recorte, mas deixa o scroll fluido.
    overflow: "hidden",
    borderRadius: 36,
    ...(Platform.OS === "web"
      ? ({ contain: "layout paint", willChange: "transform", transform: "translateZ(0)" } as any)
      : {}),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "#0A0A0A",
  },
});
