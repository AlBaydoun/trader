import type {
  AccountList,
  Backtest,
  Candle,
  MT5Position,
  MT5Quote,
  MarketScan,
  MarketSymbol,
  NewsFeed,
  ScanResponse,
  Status,
  StrategyDefinition
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
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

export function scan(symbols: string[], timeframe: string): Promise<ScanResponse> {
  const query = encodeURIComponent(symbols.join(","));
  return getJson<ScanResponse>(`/scan?symbols=${query}&timeframe=${timeframe}`);
}

export function getNewsAnalysis(symbols: string[]): Promise<NewsFeed> {
  const query = encodeURIComponent(symbols.join(","));
  return getJson<NewsFeed>(`/news/analysis?symbols=${query}`);
}

export function getMarketSymbols(): Promise<MarketSymbol[]> {
  return getJson<MarketSymbol[]>("/market/symbols?limit=2000");
}

export function scanWholeMarket(timeframe: string, force = false): Promise<MarketScan> {
  return getJson<MarketScan>(
    `/market/scan?timeframe=${timeframe}&limit=50&force=${force ? "true" : "false"}`
  );
}

export function getStrategy(): Promise<StrategyDefinition> {
  return getJson<StrategyDefinition>("/strategy");
}

export function getBacktest(symbol: string, timeframe: string): Promise<Backtest> {
  return getJson<Backtest>(`/backtests/${encodeURIComponent(symbol)}?timeframe=${timeframe}`);
}
