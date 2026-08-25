import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import type { ArcProfile } from './engine/types.ts';
import { createEmptyLiveSession } from './engine/types.ts';
import { getFirstStage } from './engine/arcEngine.ts';
import { DEFAULT_PRESENCE_THRESHOLD, DEFAULT_INTENSITY_THRESHOLDS } from './engine/thresholds.ts';

const placeholderProfile: ArcProfile = {
  goal: '',
  interferingState: '',
  supportiveState: '',
  arcType: 'identity',
  actions: {
    internalAction: '',
    beneficialAction: '',
  },
  regulationTool: '',
  presenceThreshold: DEFAULT_PRESENCE_THRESHOLD,
  intensityThresholds: DEFAULT_INTENSITY_THRESHOLDS,
};

const firstStage = getFirstStage(createEmptyLiveSession(), placeholderProfile);

export default function App() {
  return (
    <View style={styles.container}>
      <Text>ARC Engine wired up. First LIVE stage: {firstStage}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
