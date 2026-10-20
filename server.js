const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TWELVE_DATA_API_KEY || "";

app.use(express.static(path.join(__dirname, "public")));

const symbols = {
  "BTC/USD": { crypto: "BTCUSDT", type: "crypto" },
  "ETH/USD": { crypto: "ETHUSDT", type: "crypto" },
  "SOL/USD": { crypto: "SOLUSDT", type: "crypto" },
  "EUR/USD": { type: "forex" },
  "GBP/USD": { type: "forex" },
  "USD/JPY": { type: "forex" },
  "XAU/USD": { type: "metal" },
  "XAG/USD": { type: "metal" }
};

const intervals = {
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day"
};

async function getBinance(symbol, interval, limit) {
  const response = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error("Binance data unavailable");
  }

  const rows = await response.json();

  return rows.map(row => ({
    datetime: new Date(row[0]).toISOString(),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }));
}

async function getTwelveData(symbol, interval, limit) {
  if (!API_KEY) {
    throw new Error("Twelve Data API key is not configured on Render.");
  }

  const url = new URL(
    "https://api.twelvedata.com/time_series"
  );

  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(limit));
  url.searchParams.set("apikey", API_KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.status === "error" || !data.values) {
    throw new Error(
      data.message || "Twelve Data request failed"
    );
  }

  return data.values.reverse().map(row => ({
    datetime: row.datetime,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume || 0)
  }));
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    apiKeyConfigured: Boolean(API_KEY)
  });
});

app.get("/api/candles", async (req, res) => {
  const symbol = String(
    req.query.symbol || "BTC/USD"
  ).toUpperCase();

  const interval = String(req.query.interval || "1h");
  const limit = Math.max(
    80,
    Math.min(500, Number(req.query.limit) || 200)
  );

  if (!symbols[symbol] || !intervals[interval]) {
    return res.status(400).json({
      error: "Unsupported symbol or timeframe"
    });
  }

  try {
    let candles;
    let source;

    if (symbols[symbol].type === "crypto") {
      try {
        candles = await getBinance(
          symbols[symbol].crypto,
          interval,
          limit
        );
        source = "Binance";
      } catch (error) {
        candles = await getTwelveData(
          symbol,
          intervals[interval],
          limit
        );
        source = "Twelve Data";
      }
    } else {
      candles = await getTwelveData(
        symbol,
        intervals[interval],
        limit
      );
      source = "Twelve Data";
    }

    if (candles.length < 60) {
      throw new Error("Not enough market candles returned");
    }

    res.set("Cache-Control", "no-store");

    res.json({
      symbol,
      interval,
      source,
      fetchedAt: new Date().toISOString(),
      candles
    });
  } catch (error) {
    res.status(502).json({
      error: error.message || "Live data unavailable"
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.listen(PORT, () => {
  console.log("GENERAL PRO V1.0 running on port " + PORT);
});
