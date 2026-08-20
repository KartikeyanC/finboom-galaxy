import { Sector } from "recharts";

/**
 * Props Recharts passes to a Pie `activeShape` render callback. Recharts types
 * this loosely; we narrow to the fields our donut charts actually read.
 */
export type ActiveShapeProps = {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
};

/**
 * Minimal active-shape for "Model A" donuts: just grows the hovered segment
 * outward a few px (no accent ring / glow) so the slice gently enlarges while
 * keeping the flat, refined look.
 */
export function renderActiveSlice(props: unknown) {
  // Recharts' own `activeShape` prop type is `(props: unknown) => ReactElement`
  // — looser than what it actually passes at runtime, which matches
  // `ActiveShapeProps`. Narrowed here, at the one boundary that needs it,
  // rather than widening the type callers actually work with.
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props as ActiveShapeProps;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 5}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      cornerRadius={2}
    />
  );
}
