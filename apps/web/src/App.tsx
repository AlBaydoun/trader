import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHART_HEIGHT_MAX,
  CHART_HEIGHT_MIN,
  ChartPanel
} from "./components/ChartPanel";
import { ExtremeAlertsPanel } from "./components/ExtremeAlertsPanel";
import { PaperTradingPanel } from "./components/PaperTradingPanel";
import { SignalRail } from "./components/SignalRail";
import { SymbolDrawer } from "./components/SymbolDrawer";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import {
  getAccounts,
  getBacktest,
  getCandles,
  getMT5Quotes,
  getMarketSymbols,
  getNewsAnalysis,
  getPaperPortfolio,
  scanExtremeLevels,
  getStatus,
  getStrategy,
  scan,
  scanWholeMarket,
  setActiveAccount,
  closePaperPosition,
  resetPaperPortfolio,
  runPaperCycle,
  updatePaperControl
} from "./lib/api";
import { playExtremeAlert, playSignalTone, speakExtremeAlert, speakSignal } from "./lib/alerts";
import type {
  AccountList,
  Backtest,
  Candle,
  MarketEvent,
  MarketScan,
  MarketSymbol,
  MT5Quote,
  NewsStatus,
  PaperControl,
  PaperPortfolio,
  ExtremeScan,
  Signal,
  Status,
  StrategyDefinition,
  TradeMode
} from "./types";

