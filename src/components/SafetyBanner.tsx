import { AlertTriangle } from "lucide-react";

export function SafetyBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
      <div>
        <span className="font-semibold">Research and simulation only.</span> GoTrader AI Lab uses mock market data,
        simulated outcomes, and local storage. It does not connect to brokers, place orders, execute trades, or provide
        financial advice.
      </div>
    </div>
  );
}
