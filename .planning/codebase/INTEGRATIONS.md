# External Integrations

**Analysis Date:** 2026-02-21

## APIs & External Services

**IPFS Storage (Pinata):**
- Pinata Cloud - Decentralized file storage and metadata management
  - SDK/Client: Custom implementation via axios to `https://api.pinata.cloud`
  - Auth: `pinata_api_key` and `pinata_secret_api_key` headers
  - Endpoints:
    - `POST /pinning/pinFileToIPFS` - Upload image files (used in `frontend/src/services/ipfs.ts`)
    - `POST /pinning/pinJSONToIPFS` - Upload metadata JSON (used in `frontend/src/services/ipfs.ts`)
  - Gateway: Configurable via `VITE_PINATA_GATEWAY` env var (default: `https://gateway.pinata.cloud/ipfs/`)

**Blockchain RPC:**
- Alchemy - Ethereum node provider
  - SDK/Client: ethers.js BrowserProvider wraps `window.ethereum` for JSON-RPC calls
  - Auth: `ALCHEMY_SEPOLIA_URL` contains API key in URL
  - Endpoint: Sepolia testnet RPC (chainId: 11155111)
  - Used by: `frontend/src/hooks/useWallet.ts` for provider initialization

## Data Storage

**Databases:**
- Blockchain (Ethereum Sepolia) - Primary data store
  - Connection: Via Alchemy RPC endpoint (`VITE_ALCHEMY_SEPOLIA_URL`)
  - Client: ethers.js 6.13.0
  - Contracts:
    - NFT Contract (`0x5FbDB2315678afecb367f032d93F642f64180aa3` - default local address)
    - Marketplace Contract (`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` - default local address)
  - Data structure: ERC721 tokens with IPFS metadata URIs, marketplace listings with prices

**File Storage:**
- IPFS via Pinata - Distributed file storage
  - Images and metadata JSON stored on IPFS
  - IPFS hash returned from Pinata API used in token metadata
  - Gateway resolution: `ipfsToHttp()` function in `frontend/src/services/ipfs.ts` converts `ipfs://` URIs to HTTP gateway URLs

**Caching:**
- Browser localStorage - React state management (implicit via hooks)
- No explicit caching layer detected

## Authentication & Identity

**Auth Provider:**
- MetaMask (wallet-based, decentralized)
  - Implementation: Web3 wallet provider via `window.ethereum` (EIP-1193)
  - Connection flow: `useWallet()` hook in `frontend/src/hooks/useWallet.ts`
    - Requests account access via `eth_requestAccounts`
    - Listens to `accountsChanged` and `chainChanged` events
    - Auto-reconnects if previously connected
  - Signing: Contract transactions signed by wallet owner via ethers.js signer
  - No backend authentication - all auth is on-chain via transaction signatures

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, LogRocket, or similar service integrated

**Logs:**
- Console logging only (implicit in development)
- Contract test output via Hardhat/Chai (file: `contracts/test/NFTContract.test.js`, `contracts/test/Marketplace.test.js`)

**Debugging:**
- Vite source maps enabled in dev, disabled in production
- Hardhat local network for testing (`http://127.0.0.1:8545`)

## CI/CD & Deployment

**Hosting:**
- Frontend: Undeployed (dev/build ready)
  - Build command: `tsc -b && vite build`
  - Output: `frontend/dist/`
  - Requires static file hosting (Vercel, Netlify, AWS S3, etc.)
- Contracts: Ethereum Sepolia testnet
  - Deployment script: `contracts/scripts/deploy.js`
  - Deploy command: `hardhat run scripts/deploy.js --network sepolia`

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, or similar configured

## Environment Configuration

**Required env vars - Frontend:**
- `VITE_NFT_CONTRACT_ADDRESS` - Deployed NFT contract address (required after deployment)
- `VITE_MARKETPLACE_ADDRESS` - Deployed Marketplace contract address (required after deployment)
- `VITE_PINATA_API_KEY` - Pinata API key (required for image uploads)
- `VITE_PINATA_SECRET_KEY` - Pinata secret key (required for API auth)
- `VITE_PINATA_GATEWAY` - Pinata gateway domain (optional, defaults to `gateway.pinata.cloud`)
- `VITE_ALCHEMY_SEPOLIA_URL` - Alchemy Sepolia RPC URL (optional, used in fallback)

**Required env vars - Contracts:**
- `ALCHEMY_SEPOLIA_URL` - Alchemy Sepolia RPC URL (required for testnet deployment)
- `DEPLOYER_PRIVATE_KEY` - Private key for contract deployment (required, NEVER commit)

**Secrets location:**
- `.env` files (git-ignored via `.gitignore`)
- `.env.example` provides template without secrets
- Frontend: `frontend/.env` and `frontend/.env.example`
- Contracts: `contracts/.env` and `contracts/.env.example`

## Webhooks & Callbacks

**Incoming:**
- None detected - No webhook endpoints in frontend or contracts

**Outgoing:**
- MetaMask event listeners (browser-side):
  - `window.ethereum.on('accountsChanged', ...)` - User switches account
  - `window.ethereum.on('chainChanged', ...)` - User switches network
  - Implemented in `frontend/src/hooks/useWallet.ts` (lines 95-105)

## Smart Contract Interactions

**NFT Contract (ERC721):**
- Address: `VITE_NFT_CONTRACT_ADDRESS`
- ABI: Defined in `frontend/src/config/contracts.ts`
- Key functions:
  - `mintNFT(tokenURI)` - Mint new NFT with IPFS metadata
  - `transferFrom(from, to, tokenId)` - Transfer ownership
  - `approve(to, tokenId)` - Approve for sale on marketplace
  - `setApprovalForAll(operator, approved)` - Approve marketplace to transfer

**Marketplace Contract:**
- Address: `VITE_MARKETPLACE_ADDRESS`
- ABI: Defined in `frontend/src/config/contracts.ts`
- Key functions:
  - `listItem(nftContract, tokenId, price)` - List NFT for sale
  - `buyItem(listingId)` - Purchase listed NFT (payable)
  - `unlistItem(listingId)` - Remove listing
  - `getActiveListingIds()` - Fetch all active listings
- Events emitted: `ItemListed`, `ItemSold`, `ItemUnlisted`

## Cross-Contract Dependencies

**Frontend → Contracts:**
- NFT Contract via ethers.js at runtime (user-supplied address)
- Marketplace Contract via ethers.js at runtime (user-supplied address)
- Both configured in `frontend/src/config/contracts.ts`

**Marketplace → NFT Contract:**
- On-chain: Marketplace calls `transferFrom()` on NFT contract
- Referenced in Marketplace contract code (requires approval)

---

*Integration audit: 2026-02-21*
