import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerTitleAlign: "center" }}>
        <Stack.Screen name="index" options={{ title: "ARCHI" }} />
        <Stack.Screen name="build/index" options={{ title: "בניית מטרה" }} />
        <Stack.Screen name="build-arc/index" options={{ title: "בניית מפת ARC" }} />
        <Stack.Screen name="live/index" options={{ title: "ARCHI LIVE" }} />
        <Stack.Screen name="stats/index" options={{ title: "התקדמות שבועית" }} />
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
