# QRCode Lookup Backend (Node 18.x)

Backend untuk lookup barcode/QR dan mengambil title, brand, & image dari eBay.

## Deploy ke Render

1. Upload repo ini ke GitHub
2. Render → New Web Service
3. Build Command:
   npm install
4. Start Command:
   npm start
5. Tambah Environment Variables:
   EBAY_CLIENT_ID=
   EBAY_CLIENT_SECRET=
   EBAY_REFRESH_TOKEN=

## Endpoint Tes
GET /lookup?code=196153392214
