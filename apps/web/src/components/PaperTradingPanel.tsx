import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Database,
  FlaskConical,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  ShieldCheck,
  StickyNote
} from "lucide-react";
import type {
  ManualPaperTradeRequest,
  PaperControl,
  PaperEquityPoint,
  PaperPortfolio,
  PaperTrade
} from "../types";

type PaperTab = "open" | "history" | "daily" | "learning" | "log";
type PaperTradingVariant = "market" | "manual" | "jdub" | "rigorgate" | "extreme" | "candlestick" | "candlestick-buy" | "candlestick-sell" | "video-strategy";

interface PaperTradingPanelProps {
  variant?: PaperTradingVariant;
  portfolio?: PaperPortfolio;
  busy: boolean;
  error: string;
  onControl: (control: PaperControl) => void;
  onRun: () => void;
  onClose: (tradeId: string) => void;
  onReset: () => void;
  onBackToDashboard: () => void;
  onManualOpen?: (request: ManualPaperTradeRequest) => void;
  onNoteSave?: (tradeId: string, note: string) => void;
  manualSymbols?: string[];
  manualSymbol?: string;
  manualPrice?: number;
  manualTimeframe?: PaperControl["timeframe"];
  liveChart?: ReactNode;
}

export function PaperTradingPanel({
  variant = "market",
  portfolio,
  busy,
  error,
  onControl,
  onRun,
  onClose,
  onReset,
  onBackToDashboard,
  onManualOpen,
  onNoteSave,
  manualSymbols = [],
  manualSymbol: selectedManualSymbol,
  manualPrice,
  manualTimeframe = "1m",
  liveChart
}: PaperTradingPanelProps) {
  const [tab, setTab] = useState<PaperTab>("open");
  const [manualDirection, setManualDirection] = useState<ManualPaperTradeRequest["direction"]>("buy");
  const [manualSymbol, setManualSymbol] = useState(selectedManualSymbol ?? "");
  const [manualVolume, setManualVolume] = useState("1");
  const [manualEntry, setManualEntry] = useState(manualPrice?.toString() ?? "");
  const [manualEntryDirty, setManualEntryDirty] = useState(false);
  const [manualStopLoss, setManualStopLoss] = useState("");
  const [manualTakeProfit, setManualTakeProfit] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (selectedManualSymbol) setManualSymbol(selectedManualSymbol);
    if (!manualEntryDirty) setManualEntry(manualPrice === undefined ? "" : String(manualPrice));
  }, [manualEntryDirty, manualPrice, selectedManualSymbol]);
  const manual = variant === "manual";
  const extreme = variant === "extreme";
  const jdub = variant === "jdub";
  const rigorgate = variant === "rigorgate";
  const candlestickBuy = variant === "candlestick-buy";
  const candlestickSell = variant === "candlestick-sell";
  const candlestick = variant === "candlestick" || candlestickBuy || candlestickSell;
  const videoStrategy = variant === "video-strategy";
  const candlestickName = candlestickBuy
    ? "Bullish Engulfing BUY Bot"
    : candlestickSell
      ? "Bearish Engulfing SELL Bot"
      : "Candlestick Main BUY + SELL Bot";
  const candlestickDescription = candlestickBuy
    ? "Confirmed Bullish Engulfing virtual trades with no real money"
    : candlestickSell
      ? "Confirmed Bearish Engulfing virtual trades with no real money"
      : "Bullish and bearish engulfing virtual trades with no real money";
  const candlestickRules = candlestickBuy
    ? "Bullish engulfing opens BUY; ATR sets SL and 1.35R sets TP"
    : candlestickSell
      ? "Bearish engulfing opens SELL; ATR sets SL and 1.35R sets TP"
      : "Bullish engulfing opens BUY; bearish engulfing opens SELL; ATR sets SL and 1.35R sets TP";
  const candlestickFilter = candlestickBuy
    ? "Bullish engulfing -> BUY"
    : candlestickSell
      ? "Bearish engulfing -> SELL"
      : "Bullish / bearish engulfing -> BUY / SELL";
  const engine = portfolio?.engine;
  const metrics = portfolio?.metrics;
  const panelId = manual ? "manual-trading" : extreme ? "extreme-paper-trading" : jdub ? "jdub-trading" : rigorgate ? "rigorgate-trading" : candlestickBuy ? "candlestick-buy-trading" : candlestickSell ? "candlestick-sell-trading" : candlestick ? "candlestick-trading" : videoStrategy ? "video-strategy-trading" : "paper-trading";

  return (
    <section className={`paper-workspace ${manual ? "manual-bot-workspace" : ""}`} id={panelId} aria-label={manual ? "Manual virtual trading" : extreme ? "Extreme virtual trading" : jdub ? "Jdub Traders virtual trading" : rigorgate ? "RigorGate virtual trading" : candlestick ? `${candlestickName} virtual trading` : videoStrategy ? "Video MA and MTF MACD virtual trading" : "Virtual paper trading"}>
      <header className="paper-header">
        <div className="paper-title">
          <span className="paper-title-icon"><FlaskConical size={19} /></span>
          <div>
            <h2>{manual ? "Manual Trading Bot" : extreme ? "Extreme Virtual Trading" : jdub ? "Jdub Traders" : rigorgate ? "RigorGate" : candlestick ? candlestickName : videoStrategy ? "Video MA + MTF MACD Bot" : "Virtual Trading"}</h2>
            <span>{manual ? "Operator-controlled entries with live price monitoring · no real money" : extreme ? "Confirmed 85/15 reversal simulation with no real money" : jdub ? "New York opening-range simulation with no real money" : rigorgate ? "BUY / WAIT / SELL evidence-gated simulation with no real money" : candlestick ? candlestickDescription : videoStrategy ? "Video-derived EMA and multi-timeframe MACD simulation with no real money" : "Automatic whole-market simulation · configurable timeframe"}</span>
          </div>
          <span className="paper-timeframe-badge">
            Timeframe {engine ? formatTimeframe(engine.timeframe) : "--"}
            {engine?.timeframe_mode === "auto" ? " · Auto-selected" : ""}
          </span>
        </div>
        <div className="paper-actions">
          <button
            className="icon-button paper-collapse-button"
            type="button"
            title={collapsed ? "Expand bot" : "Fold bot"}
            aria-label={collapsed ? "Expand bot" : "Fold bot"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <button className="icon-text dashboard-return" type="button" onClick={onBackToDashboard}>
            <ArrowUp size={14} />
            Dashboard
          </button>
          <label className="paper-toggle">
            <input
              type="checkbox"
              checked={Boolean(engine?.enabled)}
              disabled={busy || !engine}
              onChange={(event) => onControl({ enabled: event.target.checked })}
            />
            <span className="toggle-track" aria-hidden="true"><span /></span>
            <span>{engine?.enabled ? manual ? "Monitoring on" : "Auto running" : manual ? "Monitoring paused" : "Paused"}</span>
          </label>
          <button className="icon-text" type="button" disabled={busy} onClick={onRun}>
            {busy ? <RefreshCcw className="spin" size={15} /> : <Play size={15} />}
            Run now
          </button>
          <button
            className="icon-button"
            type="button"
            title={manual ? "Reset manual virtual portfolio" : extreme ? "Reset extreme virtual portfolio" : jdub ? "Reset Jdub Traders virtual portfolio" : rigorgate ? "Reset RigorGate virtual portfolio" : candlestick ? `Reset ${candlestickName} virtual portfolio` : videoStrategy ? "Reset Video MA + MTF MACD virtual portfolio" : "Reset virtual portfolio"}
            aria-label={manual ? "Reset manual virtual portfolio" : extreme ? "Reset extreme virtual portfolio" : jdub ? "Reset Jdub Traders virtual portfolio" : rigorgate ? "Reset RigorGate virtual portfolio" : candlestick ? `Reset ${candlestickName} virtual portfolio` : videoStrategy ? "Reset Video MA + MTF MACD virtual portfolio" : "Reset virtual portfolio"}
            disabled={busy}
            onClick={onReset}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      {!collapsed && <div className="paper-body">
        <div className={`paper-status ${engine?.last_error || error ? "error" : engine?.enabled ? "running" : ""}`}>
        {engine?.enabled ? <Activity size={15} /> : <CircleStop size={15} />}
        <strong>{engine?.enabled ? manual ? "Live price monitoring" : "Scanning and simulating" : manual ? "Manual monitor paused" : "Virtual engine paused"}</strong>
        <span>
          {error || engine?.last_error || (manual ? "Entries are opened only when you submit them." : cycleSummary(portfolio, extreme))}
        </span>
        <b>Virtual only</b>
        {portfolio?.persistence && (
          <b
            className={`paper-save-state ${portfolio.persistence.status}`}
            title="Virtual trades and learning records are stored on the API server."
          >
            <Database size={12} />
            {portfolio.persistence.status === "saved" ? "Saved" : portfolio.persistence.status}
          </b>
        )}
      </div>

      {liveChart}

      {(variant === "market" || manual) && onManualOpen && (
        <ManualTradeForm
          busy={busy}
          direction={manualDirection}
          symbol={manualSymbol}
          symbols={manualSymbols}
          volume={manualVolume}
          entry={manualEntry}
          stopLoss={manualStopLoss}
          takeProfit={manualTakeProfit}
          note={manualNote}
          timeframe={manualTimeframe}
          onDirectionChange={setManualDirection}
          onSymbolChange={setManualSymbol}
          onVolumeChange={setManualVolume}
          onEntryChange={(value) => {
            setManualEntry(value);
            setManualEntryDirty(true);
          }}
          onStopLossChange={setManualStopLoss}
          onTakeProfitChange={setManualTakeProfit}
          onNoteChange={setManualNote}
          onSubmit={() => {
            const entry = manualEntry.trim() ? Number(manualEntry) : undefined;
            onManualOpen({
              symbol: manualSymbol.trim(),
              direction: manualDirection,
              volume: Number(manualVolume),
              entry,
              stop_loss: Number(manualStopLoss),
              take_profit: Number(manualTakeProfit),
              timeframe: manualTimeframe,
              note: manualNote
            });
          }}
        />
      )}

      {metrics && engine ? (
        <>
          <div className="paper-metrics" aria-label={manual ? "Manual virtual trading performance" : extreme ? "Extreme virtual trading performance" : jdub ? "Jdub Traders virtual trading performance" : rigorgate ? "RigorGate virtual trading performance" : candlestick ? `${candlestickName} performance` : videoStrategy ? "Video MA and MTF MACD performance" : "Paper trading performance"}>
            <PaperMetric label="Virtual equity" value={money(metrics.equity)} change={metrics.total_return_pct} />
            <PaperMetric label={extreme ? "Profit since signals" : "Net result"} value={signedMoney(metrics.realized_pnl + metrics.unrealized_pnl)} />
            <PaperMetric label="Open / closed" value={`${metrics.open_positions} / ${metrics.closed_trades}`} />
            <PaperMetric label="Win rate" value={`${metrics.win_rate.toFixed(1)}%`} />
            <PaperMetric label="Profit factor" value={metrics.profit_factor?.toFixed(2) ?? "--"} />
            <PaperMetric label="Max drawdown" value={`${metrics.max_drawdown_pct.toFixed(2)}%`} negative />
            <PaperMetric label="Average result" value={`${metrics.average_r_multiple.toFixed(2)}R`} />
            <PaperMetric label="Open risk" value={money(metrics.open_risk_amount)} />
          </div>

          <div className="paper-overview">
            <div className="equity-area">
              <div className="paper-subheading">
                <div>
                  <strong>Equity curve</strong>
                  <span>{portfolio.equity_curve.length} recorded cycles</span>
                </div>
                <div className="equity-legend">
                  <span><i className="equity-line" /> Equity</span>
                  <span><i className="balance-line" /> Closed balance</span>
                </div>
              </div>
              <EquityCurve points={portfolio.equity_curve} startingBalance={metrics.starting_balance} />
            </div>
            <div className="simulation-assumptions">
              <div className="paper-subheading">
                <div>
                  <strong>Simulation rules</strong>
                <span>{manual ? "Only operator-submitted entries; live MT5 prices manage exits" : extreme ? "Applied only after RSI(1), MACD, and MA confirmation" : jdub ? "15m New York range, 5m close, then 1m trigger" : rigorgate ? "BUY opens a long; WAIT does nothing; SELL closes a matching long" : candlestick ? candlestickRules : videoStrategy ? "EMA(200) regime · EMA(9/36) direction · higher-timeframe MACD · 2R target" : "Applied to every eligible directional signal on the selected timeframe"}</span>
                </div>
              </div>
              <dl>
                <div><dt>Market coverage</dt><dd>{engine.scanned_symbols || "--"} instruments</dd></div>
                <div><dt>Entry filter</dt><dd>{manual ? "Operator controlled" : extreme ? `Confirmed 85/15 · score ${engine.minimum_opportunity_score}+` : jdub ? `Opening range · score ${engine.minimum_opportunity_score}+` : rigorgate ? `BUY / SELL gate · score ${engine.minimum_opportunity_score}+` : candlestick ? `${candlestickFilter} · score ${engine.minimum_opportunity_score}+` : videoStrategy ? `EMA + MTF MACD · score ${engine.minimum_opportunity_score}+` : engine.minimum_opportunity_score === 0 ? "All strategy signals" : `Score ${engine.minimum_opportunity_score}+`}</dd></div>
                <div><dt>Risk per trade</dt><dd>{engine.risk_per_trade_pct.toFixed(2)}%</dd></div>
                <div><dt>Position limit</dt><dd>{engine.max_open_positions}</dd></div>
                <div><dt>Cycle</dt><dd>{engine.timeframe_mode === "auto" ? `Auto · ${engine.timeframe}` : engine.timeframe} / {engine.cycle_interval_seconds}s</dd></div>
                <div><dt>Costs</dt><dd>{money(metrics.fees_paid)} recorded</dd></div>
                <div><dt>Paper learning</dt><dd>{portfolio.learning.observations} outcomes</dd></div>
              </dl>
            </div>
          </div>

          {!manual && <details className="paper-settings">
            <summary>Simulation controls</summary>
            <div className="paper-settings-grid">
              <label>
                <span>Timeframe selection</span>
                <select
                  value={engine.timeframe_mode}
                  disabled={busy}
                  onChange={(event) => onControl({ timeframe_mode: event.target.value as PaperControl["timeframe_mode"] })}
                >
                  <option value="auto">Automatic · best available</option>
                  <option value="manual">Manual selection</option>
                </select>
              </label>
              <label>
                <span>Timeframe</span>
                <select
                  value={engine.timeframe}
                  disabled={busy || engine.timeframe_mode === "auto"}
                  onChange={(event) => onControl({
                    timeframe: event.target.value as PaperControl["timeframe"],
                    timeframe_mode: "manual"
                  })}
                >
                  {(["1m", "5m", "15m", "1h", "4h", "1d"] as const).map((item) => (
                    <option value={item} key={item}>{item}</option>
                  ))}
                </select>
                {jdub && <small className="field-note">M1 preserves the original setup; higher timeframes use the timeframe-aware opening-range adaptation.</small>}
              </label>
              <label>
                <span>Minimum opportunity score <b>{engine.minimum_opportunity_score.toFixed(0)}</b></span>
                <input
                  type="range"
                    min={extreme ? "70" : jdub ? "50" : videoStrategy ? "68" : "0"}
                    max={extreme || jdub || videoStrategy ? "100" : "80"}
                  step="5"
                  value={engine.minimum_opportunity_score}
                  disabled={busy}
                  onChange={(event) => onControl({ minimum_opportunity_score: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Maximum open positions</span>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={engine.max_open_positions}
                  disabled={busy}
                  onChange={(event) => onControl({ max_open_positions: Number(event.target.value) })}
                />
              </label>
            </div>
          </details>}

          <div className="paper-ledger-heading">
            <div className="segmented paper-tabs" aria-label="Virtual trading records">
              <button className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>
                Open <span>{metrics.open_positions}</span>
              </button>
              <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
                History <span>{metrics.closed_trades}</span>
              </button>
              <button className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}>
                Daily <span>{portfolio.daily_reports.length}</span>
              </button>
              <button className={tab === "learning" ? "active" : ""} onClick={() => setTab("learning")}>
                Learning <span>{portfolio.learning.observations}</span>
              </button>
              <button className={tab === "log" ? "active" : ""} onClick={() => setTab("log")}>
                Decision log <span>{portfolio.decisions.length}</span>
              </button>
            </div>
            <span className="ledger-update">
              Last cycle {engine.last_cycle_at ? time(engine.last_cycle_at) : "waiting"}
            </span>
          </div>

          {tab === "open" && (
            <OpenTrades trades={portfolio.open_positions} onClose={onClose} onNoteSave={onNoteSave} busy={busy} extreme={extreme} manual={manual} />
          )}
          {tab === "history" && <TradeHistory trades={portfolio.closed_trades} extreme={extreme} onNoteSave={onNoteSave} />}
          {tab === "daily" && <DailyReport reports={portfolio.daily_reports} />}
          {tab === "learning" && <LearningPanel learning={portfolio.learning} />}
          {tab === "log" && (
            <div className="decision-log">
              {portfolio.decisions.length ? portfolio.decisions.map((decision) => (
                <article className={`decision-row ${decision.action}`} key={decision.id}>
                  <time>{dateTime(decision.created_at)}</time>
                  <strong>{decision.symbol ?? decision.action}</strong>
                  <span>{decision.outcome}</span>
                  <p>{decision.reason}</p>
                </article>
              )) : <PaperEmpty text="The first scan cycle will create the decision log." />}
            </div>
          )}

          <footer className="paper-footnote">
            <ShieldCheck size={14} />
            <span>{portfolio.disclaimer}</span>
          </footer>
        </>
      ) : (
        <PaperEmpty text="Connecting to the virtual portfolio." />
      )}
      </div>}
    </section>
  );
}

function DailyReport({ reports }: { reports: PaperPortfolio["daily_reports"] }) {
  if (!reports.length) return <PaperEmpty text="Daily results will appear after the first virtual trade closes." />;
  return (
    <div className="daily-report">
      <div className="daily-report-summary">
        <strong>UTC close-day report</strong>
        <span>Only closed virtual trades are included. Amounts include simulated fees.</span>
      </div>
      <div className="paper-table-wrap">
        <table className="paper-table daily-report-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Win rate</th>
              <th>Win amount</th>
              <th>Loss amount</th>
              <th>Net</th>
              <th>Net %</th>
              <th>Profit factor</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.date}>
                <td><strong>{reportDate(report.date)}</strong><span>Close day · {money(report.closing_balance)} balance</span></td>
                <td className="positive"><strong>{report.winning_trades}</strong><span>{money(report.winning_amount)} / {report.winning_pct.toFixed(3)}%</span></td>
                <td className="negative"><strong>{report.losing_trades}</strong><span>{money(report.losing_amount)} / {report.losing_pct.toFixed(3)}%</span></td>
                <td>{report.win_rate_pct.toFixed(1)}%</td>
                <td className="positive">{money(report.winning_amount)}</td>
                <td className="negative">{money(report.losing_amount)}</td>
                <td className={pnlClass(report.net_pnl)}><strong>{signedMoney(report.net_pnl)}</strong><span>{money(report.fees_paid)} fees</span></td>
                <td className={pnlClass(report.net_return_pct)}>{report.net_return_pct >= 0 ? "+" : ""}{report.net_return_pct.toFixed(3)}%</td>
                <td>{report.profit_factor?.toFixed(2) ?? "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LearningPanel({ learning }: { learning: PaperPortfolio["learning"] }) {
  return (
    <div className="learning-workspace">
      <header className="learning-header">
        <div>
          <strong><BrainCircuit size={15} /> {learning.mode}</strong>
          <span>Losses are recorded as faults; only the paper-entry overlay can adapt.</span>
        </div>
        <span className="learning-count">{learning.observations} outcomes · {learning.wins} wins · {learning.losses} losses</span>
      </header>
      <div className="learning-recommendation">
        <strong>Current recommendation</strong>
        <p>{learning.recommendation}</p>
      </div>
      <div className="learning-plan">
        <strong>How it will adapt next</strong>
        <p>{learning.future_plan}</p>
      </div>
      {learning.last_fault && (
        <div className="learning-fault">
          <strong>Latest fault to review</strong>
          <span>{learning.last_fault}</span>
        </div>
      )}
      {learning.factor_performance.length ? (
        <div className="learning-factor-table">
          {learning.factor_performance.map((factor) => (
            <div className="learning-factor-row" key={factor.factor}>
              <strong>{factor.factor}</strong>
              <span>{factor.samples} samples</span>
              <span>{factor.wins}W / {factor.losses}L</span>
              <b className={factor.win_rate >= 60 ? "positive" : factor.win_rate < 45 ? "negative" : "neutral"}>
                {factor.win_rate.toFixed(1)}%
              </b>
              <span>{factor.average_r_multiple.toFixed(2)}R avg</span>
            </div>
          ))}
        </div>
      ) : (
        <PaperEmpty text="Completed virtual trades will teach the paper overlay which factors deserve more or less weight." />
      )}
      <div className="learning-lessons">
        <div className="learning-lessons-heading">
          <strong>Recent fault lessons</strong>
          <span>Latest non-positive outcomes</span>
        </div>
        {learning.lessons.length ? learning.lessons.map((lesson) => (
          <article className="learning-lesson" key={lesson.trade_id}>
            <header>
              <strong>{lesson.symbol} · {lesson.direction}</strong>
              <span>{dateTime(lesson.observed_at)} · {lesson.r_multiple.toFixed(2)}R · {lesson.exit_reason.replaceAll("_", " ")}</span>
            </header>
            <p><b>Fault</b>{lesson.fault}</p>
            <p><b>Future action</b>{lesson.future_action}</p>
            <div className="learning-factors">{lesson.factors.map((factor) => <span key={factor}>{factor}</span>)}</div>
          </article>
        )) : <PaperEmpty text="Loss lessons will appear after a virtual position closes at or below break-even." />}
      </div>
      <footer className="learning-footnote">
        <ShieldCheck size={13} />
        <span>Learning stays inside paper trading. It never changes the deterministic live strategy or unlocks MT5 orders.</span>
      </footer>
    </div>
  );
}

interface ManualTradeFormProps {
  busy: boolean;
  direction: ManualPaperTradeRequest["direction"];
  symbol: string;
  symbols: string[];
  volume: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  note: string;
  timeframe: ManualPaperTradeRequest["timeframe"];
  onDirectionChange: (direction: ManualPaperTradeRequest["direction"]) => void;
  onSymbolChange: (value: string) => void;
  onVolumeChange: (value: string) => void;
  onEntryChange: (value: string) => void;
  onStopLossChange: (value: string) => void;
  onTakeProfitChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
}

function ManualTradeForm({
  busy,
  direction,
  symbol,
  symbols,
  volume,
  entry,
  stopLoss,
  takeProfit,
  note,
  timeframe,
  onDirectionChange,
  onSymbolChange,
  onVolumeChange,
  onEntryChange,
  onStopLossChange,
  onTakeProfitChange,
  onNoteChange,
  onSubmit
}: ManualTradeFormProps) {
  return (
    <section className="manual-trade-panel" aria-label="Manual paper trading">
      <div className="manual-trade-heading">
        <div>
          <strong><StickyNote size={15} /> Manual paper trade</strong>
          <span>Pause the bot to trade entirely yourself, or keep it running alongside your entries.</span>
        </div>
        <b>Virtual only · {formatTimeframe(timeframe)}</b>
      </div>
      <form
        className="manual-trade-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label>
          <span>Symbol</span>
          <input
            list="manual-symbol-options"
            value={symbol}
            required
            maxLength={40}
            placeholder="XAUUSD"
            onChange={(event) => onSymbolChange(event.target.value)}
          />
          <datalist id="manual-symbol-options">
            {symbols.map((item) => <option value={item} key={item} />)}
          </datalist>
        </label>
        <div className="manual-direction-field">
          <span>Direction</span>
          <div className="segmented manual-direction" aria-label="Manual trade direction">
            <button type="button" className={direction === "buy" ? "active buy" : "buy"} onClick={() => onDirectionChange("buy")}>BUY</button>
            <button type="button" className={direction === "sell" ? "active sell" : "sell"} onClick={() => onDirectionChange("sell")}>SELL</button>
          </div>
        </div>
        <label>
          <span>Volume</span>
          <input type="number" min="0.00000001" step="any" value={volume} required onChange={(event) => onVolumeChange(event.target.value)} />
        </label>
        <label>
          <span>Entry price <small>(blank = current)</small></span>
          <input type="number" min="0.00000001" step="any" value={entry} placeholder="Current price" onChange={(event) => onEntryChange(event.target.value)} />
        </label>
        <label>
          <span>Stop-loss</span>
          <input type="number" min="0.00000001" step="any" value={stopLoss} required placeholder={direction === "buy" ? "Below entry" : "Above entry"} onChange={(event) => onStopLossChange(event.target.value)} />
        </label>
        <label>
          <span>Take-profit</span>
          <input type="number" min="0.00000001" step="any" value={takeProfit} required placeholder={direction === "buy" ? "Above entry" : "Below entry"} onChange={(event) => onTakeProfitChange(event.target.value)} />
        </label>
        <label className="manual-note-field">
          <span>Trade note</span>
          <input type="text" maxLength={2000} value={note} placeholder="Why am I taking this trade?" onChange={(event) => onNoteChange(event.target.value)} />
        </label>
        <div className="manual-trade-submit">
          <span>Stops are required and saved with the trade.</span>
          <button className={`icon-text ${direction === "buy" ? "buy-button" : "sell-button"}`} type="submit" disabled={busy}>
            {busy ? <RefreshCcw className="spin" size={15} /> : <Play size={15} />}
            Open virtual {direction.toUpperCase()}
          </button>
        </div>
      </form>
    </section>
  );
}

function OpenTrades({ trades, onClose, onNoteSave, busy, extreme, manual }: { trades: PaperTrade[]; onClose: (id: string) => void; onNoteSave?: (tradeId: string, note: string) => void; busy: boolean; extreme: boolean; manual: boolean }) {
  if (!trades.length) return <PaperEmpty text={manual ? "No manual virtual positions are open. Submit a BUY or SELL above." : "No actionable signal is open. HOLD signals are observed but never entered."} />;
  return (
    <div className="paper-table-wrap">
      <table className="paper-table">
        <thead><tr><th>Market</th><th>Timeframe</th><th>{extreme ? "Signal entry / now" : "Entry / current"}</th><th>Stop / target</th><th>Virtual size</th><th>Result</th><th>Signal</th><th>{extreme ? "Since signal" : "Opened"}</th><th>Note</th><th /></tr></thead>
        <tbody>{trades.map((trade) => (
          <tr key={trade.id}>
            <td><strong>{trade.symbol}</strong><span className={`side ${trade.direction}`}>{trade.direction}</span></td>
            <td title={`Executed on ${trade.timeframe}`}><strong>{formatTimeframe(trade.timeframe)}</strong><span>Entry execution</span></td>
            <td>{price(extreme ? trade.signal_price ?? trade.entry_price : trade.entry_price)}<span>{extreme ? `Fill ${price(trade.entry_price)}` : price(trade.current_price)}</span>{extreme && <small>Now {price(trade.current_price)}</small>}</td>
            <td>{price(trade.stop_loss)}<span>{price(trade.take_profit)}</span></td>
            <td>{trade.quantity.toPrecision(5)}<span>{money(trade.risk_amount)} risk</span></td>
            <td className={pnlClass(trade.unrealized_pnl)}><strong>{signedMoney(trade.unrealized_pnl)}</strong><span>{trade.r_multiple.toFixed(2)}R</span></td>
            <td>{extreme && trade.signal_level ? <strong>{levelLabel(trade.signal_level)}</strong> : `${Math.round(trade.confidence * 100)}%`}<span title={trade.signal_recommendation ?? trade.reasons.join(" ")}>{extreme ? "Confirmed RSI + MACD + MA" : `Score ${trade.opportunity_score.toFixed(1)}`}</span></td>
            <td>{age(signalTime(trade))}<span>{dateTime(signalTime(trade))}</span></td>
            <td><NoteCell trade={trade} onSave={onNoteSave} busy={busy} /></td>
            <td><button className="icon-button compact-icon" title="Close virtual position" aria-label={`Close virtual ${trade.symbol} position`} disabled={busy} onClick={() => onClose(trade.id)}><CircleStop size={14} /></button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TradeHistory({ trades, extreme, onNoteSave }: { trades: PaperTrade[]; extreme: boolean; onNoteSave?: (tradeId: string, note: string) => void }) {
  if (!trades.length) return <PaperEmpty text="Completed virtual trades will appear here with their full result." />;
  return (
    <div className="paper-table-wrap">
      <table className="paper-table history-table">
        <thead><tr><th>Market</th><th>Timeframe</th><th>{extreme ? "Signal / fill / exit" : "Entry / exit price"}</th><th>Entered at</th><th>Exited at</th><th>Net result</th><th>Excursion</th><th>Costs</th><th>Exit reason</th><th>Duration</th><th>Note</th></tr></thead>
        <tbody>{trades.map((trade) => (
          <tr key={trade.id}>
            <td><strong>{trade.symbol}</strong><span className={`side ${trade.direction}`}>{trade.direction}</span></td>
            <td title={`Executed on ${trade.timeframe}`}><strong>{formatTimeframe(trade.timeframe)}</strong><span>Entry execution</span></td>
            <td>{extreme && trade.signal_level ? levelLabel(trade.signal_level) : price(trade.entry_price)}<span>{extreme ? `${price(trade.signal_price ?? trade.entry_price)} fill ${price(trade.entry_price)}` : price(trade.exit_price)}</span>{extreme && <small>Exit {price(trade.exit_price)}</small>}</td>
            <td className="trade-event-time" title={`${new Date(trade.opened_at).toISOString()} UTC`}><strong>{exactDateTime(trade.opened_at)}</strong><span>{timeZoneLabel()}</span></td>
            <td className="trade-event-time" title={trade.closed_at ? `${new Date(trade.closed_at).toISOString()} UTC` : "Trade is still open"}>{trade.closed_at ? <strong>{exactDateTime(trade.closed_at)}</strong> : <strong>--</strong>}<span>{trade.closed_at ? timeZoneLabel() : "Not closed"}</span></td>
            <td className={pnlClass(trade.net_pnl)}><strong>{signedMoney(trade.net_pnl)}</strong><span>{trade.r_multiple.toFixed(2)}R / {trade.return_pct.toFixed(3)}%</span></td>
            <td>{signedMoney(trade.max_favorable_excursion)}<span>{signedMoney(trade.max_adverse_excursion)}</span></td>
            <td>{money(trade.entry_fee + trade.exit_fee)}<span>virtual fees</span></td>
            <td>{exitLabel(trade.exit_reason)}<span>{trade.closed_at ? "Exit recorded" : "Open"}</span></td>
            <td>{duration(trade.opened_at, trade.closed_at)}<span title={trade.signal_recommendation ?? trade.reasons.join(" ")}>{extreme ? `${exactDateTime(signalTime(trade))} signal` : `Score ${trade.opportunity_score.toFixed(1)}`}</span></td>
            <td><NoteCell trade={trade} onSave={onNoteSave} busy={false} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function NoteCell({ trade, onSave, busy }: { trade: PaperTrade; onSave?: (tradeId: string, note: string) => void; busy: boolean }) {
  const [draft, setDraft] = useState(trade.note);
  useEffect(() => setDraft(trade.note), [trade.note]);
  if (!onSave) return <span className="trade-note-readonly" title={trade.note}>{trade.note || "No note"}</span>;
  return (
    <div className="trade-note-editor">
      <input
        type="text"
        maxLength={2000}
        value={draft}
        placeholder="Add note"
        aria-label={`Note for ${trade.symbol} trade`}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        className="icon-button compact-icon"
        type="button"
        title="Save trade note"
        aria-label={`Save note for ${trade.symbol} trade`}
        disabled={busy || draft === trade.note}
        onClick={() => onSave(trade.id, draft)}
      >
        <Save size={13} />
      </button>
    </div>
  );
}

function EquityCurve({ points, startingBalance }: { points: PaperEquityPoint[]; startingBalance: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawEquity(canvas, points, startingBalance);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [points, startingBalance]);

  return <canvas className="equity-canvas" ref={canvasRef} aria-label="Virtual account equity curve" />;
}

function drawEquity(canvas: HTMLCanvasElement, points: PaperEquityPoint[], startingBalance: number) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, rect.width, rect.height);
  const padding = { top: 16, right: 14, bottom: 20, left: 54 };
  const width = Math.max(1, rect.width - padding.left - padding.right);
  const height = Math.max(1, rect.height - padding.top - padding.bottom);
  const values = points.length ? points : [{ timestamp: new Date().toISOString(), equity: startingBalance, balance: startingBalance, unrealized_pnl: 0 }];
  const allValues = values.flatMap((point) => [point.equity, point.balance, startingBalance]);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const range = Math.max(1, rawMax - rawMin);
  const min = rawMin - range * 0.15;
  const max = rawMax + range * 0.15;
  const x = (index: number) => padding.left + (values.length === 1 ? width : index / (values.length - 1) * width);
  const y = (value: number) => padding.top + (max - value) / (max - min) * height;

  context.strokeStyle = "#26313a";
  context.lineWidth = 1;
  context.fillStyle = "#7f8e9b";
  context.font = "10px system-ui";
  context.textAlign = "right";
  for (let index = 0; index < 4; index += 1) {
    const value = min + (max - min) * (index / 3);
    const lineY = y(value);
    context.beginPath();
    context.moveTo(padding.left, lineY);
    context.lineTo(rect.width - padding.right, lineY);
    context.stroke();
    context.fillText(`$${value.toFixed(0)}`, padding.left - 7, lineY + 3);
  }
  drawLine(context, values.map((point) => point.balance), x, y, "#697785");
  drawLine(context, values.map((point) => point.equity), x, y, "#2ed8a3");
}

function drawLine(
  context: CanvasRenderingContext2D,
  values: number[],
  x: (index: number) => number,
  y: (value: number) => number,
  color: string
) {
  context.beginPath();
  values.forEach((value, index) => {
    if (index === 0) context.moveTo(x(index), y(value));
    else context.lineTo(x(index), y(value));
  });
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
}

function PaperMetric({ label, value, change, negative = false }: { label: string; value: string; change?: number; negative?: boolean }) {
  return <div className="paper-metric"><span>{label}</span><strong className={negative ? "negative" : change === undefined ? "" : pnlClass(change)}>{value}</strong>{change !== undefined && <small className={pnlClass(change)}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small>}</div>;
}

function PaperEmpty({ text }: { text: string }) {
  return <div className="paper-empty"><Activity size={16} /><span>{text}</span></div>;
}

function cycleSummary(portfolio?: PaperPortfolio, extreme = false) {
  const engine = portfolio?.engine;
  if (!engine) return "Loading the virtual portfolio.";
  if (!engine.last_cycle_at) return "The first whole-market simulation cycle is waiting to run.";
  const timeframe = `${formatTimeframe(engine.timeframe)}${engine.timeframe_mode === "auto" ? " · auto-selected" : ""}`;
  return `${engine.scanned_symbols} scanned on ${timeframe}, ${engine.eligible_candidates} confirmed, ${engine.opened_last_cycle} opened and ${engine.closed_last_cycle} closed in the last cycle${extreme ? " from threshold signals" : ""}.`;
}

const moneyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
function money(value: number) { return moneyFormatter.format(value); }
function signedMoney(value: number) { return `${value > 0 ? "+" : ""}${money(value)}`; }
function pnlClass(value: number) { return value > 0 ? "positive" : value < 0 ? "negative" : "neutral"; }
function price(value: number | null) { return value === null ? "--" : value.toLocaleString(undefined, { maximumFractionDigits: 8 }); }
function time(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)); }
function dateTime(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function exactDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }
function timeZoneLabel() { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
function age(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`; }
function duration(start: string, end: string | null) { if (!end) return age(start); const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)); return seconds < 3600 ? `${Math.max(1, Math.floor(seconds / 60))}m` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`; }
function exitLabel(reason: PaperTrade["exit_reason"]) { return reason ? reason.replaceAll("_", " ") : "--"; }
function signalTime(trade: PaperTrade) { return trade.signal_at ?? trade.opened_at; }
function levelLabel(level: string) { return level === "upper_85" ? "85.00 / sell" : level === "lower_15" ? "15.00 / buy" : level; }
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
function reportDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
