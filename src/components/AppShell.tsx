import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
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
    items: [
      { href: "/dashboard", label: "Command Center", icon: LayoutDashboard, primary: true },
      { href: "/advisor", label: "Research Advisor", icon: MessageSquareText }
    ]
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

const NAV_COLLAPSED_STORAGE_KEY = "gotrader-ai-lab-nav-collapsed";

const loadNavCollapsedPreference = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === "true";
};

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(loadNavCollapsedPreference);

  useEffect(() => {
    window.localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, String(navCollapsed));
  }, [navCollapsed]);

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

  const shellStyle = {
    "--app-sidebar-width": navCollapsed ? "5rem" : "18rem"
  } as CSSProperties;

  return (
    <div className="min-h-screen terminal-grid lg:h-screen lg:overflow-hidden">
      <div
        className="mx-auto min-h-screen w-full lg:grid lg:h-screen lg:grid-cols-[var(--app-sidebar-width)_minmax(0,1fr)]"
        style={shellStyle}
      >
        <aside
          className={cn(
            "min-w-0 border-b border-border bg-background/75 backdrop-blur transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[var(--app-sidebar-width)] lg:flex-col lg:border-b-0 lg:border-r",
            navCollapsed && "lg:items-center"
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-5",
              navCollapsed && "lg:flex-col lg:justify-start lg:px-3"
            )}
          >
            <div className={cn("min-w-0", navCollapsed && "lg:w-full")}>
              <div className={cn("flex min-w-0 items-center gap-3", navCollapsed && "lg:justify-center")}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                  <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className={cn("min-w-0", navCollapsed && "lg:hidden")}>
                  <h1 className="text-lg font-semibold tracking-normal">GoTrader AI Lab</h1>
                  <p className="text-xs text-muted-foreground">Simulation research layer</p>
                </div>
              </div>
            </div>
            <div className={cn("flex shrink-0 items-center gap-2", navCollapsed && "lg:flex-col")}>
              <Badge variant="warning" className={cn(navCollapsed && "lg:hidden")}>
                No live trading
              </Badge>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/70 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => setNavCollapsed((value) => !value)}
                aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
                title={navCollapsed ? "Expand navigation" : "Collapse navigation"}
                aria-pressed={navCollapsed}
              >
                {navCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <nav
            ref={navRef}
            className={cn(
              "scrollbar-thin flex min-w-0 gap-3 overflow-x-auto px-3 pb-4 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain lg:pb-5",
              navCollapsed ? "lg:items-center lg:px-2 lg:pr-2" : "lg:pr-2"
            )}
            aria-label="Primary navigation"
          >
            {primaryNavigation.map((group) => (
              <div key={group.section} className={cn("flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-1", navCollapsed && "lg:w-full")}>
                <div className={cn("hidden px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 lg:block", navCollapsed && "lg:hidden")}>
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
                        isActive && "bg-secondary text-foreground shadow-sm",
                        navCollapsed && "lg:mx-auto lg:w-11 lg:justify-center lg:px-0"
                      )
                    }
                    aria-label={item.label}
                    title={navCollapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className={cn("truncate", navCollapsed && "lg:hidden")}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
            <div className={cn("flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-1", navCollapsed && "lg:w-full")}>
              <button
                type="button"
                className={cn(
                  "flex min-w-fit items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors hover:bg-secondary/50 hover:text-foreground lg:min-w-0",
                  navCollapsed && "lg:mx-auto lg:w-11 lg:justify-center lg:px-0"
                )}
                onClick={() => setAdvancedOpen((value) => !value)}
                aria-expanded={advancedOpen}
                aria-label="Toggle advanced navigation"
                title={navCollapsed ? "Advanced Lab" : undefined}
              >
                <FlaskConical className={cn("h-4 w-4 shrink-0 lg:hidden", navCollapsed && "lg:block")} aria-hidden="true" />
                <span className={cn(navCollapsed && "lg:hidden")}>Advanced Lab</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
              </button>
              <div className={cn("flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-4", navCollapsed && "lg:w-full lg:items-center", !advancedOpen && "hidden")}>
                {advancedNavigation.map((group) => (
                  <div key={group.section} className={cn("flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-1", navCollapsed && "lg:w-full")}>
                    <div className={cn("hidden px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 lg:block", navCollapsed && "lg:hidden")}>
                      {group.section}
                    </div>
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        className={({ isActive }) =>
                          cn(
                            "flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] lg:min-w-0",
                            isActive && "bg-secondary text-foreground shadow-sm",
                            navCollapsed && "lg:mx-auto lg:w-11 lg:justify-center lg:px-0"
                          )
                        }
                        aria-label={item.label}
                        title={navCollapsed ? item.label : undefined}
                      >
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className={cn("truncate", navCollapsed && "lg:hidden")}>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </nav>

          <div className={cn("hidden shrink-0 border-t border-border/70 px-5 pb-5 pt-4 lg:block", navCollapsed && "lg:hidden")}>
            <div className="rounded-lg border border-border bg-card/70 p-4 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Local-first controls
              </div>
              Mock agents, prompt history, simulated outcomes, and export approvals stay in browser storage.
            </div>
          </div>
        </aside>

        <main className="scrollbar-thin min-w-0 overflow-x-auto px-4 py-5 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-6 xl:px-8">
          <div className="mb-5 min-w-0">
            <SafetyBanner />
          </div>
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
