import type { OpenClawHermesBridgeSpec } from "@/lib/integrations/openclawHermesBridgeTypes";

export const openClawHermesBridgeSpec: OpenClawHermesBridgeSpec = {
  status: "local_script_available",
  mode: "local_file_contract",
  openClawConnection: "not_connected",
  hermesConnection: "not_connected",
  fileWatchImplemented: true,
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none",
  pathContract: {
    requestDirectory: "C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/",
    responseDirectory: "C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/",
    latestRequestFile:
      "C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/latest-advisory-request.json",
    latestResponseFile:
      "C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/latest-advisory-response.json",
    requestPattern: "advisory/requests/*.json",
    responsePattern: "advisory/responses/*.json"
  },
  requestValidation: [
    'mode must be "advisory_only"',
    'executionAuthority must be "none"',
    'brokerAuthority must be "none"',
    'readinessOverrideAuthority must be "none"',
    "packetId, thesisId, symbol, and timeframe must be present"
  ],
  responseValidation: [
    'mode must be "advisory_only"',
    'executionAuthority must be "none"',
    'brokerAuthority must be "none"',
    'readinessOverrideAuthority must be "none"',
    "packetId must match an advisory request packet when possible",
    "proceedRecommendation must be advisory-only"
  ],
  lifecycle: [
    {
      step: "Export advisory request",
      owner: "AI Lab",
      description: "AI Lab writes an advisory-only request packet to the requests folder."
    },
    {
      step: "Detect request file",
      owner: "Future local bridge",
      description: "A future bridge may watch the requests folder and pass the packet to an advisory reviewer."
    },
    {
      step: "Review research context",
      owner: "OpenClaw/Hermes",
      description: "The reviewer may critique ICT context, CIO thesis, validation, readiness, and risk notes."
    },
    {
      step: "Write advisory response",
      owner: "Future local bridge",
      description: "A future bridge may write an advisory-only response packet to the responses folder."
    },
    {
      step: "Import response",
      owner: "User",
      description: "The user validates and imports the response into AI Lab for research review only."
    }
  ],
  prohibitedActions: [
    "execute trades",
    "approve trades",
    "override readiness gates",
    "connect to brokers",
    "change live settings",
    "control go-trader",
    "write API keys or credentials"
  ],
  safetyNotice:
    "Planning-only local file bridge contract. No live OpenClaw/Hermes connection, no execution authority, no broker control, and no readiness override."
};
