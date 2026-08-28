import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartPanel } from "./components/ChartPanel";
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
  getStatus,
  getStrategy,
  scan,
  scanWholeMarket,
  setActiveAccount
} from "./lib/api";
import { playSignalTone, speakSignal } from "./lib/alerts";
import type {
  AccountList,
  Backtest,
  Candle,
  MarketEvent,
  MarketScan,
  MarketSymbol,
  MT5Quote,
  NewsStatus,
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
  const [tradeMode, setTradeMode] = useState<TradeMode>("signal_only");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [backtest, setBacktest] = useState<Backtest | undefined>();
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
    getStrategy().then(setStrategy).catch(() => setStrategy(undefined));
  }, []);

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
        onOpenSymbols={() => setDrawerOpen(true)}
        onTimeframeChange={setTimeframe}
        onAccountChange={(accountId) => void switchAccount(accountId)}
        onRefresh={() => void refresh()}
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
          onTradeModeChange={setTradeMode}
          onSoundToggle={() => setSoundEnabled((enabled) => !enabled)}
          onVoiceToggle={() => setVoiceEnabled((enabled) => !enabled)}
        />
      </div>
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
