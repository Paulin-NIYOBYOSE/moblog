"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "./ThemeContext";
import SegmentedControl from "./ui/SegmentedControl";

const OPTIONS: { value: ThemeMode; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <SegmentedControl
      options={OPTIONS}
      value={mode}
      onChange={setMode}
      showLabels={false}
    />
  );
}
