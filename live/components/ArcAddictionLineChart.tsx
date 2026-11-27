/**
 * live/components/ArcAddictionLineChart.tsx
 *
 * A small, dependency-free line/bar chart on react-native-svg (already a
 * project dependency, used by the body maps) for the ARC Addiction
 * progress screen. Coordinates come from arc/arcAddictionStats.ts's pure
 * projectChartPoints, so the math is unit-tested.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";

import type { ChartPoint } from "../../arc/arcAddictionStats.ts";
import { projectChartPoints } from "../../arc/arcAddictionStats.ts";
import { ARC_ADDICTION_COLORS, arcAddictionStyles as styles } from "./arcAddictionStyles.ts";

const HEIGHT = 120;
const PAD = 10;

export interface ArcAddictionLineChartProps {
  title: string;
  points: readonly ChartPoint[];
  unit: string;
  /** e.g. 10 for 0..10 ratings; omitted => auto */
  max?: number;
  kind?: "line" | "bar";
  color?: string;
  footer?: string;
}

export default function ArcAddictionLineChart({ title, points, unit, max, kind = "line", color = ARC_ADDICTION_COLORS.primary, footer }: ArcAddictionLineChartProps) {
  const [width, setWidth] = useState(0);
  const projected = projectChartPoints(points, max);
  const innerW = Math.max(0, width - PAD * 2);
  const innerH = HEIGHT - PAD * 2;
  // RTL screen, but time still flows left → right like every chart reader expects.
  const toXY = (point: { x: number; y: number }) => ({ x: PAD + point.x * innerW, y: PAD + (1 - point.y) * innerH });
  const last = points.length > 0 ? points[points.length - 1].value : null;
  const shownMax = max ?? (points.length > 0 ? Math.max(1, ...points.map((p) => p.value)) : null);

  return (
    <View style={styles.card} accessibilityLabel={`${title}: ${points.length} נקודות${last !== null ? `, אחרון ${last} ${unit}` : ""}`}>
      <Text style={styles.cardTitle}>{title}</Text>
      {points.length === 0 ? (
        <Text style={styles.muted}>עדיין אין נתונים.</Text>
      ) : (
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {width > 0 && (
            <Svg width={width} height={HEIGHT}>
              <Line x1={PAD} y1={HEIGHT - PAD} x2={width - PAD} y2={HEIGHT - PAD} stroke="#ddd" strokeWidth={1} />
              <Line x1={PAD} y1={PAD} x2={width - PAD} y2={PAD} stroke="#f0f0f0" strokeWidth={1} />
              {kind === "bar"
                ? projected.map((point, index) => {
                    const barW = Math.max(4, innerW / Math.max(projected.length, 1) - 4);
                    const { x, y } = toXY(point);
                    const left = projected.length === 1 ? x - barW / 2 : PAD + (index * innerW) / projected.length + 2;
                    return <Rect key={index} x={left} y={y} width={barW} height={HEIGHT - PAD - y} fill={color} opacity={0.8} rx={2} />;
                  })
                : [
                    projected.length > 1 && (
                      <Polyline key="line" points={projected.map((point) => { const { x, y } = toXY(point); return `${x},${y}`; }).join(" ")} fill="none" stroke={color} strokeWidth={2} />
                    ),
                    ...projected.map((point, index) => {
                      const { x, y } = toXY(point);
                      return <Circle key={`p${index}`} cx={x} cy={y} r={3} fill={color} />;
                    }),
                  ]}
            </Svg>
          )}
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Text style={styles.muted}>{last !== null ? `אחרון: ${last} ${unit}` : ""}</Text>
            <Text style={styles.muted}>{shownMax !== null ? `מקסימום בגרף: ${shownMax} ${unit}` : ""}</Text>
          </View>
        </View>
      )}
      {footer && <Text style={styles.muted}>{footer}</Text>}
    </View>
  );
}
