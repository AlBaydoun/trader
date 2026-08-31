import { useEffect, useState } from "react";
import { Radio, RefreshCw, Search, WifiOff } from "lucide-react";
import { getCandles, getMarketSymbols, getSignal } from "../lib/api";
import { DEFAULT_INDICATORS, type ActiveIndicator } from "../lib/indicators";
import type { Candle, MarketSymbol, Signal } from "../types";
import { ChartPanel } from "./ChartPanel";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

interface ManualTradingBotChartProps {
  symbol: string;
  timeframe: (typeof TIMEFRAMES)[number];
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: (typeof TIMEFRAMES)[number]) => void;
  onPriceChange: (price: number | undefined) => void;
}

export function ManualTradingBotChart({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  onPriceChange
}: ManualTradingBotChartProps) {
  const [query, setQuery] = useState(symbol);
  const [catalog, setCatalog] = useState<MarketSymbol[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signal, setSignal] = useState<Signal>();
  const [indicators, setIndicators] = useState<ActiveIndicator[]>(DEFAULT_INDICATORS);
  const [chartHeight, setChartHeight] = useState(560);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setQuery(symbol);
  }, [symbol]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void getMarketSymbols(query, 80)
        .then((items) => {
          if (active) setCatalog(items);
        })
        .catch(() => {
          if (active) setCatalog([]);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [nextCandles, nextSignal] = await Promise.all([
          getCandles(symbol, timeframe),
          getSignal(symbol, timeframe).catch(() => undefined)
        ]);
        if (!active) return;
        setCandles(nextCandles);
        setSignal(nextSignal);
        onPriceChange(nextCandles.at(-1)?.close);
      } catch (requestError) {
        if (active) {
          setCandles([]);
          setSignal(undefined);
          onPriceChange(undefined);
          setError(requestError instanceof Error ? requestError.message : "Live chart unavailable.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    onPriceChange(undefined);
    void load();
    const interval = window.setInterval(() => void load(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [onPriceChange, symbol, timeframe]);

  function submitSearch() {
    const nextSymbol = query.trim();
    if (nextSymbol) onSymbolChange(nextSymbol);
  }

  return (
    <section className="manual-live-chart" aria-label="Manual bot live searchable chart">
      <header className="manual-live-chart-header">
        <div className="manual-live-chart-title">
          <span className="manual-live-chart-icon"><Radio size={15} /></span>
          <div>
            <strong>Live searchable chart</strong>
            <span>Choose any symbol available from the connected MT5 terminal.</span>
          </div>
        </div>
        <div className="manual-live-chart-controls">
          <form className="manual-symbol-search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
            <Search size={14} />
            <label className="sr-only" htmlFor="manual-bot-symbol-search">Search any symbol</label>
            <input
              id="manual-bot-symbol-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search any pair or instrument"
              autoComplete="off"
            />
            <button type="submit" className="icon-button compact-icon" title="Open searched symbol" aria-label="Open searched symbol">
              <Search size={13} />
            </button>
          </form>
          <label className="manual-timeframe-select">
            <span className="sr-only">Manual bot timeframe</span>
            <select value={timeframe} onChange={(event) => onTimeframeChange(event.target.value as (typeof TIMEFRAMES)[number])}>
              {TIMEFRAMES.map((option) => <option value={option} key={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="manual-symbol-results" aria-label="Matching MT5 symbols">
        {catalog.slice(0, 8).map((item) => (
          <button
            type="button"
            className={item.symbol === symbol ? "active" : ""}
            key={item.symbol}
            onClick={() => {
              setQuery(item.symbol);
              onSymbolChange(item.symbol);
            }}
          >
            <strong>{item.symbol}</strong>
            <span>{item.category || item.description}</span>
          </button>
        ))}
        {!catalog.length && query.trim() && <span className="manual-symbol-empty">No catalog match. Press Enter to try the typed symbol.</span>}
      </div>

      <div className="manual-live-chart-status">
        {loading ? <RefreshCw size={13} className="spin" /> : candles.at(-1)?.source === "mt5" ? <Radio size={13} /> : <WifiOff size={13} />}
        <strong>{symbol}</strong>
        <span>{candles.at(-1)?.source === "mt5" ? "Live MT5 candles" : "Demo fallback candles"}</span>
        <span>{candles.at(-1) ? `Last ${candles.at(-1)!.close}` : "Waiting for price"}</span>
        {error && <b>{error}</b>}
      </div>

      <ChartPanel
        symbol={symbol}
        timeframe={timeframe}
        candles={candles}
        signal={signal}
        indicators={indicators}
        focused={false}
        onFocus={() => undefined}
        onIndicatorsChange={setIndicators}
        onMove={() => undefined}
        onMoveByOffset={() => undefined}
        height={chartHeight}
        onResize={(_, height) => setChartHeight(height)}
      />
    </section>
  );
}
