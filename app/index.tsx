import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { loadProfile } from "../data/storage.ts";

export default function Home() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadProfile().then((profile) => {
        if (!cancelled) setHasProfile(!!profile);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Archi</Text>

        {hasProfile === false && (
          <Link href="/build" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>הגדר פרופיל</Text>
            </Pressable>
          </Link>
        )}

        {hasProfile === true && (
          <>
            <Link href="/live" asChild>
              <Pressable style={styles.button}>
                <Text style={styles.buttonText}>התחל סשן LIVE</Text>
              </Pressable>
            </Link>
            <Link href="/stats" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>התקדמות שבועית</Text>
              </Pressable>
            </Link>
            <Link href="/build" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>ערוך מטרה (BUILD-GOAL)</Text>
              </Pressable>
            </Link>
            <Link href="/build-arc" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>מפת ARC (BUILD-ARC)</Text>
              </Pressable>
            </Link>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 17,
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
});
