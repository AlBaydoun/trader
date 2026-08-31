import type {
  AccountList,
  Backtest,
  Candle,
  ExtremeBacktest,
  MT5Position,
  MT5Quote,
  MarketScan,
  MarketSymbol,
  NewsFeed,
  ExtremeScan,
  ManualPaperTradeRequest,
  PaperControl,
  PaperPortfolio,
  ScanResponse,
  Signal,
  Status,
  StrategyDefinition,
  StrategyLabSnapshot
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function sendJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getStatus(): Promise<Status> {
  return getJson<Status>("/status");
}

export function getAccounts(): Promise<AccountList> {
  return getJson<AccountList>("/accounts");
}

export function getMT5Quotes(symbols: string[]): Promise<MT5Quote[]> {
  const query = encodeURIComponent(symbols.join(","));
  return getJson<MT5Quote[]>(`/mt5/quotes?symbols=${query}`);
}

export function getMT5Positions(): Promise<MT5Position[]> {
  return getJson<MT5Position[]>("/mt5/positions");
}

export async function setActiveAccount(accountId: string): Promise<AccountList> {
  const response = await fetch(`${API_URL}/accounts/active`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_id: accountId })
  });
  if (!response.ok) {
    throw new Error(`Account switch failed: ${response.status}`);
  }
  return response.json() as Promise<AccountList>;
}

export function getCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  return getJson<Candle[]>(`/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}&limit=240`);
}

export function getSignal(symbol: string, timeframe: string): Promise<Signal> {
  return getJson<Signal>(`/signals/${encodeURIComponent(symbol)}?timeframe=${timeframe}`);
}

export function scan(symbols: string[], timeframe: string): Promise<ScanResponse> {
  const query = encodeURIComponent(symbols.join(","));
  return getJson<ScanResponse>(`/scan?symbols=${query}&timeframe=${timeframe}`);
}

export function getNewsAnalysis(symbols: string[]): Promise<NewsFeed> {
  const query = encodeURIComponent(symbols.join(","));
  return getJson<NewsFeed>(`/news/analysis?symbols=${query}`);
}

export function getMarketSymbols(search = "", limit = 2000): Promise<MarketSymbol[]> {
  const query = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
  return getJson<MarketSymbol[]>(`/market/symbols?limit=${limit}${query}`);
}

export function scanWholeMarket(timeframe: string, force = false): Promise<MarketScan> {
  return getJson<MarketScan>(
    `/market/scan?timeframe=${timeframe}&limit=50&force=${force ? "true" : "false"}`
  );
}

export function getStrategy(): Promise<StrategyDefinition> {
  return getJson<StrategyDefinition>("/strategy");
}

export function getPaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/portfolio");
}

export function getManualPaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/manual/portfolio");
}

export function getJdubPaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/jdub/portfolio");
}

export function getRigorGatePaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/rigorgate/portfolio");
}

export function getExtremePaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/extreme/portfolio");
}

export function getCandlestickPaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/candlestick/portfolio");
}

export function getCandlestickBuyPaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/candlestick/buy/portfolio");
}

export function getCandlestickSellPaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/candlestick/sell/portfolio");
}

export function getVideoStrategyPaperPortfolio(): Promise<PaperPortfolio> {
  return getJson<PaperPortfolio>("/paper/video-ma-macd/portfolio");
}

export function getStrategyLab(): Promise<StrategyLabSnapshot> {
  return getJson<StrategyLabSnapshot>("/paper/strategies");
}

export function scanExtremeLevels(timeframe: string, force = false): Promise<ExtremeScan> {
  return getJson<ExtremeScan>(
    `/extreme/scan?timeframe=${timeframe}&limit=50&force=${force ? "true" : "false"}`
  );
}

export function updatePaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/control", control);
}

export function updateManualPaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/manual/control", control);
}

export function openManualPaperTrade(trade: ManualPaperTradeRequest): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/manual/open", trade);
}

export function runManualPaperCycle(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/manual/cycle");
}

