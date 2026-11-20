/**
 * live/components/BodyOutlineBackdrop.tsx
 *
 * Final ARC Body Redesign & Flow Fixes task, requirement 2 ("beautiful,
 * polished, gender-neutral human silhouette... smooth connected shapes
 * instead of disconnected ellipses... elegant light-blue outlines and
 * subtle depth/shading"): the one continuous decorative body figure
 * (head/neck/torso/arms/legs), drawn BEHIND every interactive or
 * animated region shape -- in live/components/BodySilhouetteMap.tsx's
 * own selection screens AND inside live/components/ArcBodyMantraCircle.tsx's
 * animated circle, so the trainee sees the SAME smooth, connected body
 * everywhere, with the colored region highlights reading as "a part of
 * this one body," never as a scatter of floating shapes on their own.
 *
 * Purely presentational: it owns no selection state, no session data,
 * no region identifiers of its own -- every shape it draws comes
 * straight from arc/bodySilhouetteLayout.ts's own BODY_OUTLINE_PARTS,
 * which is itself built to line up with that file's existing
 * BODY_SCAN_REGION_SHAPES (never the reverse). A plain, abstract,
 * gender-neutral figure -- no gendered proportions or secondary
 * characteristics are drawn at all.
 *
 * `strokeLinejoin="round"` + `strokeLinecap="round"` on every shape is
 * doing real visual work here: it is what turns a handful of plain,
 * straight-edged polygons (the only kind of shape this environment can
 * author with real confidence, with no device/emulator to visually
 * iterate a hand-authored curve against) into a silhouette that reads
 * as soft and connected rather than angular.
 */

import { Defs, Ellipse, LinearGradient, Polygon, Stop } from "react-native-svg";

import { BODY_OUTLINE_PARTS } from "../../arc/bodySilhouetteLayout.ts";

/** Soft light-blue gradient (subtle depth/shading) + a slightly deeper light-blue outline -- the app's own existing light-blue chip/accent language (#0a7ea4), never a new, competing palette. */
const OUTLINE_GRADIENT_TOP = "#F4FAFE";
const OUTLINE_GRADIENT_BOTTOM = "#DCEEFA";
const OUTLINE_STROKE = "#6FB8E0";
const GRADIENT_ID = "bodyOutlineGradient";

export interface BodyOutlineBackdropProps {
  /** A stable, unique id suffix so multiple instances (e.g. this component rendered more than once on the same screen) never collide on the same SVG `<Defs>` gradient id. */
  instanceKey?: string;
}

export default function BodyOutlineBackdrop({ instanceKey = "default" }: BodyOutlineBackdropProps) {
  const gradientId = `${GRADIENT_ID}-${instanceKey}`;
  return (
    <>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={OUTLINE_GRADIENT_TOP} stopOpacity={1} />
          <Stop offset="1" stopColor={OUTLINE_GRADIENT_BOTTOM} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      {BODY_OUTLINE_PARTS.map((part) =>
        part.kind === "ellipse" ? (
          <Ellipse
            key={part.id}
            cx={part.cx}
            cy={part.cy}
            rx={part.rx}
            ry={part.ry}
            fill={`url(#${gradientId})`}
            stroke={OUTLINE_STROKE}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ) : (
          <Polygon
            key={part.id}
            points={part.points}
            fill={`url(#${gradientId})`}
            stroke={OUTLINE_STROKE}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      )}
    </>
  );
}
