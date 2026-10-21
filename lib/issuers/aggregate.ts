export type IssuerEvent = {
  issuer: string;
  asset: string;
  paymentVolume: number;
  trustlineOps: number;
};

export type IssuerSort = "volume" | "ops";

export type IssuerAggregate = {
  issuer: string;
  name: string | null;
  paymentVolume: number;
  trustlineOps: number;
  opShare: number;
  assets: string[];
  displayAddress: string;
  copyAddress: string;
};

export function truncateIssuer(issuer: string): string {
  const trimmed = issuer.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function aggregateIssuers(
  events: IssuerEvent[],
  names: Record<string, { name: string }>,
  sort: IssuerSort = "volume",
): IssuerAggregate[] {
  const buckets = new Map<
    string,
    { paymentVolume: number; trustlineOps: number; assets: Set<string> }
  >();

  for (const event of events) {
    const issuer = event.issuer.trim();
    if (!issuer) continue;
    const bucket = buckets.get(issuer) ?? {
      paymentVolume: 0,
      trustlineOps: 0,
      assets: new Set<string>(),
    };
    bucket.paymentVolume += event.paymentVolume;
    bucket.trustlineOps += event.trustlineOps;
    if (event.asset.trim()) bucket.assets.add(event.asset.trim());
    buckets.set(issuer, bucket);
  }

  const totalOps = [...buckets.values()].reduce(
    (sum, bucket) => sum + bucket.trustlineOps,
    0,
  );

  const rows: IssuerAggregate[] = [...buckets.entries()].map(([issuer, bucket]) => {
    const name = names[issuer]?.name ?? null;
    return {
      issuer,
      name,
      paymentVolume: bucket.paymentVolume,
      trustlineOps: bucket.trustlineOps,
      opShare: totalOps === 0 ? 0 : bucket.trustlineOps / totalOps,
      assets: [...bucket.assets].sort(),
      displayAddress: name ?? truncateIssuer(issuer),
      copyAddress: issuer,
    };
  });

  rows.sort((left, right) => {
    const key = sort === "volume" ? "paymentVolume" : "trustlineOps";
    return right[key] - left[key] || left.issuer.localeCompare(right.issuer);
  });

  return rows;
}
