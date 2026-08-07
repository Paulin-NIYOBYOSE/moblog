"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

export default function SparklineCell({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const points = data.map((value, i) => ({ i, value }));
  return (
    <div className="mt-2 h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={color}
            fillOpacity={0.12}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
