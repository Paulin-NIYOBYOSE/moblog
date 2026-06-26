// Seed Moblog with sample accounts and a realistic journal.
// Run with: npm run db:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PAIRS = [
  "EUR/CHF", "EUR/NZD", "EUR/AUD", "GBP/CAD", "USD/CHF", "NZD/JPY",
  "GBP/NZD", "GBP/CHF", "CAD/CHF", "EUR/JPY", "AUD/JPY", "EUR/USD",
  "USD/JPY", "CHF/JPY", "GBP/USD", "NZD/USD", "GBP/CAD", "EUR/CAD",
];
const SETUPS = ["BCS", "WCS", "Breaker", "FVG", "Order block", "Liquidity sweep"];
const EXIT_LOGICS = [
  "Full TP",
  "BCS full TP",
  "WCS direction",
  "Close after confirmation",
  "Stop loss",
  "Break-even",
];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function floor2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  console.log("Seeding sample accounts + trades...");
  await prisma.trade.deleteMany();
  await prisma.account.deleteMany();

  const main = await prisma.account.create({
    data: { name: "Main Journal", currency: "USD", startingBalance: 5000 },
  });
  const challenge = await prisma.account.create({
    data: { name: "Prop Challenge", currency: "USD", startingBalance: 10000 },
  });

  const today = new Date();

  async function seedAccount(account, count, winRate) {
    const trades = [];
    for (let d = 0; d < 60; d++) {
      const openDate = new Date(today);
      openDate.setDate(today.getDate() - d);
      const isWeekend = openDate.getDay() === 0 || openDate.getDay() === 6;
      if (isWeekend && Math.random() < 0.85) continue;
      if (Math.random() < 0.4) continue;

      const tradesToday = Math.floor(rand(1, 3));
      for (let i = 0; i < tradesToday; i++) {
        const win = Math.random() < winRate;
        const direction = Math.random() < 0.55 ? "LONG" : "SHORT";
        const riskAmount = floor2(rand(30, 120));
        const rr = win ? floor2(rand(1, 3)) : floor2(rand(0.5, 1.2));
        const pnl = win ? Math.round(riskAmount * rr) : -Math.round(riskAmount * rr);
        const roi = floor2((pnl / account.startingBalance) * 100);
        const closeDate = new Date(openDate);
        closeDate.setHours(closeDate.getHours() + Math.floor(rand(2, 72)));
        const entry = floor2(rand(1.05, 1.35));
        const exit = floor2(entry + (direction === "LONG" ? 1 : -1) * rand(0.001, 0.015));
        const stopLoss = floor2(entry - (direction === "LONG" ? 1 : -1) * rand(0.004, 0.012));
        const takeProfit = floor2(entry + (direction === "LONG" ? 1 : -1) * rand(0.01, 0.03));

        trades.push({
          accountId: account.id,
          openDate,
          closeDate,
          pair: pick(PAIRS),
          direction,
          exitLogic: pick(EXIT_LOGICS),
          pnl,
          roi,
          rr,
          entry,
          exit,
          stopLoss,
          takeProfit,
          size: floor2(rand(0.5, 5)),
          riskAmount,
          setup: pick(SETUPS),
          comment: win ? "Followed plan." : "Thesis invalidated.",
          chartUrl: "https://www.tradingview.com/chart",
        });
      }
    }
    await prisma.trade.createMany({ data: trades });
    return trades.length;
  }

  const mainCount = await seedAccount(main, 0, 0.48);
  const challengeCount = await seedAccount(challenge, 0, 0.55);

  console.log(`Done. Created ${mainCount + challengeCount} trades across ${2} accounts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
