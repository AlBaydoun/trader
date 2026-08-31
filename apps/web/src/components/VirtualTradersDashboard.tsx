import type { ReactNode } from "react";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  ChevronRight,
  CircleStop,
  Clock3,
  Layers3,
  ScanLine,
  ShieldCheck,
  Target,
  CandlestickChart,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import type { PaperPortfolio, StrategyLabSnapshot } from "../types";

interface VirtualTradersDashboardProps {
  paper?: PaperPortfolio;
  jdub?: PaperPortfolio;
  rigorgate?: PaperPortfolio;
  extreme?: PaperPortfolio;
  candlestick?: PaperPortfolio;
  candlestickBuy?: PaperPortfolio;
  candlestickSell?: PaperPortfolio;
  strategyLab?: StrategyLabSnapshot;
  onOpenPanel: (panelId: string) => void;
}

interface TraderCardProps {
  name: string;
  subtitle: string;
  accent: "market" | "jdub" | "rigorgate" | "extreme" | "candlestick" | "candlestick-buy" | "candlestick-sell";
  icon: ReactNode;
  panelId: string;
  portfolio?: PaperPortfolio;
  onOpenPanel: (panelId: string) => void;
}

export function VirtualTradersDashboard({
  paper,
  jdub,
  rigorgate,
  extreme,
  candlestick,
  candlestickBuy,
  candlestickSell,
  strategyLab,
  onOpenPanel
}: VirtualTradersDashboardProps) {
  const portfolios = [paper, jdub, rigorgate, extreme, candlestick, candlestickBuy, candlestickSell].filter(
    (portfolio): portfolio is PaperPortfolio => Boolean(portfolio)
  );
  const totalEquity = portfolios.length
    ? portfolios.reduce((total, portfolio) => total + portfolio.metrics.equity, 0)
    : undefined;
  const totalStartingBalance = portfolios.length
    ? portfolios.reduce((total, portfolio) => total + portfolio.metrics.starting_balance, 0)
    : undefined;
  const totalNet = portfolios.length
    ? portfolios.reduce(
      (total, portfolio) => total + portfolio.metrics.realized_pnl + portfolio.metrics.unrealized_pnl,
      0
    )
    : undefined;
  const totalOpen = portfolios.reduce((total, portfolio) => total + portfolio.metrics.open_positions, 0);
  const totalClosed = portfolios.reduce((total, portfolio) => total + portfolio.metrics.closed_trades, 0);
  const totalWins = portfolios.reduce((total, portfolio) => total + portfolio.metrics.winning_trades, 0);
  const totalLosses = portfolios.reduce((total, portfolio) => total + portfolio.metrics.losing_trades, 0);
  const running = portfolios.filter((portfolio) => portfolio.engine.enabled).length;
  const totalReturn = totalStartingBalance && totalNet !== undefined
    ? totalNet / totalStartingBalance * 100
    : undefined;
  const totalWinRate = totalClosed ? totalWins / totalClosed * 100 : undefined;
  const latestCycle = portfolios.reduce<string | null>((latest, portfolio) => {
    const cycle = portfolio.engine.last_cycle_at;
    if (!cycle) return latest;
    return !latest || cycle > latest ? cycle : latest;
  }, null);

  return (
    <section className="trader-dashboard" id="virtual-dashboard" aria-label="Virtual trader dashboard">
      <header className="trader-dashboard-header">
        <div className="trader-dashboard-title">
          <span className="trader-dashboard-icon"><Layers3 size={19} /></span>
          <div>
            <span className="dashboard-eyebrow">Command center</span>
            <h2>Virtual Trader Dashboard</h2>
            <p>One view for every paper engine, its current exposure, and its recorded results.</p>
          </div>
        </div>
        <div className="trader-dashboard-actions">
          <span className="dashboard-live-state"><Activity size={13} /> {running} of {portfolios.length} running</span>
          <button className="icon-text dashboard-jump" type="button" onClick={() => onOpenPanel("paper-trading")}>
            Open ledgers <ChevronRight size={14} />
          </button>
        </div>
      </header>

      <div className="dashboard-kpis">
        <DashboardKpi label="Combined equity" value={totalEquity === undefined ? "--" : money(totalEquity)} detail="Across paper engines" />
        <DashboardKpi
          label="Net result"
          value={totalNet === undefined ? "--" : signedMoney(totalNet)}
          detail={totalReturn === undefined ? "Waiting for results" : `${signedPercent(totalReturn)} total return`}
          tone={totalNet}
        />
        <DashboardKpi label="Open exposure" value={String(totalOpen)} detail="Virtual positions" />
        <DashboardKpi label="Closed trades" value={String(totalClosed)} detail={`${totalWins} wins · ${totalLosses} losses`} />
        <DashboardKpi
          label="Win rate"
          value={totalWinRate === undefined ? "--" : `${totalWinRate.toFixed(1)}%`}
          detail={latestCycle ? `Last cycle ${dateTime(latestCycle)}` : "No completed trades yet"}
          tone={totalWinRate === undefined ? undefined : totalWinRate - 50}
        />
      </div>

      <div className="dashboard-trader-grid">
        <TraderCard
          name="Market Scanner"
          subtitle="Whole-market virtual execution · configurable timeframe"
          accent="market"
          icon={<BarChart3 size={17} />}
          panelId="paper-trading"
          portfolio={paper}
          onOpenPanel={onOpenPanel}
        />
        <TraderCard
          name="Jdub Traders"
          subtitle="New York opening-range paper strategy"
          accent="jdub"
          icon={<Target size={17} />}
          panelId="jdub-trading"
          portfolio={jdub}
          onOpenPanel={onOpenPanel}
        />
        <TraderCard
          name="RigorGate"
          subtitle="Direct BUY / WAIT / SELL evidence-gated paper bot"
          accent="rigorgate"
          icon={<ScanLine size={17} />}
          panelId="rigorgate-trading"
          portfolio={rigorgate}
          onOpenPanel={onOpenPanel}
        />
        <TraderCard
          name="Extreme Virtual"
          subtitle="Confirmed 85/15 reversal simulation"
          accent="extreme"
          icon={<TrendingDown size={17} />}
          panelId="extreme-paper-trading"
          portfolio={extreme}
          onOpenPanel={onOpenPanel}
        />
        <TraderCard
          name="Candlestick Main BUY + SELL Bot"
          subtitle="Bullish and bearish engulfing · virtual BUY and SELL"
          accent="candlestick"
          icon={<CandlestickChart size={17} />}
          panelId="candlestick-trading"
          portfolio={candlestick}
          onOpenPanel={onOpenPanel}
        />
        <TraderCard
          name="Bullish Engulfing BUY Bot"
          subtitle="Bullish engulfing only · virtual BUY entries"
          accent="candlestick-buy"
          icon={<TrendingUp size={17} />}
          panelId="candlestick-buy-trading"
          portfolio={candlestickBuy}
          onOpenPanel={onOpenPanel}
        />
        <TraderCard
          name="Bearish Engulfing SELL Bot"
          subtitle="Bearish engulfing only · virtual SELL entries"
          accent="candlestick-sell"
          icon={<TrendingDown size={17} />}
          panelId="candlestick-sell-trading"
          portfolio={candlestickSell}
          onOpenPanel={onOpenPanel}
        />
        <StrategyLabCard snapshot={strategyLab} onOpenPanel={onOpenPanel} />
      </div>

      <footer className="trader-dashboard-footnote">
        <ShieldCheck size={13} />
        <span>All numbers are virtual. The dashboard summarizes the detailed ledgers below without changing their strategies or risk controls.</span>
      </footer>
    </section>
  );
}

