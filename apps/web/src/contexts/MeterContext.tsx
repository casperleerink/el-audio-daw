import { createContext, useContext, type ReactNode } from "react";
import type { MeterValue } from "@el-audio-daw/audio";

interface MeterContextValue {
  subscribe: (source: string, callback: (value: MeterValue) => void) => () => void;
}

const MeterContext = createContext<MeterContextValue | null>(null);

interface MeterProviderProps {
  children: ReactNode;
  subscribe: (source: string, callback: (value: MeterValue) => void) => () => void;
}

export function MeterProvider({ children, subscribe }: MeterProviderProps) {
  return <MeterContext.Provider value={{ subscribe }}>{children}</MeterContext.Provider>;
}

export function useMeterSubscription(): MeterContextValue {
  const context = useContext(MeterContext);
  if (!context) {
    throw new Error("useMeterSubscription must be used within MeterProvider");
  }
  return context;
}
