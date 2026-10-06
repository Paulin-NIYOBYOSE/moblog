// DRIPDOLLAR swing-trading playbook — kept as data so the Journal's Playbook
// view and its A+ checklist quote the same rules.

export const PLAYBOOK = {
  name: "DRIPDOLLAR",
  tagline: "Swing trading strategy",
  stack: "Weekly → Daily → 4H → 1H | Pure Price Action",
  coreIdea:
    "Higher timeframe determines direction. Daily determines structure and location. 4H confirms the setup. 1H executes the trade.",
  oneLine: [
    "Weekly direction",
    "Daily structure & 1-2-3",
    "HTF POI",
    "4H displacement / break",
    "4H retest",
    "1H confirmation",
    "Structural SL",
    "Clean 2R room",
    "1% risk",
    "Predefined exit",
  ],
  timeframes: [
    { tf: "Weekly", purpose: "Direction", identify: "HH/HL or LH/LL + major S/R", decision: "Long / Short bias" },
    { tf: "Daily", purpose: "Structure & location", identify: "1-2-3 + POI + market structure", decision: "Setup quality" },
    { tf: "4H", purpose: "Setup confirmation", identify: "Break + displacement + retest", decision: "Valid setup" },
    { tf: "1H", purpose: "Execution", identify: "Structure break / engulfing / break-retest", decision: "Entry" },
  ],
  sections: [
    {
      n: 1,
      title: "Weekly analysis — Direction",
      blocks: [
        {
          title: "Bullish bias",
          tone: "profit",
          items: [
            "Higher Highs (HH) and Higher Lows (HL)",
            "Bullish continuation",
            "Price respecting important support",
            "Meaningful resistance broken and accepted above",
          ],
          footer: "Preferred action: look for LONG setups.",
        },
        {
          title: "Bearish bias",
          tone: "loss",
          items: [
            "Lower Highs (LH) and Lower Lows (LL)",
            "Bearish continuation",
            "Price respecting important resistance",
            "Meaningful support broken and accepted below",
          ],
          footer: "Preferred action: look for SHORT setups.",
        },
        {
          title: "Weekly levels to mark",
          tone: "muted",
          items: ["Major support and resistance", "Important swing highs / lows", "Major zones", "Previous significant highs / lows"],
          footer: "Avoid clutter. Mark levels that can realistically influence the trade.",
        },
      ],
    },
    {
      n: 2,
      title: "Daily analysis — Structure & location",
      blocks: [
        {
          title: "Structure",
          tone: "muted",
          items: ["Bullish: HH → HL → HH", "Bearish: LL → LH → LL"],
        },
        {
          title: "Daily 1-2-3",
          tone: "muted",
          items: [
            "Bullish: low → reaction high → higher low → break of the relevant high",
            "Bearish: high → reaction low → lower high → break of the relevant low",
          ],
        },
        {
          title: "Daily / Weekly POI",
          tone: "muted",
          items: [
            "Major support / resistance",
            "Previous significant high / low",
            "Fresh zone",
            "Broken level becoming support / resistance",
            "Important swing",
            "Repeatedly tested level",
          ],
          footer: "Location before confirmation — never trade a random 4H pattern in the middle of nowhere.",
        },
      ],
    },
    {
      n: 3,
      title: "Directional alignment",
      blocks: [
        {
          title: "Preferred",
          tone: "muted",
          items: ["Long: Weekly bullish + Daily bullish", "Short: Weekly bearish + Daily bearish"],
          footer: "If Weekly and Daily disagree, treat the setup as lower quality and test it separately rather than assuming it is invalid.",
        },
      ],
    },
    {
      n: 4,
      title: "4H setup — Break & retest",
      blocks: [
        {
          title: "Long setup",
          tone: "profit",
          items: [
            "Price reaches a bullish Daily / Weekly POI",
            "Bullish structure begins developing",
            "4H breaks a meaningful swing high / resistance",
            "Prefer a 4H candle CLOSE beyond the level",
            "Price returns to retest the broken level",
            "The level holds and price rejects away from it",
          ],
          ordered: true,
        },
        {
          title: "Short setup",
          tone: "loss",
          items: [
            "Price reaches a bearish Daily / Weekly POI",
            "Bearish structure begins developing",
            "4H breaks a meaningful swing low / support",
            "Prefer a 4H candle CLOSE beyond the level",
            "Price returns to retest the broken level",
            "The level holds as resistance and price rejects away from it",
          ],
          ordered: true,
        },
        {
          title: "Break quality",
          tone: "muted",
          items: [
            "Clear 4H close beyond the level",
            "Meaningful candle body",
            "Directional movement away from the level",
            "Limited opposing wick",
            "Obvious structural change",
          ],
          footer: "Avoid tiny wick-only breaks, immediate closes back inside the range and choppy repeated failures.",
        },
        {
          title: "Retest quality",
          tone: "muted",
          items: ["A touch is not confirmation", "break → return → rejection/hold → 4H reaction → 1H trigger"],
          footer: "Optional test — liquidity sweep → displacement → structure break → retest. A research variable until the backtest proves it adds value.",
        },
      ],
    },
    {
      n: 5,
      title: "1H execution",
      blocks: [
        {
          title: "Trigger",
          tone: "muted",
          items: [
            "4H break and retest must already be valid",
            "1H break of structure and/or clear engulfing",
            "Prefer a 1H break + retest when it produces a cleaner entry",
            "Enter after the defined trigger closes / confirmations are complete",
          ],
          footer: "The 1H is the execution timeframe, not the bias timeframe.",
        },
      ],
    },
    {
      n: 6,
      title: "Stop loss",
      blocks: [
        {
          title: "Structural invalidation",
          tone: "muted",
          items: [
            "Long: below the 4H swing low, retest low or liquidity-sweep low",
            "Short: above the 4H swing high, retest high or liquidity-sweep high",
            "Never an arbitrary pip distance",
          ],
          footer: "If the required stop makes the target unrealistic, skip the trade.",
        },
      ],
    },
    {
      n: 7,
      title: "Target & risk / reward",
      blocks: [
        {
          title: "Base target 1:2",
          tone: "muted",
          items: [
            "1R risk → 2R target (1% risk → SL −1%, TP +2%)",
            "Identify the next major opposing structure before entry",
            "Don't demand 2R when major S/R blocks the path",
          ],
          footer: "Test: compare minimum clean room of 1.5R, 2R, 2.5R and 3R.",
        },
      ],
    },
    {
      n: 8,
      title: "Risk management",
      blocks: [
        {
          title: "Standard risk",
          tone: "muted",
          items: [
            "Baseline: 1% account risk per trade",
            "$10,000 account → 1% = $100 = 1R; a 2R winner = +$200",
            "Cap combined risk on strongly correlated FX positions (test the cap)",
          ],
        },
      ],
    },
    {
      n: 9,
      title: "Trade management — experimental",
      blocks: [
        {
          title: "Variants to test",
          tone: "muted",
          items: [
            "Baseline: set SL and TP, no discretionary interference",
            "50% at 1R, remainder to 2R → +1.5R / +0.5R / −1R",
            "Structure-based BE: wait for a new 1H HL (long) / LH (short) after +1R",
            "BE at +0.75R, +1R and +1.25R",
          ],
        },
      ],
    },
  ],
  noTrade: [
    "Weekly direction is unclear",
    "Daily structure is extremely messy",
    "No meaningful higher-timeframe POI exists",
    "4H break is weak or wick-only",
    "4H immediately closes back inside the broken range",
    "Retest completely invalidates the breakout",
    "No valid 1H confirmation",
    "Major opposing structure blocks the intended target",
    "Required RR is poor",
    "Stop is excessively wide",
    "Price is extremely extended",
    "Taken because of FOMO rather than the predefined rules",
  ],
  master: {
    long: "Weekly bullish + Daily bullish structure + Daily/Weekly POI + 4H bullish displacement/break + 4H retest + 1H bullish confirmation + adequate room to target → LONG",
    short:
      "Weekly bearish + Daily bearish structure + Daily/Weekly POI + 4H bearish displacement/break + 4H retest + 1H bearish confirmation + adequate room to target → SHORT",
  },
  protocol: [
    { code: "Base", change: "Current strategy" },
    { code: "T1", change: "Weekly + Daily alignment" },
    { code: "T2", change: "Strong 4H displacement" },
    { code: "T3", change: "Quality retest" },
    { code: "T4", change: "Liquidity sweep" },
    { code: "T5", change: "Clean Daily 1-2-3" },
    { code: "T6", change: "Minimum 2R room" },
    { code: "T7", change: "1H trigger variants" },
    { code: "T8", change: "Set-and-forget 1:2 vs partial at 1R" },
    { code: "T9", change: "BE timing / structure-based BE" },
  ],
  metrics: [
    "Win rate",
    "Profit factor",
    "Expectancy per trade (R)",
    "Average winner (R)",
    "Average loser (R)",
    "Net R",
    "Maximum drawdown",
    "Maximum losing streak",
    "Number of trades",
    "Average holding time",
    "MAE / MFE",
  ],
  golden: [
    "Higher timeframe first.",
    "Location before confirmation.",
    "Break before retest.",
    "Retest before entry.",
    "4H decides; 1H executes.",
    "SL goes where the setup becomes invalid.",
    "Do not force 2R when major structure is in the way.",
    "Never increase risk to recover losses.",
    "One losing trade does not invalidate the strategy.",
    "Backtest every modification before making it permanent.",
  ],
  optimization:
    "Do not optimize for win rate alone. Prefer the rule set that produces robust positive expectancy with acceptable drawdown and enough trades to be statistically useful.",
} as const;
