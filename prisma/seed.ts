import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const account1 = await prisma.account.upsert({
    where: { id: "clx9z44e000003b6w53f40f0r" },
    update: {},
    create: {
      id: "clx9z44e000003b6w53f40f0r",
      name: "Futures Account",
      currency: "USD",
      startingBalance: 10000,
    },
  });

  const account2 = await prisma.account.upsert({
    where: { id: "clx9z44e000013b6w26e0310k" },
    update: {},
    create: {
      id: "clx9z44e000013b6w26e0310k",
      name: "Options Account",
      currency: "USD",
      startingBalance: 5000,
    },
  });

  const trades = [
    {
      accountId: account1.id,
      openDate: new Date("2024-01-05"),
      closeDate: new Date("2024-01-05"),
      pair: "ES",
      direction: "LONG" as const,
      entry: 4700,
      exit: 4720,
      stopLoss: 4690,
      takeProfit: 4730,
      size: 10,
      riskAmount: 100,
      pnl: 200,
      roi: 2,
      rr: 2,
      exitLogic: "Reached TP",
      setup: "Breakout",
      comment: "Strong momentum after news.",
      chartUrl: "https://example.com/chart1.png",
    },
    {
      accountId: account1.id,
      openDate: new Date("2024-01-08"),
      closeDate: new Date("2024-01-08"),
      pair: "NQ",
      direction: "SHORT" as const,
      entry: 16500,
      exit: 16450,
      stopLoss: 16520,
      takeProfit: 16400,
      size: 5,
      riskAmount: 100,
      pnl: 250,
      roi: 2.5,
      rr: 2.5,
      exitLogic: "Fade after initial pop.",
      setup: "Reversal",
      comment: "Fade after initial pop.",
      chartUrl: "https://example.com/chart2.png",
    },
    {
      accountId: account1.id,
      openDate: new Date("2024-01-10"),
      closeDate: new Date("2024-01-10"),
      pair: "RTY",
      direction: "LONG" as const,
      entry: 2000,
      exit: 1990,
      stopLoss: 2010,
      takeProfit: 1980,
      size: 20,
      riskAmount: 200,
      pnl: -200,
      roi: -1,
      rr: -1,
      exitLogic: "Stop out",
      setup: "Trend continuation",
      comment: "Failed to hold support.",
      chartUrl: "https://example.com/chart3.png",
    },
    {
      accountId: account2.id,
      openDate: new Date("2024-01-12"),
      closeDate: new Date("2024-01-12"),
      pair: "SPY",
      direction: "LONG" as const,
      entry: 470,
      exit: 475,
      stopLoss: 468,
      takeProfit: 478,
      size: 100,
      riskAmount: 200,
      pnl: 500,
      roi: 2.5,
      rr: 2.5,
      exitLogic: "Reached TP",
      setup: "Call spread",
      comment: "Weekly options play.",
      chartUrl: "https://example.com/chart4.png",
    },
    {
      accountId: account2.id,
      openDate: new Date("2024-01-15"),
      closeDate: null,
      pair: "QQQ",
      direction: "SHORT" as const,
      entry: 400,
      exit: null,
      stopLoss: 405,
      takeProfit: 390,
      size: 50,
      riskAmount: 250,
      pnl: 0,
      roi: 0,
      rr: 0,
      exitLogic: null,
      setup: "Put options",
      comment: "Expecting tech pullback.",
      chartUrl: "https://example.com/chart5.png",
    },
  ];

  for (const trade of trades) {
    await prisma.trade.create({ data: trade });
  }

  console.log(`Done. Created ${trades.length} trades across 2 accounts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
