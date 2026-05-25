export type OpenClawHermesBridgeStatus = "planning_only" | "local_script_available";
export type OpenClawHermesBridgeConnection = "not_connected";
export type OpenClawHermesBridgeMode = "local_file_contract";
export type OpenClawHermesBridgeAuthority = "none";
export type OpenClawHermesBridgeProvider = "mock" | "local-command";

export interface OpenClawHermesBridgePathContract {
  requestDirectory: string;
  responseDirectory: string;
  latestRequestFile: string;
  latestResponseFile: string;
  requestPattern: string;
  responsePattern: string;
}

export interface OpenClawHermesBridgeLifecycleStep {
  step: string;
  owner: "AI Lab" | "Future local bridge" | "OpenClaw/Hermes" | "User";
  description: string;
}

export interface OpenClawHermesBridgeSpec {
  status: OpenClawHermesBridgeStatus;
  mode: OpenClawHermesBridgeMode;
  openClawConnection: OpenClawHermesBridgeConnection;
  hermesConnection: OpenClawHermesBridgeConnection;
  fileWatchImplemented: boolean;
  executionAuthority: OpenClawHermesBridgeAuthority;
  brokerAuthority: OpenClawHermesBridgeAuthority;
  readinessOverrideAuthority: OpenClawHermesBridgeAuthority;
  pathContract: OpenClawHermesBridgePathContract;
  providerModes: OpenClawHermesBridgeProvider[];
  defaultProvider: OpenClawHermesBridgeProvider;
  localCommandEnvVar: "GOTRADER_ADVISORY_COMMAND";
  dryRunSupported: true;
  fallbackMockSupported: true;
  requestValidation: string[];
  responseValidation: string[];
  lifecycle: OpenClawHermesBridgeLifecycleStep[];
  prohibitedActions: string[];
  safetyNotice: "Planning-only local file bridge contract. No live OpenClaw/Hermes connection, no execution authority, no broker control, and no readiness override.";
}
