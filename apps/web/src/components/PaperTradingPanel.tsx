import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CircleStop,
  FlaskConical,
  Play,
  RefreshCcw,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import type { PaperControl, PaperEquityPoint, PaperPortfolio, PaperTrade } from "../types";

type PaperTab = "open" | "history" | "log";

interface PaperTradingPanelProps {
  portfolio?: PaperPortfolio;
  busy: boolean;
  error: string;
  onControl: (control: PaperControl) => void;
  onRun: () => void;
  onClose: (tradeId: string) => void;
  onReset: () => void;
}

export function PaperTradingPanel({
  portfolio,
  busy,
  error,
  onControl,
  onRun,
  onClose,
  onReset
}: PaperTradingPanelProps) {
  const [tab, setTab] = useState<PaperTab>("open");
  const engine = portfolio?.engine;
  const metrics = portfolio?.metrics;

  return (
    <section className="paper-workspace" id="paper-trading" aria-label="Virtual paper trading">
      <header className="paper-header">
        <div className="paper-title">
          <span className="paper-title-icon"><FlaskConical size={19} /></span>
          <div>
            <h2>Virtual Trading</h2>
            <span>Automatic whole-market simulation with no real money</span>
          </div>
        </div>
        <div className="paper-actions">
          <label className="paper-toggle">
            <input
              type="checkbox"
              checked={Boolean(engine?.enabled)}
              disabled={busy || !engine}
              onChange={(event) => onControl({ enabled: event.target.checked })}
            />
            <span className="toggle-track" aria-hidden="true"><span /></span>
            <span>{engine?.enabled ? "Auto running" : "Paused"}</span>
          </label>
          <button className="icon-text" type="button" disabled={busy} onClick={onRun}>
            {busy ? <RefreshCcw className="spin" size={15} /> : <Play size={15} />}
            Run now
          </button>
          <button
            className="icon-button"
            type="button"
            title="Reset virtual portfolio"
            aria-label="Reset virtual portfolio"
            disabled={busy}
            onClick={onReset}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      <div className={`paper-status ${engine?.last_error || error ? "error" : engine?.enabled ? "running" : ""}`}>
        {engine?.enabled ? <Activity size={15} /> : <CircleStop size={15} />}
        <strong>{engine?.enabled ? "Scanning and simulating" : "Virtual engine paused"}</strong>
        <span>
          {error || engine?.last_error || cycleSummary(portfolio)}
        </span>
        <b>Virtual only</b>
      </div>

      {metrics && engine ? (
        <>
          <div className="paper-metrics" aria-label="Paper trading performance">
            <PaperMetric label="Virtual equity" value={money(metrics.equity)} change={metrics.total_return_pct} />
            <PaperMetric label="Net result" value={signedMoney(metrics.realized_pnl + metrics.unrealized_pnl)} />
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
                  <span>Applied to every eligible directional signal</span>
                </div>
              </div>
              <dl>
                <div><dt>Market coverage</dt><dd>{engine.scanned_symbols || "--"} instruments</dd></div>
                <div><dt>Entry filter</dt><dd>{engine.minimum_opportunity_score === 0 ? "All strategy signals" : `Score ${engine.minimum_opportunity_score}+`}</dd></div>
                <div><dt>Risk per trade</dt><dd>{engine.risk_per_trade_pct.toFixed(2)}%</dd></div>
                <div><dt>Position limit</dt><dd>{engine.max_open_positions}</dd></div>
                <div><dt>Cycle</dt><dd>{engine.timeframe} / {engine.cycle_interval_seconds}s</dd></div>
                <div><dt>Costs</dt><dd>{money(metrics.fees_paid)} recorded</dd></div>
              </dl>
            </div>
          </div>

          <details className="paper-settings">
            <summary>Simulation controls</summary>
            <div className="paper-settings-grid">
              <label>
                <span>Timeframe</span>
                <select
                  value={engine.timeframe}
                  disabled={busy}
                  onChange={(event) => onControl({ timeframe: event.target.value as PaperControl["timeframe"] })}
                >
                  {(["1m", "5m", "15m", "1h", "4h", "1d"] as const).map((item) => (
                    <option value={item} key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Minimum opportunity score <b>{engine.minimum_opportunity_score.toFixed(0)}</b></span>
                <input
                  type="range"
                  min="0"
                  max="80"
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
          </details>

          <div className="paper-ledger-heading">
            <div className="segmented paper-tabs" aria-label="Virtual trading records">
              <button className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>
                Open <span>{metrics.open_positions}</span>
              </button>
              <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
                History <span>{metrics.closed_trades}</span>
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
            <OpenTrades trades={portfolio.open_positions} onClose={onClose} busy={busy} />
          )}
          {tab === "history" && <TradeHistory trades={portfolio.closed_trades} />}
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
    </section>
  );
}

function OpenTrades({ trades, onClose, busy }: { trades: PaperTrade[]; onClose: (id: string) => void; busy: boolean }) {
  if (!trades.length) return <PaperEmpty text="No actionable signal is open. HOLD signals are observed but never entered." />;
  return (
    <div className="paper-table-wrap">
      <table className="paper-table">
        <thead><tr><th>Market</th><th>Entry / current</th><th>Stop / target</th><th>Virtual size</th><th>Result</th><th>Signal</th><th>Opened</th><th /></tr></thead>
        <tbody>{trades.map((trade) => (
          <tr key={trade.id}>
            <td><strong>{trade.symbol}</strong><span className={`side ${trade.direction}`}>{trade.direction}</span></td>
            <td>{price(trade.entry_price)}<span>{price(trade.current_price)}</span></td>
            <td>{price(trade.stop_loss)}<span>{price(trade.take_profit)}</span></td>
            <td>{trade.quantity.toPrecision(5)}<span>{money(trade.risk_amount)} risk</span></td>
            <td className={pnlClass(trade.unrealized_pnl)}><strong>{signedMoney(trade.unrealized_pnl)}</strong><span>{trade.r_multiple.toFixed(2)}R</span></td>
            <td>{Math.round(trade.confidence * 100)}%<span title={trade.reasons.join(" ")}>Score {trade.opportunity_score.toFixed(1)}</span></td>
            <td>{age(trade.opened_at)}<span>{time(trade.opened_at)}</span></td>
            <td><button className="icon-button compact-icon" title="Close virtual position" aria-label={`Close virtual ${trade.symbol} position`} disabled={busy} onClick={() => onClose(trade.id)}><CircleStop size={14} /></button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TradeHistory({ trades }: { trades: PaperTrade[] }) {
  if (!trades.length) return <PaperEmpty text="Completed virtual trades will appear here with their full result." />;
  return (
    <div className="paper-table-wrap">
      <table className="paper-table history-table">
        <thead><tr><th>Market</th><th>Entry / exit</th><th>Net result</th><th>Excursion</th><th>Costs</th><th>Exit</th><th>Duration</th></tr></thead>
        <tbody>{trades.map((trade) => (
          <tr key={trade.id}>
            <td><strong>{trade.symbol}</strong><span className={`side ${trade.direction}`}>{trade.direction}</span></td>
            <td>{price(trade.entry_price)}<span>{price(trade.exit_price)}</span></td>
            <td className={pnlClass(trade.net_pnl)}><strong>{signedMoney(trade.net_pnl)}</strong><span>{trade.r_multiple.toFixed(2)}R / {trade.return_pct.toFixed(3)}%</span></td>
            <td>{signedMoney(trade.max_favorable_excursion)}<span>{signedMoney(trade.max_adverse_excursion)}</span></td>
            <td>{money(trade.entry_fee + trade.exit_fee)}<span>virtual fees</span></td>
            <td>{exitLabel(trade.exit_reason)}<span>{trade.closed_at ? dateTime(trade.closed_at) : "--"}</span></td>
            <td>{duration(trade.opened_at, trade.closed_at)}<span title={trade.reasons.join(" ")}>Score {trade.opportunity_score.toFixed(1)}</span></td>
          </tr>
        ))}</tbody>
      </table>
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

function cycleSummary(portfolio?: PaperPortfolio) {
  const engine = portfolio?.engine;
  if (!engine) return "Loading the virtual portfolio.";
  if (!engine.last_cycle_at) return "The first whole-market simulation cycle is waiting to run.";
  return `${engine.scanned_symbols} scanned, ${engine.eligible_candidates} actionable, ${engine.opened_last_cycle} opened and ${engine.closed_last_cycle} closed in the last cycle.`;
}

const moneyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
function money(value: number) { return moneyFormatter.format(value); }
function signedMoney(value: number) { return `${value > 0 ? "+" : ""}${money(value)}`; }
function pnlClass(value: number) { return value > 0 ? "positive" : value < 0 ? "negative" : "neutral"; }
function price(value: number | null) { return value === null ? "--" : value.toLocaleString(undefined, { maximumFractionDigits: 8 }); }
function time(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)); }
function dateTime(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function age(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`; }
function duration(start: string, end: string | null) { if (!end) return age(start); const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)); return seconds < 3600 ? `${Math.max(1, Math.floor(seconds / 60))}m` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`; }
function exitLabel(reason: PaperTrade["exit_reason"]) { return reason ? reason.replaceAll("_", " ") : "--"; }
