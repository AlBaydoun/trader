import { Activity, BarChart3, Gauge, Layers3, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import type { Candle, Signal } from "../types";

interface IndicatorStackProps {
  candles: Candle[];
  signal?: Signal;
}

interface IndicatorReading {
  name: string;
  parameters: string;
  value: string;
  status: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  gauge?: number;
  detail: string;
}

export function IndicatorStack({ candles, signal }: IndicatorStackProps) {
  const readings = useMemo(() => buildReadings(candles, signal), [candles, signal]);

  return (
    <details className="indicator-stack" open>
      <summary>
        <span className="indicator-stack-title">
          <Layers3 size={15} />
          <strong>Advanced indicators</strong>
        </span>
        <span className="indicator-stack-summary">RSI 1 · MACD 5/6/1 · EMA 12/36 · ATR 15</span>
      </summary>
      <div className="indicator-readings">
        {readings.map((reading) => (
          <article className="indicator-reading" key={reading.name}>
            <div className="indicator-reading-heading">
              <span className="indicator-reading-name">
                {indicatorIcon(reading.name)}
                <strong>{reading.name}</strong>
              </span>
              <span>{reading.parameters}</span>
            </div>
            {reading.gauge !== undefined && (
              <div className="indicator-gauge" aria-hidden="true">
                <i style={{ width: `${Math.max(2, Math.min(100, reading.gauge))}%` }} />
                {reading.name === "RSI" && <><b className="gauge-line upper" /><b className="gauge-line lower" /></>}
              </div>
            )}
            <div className="indicator-reading-result">
              <strong className={reading.tone}>{reading.value}</strong>
              <span className={reading.tone}>{reading.status}</span>
            </div>
            <p>{reading.detail}</p>
          </article>
        ))}
      </div>
      <div className="indicator-disclaimer">
        <Activity size={13} />
        <span>These readings describe current market conditions; they are not a profit guarantee.</span>
      </div>
    </details>
  );
}

function buildReadings(candles: Candle[], signal?: Signal): IndicatorReading[] {
  if (candles.length < 3) return [waitingReading("Waiting for enough candle data.")];
  const closes = candles.map((candle) => candle.close);
  const current = closes.at(-1) ?? 0;
  const previous = closes.at(-2) ?? current;
  const fastEma = ema(closes, 12);
  const slowEma = ema(closes, 36);
  const macdFast = ema(closes, 5);
  const macdSlow = ema(closes, 6);
  const macd = macdFast - macdSlow;
  const previousMacd = ema(closes.slice(0, -1), 5) - ema(closes.slice(0, -1), 6);
  const macdSignal = macd;
  const macdHistogram = macd - macdSignal;
  const rsi = previous === current ? 50 : current > previous ? 100 : 0;
  const atr = averageTrueRange(candles.slice(-15));
  const rangeHigh = Math.max(...candles.slice(-25, -1).map((candle) => candle.high));
  const rangeLow = Math.min(...candles.slice(-25, -1).map((candle) => candle.low));
  const structure = current > rangeHigh ? "Breakout above range" : current < rangeLow ? "Breakdown below range" : "Inside recent range";
  const trendUp = fastEma > slowEma;
  const momentumUp = macd > previousMacd;
  const volatilityPct = current ? (atr / current) * 100 : 0;

  return [
    {
      name: "RSI",
      parameters: "period 1",
      value: rsi.toFixed(2),
      status: rsi >= 85 ? "Upper extreme 85" : rsi <= 15 ? "Lower extreme 15" : "Neutral zone",
      tone: rsi >= 85 ? "negative" : rsi <= 15 ? "positive" : "neutral",
      gauge: rsi,
      detail: "Fast momentum reading used for the separate 85/15 alert scanner."
    },
    {
      name: "MACD",
      parameters: "5 / 6 / 1",
      value: formatCompact(macd),
      status: momentumUp ? "Momentum rising" : "Momentum fading",
      tone: macd >= 0 ? "positive" : "negative",
      detail: `Histogram ${formatCompact(macdHistogram)} · signal ${formatCompact(macdSignal)}.`
    },
    {
      name: "EMA",
      parameters: "12 / 36",
      value: trendUp ? "Bullish" : "Bearish",
      status: `${formatPrice(fastEma)} / ${formatPrice(slowEma)}`,
      tone: trendUp ? "positive" : "negative",
      detail: "Fast and slow exponential averages show the active trend alignment."
    },
    {
      name: "ATR",
      parameters: "period 15",
      value: formatPrice(atr),
      status: volatilityPct >= 1.8 ? "Elevated volatility" : "Normal volatility",
      tone: volatilityPct >= 1.8 ? "warning" : "neutral",
      detail: `${volatilityPct.toFixed(2)}% of current price · used to size stops and targets.`
    },
    {
      name: "Structure",
      parameters: "24 candles",
      value: structure,
      status: signal ? `${signal.direction} signal · ${Math.round(signal.confidence * 100)}%` : "Signal waiting",
      tone: structure.includes("above") ? "positive" : structure.includes("below") ? "negative" : "neutral",
      detail: `Range ${formatPrice(rangeLow)} – ${formatPrice(rangeHigh)}.`
    }
  ];
}

function waitingReading(detail: string): IndicatorReading {
  return {
    name: "Indicator stack",
    parameters: "loading",
    value: "--",
    status: "Waiting",
    tone: "neutral",
    detail
  };
}

function indicatorIcon(name: string) {
  if (name === "RSI") return <Gauge size={13} />;
  if (name === "MACD") return <BarChart3 size={13} />;
  return <TrendingUp size={13} />;
}

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / Math.min(period, values.length);
  const multiplier = 2 / (period + 1);
  return values.slice(Math.min(period, values.length)).reduce(
    (current, value) => (value - current) * multiplier + current,
    seed
  );
}

function averageTrueRange(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)}k`;
  if (Math.abs(value) < 0.01) return value.toFixed(5);
  return value.toFixed(3);
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return value >= 10000 ? value.toFixed(1) : value < 10 ? value.toFixed(4) : value.toFixed(2);
}
