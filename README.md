# wacz-uploader

A straightforward single page application for uploading your WACZ archives to IPFS

## Development

Copy config file and replace `your_web3_storage_token` with your token:
```
cp config.js.sample config.js
```

Install dependencies:

```
npm i
```

Start dev server and reload on changes:

```
npm run dev
```

Build JS files:
```
npm run build
```

> NOTE: This app should NOT be deployed to a production environment as it currently hardcodes your Web3 Storage auth token thereby exposing it in the browser.