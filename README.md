# wacz-uploader

A straightforward single page application for uploading your WACZ archives to IPFS

## Development

Copy config file and replace `your_web3_storage_token` with your token:
```
cp .env.sample .env
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

**Warning:**
This app should NOT be deployed to a production environment if you do not want to publicly share your Web3 Storage auth token, as it currently hardcodes your token thereby exposing it in the browser.