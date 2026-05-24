import type { GoTraderSignalExport, TradeThesis } from "@/lib/types";
import { createGoTraderSimulationSignal } from "@/lib/integrations/goTraderBridge";

export function exportGoTraderSignal(thesis: TradeThesis): GoTraderSignalExport {
  return createGoTraderSimulationSignal(thesis);
}
