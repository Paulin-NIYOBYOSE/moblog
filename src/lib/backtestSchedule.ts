// Customizable backtesting schedule for the Daily Plan in Notebook.
// Stores user's preferred times, sessions, and pair assignments for backtesting.

import { V2_INSTRUMENTS } from "./backtestV2";

export interface BacktestSession {
  id: string;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  pairs: string[]; // Instrument names to backtest in this session
}

export interface DaySchedule {
  sessions: BacktestSession[];
}

export interface BacktestScheduleConfig {
  weekday: DaySchedule;
  weekend: DaySchedule;
  pairsPerDay: number; // How many pair-years to complete per day
  lastUpdated: string;
}

// Default schedule configuration matching the original hardcoded values
export function getDefaultSchedule(): BacktestScheduleConfig {
  return {
    weekday: {
      sessions: [
        {
          id: "weekday-morning",
          startTime: "07:00",
          endTime: "09:00",
          pairs: [], // Will be assigned dynamically
        },
        {
          id: "weekday-evening",
          startTime: "19:00",
          endTime: "21:00",
          pairs: [], // Will be assigned dynamically
        },
      ],
    },
    weekend: {
      sessions: [
        {
          id: "weekend-morning",
          startTime: "09:00",
          endTime: "11:00",
          pairs: [], // Will be assigned dynamically
        },
        {
          id: "weekend-afternoon",
          startTime: "14:00",
          endTime: "16:00",
          pairs: [], // Will be assigned dynamically
        },
      ],
    },
    pairsPerDay: 2,
    lastUpdated: new Date().toISOString(),
  };
}

// Calculate how many days needed to complete all pairs at current rate
export function calculateCompletionDays(pairsPerDay: number): number {
  const totalPairs = V2_INSTRUMENTS.length * 2; // 28 pairs × 2 years = 56
  return Math.ceil(totalPairs / pairsPerDay);
}

// Distribute pairs across sessions (simple round-robin distribution)
export function distributePairsToSessions(
  sessions: BacktestSession[],
  pairsPerDay: number,
): BacktestSession[] {
  if (sessions.length === 0) return sessions;

  const pairsPerSession = Math.ceil(pairsPerDay / sessions.length);
  const allPairs = [...V2_INSTRUMENTS];
  
  return sessions.map((session, index) => {
    const startIdx = index * pairsPerSession;
    const assignedPairs = allPairs.slice(startIdx, startIdx + pairsPerSession);
    return {
      ...session,
      pairs: assignedPairs,
    };
  });
}

// Get a suggested pair assignment based on pairs per day
export function getSuggestedPairDistribution(
  pairsPerDay: number,
  sessionCount: number,
): string[][] {
  if (sessionCount === 0) return [];
  
  const pairsPerSession = Math.ceil(pairsPerDay / sessionCount);
  const allPairs = [...V2_INSTRUMENTS];
  const result: string[][] = [];
  
  for (let i = 0; i < sessionCount; i++) {
    const startIdx = i * pairsPerSession;
    const sessionPairs = allPairs.slice(startIdx, startIdx + pairsPerSession);
    result.push(sessionPairs);
  }
  
  return result;
}

// Validate schedule configuration
export function validateSchedule(config: BacktestScheduleConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate pairs per day
  if (config.pairsPerDay < 1) {
    errors.push("Pairs per day must be at least 1");
  }

  // Validate weekday sessions
  if (config.weekday.sessions.length === 0) {
    errors.push("Weekday must have at least one session");
  }

  // Validate weekend sessions
  if (config.weekend.sessions.length === 0) {
    errors.push("Weekend must have at least one session");
  }

  // Validate time formats and ranges
  const validateSession = (session: BacktestSession, day: string) => {
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    
    if (!timeRegex.test(session.startTime)) {
      errors.push(`${day} session has invalid start time format`);
    }
    
    if (!timeRegex.test(session.endTime)) {
      errors.push(`${day} session has invalid end time format`);
    }
    
    if (session.startTime >= session.endTime) {
      errors.push(`${day} session end time must be after start time`);
    }
  };

  config.weekday.sessions.forEach((s) => validateSession(s, "Weekday"));
  config.weekend.sessions.forEach((s) => validateSession(s, "Weekend"));

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Generate a unique session ID
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
