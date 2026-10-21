export interface ProtocolHealthDetailLink {
  /** `protocol` opens the protocol TVL tile; `entity` opens search/detail context. */
  context: "protocol" | "entity";
  href: string;
  entityId?: string;
}

/**
 * Dashboard URL that lands in the existing protocol or entity detail context.
 * Protocol TVL tiles use the adapter id (lowercased protocol name) as the path.
 */
export function protocolHealthDetailLink(
  protocol: string,
  tvlAvailable: boolean,
  entityId?: string,
): ProtocolHealthDetailLink {
  if (tvlAvailable) {
    return {
      context: "protocol",
      href: `/?metric=protocol_tvl&path=${encodeURIComponent(protocol.toLowerCase())}`,
      ...(entityId ? { entityId } : {}),
    };
  }

  const params = new URLSearchParams({
    metric: "ops",
    view: "actors",
    q: protocol,
  });

  return {
    context: "entity",
    href: `/?${params.toString()}`,
    ...(entityId ? { entityId } : {}),
  };
}
