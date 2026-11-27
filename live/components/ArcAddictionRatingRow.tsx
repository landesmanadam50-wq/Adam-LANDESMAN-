import { Pressable, Text, View } from "react-native";
import { ADDICTION_RATING_VALUES } from "../../arc/arcAddiction.ts";
import { arcAddictionStyles as styles } from "./arcAddictionStyles.ts";

export interface ArcAddictionRatingRowProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Accessibility label prefix, e.g. "עוצמת הדחף". */
  label: string;
  /** Tapping the selected value again clears it (ratings are always optional unless the caller gates on them). */
  allowClear?: boolean;
}

/** 0..10 chip row – same chip pattern as live/SupportiveActionFlowScreen.tsx's RATING_VALUES row. */
export default function ArcAddictionRatingRow({ value, onChange, label, allowClear = true }: ArcAddictionRatingRowProps) {
  return (
    <View style={[styles.row, { justifyContent: "center" }]}>
      {ADDICTION_RATING_VALUES.map((rating) => {
        const selected = value === rating;
        return (
          <Pressable
            key={rating}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${rating}`}
            accessibilityState={{ selected }}
            style={[styles.chip, { minWidth: 40, alignItems: "center" }, selected && styles.chipSelected]}
            onPress={() => onChange(selected && allowClear ? null : rating)}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{rating}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