function TraderCard({
  name,
  subtitle,
  accent,
  icon,
  panelId,
  portfolio,
  onOpenPanel
}: TraderCardProps) {
  const metrics = portfolio?.metrics;
  const engine = portfolio?.engine;
  const net = metrics ? metrics.realized_pnl + metrics.unrealized_pnl : undefined;
  const state = engine ? (engine.enabled ? engine.market_source === "mt5" ? "Running" : "Waiting" : "Paused") : "Loading";
  const stateIcon = state === "Running" ? <Activity size={11} /> : <CircleStop size={11} />;

  return (
    <article className={`dashboard-trader-card ${accent}`}>
      <div className="dashboard-card-topline">
        <span className="dashboard-card-icon">{icon}</span>
        <span className={`dashboard-engine-state ${state.toLowerCase()}`}>{stateIcon}{state}</span>
      </div>
      <div className="dashboard-card-heading">
        <h3>{name}</h3>
        <p>{subtitle}</p>
      </div>
      {metrics && engine ? (
        <>
          <div className="dashboard-card-result">
            <span>Net result</span>
            <strong className={pnlClass(net ?? 0)}>{signedMoney(net ?? 0)}</strong>
          </div>
          <dl className="dashboard-card-details">
            <div><dt>Win rate</dt><dd>{metrics.closed_trades ? `${metrics.win_rate.toFixed(1)}%` : "--"}</dd></div>
            <div><dt>Open / closed</dt><dd>{metrics.open_positions} / {metrics.closed_trades}</dd></div>
            <div><dt>Equity</dt><dd>{money(metrics.equity)}</dd></div>
            <div><dt>Timeframe</dt><dd>{formatTimeframe(engine.timeframe)}{engine.timeframe_mode === "auto" ? " · auto" : ""}</dd></div>
            <div><dt>Coverage</dt><dd>{engine.scanned_symbols ? `${engine.scanned_symbols} symbols` : "Waiting"}</dd></div>
            <div><dt>Last cycle</dt><dd>{engine.last_cycle_at ? dateTime(engine.last_cycle_at) : "Waiting"}</dd></div>
          </dl>
        </>
      ) : (
        <div className="dashboard-card-loading"><Clock3 size={14} /> Connecting to this virtual ledger</div>
      )}
      <button className="dashboard-card-link" type="button" onClick={() => onOpenPanel(panelId)}>
        View detailed results <ChevronRight size={14} />
      </button>
    </article>
  );
}

