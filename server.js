// ======================================================
// LEGITCHECK.AI — QR / BARCODE LOOKUP BACKEND
// Node 18.x + eBay Browse API (Refresh Token Flow)
// ======================================================

import express from "express";
import axios from "axios";
import qs from "qs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ======================================================
// TOKEN MANAGEMENT (REFRESH TOKEN)
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

  const expiresIn = res.data.expires_in ?? 3000;
  accessTokenExpiresAt = now + expiresIn * 1000 - 60000;

  console.log("✅ eBay token refreshed OK");
  return accessToken;
}

// ======================================================
// ROOT
// ======================================================
app.get("/", (req, res) => {
  res.send("QR Lookup Backend (Node 18.x) Running ✔");
});

// ======================================================
// HELPERS
// ======================================================
function normalizeCode(raw) {
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
    image: i.thumbnailImages?.[0]?.imageUrl ?? i.image?.imageUrl ?? null,
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
      error: "Missing ?code=",
    });
  }

  const code = normalizeCode(rawCode);

  try {
    const token = await getEbayToken();

    const headers = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    };

    const collected = [];

    // UPC filter
    try {
      const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?filter=upc:${code}&limit=10`;
      const upcRes = await axios.get(url, { headers, timeout: 15000 });
      const items = upcRes.data.itemSummaries || [];
      collected.push(...items);
    } catch {}

    // fallback search
    if (collected.length === 0) {
      try {
        const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${code}&limit=10`;
        const qRes = await axios.get(url, { headers, timeout: 15000 });
        const items = qRes.data.itemSummaries || [];
        collected.push(...items);
      } catch {}
    }

    if (collected.length === 0) {
      return res.json({
        success: true,
        found: false,
        code,
        items: [],
      });
    }

    const unique = [];
    const seen = new Set();

    for (const i of collected) {
      const key = i.itemId || i.itemWebUrl;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(mapItemSummary(i));
      }
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
// START
// ======================================================
app.listen(PORT, () => {
  console.log(`🚀 QR Lookup Backend running on port ${PORT}`);
});