export function closeManualPaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/manual/positions/${encodeURIComponent(tradeId)}/close`);
}

export function updateManualPaperTradeNote(tradeId: string, note: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(
    `/paper/manual/positions/${encodeURIComponent(tradeId)}/note`,
    { note }
  );
}

export function resetManualPaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/manual/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function updatePaperTradeNote(tradeId: string, note: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(
    `/paper/positions/${encodeURIComponent(tradeId)}/note`,
    { note }
  );
}

export function updateJdubPaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/jdub/control", control);
}

export function updateRigorGatePaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/rigorgate/control", control);
}

export function updateExtremePaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/extreme/control", control);
}

export function updateCandlestickPaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/candlestick/control", control);
}

export function updateCandlestickBuyPaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/candlestick/buy/control", control);
}

export function updateCandlestickSellPaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/candlestick/sell/control", control);
}

export function updateVideoStrategyPaperControl(control: PaperControl): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/video-ma-macd/control", control);
}

export function runPaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/cycle?force=${force ? "true" : "false"}`);
}

export function runJdubPaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/jdub/cycle?force=${force ? "true" : "false"}`);
}

export function runRigorGatePaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/rigorgate/cycle?force=${force ? "true" : "false"}`);
}

export function runExtremePaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/extreme/cycle?force=${force ? "true" : "false"}`);
}

export function runCandlestickPaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/candlestick/cycle?force=${force ? "true" : "false"}`);
}

export function runCandlestickBuyPaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/candlestick/buy/cycle?force=${force ? "true" : "false"}`);
}

export function runCandlestickSellPaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/candlestick/sell/cycle?force=${force ? "true" : "false"}`);
}

export function runVideoStrategyPaperCycle(force = true): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/video-ma-macd/cycle?force=${force ? "true" : "false"}`);
}

export function runStrategyLabCycle(force = true): Promise<StrategyLabSnapshot> {
  return sendJson<StrategyLabSnapshot>(`/paper/strategies/cycle?force=${force ? "true" : "false"}`);
}

export function updateStrategyLabControl(
  strategyId: string,
  control: PaperControl
): Promise<StrategyLabSnapshot> {
  return sendJson<StrategyLabSnapshot>(
    `/paper/strategies/${encodeURIComponent(strategyId)}/control`,
    control
  );
}

export function closePaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/positions/${encodeURIComponent(tradeId)}/close`);
}

export function closeJdubPaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/jdub/positions/${encodeURIComponent(tradeId)}/close`);
}

export function closeRigorGatePaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/rigorgate/positions/${encodeURIComponent(tradeId)}/close`);
}

export function closeExtremePaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/extreme/positions/${encodeURIComponent(tradeId)}/close`);
}

export function closeCandlestickPaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/candlestick/positions/${encodeURIComponent(tradeId)}/close`);
}

export function closeCandlestickBuyPaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/candlestick/buy/positions/${encodeURIComponent(tradeId)}/close`);
}

export function closeCandlestickSellPaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/candlestick/sell/positions/${encodeURIComponent(tradeId)}/close`);
}

export function closeVideoStrategyPaperPosition(tradeId: string): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>(`/paper/video-ma-macd/positions/${encodeURIComponent(tradeId)}/close`);
}

export function resetPaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function resetJdubPaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/jdub/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function resetRigorGatePaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/rigorgate/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function resetExtremePaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/extreme/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function resetCandlestickPaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/candlestick/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function resetCandlestickBuyPaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/candlestick/buy/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function resetCandlestickSellPaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/candlestick/sell/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function resetVideoStrategyPaperPortfolio(): Promise<PaperPortfolio> {
  return sendJson<PaperPortfolio>("/paper/video-ma-macd/reset", { confirmation: "RESET PAPER ACCOUNT" });
}

export function getBacktest(symbol: string, timeframe: string): Promise<Backtest> {
  return getJson<Backtest>(`/backtests/${encodeURIComponent(symbol)}?timeframe=${timeframe}`);
}

export function getExtremeBacktest(
  symbol: string,
  timeframe: string,
  limit = 2000
): Promise<ExtremeBacktest> {
  return getJson<ExtremeBacktest>(
    `/backtests/extreme/${encodeURIComponent(symbol)}?timeframe=${timeframe}&limit=${limit}&max_hold_bars=15`
  );
}