function StrategyLabCard({ snapshot, onOpenPanel }: { snapshot?: StrategyLabSnapshot; onOpenPanel: (panelId: string) => void }) {
  const strategies = snapshot?.strategies ?? [];
  const closed = strategies.reduce((total, strategy) => total + strategy.portfolio.metrics.closed_trades, 0);
  const wins = strategies.reduce((total, strategy) => total + strategy.portfolio.metrics.winning_trades, 0);
  const open = strategies.reduce((total, strategy) => total + strategy.portfolio.metrics.open_positions, 0);
  const net = strategies.reduce(
    (total, strategy) => total + strategy.portfolio.metrics.realized_pnl + strategy.portfolio.metrics.unrealized_pnl,
    0
  );
  const leader = strategies.find((strategy) => strategy.id === snapshot?.leader_strategy_id) ?? strategies[0];

  return (
    <article className="dashboard-trader-card lab">
      <div className="dashboard-card-topline">
        <span className="dashboard-card-icon"><BrainCircuit size={17} /></span>
        <span className={`dashboard-engine-state ${snapshot ? "running" : "loading"}`}><Activity size={11} />{snapshot ? "Comparing" : "Loading"}</span>
      </div>
      <div className="dashboard-card-heading">
        <h3>Strategy Lab</h3>
        <p>Competing paper rules learning from shared observations</p>
      </div>
      {snapshot ? (
        <>
          <div className="dashboard-card-result">
            <span>Combined net result</span>
            <strong className={pnlClass(net)}>{signedMoney(net)}</strong>
          </div>
          <dl className="dashboard-card-details">
            <div><dt>Strategies</dt><dd>{strategies.length}</dd></div>
            <div><dt>Win rate</dt><dd>{closed ? `${(wins / closed * 100).toFixed(1)}%` : "--"}</dd></div>
            <div><dt>Open / closed</dt><dd>{open} / {closed}</dd></div>
            <div><dt>Timeframe</dt><dd>{formatTimeframe(snapshot.timeframe)}</dd></div>
            <div><dt>Leader</dt><dd>{leader?.name ?? "Waiting"}</dd></div>
            <div><dt>Last scan</dt><dd>{dateTime(snapshot.generated_at)}</dd></div>
          </dl>
        </>
      ) : (
        <div className="dashboard-card-loading"><Clock3 size={14} /> Connecting to strategy comparison</div>
      )}
      <button className="dashboard-card-link" type="button" onClick={() => onOpenPanel("strategy-lab")}>
        View strategy comparison <ChevronRight size={14} />
      </button>
    </article>
  );
}

function DashboardKpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: number }) {
  return (
    <div className="dashboard-kpi">
      <span>{label}</span>
      <strong className={tone === undefined ? "" : pnlClass(tone)}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function formatTimeframe(value: string) {
  const labels: Record<string, string> = {
    "1m": "1m (M1)",
    "5m": "5m (M5)",
    "15m": "15m (M15)",
    "1h": "1h (H1)",
    "4h": "4h (H4)",
    "1d": "1d (D1)"
  };
  return labels[value] ?? value;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const moneyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
function money(value: number) { return moneyFormatter.format(value); }
function signedMoney(value: number) { return `${value > 0 ? "+" : ""}${money(value)}`; }
function signedPercent(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function pnlClass(value: number) { return value > 0 ? "positive" : value < 0 ? "negative" : "neutral"; }