const FALLBACK_SYMBOLS = ["XAUUSD", "XAGUSD", "BTCUSD", "US100.std", "US30.std", "WTI.m", "BRENT.m"];

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [accounts, setAccounts] = useState<AccountList>({ active_account_id: null, accounts: [] });
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [mt5Quotes, setMT5Quotes] = useState<MT5Quote[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(loadSelectedSymbols);
  const [chartHeights, setChartHeights] = useState<Record<string, number>>(loadChartHeights);
  const [timeframe, setTimeframe] = useState("1m");
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [signals, setSignals] = useState<Record<string, Signal>>({});
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [newsStatus, setNewsStatus] = useState<NewsStatus>();
  const [catalog, setCatalog] = useState<MarketSymbol[]>([]);
  const [marketScan, setMarketScan] = useState<MarketScan>();
  const [strategy, setStrategy] = useState<StrategyDefinition>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [marketScanning, setMarketScanning] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState("XAUUSD");
  const [tradeMode, setTradeMode] = useState<TradeMode>("auto_trade");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [backtest, setBacktest] = useState<Backtest | undefined>();
  const [paperPortfolio, setPaperPortfolio] = useState<PaperPortfolio>();
  const [paperBusy, setPaperBusy] = useState(false);
  const [paperError, setPaperError] = useState("");
  const [extremeScan, setExtremeScan] = useState<ExtremeScan>();
  const [extremeBusy, setExtremeBusy] = useState(false);
  const extremeAlertIdsRef = useRef<Set<string>>(new Set());
  const lastAlertRef = useRef<string>("");

  const activeSignal = signals[activeSymbol] ?? Object.values(signals)[0];

  const refresh = useCallback(async () => {
    setScanning(true);
    try {
      const [statusResponse, accountResponse, scanResponse, candlePairs] = await Promise.all([
        getStatus().catch(() => null),
        getAccounts().catch(() => null),
        scan(selectedSymbols, timeframe),
        Promise.all(selectedSymbols.map(async (symbol) => [symbol, await getCandles(symbol, timeframe)] as const))
      ]);
      if (statusResponse) setStatus(statusResponse);
      if (accountResponse) setAccounts(accountResponse);
      setEvents(scanResponse.events);
      setNewsStatus(scanResponse.news_status);
      setSignals(Object.fromEntries(scanResponse.signals.map((signal) => [signal.symbol, signal])));
      setCandles(Object.fromEntries(candlePairs));
      setActiveSymbol((current) => (selectedSymbols.includes(current) ? current : selectedSymbols[0]));
    } finally {
      setScanning(false);
    }
  }, [selectedSymbols, timeframe]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.localStorage.setItem("trader:selected-symbols", JSON.stringify(selectedSymbols));
  }, [selectedSymbols]);

  useEffect(() => {
    window.localStorage.setItem("trader:chart-heights", JSON.stringify(chartHeights));
  }, [chartHeights]);

  useEffect(() => {
    getStrategy().then(setStrategy).catch(() => setStrategy(undefined));
  }, []);

  const refreshPaper = useCallback(async () => {
    const portfolio = await getPaperPortfolio().catch(() => null);
    if (!portfolio) return;
    setPaperPortfolio(portfolio);
    setTradeMode(portfolio.engine.enabled ? "auto_trade" : "signal_only");
  }, []);

  useEffect(() => {
    void refreshPaper();
    const interval = window.setInterval(() => void refreshPaper(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshPaper]);

  const refreshMarket = useCallback(async () => {
    setMarketScanning(true);
    try {
      const catalogRequest = getMarketSymbols().then(setCatalog);
      const scanRequest = scanWholeMarket(timeframe, true).then(setMarketScan);
      await Promise.all([catalogRequest, scanRequest]);
    } finally {
      setMarketScanning(false);
    }
  }, [timeframe]);

  useEffect(() => {
    let active = true;
    void getMarketSymbols().then((items) => {
      if (active) setCatalog(items);
    });
    const runScan = async () => {
      setMarketScanning(true);
      try {
        const result = await scanWholeMarket(timeframe);
        if (active) setMarketScan(result);
      } finally {
        if (active) setMarketScanning(false);
      }
    };
    const startup = window.setTimeout(() => void runScan(), 2500);
    const interval = window.setInterval(() => void runScan(), 300000);
    return () => {
      active = false;
      window.clearTimeout(startup);
      window.clearInterval(interval);
    };
  }, [accounts.active_account_id, timeframe]);

  useEffect(() => {
    async function refreshMT5() {
      const statusResponse = await getStatus().catch(() => null);
      if (!statusResponse) return;
      setStatus(statusResponse);
      if (statusResponse.mt5.connection_verified) {
        setMT5Quotes(await getMT5Quotes(selectedSymbols).catch(() => []));
      } else {
        setMT5Quotes([]);
      }
    }

    void refreshMT5();
    const interval = window.setInterval(() => void refreshMT5(), 10000);
    return () => window.clearInterval(interval);
  }, [selectedSymbols]);

  useEffect(() => {
    async function refreshNews() {
      const news = await getNewsAnalysis(selectedSymbols).catch(() => null);
      if (!news) return;
      setEvents(news.events);
      setNewsStatus(news.status);
    }

    const interval = window.setInterval(() => void refreshNews(), 60000);
    return () => window.clearInterval(interval);
  }, [selectedSymbols]);

  useEffect(() => {
    if (!activeSignal || activeSignal.direction === "hold") return;
    const key = `${activeSignal.symbol}-${activeSignal.direction}-${activeSignal.created_at}`;
    if (lastAlertRef.current === key) return;
    lastAlertRef.current = key;
    if (soundEnabled) playSignalTone(activeSignal);
    if (voiceEnabled) speakSignal(activeSignal);
  }, [activeSignal, soundEnabled, voiceEnabled]);

  const refreshExtreme = useCallback(async (force = false) => {
    const result = await scanExtremeLevels(timeframe, force).catch(() => null);
    if (!result) return;
    setExtremeScan(result);
    for (const alert of result.alerts) {
      if (extremeAlertIdsRef.current.has(alert.id)) continue;
      extremeAlertIdsRef.current.add(alert.id);
      if (soundEnabled) playExtremeAlert(alert);
      if (voiceEnabled) speakExtremeAlert(alert);
    }
    if (extremeAlertIdsRef.current.size > 500) {
      extremeAlertIdsRef.current = new Set(result.recent_alerts.map((alert) => alert.id));
    }
  }, [soundEnabled, timeframe, voiceEnabled]);

  useEffect(() => {
    const startup = window.setTimeout(() => void refreshExtreme(), 3500);
    const interval = window.setInterval(() => void refreshExtreme(), 15000);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
    };
  }, [refreshExtreme]);

  useEffect(() => {
    if (!activeSymbol) return;
    getBacktest(activeSymbol, timeframe)
      .then(setBacktest)
      .catch(() => setBacktest(undefined));
  }, [activeSymbol, timeframe]);

  const gridClass = useMemo(() => {
    if (selectedSymbols.length <= 1) return "charts-grid one";
    if (selectedSymbols.length === 2) return "charts-grid two";
    return "charts-grid";
  }, [selectedSymbols.length]);

  function addSymbol(symbol: string) {
    setSelectedSymbols((current) => {
      if (current.includes(symbol)) return current;
      return [...current, symbol];
    });
    setActiveSymbol(symbol);
  }

  function removeSymbol(symbol: string) {
    setSelectedSymbols((current) => {
      if (current.length === 1) return current;
      const next = current.filter((item) => item !== symbol);
      if (activeSymbol === symbol) setActiveSymbol(next[0]);
      return next;
    });
  }

  function moveSymbol(source: string, target: string) {
    setSelectedSymbols((current) => {
      const sourceIndex = current.indexOf(source);
      const targetIndex = current.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  }

  async function switchAccount(accountId: string) {
    setSwitchingAccount(true);
    try {
      const accountResponse = await setActiveAccount(accountId);
      const statusResponse = await getStatus();
      setAccounts(accountResponse);
      setStatus(statusResponse);
      setMT5Quotes(
        statusResponse.mt5.connection_verified
          ? await getMT5Quotes(selectedSymbols).catch(() => [])
          : []
      );
    } finally {
      setSwitchingAccount(false);
    }
  }

  async function controlPaper(control: PaperControl) {
    setPaperBusy(true);
    setPaperError("");
    try {
      const portfolio = await updatePaperControl(control);
      setPaperPortfolio(portfolio);
      setTradeMode(portfolio.engine.enabled ? "auto_trade" : "signal_only");
    } catch (error) {
      setPaperError(error instanceof Error ? error.message : "Virtual control update failed.");
    } finally {
      setPaperBusy(false);
    }
  }

  async function runVirtualCycle() {
    setPaperBusy(true);
    setPaperError("");
    try {
      setPaperPortfolio(await runPaperCycle(true));
    } catch (error) {
      setPaperError(error instanceof Error ? error.message : "Virtual market cycle failed.");
    } finally {
      setPaperBusy(false);
    }
  }

  async function runExtremeScan() {
    setExtremeBusy(true);
    try {
      await refreshExtreme(true);
    } finally {
      setExtremeBusy(false);
    }
  }

  async function closeVirtualPosition(tradeId: string) {
    setPaperBusy(true);
    setPaperError("");
    try {
      setPaperPortfolio(await closePaperPosition(tradeId));
    } catch (error) {
      setPaperError(error instanceof Error ? error.message : "Virtual position could not close.");
    } finally {
      setPaperBusy(false);
    }
  }

  async function resetVirtualPortfolio() {
    if (!window.confirm("Reset all virtual trades, history, and performance results?")) return;
    setPaperBusy(true);
    setPaperError("");
    try {
      setPaperPortfolio(await resetPaperPortfolio());
    } catch (error) {
      setPaperError(error instanceof Error ? error.message : "Virtual portfolio reset failed.");
    } finally {
      setPaperBusy(false);
    }
  }

  function openPaperPanel() {
    const panel = document.getElementById("paper-trading");
    const header = document.querySelector<HTMLElement>(".workspace-header");
    if (!panel) return;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    window.scrollTo({
      top: Math.max(0, panel.offsetTop - headerHeight - 8),
      behavior: "smooth"
    });
  }

  function resizeChart(symbol: string, height: number) {
    setChartHeights((current) => ({
      ...current,
      [symbol]: Math.max(CHART_HEIGHT_MIN, Math.min(CHART_HEIGHT_MAX, Math.round(height)))
    }));
  }

  function openExtremePanel() {
    const panel = document.getElementById("extreme-alerts");
    const header = document.querySelector<HTMLElement>(".workspace-header");
    if (!panel) return;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    window.scrollTo({
      top: Math.max(0, panel.offsetTop - headerHeight - 8),
      behavior: "smooth"
    });
  }

  return (
    <main className="app-shell">
      <SymbolDrawer
        open={drawerOpen}
        selectedSymbols={selectedSymbols}
        catalog={catalog}
        marketScan={marketScan}
        scanning={marketScanning}
        onClose={() => setDrawerOpen(false)}
        onAdd={addSymbol}
        onRemove={removeSymbol}
        onMove={moveSymbol}
        onScan={() => void refreshMarket()}
      />
      <WorkspaceHeader
        selectedCount={selectedSymbols.length}
        timeframe={timeframe}
        tradeMode={tradeMode}
        liveUnlocked={Boolean(status?.live_trading_unlocked)}
        brokerAccount={status?.broker_account}
        mt5={status?.mt5}
        accounts={accounts.accounts}
        activeAccountId={accounts.active_account_id}
        switchingAccount={switchingAccount}
        scanning={scanning}
        paperEnabled={Boolean(paperPortfolio?.engine.enabled)}
        paperOpenPositions={paperPortfolio?.metrics.open_positions ?? 0}
        extremeAlertCount={extremeScan?.alerts.length ?? 0}
        onOpenSymbols={() => setDrawerOpen(true)}
        onTimeframeChange={setTimeframe}
        onAccountChange={(accountId) => void switchAccount(accountId)}
        onRefresh={() => void refresh()}
        onOpenPaper={openPaperPanel}
        onOpenExtreme={openExtremePanel}
      />

      <div className="workstation">
        <section className={gridClass} aria-label="Charts">
          {selectedSymbols.map((symbol) => (
            <ChartPanel
              key={symbol}
              symbol={symbol}
              timeframe={timeframe}
              candles={candles[symbol] ?? []}
              signal={signals[symbol]}
              focused={activeSymbol === symbol}
              onFocus={setActiveSymbol}
              height={chartHeights[symbol]}
              onResize={resizeChart}
            />
          ))}
        </section>

        <SignalRail
          activeSignal={activeSignal}
          backtest={backtest}
          events={events}
          newsStatus={newsStatus}
          activeSymbol={activeSymbol}
          strategy={strategy}
          tradeMode={tradeMode}
          liveUnlocked={Boolean(status?.live_trading_unlocked)}
          mt5={status?.mt5}
          mt5Quotes={mt5Quotes}
          soundEnabled={soundEnabled}
          voiceEnabled={voiceEnabled}
          onTradeModeChange={(mode) => void controlPaper({ enabled: mode === "auto_trade" })}
          onSoundToggle={() => setSoundEnabled((enabled) => !enabled)}
          onVoiceToggle={() => setVoiceEnabled((enabled) => !enabled)}
        />
      </div>
      <PaperTradingPanel
        portfolio={paperPortfolio}
        busy={paperBusy}
        error={paperError}
        onControl={(control) => void controlPaper(control)}
        onRun={() => void runVirtualCycle()}
        onClose={(tradeId) => void closeVirtualPosition(tradeId)}
        onReset={() => void resetVirtualPortfolio()}
      />
      <ExtremeAlertsPanel
        scan={extremeScan}
        busy={extremeBusy}
        soundEnabled={soundEnabled}
        voiceEnabled={voiceEnabled}
        onRun={() => void runExtremeScan()}
      />
    </main>
  );
}

function loadSelectedSymbols(): string[] {
  try {
    const stored = window.localStorage.getItem("trader:selected-symbols");
    if (!stored) return FALLBACK_SYMBOLS.slice(0, 4);
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return FALLBACK_SYMBOLS.slice(0, 4);
    const symbols = parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
    return symbols.length ? symbols : FALLBACK_SYMBOLS.slice(0, 4);
  } catch {
    return FALLBACK_SYMBOLS.slice(0, 4);
  }
}

function loadChartHeights(): Record<string, number> {
  try {
    const stored = window.localStorage.getItem("trader:chart-heights");
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([symbol, value]) => {
        if (typeof value !== "number" || !Number.isFinite(value)) return [];
        return [[symbol, Math.max(CHART_HEIGHT_MIN, Math.min(CHART_HEIGHT_MAX, Math.round(value)))]];
      })
    );
  } catch {
    return {};
  }
}
