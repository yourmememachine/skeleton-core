// Logger: tiny structured JSON logger behind an interface apps can swap.
// Emitting a line must never throw into the caller: meta that cannot be
// serialised (circular, BigInt) degrades to a bare line instead of
// crashing the code that was only trying to log. Reserved fields (ts,
// level, msg) always win over caller meta, so log consumers can trust
// them even when meta contains user-influenced keys.

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const ORDER = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof ORDER;

/** JSON.stringify replacer: Errors and BigInts get readable forms. */
function serialiseValue(_key: string, value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function createLogger(minLevel: Level = "info", sink: (line: string) => void = console.log): Logger {
  if (!(minLevel in ORDER)) {
    throw new Error(`Unknown log level "${minLevel}": expected one of ${Object.keys(ORDER).join(", ")}`);
  }
  const emit = (level: Level) => (msg: string, meta: Record<string, unknown> = {}) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const ts = new Date().toISOString();
    let line: string;
    try {
      line = JSON.stringify({ ...meta, ts, level, msg }, serialiseValue);
    } catch {
      line = JSON.stringify({ ts, level, msg });
    }
    sink(line);
  };
  return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error") };
}
