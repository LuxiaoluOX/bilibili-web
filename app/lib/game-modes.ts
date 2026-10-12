export const GAME_MODES = ["unknown", "operations", "warfare", "black_tide"] as const;
export const CODE_GAME_MODES = ["operations", "warfare", "black_tide"] as const;

export type GameMode = (typeof GAME_MODES)[number];
export type CodeGameMode = (typeof CODE_GAME_MODES)[number];

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  unknown: "未识别模式",
  operations: "烽火地带",
  warfare: "全面战场",
  black_tide: "黑潮爆破",
};

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && GAME_MODES.includes(value as GameMode);
}

export function isCodeGameMode(value: unknown): value is CodeGameMode {
  return typeof value === "string" && CODE_GAME_MODES.includes(value as CodeGameMode);
}

const OPERATIONS_MODE_PATTERN = /(?:烽火地带|烽火模式|行动模式|搜打撤|撤离点|绝密(?:局|场|行动)?|机密(?:局|场|行动)?|哈夫币|[1-6]级?(?:甲|弹)|(?:改装费|子弹)(?:价格|成本|便宜)|\d+(?:\.\d+)?万(?:预算|改装|配装|满改|高改)?)/i;

/**
 * The creator's historical catalogue is Operations-first. The two other
 * gunsmith namespaces must be named explicitly so their share codes never get
 * merged into the Operations catalogue by accident.
 */
export function detectGameMode(value: string): GameMode {
  if (/黑潮(?:爆破|模式)?/i.test(value)) return "black_tide";
  if (/(?:全面战场|大战场)/i.test(value)) return "warfare";
  if (OPERATIONS_MODE_PATTERN.test(value)) return "operations";
  return "operations";
}

export const GAME_MODE_OPTIONS = GAME_MODES.map((value) => ({
  value,
  label: GAME_MODE_LABELS[value],
}));

export const CODE_GAME_MODE_OPTIONS = CODE_GAME_MODES.map((value) => ({
  value,
  label: GAME_MODE_LABELS[value],
}));
