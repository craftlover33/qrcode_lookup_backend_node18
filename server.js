// ======================================================
// LEGITCHECK.AI — QR / BARCODE LOOKUP BACKEND
// Node 18.x + eBay Browse API (Refresh Token Flow)
// ======================================================

import express from "express";
import axios from "axios";
import qs from "qs";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Optional: biar aman kalau nanti mau dipanggil dari web
app.use(cors());
app.use(express.json());

// ======================================================
// TOKEN MANAGEMENT (PAKAI REFRESH TOKEN)
// ======================================================
let accessToken = null;
let accessTokenExpiresAt = 0;

async function getEbayToken() {
  const now = Date.now();
  if (accessToken && now < accessTokenExpiresAt) {
    return accessToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error("❌ Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_REFRESH_TOKEN");
    throw new Error("Missing eBay environment variables");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = qs.stringify({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  console.log("🔄 Refreshing eBay access token...");

  const res = await axios.post(
    "https://api.ebay.com/identity/v1/oauth2/token",
    body,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basic}`,
      },
      timeout: 15000,
    }
  );

  accessToken = res.data.access_token;
  const expiresIn = res.data.expires_in ?? 3000; // detik
  // dikurangi 60 detik supaya tidak pas-pasan
  accessTokenExpiresAt = now + expiresIn * 1000 - 60_000;

  console.log("✅ eBay token refreshed OK");

  return accessToken;
}

// ======================================================
// ROOT CHECK
// ======================================================
app.get("/", (req, res) => {
  res.send("QR Lookup Backend (Node 18.x) Running ✔");
});

// ======================================================
// HELPER
// ======================================================
function normalizeCode(raw) {
  if (!raw) return "";
  // buang spasi, dash, dll
  return String(raw).trim().replace(/[^0-9A-Za-z]/g, "");
}

function mapItemSummary(i) {
  return {
    id: i.itemId,
    title: i.title,
    brand: i.brand ?? i.itemBrand ?? null,
    condition: i.condition ?? null,
    price: i.price?.value ?? null,
    currency: i.price?.currency ?? null,
    image:
      i.thumbnailImages?.[0]?.imageUrl ??
      i.image?.imageUrl ??
      null,
    url: i.itemWebUrl ?? null,
    seller: i.seller?.username ?? null,
  };
}

// ======================================================
// /lookup?code=123456789012
// ======================================================
app.get("/lookup", async (req, res) => {
  const rawCode = req.query.code;

  if (!rawCode) {
    return res.status(400).json({
      success: false,
      error: "Missing ?code= in query string",
    });
  }

  const code = normalizeCode(rawCode);

  if (!code) {
    return res.status(400).json({
      success: false,
      error: "Invalid code",
    });
  }

  try {
    const token = await getEbayToken();

    const headers = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
    };

    const collected = [];

    // 1️⃣ Coba pakai UPC filter (paling akurat)
    try {
      const upcUrl =
        `https://api.ebay.com/buy/browse/v1/item_summary/search` +
        `?filter=upc:${code}&limit=10`;
      console.log("🔎 eBay UPC search:", upcUrl);

      const upcResp = await axios.get(upcUrl, {
        headers,
        timeout: 15000,
      });

      const upcItems = upcResp.data.itemSummaries || [];
      collected.push(...upcItems);
    } catch (err) {
      console.error("UPC search error:", err.response?.data || err.message);
    }

    // 2️⃣ Fallback: text search pakai q=code
    if (collected.length === 0) {
      try {
        const qUrl =
          `https://api.ebay.com/buy/browse/v1/item_summary/search` +
          `?q=${encodeURIComponent(code)}&limit=10`;
        console.log("🔎 eBay text search:", qUrl);

        const qResp = await axios.get(qUrl, {
          headers,
          timeout: 15000,
        });

        const qItems = qResp.data.itemSummaries || [];
        collected.push(...qItems);
      } catch (err) {
        console.error("Text search error:", err.response?.data || err.message);
      }
    }

    // 3️⃣ Tidak ada hasil sama sekali
    if (collected.length === 0) {
      return res.json({
        success: true,
        found: false,
        code,
        items: [],
      });
    }

    // 4️⃣ Uniq by itemId / url
    const unique = [];
    const seenIds = new Set();

    for (const item of collected) {
      const id = item.itemId || item.itemWebUrl;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      unique.push(mapItemSummary(item));
    }

    return res.json({
      success: true,
      found: true,
      code,
      total_found: unique.length,
      items: unique,
    });
  } catch (err) {
    console.error("Lookup error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      found: false,
      error: "Lookup error",
    });
  }
});

// ======================================================
// START SERVER
// ======================================================
app.listen(PORT, () => {
  console.log(`✅ QR Lookup backend running on port ${PORT}`);
});
