import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  Beaker,
  Bot,
  BrainCircuit,
  ChevronDown,
  DatabaseZap,
  ChartCandlestick,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  Gauge,
  GitBranch,
  LayoutDashboard,
  MessageSquareText,
  MessagesSquare,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon
} from "lucide-react";
import { SafetyBanner } from "@/components/SafetyBanner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

interface NavigationGroup {
  section: string;
  items: NavigationItem[];
}

const primaryNavigation: NavigationGroup[] = [
  {
    section: "Command Center",
    items: [{ href: "/dashboard", label: "Command Center", icon: LayoutDashboard, primary: true }]
  },
  {
    section: "Autonomous Workflow",
    items: [
      { href: "/market-data", label: "Market Data", icon: DatabaseZap },
      { href: "/autonomous-research", label: "Autonomous Research", icon: Bot },
      { href: "/walk-forward", label: "Walk-Forward", icon: GitBranch },
      { href: "/self-improvement", label: "Self-Improvement", icon: SlidersHorizontal },
      { href: "/readiness-gate", label: "Readiness", icon: ShieldAlert },
      { href: "/performance", label: "Performance", icon: Activity },
      { href: "/communications", label: "Communications", icon: MessageSquareText }
    ]
  },
  {
    section: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }]
  }
];

const advancedNavigation: NavigationGroup[] = [
  {
    section: "Advanced Lab",
    items: [
      { href: "/ict-lab", label: "ICT Lab", icon: ChartCandlestick },
      { href: "/replay", label: "Replay", icon: RefreshCw },
      { href: "/backtest-lab", label: "Backtest Lab", icon: Beaker },
      { href: "/validation", label: "Validation", icon: ClipboardCheck },
      { href: "/research-quality", label: "Research Quality", icon: ShieldCheck },
      { href: "/auto-research", label: "Auto Research", icon: Bot },
      { href: "/research", label: "Research Workbench", icon: FlaskConical }
    ]
  },
  {
    section: "Diagnostics",
    items: [
      { href: "/agent-debate", label: "Agent Debate", icon: MessagesSquare },
      { href: "/agent-audit", label: "Agent Audit", icon: ClipboardCheck },
      { href: "/llm-agents", label: "LLM Agents", icon: BrainCircuit },
      { href: "/evidence-quality", label: "Evidence Quality", icon: DatabaseZap },
      { href: "/research-maturity", label: "Research Maturity", icon: Gauge },
      { href: "/simulation-runbook", label: "Simulation Runbook", icon: ClipboardList }
    ]
  },
  {
    section: "Developer / Debug",
    items: [
      { href: "/advisory-agents", label: "Advisory Agents", icon: Bot },
      { href: "/agents", label: "Agent Roster", icon: Bot },
      { href: "/prompt-lab", label: "Prompt Lab", icon: GitBranch }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return undefined;
    }

    const onNativeClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      const target = event.target instanceof Element ? event.target : undefined;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !nav.contains(anchor)) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) {
        return;
      }

      event.preventDefault();
      navigate(href);
    };

    nav.addEventListener("click", onNativeClick, { capture: true });
    return () => nav.removeEventListener("click", onNativeClick, { capture: true });
  }, [navigate]);

  return (
    <div className="min-h-screen terminal-grid lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:h-screen lg:flex-row">
        <aside className="border-b border-border bg-background/75 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 items-center justify-between px-5 py-5 lg:block">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                  <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold tracking-normal">GoTrader AI Lab</h1>
                  <p className="text-xs text-muted-foreground">Simulation research layer</p>
                </div>
              </div>
            </div>
            <Badge variant="warning" className="lg:mt-5">
              No live trading
            </Badge>
          </div>

          <nav ref={navRef} className="scrollbar-thin flex gap-3 overflow-x-auto px-3 pb-4 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain lg:pb-5 lg:pr-2">
            {primaryNavigation.map((group) => (
              <div key={group.section} className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-1">
                <div className="hidden px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 lg:block">
                  {group.section}
                </div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        "flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] lg:min-w-0",
                        item.primary && "border border-primary/20 bg-primary/5 text-foreground",
                        isActive && "bg-secondary text-foreground shadow-sm"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
            <div className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-1">
              <button
                type="button"
                className="flex min-w-fit items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors hover:bg-secondary/50 hover:text-foreground lg:min-w-0"
                onClick={() => setAdvancedOpen((value) => !value)}
                aria-expanded={advancedOpen}
              >
                Advanced Lab
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
              </button>
              <div className={cn("flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-4", !advancedOpen && "hidden")}>
                {advancedNavigation.map((group) => (
                  <div key={group.section} className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-1">
                    <div className="hidden px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 lg:block">
                      {group.section}
                    </div>
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        className={({ isActive }) =>
                          cn(
                            "flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] lg:min-w-0",
                            isActive && "bg-secondary text-foreground shadow-sm"
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </nav>

          <div className="hidden shrink-0 border-t border-border/70 px-5 pb-5 pt-4 lg:block">
            <div className="rounded-lg border border-border bg-card/70 p-4 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Local-first controls
              </div>
              Mock agents, prompt history, simulated outcomes, and export approvals stay in browser storage.
            </div>
          </div>
        </aside>

        <main className="scrollbar-thin min-w-0 flex-1 px-4 py-5 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8">
          <div className="mb-5">
            <SafetyBanner />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
