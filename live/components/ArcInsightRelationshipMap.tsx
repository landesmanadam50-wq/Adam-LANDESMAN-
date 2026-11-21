import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import type { ArcInsight } from "../../arc/arcInsightBelief.ts";
import type { ArcInsightRelationship, ArcInsightRelationshipType } from "../../arc/arcWriting.ts";

/**
 * live/components/ArcInsightRelationshipMap.tsx
 *
 * ARC Writing & ARC Book task, spec section 4 ("מפת תובנות/קשרים"): a
 * node for every insight, a line for every relationship touching two or
 * more of them. Tapping a node shows its content; tapping a line shows
 * its type/explanation with an option to remove it. No graph library
 * exists anywhere in this codebase (confirmed) -- this is a small,
 * from-scratch layout using only react-native-svg (already installed)
 * for the edges and plain absolute-positioned Views for the nodes.
 *
 * ALWAYS paired with a plain list-view toggle by the caller
 * (ArcRelationshipPicker) -- spec section 4's own "חובה לאפשר גם תצוגת
 * רשימה פשוטה" -- this component is never the only way to see
 * relationships.
 */

const RELATIONSHIP_TYPE_LABELS: Record<ArcInsightRelationshipType, string> = {
  cause_effect: "סיבה ותוצאה",
  complement: "השלמה",
  similarity: "דמיון",
  contrast: "ניגוד",
  other: "אחר",
};

const CANVAS_SIZE = 280;
const NODE_RADIUS = 28;
const CENTER = CANVAS_SIZE / 2;
const LAYOUT_RADIUS = CENTER - NODE_RADIUS - 10;

function resolveNodePosition(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: CENTER, y: CENTER };
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return { x: CENTER + LAYOUT_RADIUS * Math.cos(angle), y: CENTER + LAYOUT_RADIUS * Math.sin(angle) };
}

export default function ArcInsightRelationshipMap({
  insights,
  relationships,
  onRemoveRelationship,
}: {
  insights: ArcInsight[];
  relationships: ArcInsightRelationship[];
  onRemoveRelationship: (relationshipId: string) => void;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const positions = new Map(insights.map((insight, index) => [insight.id, resolveNodePosition(index, insights.length)]));

  function showInsight(insight: ArcInsight) {
    Alert.alert("תובנה", insight.text);
  }

  function showRelationship(relationship: ArcInsightRelationship) {
    Alert.alert(RELATIONSHIP_TYPE_LABELS[relationship.relationshipType], relationship.explanation || "אין הסבר נוסף.", [
      { text: "סגור", style: "cancel" },
      { text: "הסר קשר", style: "destructive", onPress: () => onRemoveRelationship(relationship.id) },
    ]);
  }

  const edges: { relationship: ArcInsightRelationship; from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  for (const relationship of relationships) {
    const ids = relationship.insightIds.filter((id) => positions.has(id));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const from = positions.get(ids[i]);
        const to = positions.get(ids[j]);
        if (from && to) edges.push({ relationship, from, to });
      }
    }
  }

  return (
    <View style={styles.canvas}>
      <Svg width={CANVAS_SIZE} height={CANVAS_SIZE} style={StyleSheet.absoluteFill}>
        {edges.map((edge, index) => (
          <Line
            key={`${edge.relationship.id}-${index}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={highlighted === edge.relationship.id ? "#2E7D32" : "#999"}
            strokeWidth={highlighted === edge.relationship.id ? 3 : 2}
          />
        ))}
      </Svg>
      {/* Invisible, evenly-spaced tap targets along each edge's midpoint -- SVG Line itself has no onPress. */}
      {edges.map((edge, index) => {
        const midX = (edge.from.x + edge.to.x) / 2;
        const midY = (edge.from.y + edge.to.y) / 2;
        return (
          <Pressable
            key={`tap-${edge.relationship.id}-${index}`}
            style={[styles.edgeTapTarget, { left: midX - 16, top: midY - 16 }]}
            onPressIn={() => setHighlighted(edge.relationship.id)}
            onPress={() => showRelationship(edge.relationship)}
          />
        );
      })}
      {insights.map((insight) => {
        const position = positions.get(insight.id);
        if (!position) return null;
        return (
          <Pressable
            key={insight.id}
            style={[styles.node, { left: position.x - NODE_RADIUS, top: position.y - NODE_RADIUS }]}
            onPress={() => showInsight(insight)}
          >
            <Text style={styles.nodeText} numberOfLines={3}>
              {insight.text.slice(0, 24)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE, alignSelf: "center", marginVertical: 12 },
  node: {
    position: "absolute",
    width: NODE_RADIUS * 2,
    height: NODE_RADIUS * 2,
    borderRadius: NODE_RADIUS,
    backgroundColor: "#eef7f0",
    borderWidth: 1,
    borderColor: "#2E7D32",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  nodeText: { fontSize: 9, textAlign: "center", color: "#1b5e20" },
  edgeTapTarget: { position: "absolute", width: 32, height: 32 },
});
