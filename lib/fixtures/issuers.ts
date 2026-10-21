import type { IssuerEvent } from "@/lib/issuers/aggregate";

const UNKNOWN = `G${"A".repeat(55)}`;

export const ISSUER_FIXTURE_EVENTS: IssuerEvent[] = [
  {
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    asset: "USDC",
    paymentVolume: 1_200_000,
    trustlineOps: 400,
  },
  {
    issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
    asset: "EURC",
    paymentVolume: 220_000,
    trustlineOps: 80,
  },
  {
    issuer: "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM",
    asset: "USD",
    paymentVolume: 90_000,
    trustlineOps: 30,
  },
  {
    issuer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNKNLXLTCV",
    asset: "USDC",
    paymentVolume: 60_000,
    trustlineOps: 25,
  },
  {
    issuer: UNKNOWN,
    asset: "TEST",
    paymentVolume: 10_000,
    trustlineOps: 12,
  },
  {
    issuer: UNKNOWN,
    asset: "TEST2",
    paymentVolume: 2_000,
    trustlineOps: 3,
  },
];

export const UNKNOWN_ISSUER = UNKNOWN;
