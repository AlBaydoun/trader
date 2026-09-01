import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHART_HEIGHT_MAX,
  CHART_HEIGHT_MIN,
  ChartPanel
} from "./components/ChartPanel";
import { ExtremeAlertsPanel } from "./components/ExtremeAlertsPanel";
import { ManualTradingBotChart } from "./components/ManualTradingBotChart";
import { PaperBotDock } from "./components/PaperBotDock";
import { PaperTradingPanel } from "./components/PaperTradingPanel";
import { SignalRail } from "./components/SignalRail";
import { StrategyLabPanel } from "./components/StrategyLabPanel";
import { SymbolDrawer } from "./components/SymbolDrawer";
import { VirtualTradersDashboard } from "./components/VirtualTradersDashboard";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import {
  getAccounts,
  getBacktest,
  getCandles,
  getExtremeBacktest,
  getMT5Quotes,
  getManualPaperPortfolio,
  getMarketSymbols,
  getNewsAnalysis,
  getJdubPaperPortfolio,
  getRigorGatePaperPortfolio,
  getExtremePaperPortfolio,
  getCandlestickPaperPortfolio,
  getCandlestickBuyPaperPortfolio,
  getCandlestickSellPaperPortfolio,
  getVideoStrategyPaperPortfolio,
  getStrategyLab,
  getPaperPortfolio,
  scanExtremeLevels,
  getStatus,
  getStrategy,
  scan,
  scanWholeMarket,
  setActiveAccount,
  closePaperPosition,
  closeJdubPaperPosition,
  closeRigorGatePaperPosition,
  closeExtremePaperPosition,
  closeCandlestickPaperPosition,
  closeCandlestickBuyPaperPosition,
  closeCandlestickSellPaperPosition,
  closeVideoStrategyPaperPosition,
  closeManualPaperPosition,
  openManualPaperTrade,
  resetExtremePaperPortfolio,
  resetJdubPaperPortfolio,
  resetRigorGatePaperPortfolio,
  resetPaperPortfolio,
  resetCandlestickPaperPortfolio,
  resetCandlestickBuyPaperPortfolio,
  resetCandlestickSellPaperPortfolio,
  resetVideoStrategyPaperPortfolio,
  resetManualPaperPortfolio,
  runJdubPaperCycle,
  runRigorGatePaperCycle,
  runExtremePaperCycle,
  runCandlestickPaperCycle,
  runCandlestickBuyPaperCycle,
  runCandlestickSellPaperCycle,
  runVideoStrategyPaperCycle,
  runStrategyLabCycle,
  runPaperCycle,
  runManualPaperCycle,
  updateExtremePaperControl,
  updateJdubPaperControl,
  updateRigorGatePaperControl,
  updateStrategyLabControl,
  updatePaperControl,
  updateCandlestickPaperControl,
  updateCandlestickBuyPaperControl,
  updateCandlestickSellPaperControl,
  updateVideoStrategyPaperControl,
  updateManualPaperControl,
  updateManualPaperTradeNote,
  updatePaperTradeNote
} from "./lib/api";
import { playExtremeAlert, playSignalTone, speakExtremeAlert, speakSignal } from "./lib/alerts";
import { DEFAULT_INDICATORS, INDICATOR_CATALOG, type ActiveIndicator } from "./lib/indicators";
import type {
  AccountList,
  Backtest,
  Candle,
  ExtremeBacktest,
  MarketEvent,
  MarketScan,
  MarketSymbol,
  MT5Quote,
  NewsStatus,
  PaperControl,
  ManualPaperTradeRequest,
  PaperPortfolio,
  ExtremeScan,
  StrategyLabSnapshot,
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
  const [chartIndicators, setChartIndicators] = useState<Record<string, ActiveIndicator[]>>(loadChartIndicators);
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
  const [extremeNotifications, setExtremeNotifications] = useState(loadExtremeNotificationPreferences);
  const [scanning, setScanning] = useState(false);
  const [backtest, setBacktest] = useState<Backtest | undefined>();
  const [backtestBusy, setBacktestBusy] = useState(false);
  const [backtestError, setBacktestError] = useState("");
  const [extremeBacktest, setExtremeBacktest] = useState<ExtremeBacktest | undefined>();
  const [extremeHistoryLimit, setExtremeHistoryLimit] = useState(2000);
  const [paperPortfolio, setPaperPortfolio] = useState<PaperPortfolio>();
  const [paperBusy, setPaperBusy] = useState(false);
  const [paperError, setPaperError] = useState("");
  const [manualPaperPortfolio, setManualPaperPortfolio] = useState<PaperPortfolio>();
  const [manualPaperBusy, setManualPaperBusy] = useState(false);
  const [manualPaperError, setManualPaperError] = useState("");
  const [manualBotSymbol, setManualBotSymbol] = useState("XAUUSD");
  const [manualBotPrice, setManualBotPrice] = useState<number>();
  const [manualBotTimeframe, setManualBotTimeframe] = useState<ManualPaperTradeRequest["timeframe"]>("1m");
  const [jdubPaperPortfolio, setJdubPaperPortfolio] = useState<PaperPortfolio>();
  const [jdubPaperBusy, setJdubPaperBusy] = useState(false);
  const [jdubPaperError, setJdubPaperError] = useState("");
  const [rigorGatePaperPortfolio, setRigorGatePaperPortfolio] = useState<PaperPortfolio>();
  const [rigorGatePaperBusy, setRigorGatePaperBusy] = useState(false);
  const [rigorGatePaperError, setRigorGatePaperError] = useState("");
  const [extremePaperPortfolio, setExtremePaperPortfolio] = useState<PaperPortfolio>();
  const [extremePaperBusy, setExtremePaperBusy] = useState(false);
  const [extremePaperError, setExtremePaperError] = useState("");
  const [candlestickPaperPortfolio, setCandlestickPaperPortfolio] = useState<PaperPortfolio>();
  const [candlestickPaperBusy, setCandlestickPaperBusy] = useState(false);
  const [candlestickPaperError, setCandlestickPaperError] = useState("");
  const [candlestickBuyPortfolio, setCandlestickBuyPortfolio] = useState<PaperPortfolio>();
  const [candlestickBuyBusy, setCandlestickBuyBusy] = useState(false);
  const [candlestickBuyError, setCandlestickBuyError] = useState("");
  const [candlestickSellPortfolio, setCandlestickSellPortfolio] = useState<PaperPortfolio>();
  const [candlestickSellBusy, setCandlestickSellBusy] = useState(false);
  const [candlestickSellError, setCandlestickSellError] = useState("");
  const [videoStrategyPortfolio, setVideoStrategyPortfolio] = useState<PaperPortfolio>();
  const [videoStrategyBusy, setVideoStrategyBusy] = useState(false);
  const [videoStrategyError, setVideoStrategyError] = useState("");
  const [strategyLab, setStrategyLab] = useState<StrategyLabSnapshot>();
  const [strategyLabBusy, setStrategyLabBusy] = useState(false);
  const [strategyLabError, setStrategyLabError] = useState("");
  const [extremeScan, setExtremeScan] = useState<ExtremeScan>();
  const [extremeBusy, setExtremeBusy] = useState(false);
  const extremeAlertIdsRef = useRef<Set<string>>(new Set());
  const lastAlertRef = useRef<string>("");
  const manualPaperMutationRef = useRef(0);

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
    window.localStorage.setItem("trader:chart-indicators", JSON.stringify(chartIndicators));
  }, [chartIndicators]);

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

  const refreshManualPaper = useCallback(async () => {
    const revision = manualPaperMutationRef.current;
    const portfolio = await getManualPaperPortfolio().catch(() => null);
    if (!portfolio || revision !== manualPaperMutationRef.current) return;
    setManualPaperPortfolio(portfolio);
    setManualBotTimeframe(portfolio.engine.timeframe as ManualPaperTradeRequest["timeframe"]);
  }, []);

  useEffect(() => {
    void refreshManualPaper();
    const interval = window.setInterval(() => void refreshManualPaper(), 5000);
    return () => window.clearInterval(interval);
  }, [refreshManualPaper]);

  const refreshJdubPaper = useCallback(async () => {
    const portfolio = await getJdubPaperPortfolio().catch(() => null);
    if (portfolio) setJdubPaperPortfolio(portfolio);
  }, []);

  useEffect(() => {
    void refreshJdubPaper();
    const interval = window.setInterval(() => void refreshJdubPaper(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshJdubPaper]);

  const refreshRigorGatePaper = useCallback(async () => {
    const portfolio = await getRigorGatePaperPortfolio().catch(() => null);
    if (portfolio) setRigorGatePaperPortfolio(portfolio);
  }, []);

  useEffect(() => {
    void refreshRigorGatePaper();
    const interval = window.setInterval(() => void refreshRigorGatePaper(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshRigorGatePaper]);

  const refreshExtremePaper = useCallback(async () => {
    const portfolio = await getExtremePaperPortfolio().catch(() => null);
    if (portfolio) setExtremePaperPortfolio(portfolio);
  }, []);

  useEffect(() => {
    void refreshExtremePaper();
    const interval = window.setInterval(() => void refreshExtremePaper(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshExtremePaper]);

  const refreshCandlestickBots = useCallback(async () => {
    const [main, buy, sell] = await Promise.all([
      getCandlestickPaperPortfolio().catch(() => null),
      getCandlestickBuyPaperPortfolio().catch(() => null),
      getCandlestickSellPaperPortfolio().catch(() => null)
    ]);
    if (main) setCandlestickPaperPortfolio(main);
    if (buy) setCandlestickBuyPortfolio(buy);
    if (sell) setCandlestickSellPortfolio(sell);
  }, []);

  useEffect(() => {
    void refreshCandlestickBots();
    const interval = window.setInterval(() => void refreshCandlestickBots(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshCandlestickBots]);

  const refreshVideoStrategy = useCallback(async () => {
    const portfolio = await getVideoStrategyPaperPortfolio().catch(() => null);
    if (portfolio) setVideoStrategyPortfolio(portfolio);
  }, []);

  useEffect(() => {
    void refreshVideoStrategy();
    const interval = window.setInterval(() => void refreshVideoStrategy(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshVideoStrategy]);

  const refreshStrategyLab = useCallback(async () => {
    const snapshot = await getStrategyLab().catch(() => null);
    if (snapshot) setStrategyLab(snapshot);
  }, []);

  useEffect(() => {
    void refreshStrategyLab();
    const interval = window.setInterval(() => void refreshStrategyLab(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshStrategyLab]);

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
      const enabled = alert.level === "upper_85"
        ? extremeNotifications.upper85
        : extremeNotifications.lower15;
      if (enabled && soundEnabled) playExtremeAlert(alert);
      if (enabled && voiceEnabled) speakExtremeAlert(alert);
    }
    if (extremeAlertIdsRef.current.size > 500) {
      extremeAlertIdsRef.current = new Set(result.recent_alerts.map((alert) => alert.id));
    }
  }, [extremeNotifications, soundEnabled, timeframe, voiceEnabled]);

  useEffect(() => {
    window.localStorage.setItem("trader:extreme-notifications", JSON.stringify(extremeNotifications));
  }, [extremeNotifications]);

  useEffect(() => {
    const startup = window.setTimeout(() => void refreshExtreme(), 3500);
    const interval = window.setInterval(() => void refreshExtreme(), 15000);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
    };
  }, [refreshExtreme]);

  const runBacktest = useCallback(async () => {
    if (!activeSymbol) return;
    setBacktestBusy(true);
    setBacktestError("");
    try {
      setBacktest(await getBacktest(activeSymbol, timeframe));
    } catch (error) {
      setBacktestError(error instanceof Error ? error.message : "Backtest could not be completed.");
    } finally {
      setBacktestBusy(false);
    }
  }, [activeSymbol, timeframe]);

  useEffect(() => {
    if (!activeSymbol) return;
    void runBacktest();
    if (timeframe !== "1m") {
      setExtremeBacktest(undefined);
      return;
    }
    void getExtremeBacktest(activeSymbol, timeframe, extremeHistoryLimit)
      .then(setExtremeBacktest)
      .catch(() => setExtremeBacktest(undefined));
  }, [activeSymbol, extremeHistoryLimit, runBacktest, timeframe]);

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

  async function controlManualPaper(control: PaperControl) {
    manualPaperMutationRef.current += 1;
    setManualPaperBusy(true);
    setManualPaperError("");
    try {
      const portfolio = await updateManualPaperControl(control);
      setManualPaperPortfolio(portfolio);
      if (control.timeframe) setManualBotTimeframe(control.timeframe);
    } catch (error) {
      setManualPaperError(error instanceof Error ? error.message : "Manual bot control update failed.");
    } finally {
      manualPaperMutationRef.current += 1;
      setManualPaperBusy(false);
    }
  }

  async function openManualTradingBotTradeNow(request: ManualPaperTradeRequest) {
    manualPaperMutationRef.current += 1;
    setManualPaperBusy(true);
    setManualPaperError("");
    try {
      const opened = await openManualPaperTrade(request);
      if (opened.engine.enabled) {
        setManualPaperPortfolio(opened);
      } else {
        // Start monitoring after the operator creates a position so live P/L and SL/TP react immediately.
        setManualPaperPortfolio(await updateManualPaperControl({ enabled: true }));
      }
    } catch (error) {
      setManualPaperError(error instanceof Error ? error.message : "Manual virtual trade could not open.");
    } finally {
      manualPaperMutationRef.current += 1;
      setManualPaperBusy(false);
    }
  }

  async function savePaperTradeNote(tradeId: string, note: string) {
    setPaperBusy(true);
    setPaperError("");
    try {
      setPaperPortfolio(await updatePaperTradeNote(tradeId, note));
    } catch (error) {
      setPaperError(error instanceof Error ? error.message : "Virtual trade note could not be saved.");
    } finally {
      setPaperBusy(false);
    }
  }

  async function saveManualTradeNote(tradeId: string, note: string) {
    manualPaperMutationRef.current += 1;
    setManualPaperBusy(true);
    setManualPaperError("");
    try {
      setManualPaperPortfolio(await updateManualPaperTradeNote(tradeId, note));
    } catch (error) {
      setManualPaperError(error instanceof Error ? error.message : "Manual trade note could not be saved.");
    } finally {
      manualPaperMutationRef.current += 1;
      setManualPaperBusy(false);
    }
  }

  async function runManualTradingCycle() {
    manualPaperMutationRef.current += 1;
    setManualPaperBusy(true);
    setManualPaperError("");
    try {
      setManualPaperPortfolio(await runManualPaperCycle());
    } catch (error) {
      setManualPaperError(error instanceof Error ? error.message : "Manual bot monitor cycle failed.");
    } finally {
      manualPaperMutationRef.current += 1;
      setManualPaperBusy(false);
    }
  }

  async function closeManualTradingPosition(tradeId: string) {
    manualPaperMutationRef.current += 1;
    setManualPaperBusy(true);
    setManualPaperError("");
    try {
      setManualPaperPortfolio(await closeManualPaperPosition(tradeId));
    } catch (error) {
      setManualPaperError(error instanceof Error ? error.message : "Manual virtual position could not close.");
    } finally {
      manualPaperMutationRef.current += 1;
      setManualPaperBusy(false);
    }
  }

  async function resetManualTradingPortfolio() {
    if (!window.confirm("Reset all Manual Trading Bot trades, history, and results?")) return;
    manualPaperMutationRef.current += 1;
    setManualPaperBusy(true);
    setManualPaperError("");
    try {
      setManualPaperPortfolio(await resetManualPaperPortfolio());
    } catch (error) {
      setManualPaperError(error instanceof Error ? error.message : "Manual bot reset failed.");
    } finally {
      manualPaperMutationRef.current += 1;
      setManualPaperBusy(false);
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

  async function controlJdubPaper(control: PaperControl) {
    setJdubPaperBusy(true);
    setJdubPaperError("");
    try {
      setJdubPaperPortfolio(await updateJdubPaperControl(control));
    } catch (error) {
      setJdubPaperError(error instanceof Error ? error.message : "Jdub Traders control update failed.");
    } finally {
      setJdubPaperBusy(false);
    }
  }

  async function runJdubVirtualCycle() {
    setJdubPaperBusy(true);
    setJdubPaperError("");
    try {
      setJdubPaperPortfolio(await runJdubPaperCycle(true));
    } catch (error) {
      setJdubPaperError(error instanceof Error ? error.message : "Jdub Traders virtual cycle failed.");
    } finally {
      setJdubPaperBusy(false);
    }
  }

  async function controlRigorGatePaper(control: PaperControl) {
    setRigorGatePaperBusy(true);
    setRigorGatePaperError("");
    try {
      setRigorGatePaperPortfolio(await updateRigorGatePaperControl(control));
    } catch (error) {
      setRigorGatePaperError(error instanceof Error ? error.message : "RigorGate control update failed.");
    } finally {
      setRigorGatePaperBusy(false);
    }
  }

  async function runRigorGateVirtualCycle() {
    setRigorGatePaperBusy(true);
    setRigorGatePaperError("");
    try {
      setRigorGatePaperPortfolio(await runRigorGatePaperCycle(true));
    } catch (error) {
      setRigorGatePaperError(error instanceof Error ? error.message : "RigorGate virtual cycle failed.");
    } finally {
      setRigorGatePaperBusy(false);
    }
  }

  async function closeRigorGateVirtualPosition(tradeId: string) {
    setRigorGatePaperBusy(true);
    setRigorGatePaperError("");
    try {
      setRigorGatePaperPortfolio(await closeRigorGatePaperPosition(tradeId));
    } catch (error) {
      setRigorGatePaperError(error instanceof Error ? error.message : "RigorGate position could not close.");
    } finally {
      setRigorGatePaperBusy(false);
    }
  }

  async function resetRigorGateVirtualPortfolio() {
    if (!window.confirm("Reset all RigorGate virtual trades, history, and performance results?")) return;
    setRigorGatePaperBusy(true);
    setRigorGatePaperError("");
    try {
      setRigorGatePaperPortfolio(await resetRigorGatePaperPortfolio());
    } catch (error) {
      setRigorGatePaperError(error instanceof Error ? error.message : "RigorGate reset failed.");
    } finally {
      setRigorGatePaperBusy(false);
    }
  }

  async function closeJdubVirtualPosition(tradeId: string) {
    setJdubPaperBusy(true);
    setJdubPaperError("");
    try {
      setJdubPaperPortfolio(await closeJdubPaperPosition(tradeId));
    } catch (error) {
      setJdubPaperError(error instanceof Error ? error.message : "Jdub Traders position could not close.");
    } finally {
      setJdubPaperBusy(false);
    }
  }

  async function resetJdubVirtualPortfolio() {
    if (!window.confirm("Reset all Jdub Traders virtual trades, history, and performance results?")) return;
    setJdubPaperBusy(true);
    setJdubPaperError("");
    try {
      setJdubPaperPortfolio(await resetJdubPaperPortfolio());
    } catch (error) {
      setJdubPaperError(error instanceof Error ? error.message : "Jdub Traders reset failed.");
    } finally {
      setJdubPaperBusy(false);
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

  async function controlExtremePaper(control: PaperControl) {
    setExtremePaperBusy(true);
    setExtremePaperError("");
    try {
      setExtremePaperPortfolio(await updateExtremePaperControl(control));
    } catch (error) {
      setExtremePaperError(error instanceof Error ? error.message : "Extreme virtual control update failed.");
    } finally {
      setExtremePaperBusy(false);
    }
  }

  async function controlCandlestickMain(control: PaperControl) {
    setCandlestickPaperBusy(true);
    setCandlestickPaperError("");
    try {
      setCandlestickPaperPortfolio(await updateCandlestickPaperControl(control));
    } catch (error) {
      setCandlestickPaperError(error instanceof Error ? error.message : "Candlestick main bot control update failed.");
    } finally {
      setCandlestickPaperBusy(false);
    }
  }

  async function runCandlestickMainCycle() {
    setCandlestickPaperBusy(true);
    setCandlestickPaperError("");
    try {
      setCandlestickPaperPortfolio(await runCandlestickPaperCycle(true));
    } catch (error) {
      setCandlestickPaperError(error instanceof Error ? error.message : "Candlestick main bot cycle failed.");
    } finally {
      setCandlestickPaperBusy(false);
    }
  }

  async function closeCandlestickMainPosition(tradeId: string) {
    setCandlestickPaperBusy(true);
    setCandlestickPaperError("");
    try {
      setCandlestickPaperPortfolio(await closeCandlestickPaperPosition(tradeId));
    } catch (error) {
      setCandlestickPaperError(error instanceof Error ? error.message : "Candlestick main position could not close.");
    } finally {
      setCandlestickPaperBusy(false);
    }
  }

  async function resetCandlestickMainPortfolio() {
    if (!window.confirm("Reset all Candlestick Main BUY + SELL trades, history, and results?")) return;
    setCandlestickPaperBusy(true);
    setCandlestickPaperError("");
    try {
      setCandlestickPaperPortfolio(await resetCandlestickPaperPortfolio());
    } catch (error) {
      setCandlestickPaperError(error instanceof Error ? error.message : "Candlestick main bot reset failed.");
    } finally {
      setCandlestickPaperBusy(false);
    }
  }

  async function controlCandlestickBuy(control: PaperControl) {
    setCandlestickBuyBusy(true);
    setCandlestickBuyError("");
    try {
      setCandlestickBuyPortfolio(await updateCandlestickBuyPaperControl(control));
    } catch (error) {
      setCandlestickBuyError(error instanceof Error ? error.message : "Bullish BUY bot control update failed.");
    } finally {
      setCandlestickBuyBusy(false);
    }
  }

  async function controlCandlestickSell(control: PaperControl) {
    setCandlestickSellBusy(true);
    setCandlestickSellError("");
    try {
      setCandlestickSellPortfolio(await updateCandlestickSellPaperControl(control));
    } catch (error) {
      setCandlestickSellError(error instanceof Error ? error.message : "Bearish SELL bot control update failed.");
    } finally {
      setCandlestickSellBusy(false);
    }
  }

  async function runCandlestickBuyCycle() {
    setCandlestickBuyBusy(true);
    setCandlestickBuyError("");
    try {
      setCandlestickBuyPortfolio(await runCandlestickBuyPaperCycle(true));
    } catch (error) {
      setCandlestickBuyError(error instanceof Error ? error.message : "Bullish BUY bot cycle failed.");
    } finally {
      setCandlestickBuyBusy(false);
    }
  }

  async function runCandlestickSellCycle() {
    setCandlestickSellBusy(true);
    setCandlestickSellError("");
    try {
      setCandlestickSellPortfolio(await runCandlestickSellPaperCycle(true));
    } catch (error) {
      setCandlestickSellError(error instanceof Error ? error.message : "Bearish SELL bot cycle failed.");
    } finally {
      setCandlestickSellBusy(false);
    }
  }

  async function closeCandlestickBuyPosition(tradeId: string) {
    setCandlestickBuyBusy(true);
    setCandlestickBuyError("");
    try {
      setCandlestickBuyPortfolio(await closeCandlestickBuyPaperPosition(tradeId));
    } catch (error) {
      setCandlestickBuyError(error instanceof Error ? error.message : "Bullish virtual position could not close.");
    } finally {
      setCandlestickBuyBusy(false);
    }
  }

  async function closeCandlestickSellPosition(tradeId: string) {
    setCandlestickSellBusy(true);
    setCandlestickSellError("");
    try {
      setCandlestickSellPortfolio(await closeCandlestickSellPaperPosition(tradeId));
    } catch (error) {
      setCandlestickSellError(error instanceof Error ? error.message : "Bearish virtual position could not close.");
    } finally {
      setCandlestickSellBusy(false);
    }
  }

  async function resetCandlestickBuyPortfolio() {
    if (!window.confirm("Reset all Bullish Engulfing BUY bot trades, history, and results?")) return;
    setCandlestickBuyBusy(true);
    setCandlestickBuyError("");
    try {
      setCandlestickBuyPortfolio(await resetCandlestickBuyPaperPortfolio());
    } catch (error) {
      setCandlestickBuyError(error instanceof Error ? error.message : "Bullish BUY bot reset failed.");
    } finally {
      setCandlestickBuyBusy(false);
    }
  }

  async function resetCandlestickSellPortfolio() {
    if (!window.confirm("Reset all Bearish Engulfing SELL bot trades, history, and results?")) return;
    setCandlestickSellBusy(true);
    setCandlestickSellError("");
    try {
      setCandlestickSellPortfolio(await resetCandlestickSellPaperPortfolio());
    } catch (error) {
      setCandlestickSellError(error instanceof Error ? error.message : "Bearish SELL bot reset failed.");
    } finally {
      setCandlestickSellBusy(false);
    }
  }

  async function controlVideoStrategy(control: PaperControl) {
    setVideoStrategyBusy(true);
    setVideoStrategyError("");
    try {
      setVideoStrategyPortfolio(await updateVideoStrategyPaperControl(control));
    } catch (error) {
      setVideoStrategyError(error instanceof Error ? error.message : "Video strategy control update failed.");
    } finally {
      setVideoStrategyBusy(false);
    }
  }

  async function runVideoStrategyCycle() {
    setVideoStrategyBusy(true);
    setVideoStrategyError("");
    try {
      setVideoStrategyPortfolio(await runVideoStrategyPaperCycle(true));
    } catch (error) {
      setVideoStrategyError(error instanceof Error ? error.message : "Video strategy cycle failed.");
    } finally {
      setVideoStrategyBusy(false);
    }
  }

  async function closeVideoStrategyPosition(tradeId: string) {
    setVideoStrategyBusy(true);
    setVideoStrategyError("");
    try {
      setVideoStrategyPortfolio(await closeVideoStrategyPaperPosition(tradeId));
    } catch (error) {
      setVideoStrategyError(error instanceof Error ? error.message : "Video strategy position could not close.");
    } finally {
      setVideoStrategyBusy(false);
    }
  }

  async function resetVideoStrategyPortfolio() {
    if (!window.confirm("Reset all Video MA + MTF MACD virtual trades, history, and results?")) return;
    setVideoStrategyBusy(true);
    setVideoStrategyError("");
    try {
      setVideoStrategyPortfolio(await resetVideoStrategyPaperPortfolio());
    } catch (error) {
      setVideoStrategyError(error instanceof Error ? error.message : "Video strategy reset failed.");
    } finally {
      setVideoStrategyBusy(false);
    }
  }

  async function runExtremeVirtualCycle() {
    setExtremePaperBusy(true);
    setExtremePaperError("");
    try {
      setExtremePaperPortfolio(await runExtremePaperCycle(true));
    } catch (error) {
      setExtremePaperError(error instanceof Error ? error.message : "Extreme virtual cycle failed.");
    } finally {
      setExtremePaperBusy(false);
    }
  }

  async function runStrategyLabCycleNow() {
    setStrategyLabBusy(true);
    setStrategyLabError("");
    try {
      setStrategyLab(await runStrategyLabCycle(true));
    } catch (error) {
      setStrategyLabError(error instanceof Error ? error.message : "Strategy lab cycle failed.");
    } finally {
      setStrategyLabBusy(false);
    }
  }

  async function controlStrategyLab(strategyId: string, control: PaperControl) {
    setStrategyLabBusy(true);
    setStrategyLabError("");
    try {
      setStrategyLab(await updateStrategyLabControl(strategyId, control));
    } catch (error) {
      setStrategyLabError(error instanceof Error ? error.message : "Strategy lab control failed.");
    } finally {
      setStrategyLabBusy(false);
    }
  }

  async function closeExtremeVirtualPosition(tradeId: string) {
    setExtremePaperBusy(true);
    setExtremePaperError("");
    try {
      setExtremePaperPortfolio(await closeExtremePaperPosition(tradeId));
    } catch (error) {
      setExtremePaperError(error instanceof Error ? error.message : "Extreme virtual position could not close.");
    } finally {
      setExtremePaperBusy(false);
    }
  }

  async function resetExtremeVirtualPortfolio() {
    if (!window.confirm("Reset all extreme virtual trades, history, and performance results?")) return;
    setExtremePaperBusy(true);
    setExtremePaperError("");
    try {
      setExtremePaperPortfolio(await resetExtremePaperPortfolio());
    } catch (error) {
      setExtremePaperError(error instanceof Error ? error.message : "Extreme virtual portfolio reset failed.");
    } finally {
      setExtremePaperBusy(false);
    }
  }

  function scrollToPanel(panelId: string) {
    const panel = document.getElementById(panelId);
    const header = document.querySelector<HTMLElement>(".workspace-header");
    if (!panel) return;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    window.scrollTo({
      top: Math.max(0, panel.offsetTop - headerHeight - 8),
      behavior: "smooth"
    });
  }

  function openPaperPanel() {
    scrollToPanel("paper-trading");
  }

  function moveSymbolByOffset(symbol: string, offset: number) {
    setSelectedSymbols((current) => {
      const sourceIndex = current.indexOf(symbol);
      const targetIndex = sourceIndex + offset;
      if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function resizeChart(symbol: string, height: number) {
    setChartHeights((current) => ({
      ...current,
      [symbol]: Math.max(CHART_HEIGHT_MIN, Math.min(CHART_HEIGHT_MAX, Math.round(height)))
    }));
  }

  function openExtremePanel() {
    scrollToPanel("extreme-alerts");
  }

  const paperBotPanels = [
    {
      id: "manual",
      label: "Manual Trading Bot",
      node: (
        <PaperTradingPanel
          variant="manual"
          portfolio={manualPaperPortfolio}
          busy={manualPaperBusy}
          error={manualPaperError}
          manualSymbol={manualBotSymbol}
          manualPrice={manualBotPrice}
          manualTimeframe={manualBotTimeframe}
          liveChart={(
            <ManualTradingBotChart
              symbol={manualBotSymbol}
              timeframe={manualBotTimeframe}
              onSymbolChange={setManualBotSymbol}
              onTimeframeChange={(nextTimeframe) => {
                setManualBotTimeframe(nextTimeframe);
                void controlManualPaper({ timeframe: nextTimeframe, timeframe_mode: "manual" });
              }}
              onPriceChange={setManualBotPrice}
            />
          )}
          onManualOpen={(request) => void openManualTradingBotTradeNow(request)}
          onNoteSave={(tradeId, note) => void saveManualTradeNote(tradeId, note)}
          onControl={(control) => void controlManualPaper(control)}
          onRun={() => void runManualTradingCycle()}
          onClose={(tradeId) => void closeManualTradingPosition(tradeId)}
          onReset={() => void resetManualTradingPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "paper",
      label: "Market Scanner",
      node: (
        <PaperTradingPanel
          portfolio={paperPortfolio}
          busy={paperBusy}
          error={paperError}
          onNoteSave={(tradeId, note) => void savePaperTradeNote(tradeId, note)}
          onControl={(control) => void controlPaper(control)}
          onRun={() => void runVirtualCycle()}
          onClose={(tradeId) => void closeVirtualPosition(tradeId)}
          onReset={() => void resetVirtualPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "jdub",
      label: "Jdub Traders",
      node: (
        <PaperTradingPanel
          variant="jdub"
          portfolio={jdubPaperPortfolio}
          busy={jdubPaperBusy}
          error={jdubPaperError}
          onControl={(control) => void controlJdubPaper(control)}
          onRun={() => void runJdubVirtualCycle()}
          onClose={(tradeId) => void closeJdubVirtualPosition(tradeId)}
          onReset={() => void resetJdubVirtualPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "candlestick",
      label: "Candlestick Main BUY + SELL",
      node: (
        <PaperTradingPanel
          variant="candlestick"
          portfolio={candlestickPaperPortfolio}
          busy={candlestickPaperBusy}
          error={candlestickPaperError}
          onControl={(control) => void controlCandlestickMain(control)}
          onRun={() => void runCandlestickMainCycle()}
          onClose={(tradeId) => void closeCandlestickMainPosition(tradeId)}
          onReset={() => void resetCandlestickMainPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "candlestick-buy",
      label: "Bullish Engulfing BUY Bot",
      node: (
        <PaperTradingPanel
          variant="candlestick-buy"
          portfolio={candlestickBuyPortfolio}
          busy={candlestickBuyBusy}
          error={candlestickBuyError}
          onControl={(control) => void controlCandlestickBuy(control)}
          onRun={() => void runCandlestickBuyCycle()}
          onClose={(tradeId) => void closeCandlestickBuyPosition(tradeId)}
          onReset={() => void resetCandlestickBuyPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "candlestick-sell",
      label: "Bearish Engulfing SELL Bot",
      node: (
        <PaperTradingPanel
          variant="candlestick-sell"
          portfolio={candlestickSellPortfolio}
          busy={candlestickSellBusy}
          error={candlestickSellError}
          onControl={(control) => void controlCandlestickSell(control)}
          onRun={() => void runCandlestickSellCycle()}
          onClose={(tradeId) => void closeCandlestickSellPosition(tradeId)}
          onReset={() => void resetCandlestickSellPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "video-strategy",
      label: "Video MA + MTF MACD Bot",
      node: (
        <PaperTradingPanel
          variant="video-strategy"
          portfolio={videoStrategyPortfolio}
          busy={videoStrategyBusy}
          error={videoStrategyError}
          onControl={(control) => void controlVideoStrategy(control)}
          onRun={() => void runVideoStrategyCycle()}
          onClose={(tradeId) => void closeVideoStrategyPosition(tradeId)}
          onReset={() => void resetVideoStrategyPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "rigorgate",
      label: "RigorGate",
      node: (
        <PaperTradingPanel
          variant="rigorgate"
          portfolio={rigorGatePaperPortfolio}
          busy={rigorGatePaperBusy}
          error={rigorGatePaperError}
          onControl={(control) => void controlRigorGatePaper(control)}
          onRun={() => void runRigorGateVirtualCycle()}
          onClose={(tradeId) => void closeRigorGateVirtualPosition(tradeId)}
          onReset={() => void resetRigorGateVirtualPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    },
    {
      id: "extreme",
      label: "Extreme Virtual Trading",
      node: (
        <PaperTradingPanel
          variant="extreme"
          portfolio={extremePaperPortfolio}
          busy={extremePaperBusy}
          error={extremePaperError}
          onControl={(control) => void controlExtremePaper(control)}
          onRun={() => void runExtremeVirtualCycle()}
          onClose={(tradeId) => void closeExtremeVirtualPosition(tradeId)}
          onReset={() => void resetExtremeVirtualPortfolio()}
          onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
        />
      )
    }
  ];

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
        onOpenDashboard={() => scrollToPanel("virtual-dashboard")}
        onOpenPaper={openPaperPanel}
        onOpenExtreme={openExtremePanel}
      />

      <VirtualTradersDashboard
        paper={paperPortfolio}
        manual={manualPaperPortfolio}
        jdub={jdubPaperPortfolio}
        rigorgate={rigorGatePaperPortfolio}
        extreme={extremePaperPortfolio}
        candlestick={candlestickPaperPortfolio}
        candlestickBuy={candlestickBuyPortfolio}
        candlestickSell={candlestickSellPortfolio}
        videoStrategy={videoStrategyPortfolio}
        strategyLab={strategyLab}
        onOpenPanel={scrollToPanel}
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
              indicators={chartIndicators[symbol] ?? DEFAULT_INDICATORS}
              focused={activeSymbol === symbol}
              onFocus={setActiveSymbol}
              onIndicatorsChange={(indicators) => setChartIndicators((current) => ({ ...current, [symbol]: indicators }))}
              onMove={moveSymbol}
              onMoveByOffset={moveSymbolByOffset}
              height={chartHeights[symbol]}
              onResize={resizeChart}
            />
          ))}
        </section>

        <SignalRail
          activeSignal={activeSignal}
          backtest={backtest}
          backtestBusy={backtestBusy}
          backtestError={backtestError}
          extremeBacktest={extremeBacktest}
          extremeHistoryLimit={extremeHistoryLimit}
          timeframe={timeframe}
          onExtremeHistoryLimitChange={setExtremeHistoryLimit}
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
          onRunBacktest={() => void runBacktest()}
        />
      </div>
      <ExtremeAlertsPanel
        scan={extremeScan}
        busy={extremeBusy}
        soundEnabled={soundEnabled}
        voiceEnabled={voiceEnabled}
        upper85NotificationsEnabled={extremeNotifications.upper85}
        lower15NotificationsEnabled={extremeNotifications.lower15}
        onUpper85NotificationsToggle={(enabled) => setExtremeNotifications((current) => ({ ...current, upper85: enabled }))}
        onLower15NotificationsToggle={(enabled) => setExtremeNotifications((current) => ({ ...current, lower15: enabled }))}
        onRun={() => void runExtremeScan()}
      />
      <StrategyLabPanel
        snapshot={strategyLab}
        busy={strategyLabBusy}
        error={strategyLabError}
        onRun={() => void runStrategyLabCycleNow()}
        onControl={(strategyId, control) => void controlStrategyLab(strategyId, control)}
        onBackToDashboard={() => scrollToPanel("virtual-dashboard")}
      />
      <PaperBotDock bots={paperBotPanels} />
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

function loadChartIndicators(): Record<string, ActiveIndicator[]> {
  try {
    const stored = window.localStorage.getItem("trader:chart-indicators");
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const validKinds = new Set(INDICATOR_CATALOG.map((indicator) => indicator.kind));
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([symbol, value]) => {
        if (!Array.isArray(value)) return [];
        const indicators = value.filter((item): item is ActiveIndicator => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false;
          const candidate = item as { kind?: unknown };
          return typeof candidate.kind === "string" && validKinds.has(candidate.kind as ActiveIndicator["kind"]);
        });
        return indicators.length ? [[symbol, indicators]] : [];
      })
    );
  } catch {
    return {};
  }
}

function loadExtremeNotificationPreferences(): { upper85: boolean; lower15: boolean } {
  try {
    const stored = window.localStorage.getItem("trader:extreme-notifications");
    if (!stored) return { upper85: true, lower15: true };
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { upper85: true, lower15: true };
    }
    const preferences = parsed as { upper85?: unknown; lower15?: unknown };
    return {
      upper85: preferences.upper85 !== false,
      lower15: preferences.lower15 !== false
    };
  } catch {
    return { upper85: true, lower15: true };
  }
}
