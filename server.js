import express from "express";
import axios from "axios";
import qs from "qs";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

async function getEbayToken() {
  const basic = Buffer.from(
    process.env.EBAY_CLIENT_ID + ":" + process.env.EBAY_CLIENT_SECRET
  ).toString("base64");

  const body = qs.stringify({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope"
  });

  const res = await axios.post(
    "https://api.ebay.com/identity/v1/oauth2/token",
    body,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basic}`
      }
    }
  );

  return res.data.access_token;
}

app.get("/", (req, res) => {
  res.send("QR Lookup Backend (Node 18.x) Running ✔");
});

app.get("/lookup", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.json({ error: "Missing ?code=" });

    const token = await getEbayToken();

    const apiRes = await axios.get(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${code}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
        }
      }
    );

    const items = apiRes.data.itemSummaries || [];

    if (items.length === 0) {
      return res.json({
        success: true,
        found: false,
        code,
        items: []
      });
    }

    const formatted = items.map(i => ({
      title: i.title,
      brand: i.brand,
      image: i.thumbnailImages?.[0]?.imageUrl ?? i.image?.imageUrl
    }));

    res.json({
      success: true,
      found: true,
      total_found: items.length,
      code,
      items: formatted
    });

  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      found: false,
      error: "Lookup error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`QR Lookup backend running on port ${PORT}`);
});
