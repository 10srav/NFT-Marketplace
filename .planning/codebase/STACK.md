# Technology Stack

**Analysis Date:** 2026-02-21

## Languages

**Primary:**
- Solidity 0.8.20 - Smart contracts (ERC721 NFT contract, Marketplace contract)
- TypeScript ~5.7.0 - React frontend with strict type checking
- JavaScript - Hardhat deployment scripts and tests

**Secondary:**
- HTML/CSS - Web UI markup and styling

## Runtime

**Environment:**
- Node.js (version not specified in lockfiles, implied modern LTS)

**Package Manager:**
- npm (Lockfiles present: `package-lock.json` in both contracts/ and frontend/)

## Frameworks

**Core:**
- React 19.0.0 - UI framework
- Vite 6.0.0 - Build tool and dev server (configured on port 3000)
- Hardhat 2.22.0 - Solidity development framework

**Web3:**
- ethers.js 6.13.0 - Ethereum library for contract interaction and wallet management
- Ant Design (antd) 5.22.0 - Component library (dark theme configured)

**Routing:**
- react-router-dom 7.1.0 - Client-side routing for multi-page app

**Styling:**
- Tailwind CSS 4.0.0 - Utility-first CSS framework
- Ant Design theming - Dark theme with custom colors (#667eea primary, #0a0a0f bg)

**Testing:**
- Chai - Assertion library for contract tests
- Hardhat Test Runner - Via `@nomicfoundation/hardhat-toolbox` 5.0.0

**Build/Dev:**
- @vitejs/plugin-react 4.3.0 - React JSX support in Vite
- @nomicfoundation/hardhat-toolbox 5.0.0 - Hardhat plugins (ethers, chai, etc.)

## Key Dependencies

**Critical:**
- @openzeppelin/contracts 5.0.0 - ERC721, Ownable, Pausable standard implementations (used in `contracts/NFTContract.sol` and `contracts/Marketplace.sol`)
- ethers 6.13.0 - Web3 provider integration, contract ABIs, wallet connection via window.ethereum
- axios 1.7.0 - HTTP client for Pinata IPFS API calls

**Infrastructure:**
- dotenv 16.4.0 - Environment variable management in contracts/

## Configuration

**Environment:**
- Frontend (`frontend/.env`):
  - `VITE_NFT_CONTRACT_ADDRESS` - Deployed NFT contract address
  - `VITE_MARKETPLACE_ADDRESS` - Deployed Marketplace contract address
  - `VITE_PINATA_API_KEY` - Pinata API key for IPFS uploads
  - `VITE_PINATA_SECRET_KEY` - Pinata secret key
  - `VITE_PINATA_GATEWAY` - Custom Pinata gateway URL
  - `VITE_ALCHEMY_SEPOLIA_URL` - RPC endpoint for Sepolia testnet

- Contracts (`contracts/.env`):
  - `ALCHEMY_SEPOLIA_URL` - Alchemy RPC URL for Sepolia deployment
  - `DEPLOYER_PRIVATE_KEY` - Private key for contract deployment (NEVER committed)

**Build:**
- `contracts/hardhat.config.js` - Solidity 0.8.20 with optimizer (200 runs), network configs for hardhat local + Sepolia testnet
- `frontend/tsconfig.json` - ES2020 target, React JSX, strict mode, module resolution "bundler", path alias `@/*` → `./src/*`
- `frontend/vite.config.ts` - React plugin, source maps disabled for production, build output to `dist/`

## Platform Requirements

**Development:**
- Node.js with npm
- MetaMask browser extension (required for wallet connection via `window.ethereum`)
- Pinata account (for IPFS file uploads)
- Alchemy account (for Sepolia RPC endpoint)

**Production:**
- Deployment target: Ethereum Sepolia testnet (chainId: 11155111)
- Fallback: Local Hardhat network (chainId: 31337) for development
- Browser: Modern browser supporting Web3 wallet providers

---

*Stack analysis: 2026-02-21*
