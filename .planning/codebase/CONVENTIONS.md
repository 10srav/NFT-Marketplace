# Coding Conventions

**Analysis Date:** 2026-02-21

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `NFTCard.tsx`, `WalletConnect.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useWallet.ts`, `useContracts.ts`)
- Services/utilities: camelCase (e.g., `ipfs.ts`)
- Pages: PascalCase (e.g., `Dashboard.tsx`, `Marketplace.tsx`)
- Solidity contracts: PascalCase (e.g., `NFTContract.sol`, `Marketplace.sol`)
- Test files: `.test.js` suffix (e.g., `Marketplace.test.js`, `NFTContract.test.js`)

**Functions:**
- React components: PascalCase (exported as default)
- Utility functions: camelCase (e.g., `uploadImageToIPFS`, `ipfsToHttp`, `truncateAddr`)
- Solidity internal functions: camelCase with underscore prefix for private (e.g., `_removeActiveListing`, `_nextTokenId`)
- Solidity public functions: camelCase (e.g., `mintNFT`, `listItem`, `buyItem`)

**Variables:**
- React state: camelCase (e.g., `listings`, `search`, `isConnecting`)
- Constants: UPPER_SNAKE_CASE for immutable values (e.g., `COMMISSION_DENOMINATOR`, `PINATA_API`)
- Type prefixes: Use descriptive types (e.g., `activeIds`, `sellerBalance`)
- Solidity private state: underscore prefix with camelCase (e.g., `_nextTokenId`, `_activeListingIds`)

**Types:**
- Interfaces: PascalCase with `Props` suffix for component props (e.g., `NFTCardProps`, `WalletState`)
- Interfaces for data: PascalCase (e.g., `OwnedNFT`, `NFTListing`)
- Solidity structs: PascalCase (e.g., `Listing`)
- Type definitions: Avoid `any`, prefer specific types or `unknown` with narrowing

## Code Style

**Formatting:**
- No Prettier config detected, but code follows 2-4 space indentation
- Line length: Flexible, but prefers readable line breaks
- Imports grouped: External libraries first, then project imports, then types
- Trailing commas in objects and arrays

**Linting:**
- ESLint configured in `frontend/eslint.config.js` with:
  - TypeScript ESLint recommended config
  - React Hooks rules enabled
  - React Refresh plugin enabled
  - Targets ES2020 with browser globals
  - No strict unused variable enforcement (`noUnusedLocals: false`, `noUnusedParameters: false`)

**TypeScript:**
- Strict mode enabled in `frontend/tsconfig.json`
- Target: ES2020
- Module: ESNext
- Path aliases: `@/*` maps to `./src/*`
- JSX: react-jsx (automatic runtime)

## Import Organization

**Order:**
1. External packages (React, ethers, axios, antd)
2. Components or hooks from current project
3. Services and utilities
4. Configuration files
5. Type definitions (inline or separate)

**Pattern example** from `frontend/src/pages/Marketplace.tsx`:
```typescript
import { useState, useEffect, useCallback } from "react";
import { Row, Col, Typography, Input, Select, Spin, Empty, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import NFTCard from "../components/NFTCard";
import { useWallet } from "../hooks/useWallet";
import { useContracts } from "../hooks/useContracts";
import { ipfsToHttp } from "../services/ipfs";

const { Title } = Typography;
```

**Path Aliases:**
- Frontend: `@/*` → `./src/*` (configured in `vite.config.ts` and `tsconfig.json`)

## Error Handling

**Frontend patterns:**
- Silent catch blocks with empty comments for expected failures (e.g., `catch { /* use defaults */ }`)
- Message notifications for user-facing errors using `message.error()`, `message.success()`
- Try-catch in async functions with fallback UI states
- Console.error for debugging (e.g., `console.error("Fetch listings error:", err);`)

**Solidity patterns:**
- Require statements with clear error messages (e.g., `"Price must be > 0"`, `"Not the NFT owner"`)
- No custom error types used (plain strings)
- ReentrancyGuard for protecting state-changing functions
- Pausable pattern for emergency circuit-breaker

**Example** from `frontend/src/hooks/useWallet.ts`:
```typescript
catch (err: any) {
    setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: err.message || "Connection failed",
    }));
}
```

## Logging

**Framework:** console methods (no dedicated logging library)

**Patterns:**
- Development logs only: `console.error()` for catching actual errors
- No verbose/debug logging in frontend
- Contract events emit on state changes (used instead of logs)
- Silent failures in non-critical paths (IPFS metadata fetch, token burns)

## Comments

**When to Comment:**
- Function headers in Solidity use NatSpec `///` format
- Complex logic requiring explanation
- Inline comments for non-obvious calculations (e.g., basis points math)
- Section headers in Solidity using ASCII art: `// ──── Types ────`

**JSDoc/TSDoc:**
- Solidity uses NatSpec comments with `@notice`, `@param`, `@return` tags
- React/TypeScript: Minimal JSDoc; prefer self-documenting code with clear names
- Interface definitions are self-documenting

**Example** from `frontend/src/components/NFTCard.tsx`:
```typescript
interface NFTCardProps {
    tokenId: number;
    name: string;
    image: string;
    price?: bigint;
    owner?: string;
    listingId?: number;
    showBuy?: boolean;
    onBuy?: (listingId: number) => void;
}
```

**Example** from `contracts/contracts/NFTContract.sol`:
```solidity
/// @notice Mint a new NFT with the given metadata URI
/// @param _tokenURI IPFS metadata URI
/// @return tokenId The ID of the newly minted token
function mintNFT(string memory _tokenURI) public returns (uint256) {
```

## Function Design

**Size:**
- Small focused functions (< 50 lines typical)
- Async functions in React may span 30-40 lines for full logic flow
- Solidity functions are concise with clear separation of concerns

**Parameters:**
- Destructured props in React components (e.g., `{ tokenId, name, image, ... }`)
- Named parameters in async calls rather than positional
- Use of callback pattern for event handlers

**Return Values:**
- Functions return appropriate types with no implicit undefined
- Async functions return promises
- Optional chaining for safe property access (e.g., `listing?.price`)

**Pattern example** from `frontend/src/services/ipfs.ts`:
```typescript
export async function uploadImageToIPFS(file: File): Promise<string> {
    // validation and processing
    const response = await axios.post(/* ... */);
    return response.data.IpfsHash;
}
```

## Module Design

**Exports:**
- Default export for React components
- Named exports for hooks, utilities, and services
- Configuration objects exported as named exports

**Barrel Files:**
- Not heavily used; imports are direct (e.g., import from `../hooks/useWallet` not `../hooks`)

**Component Structure:**
- Props interface defined at top
- Component function immediately after props
- No class components used

**Pattern** from `frontend/src/hooks/useContracts.ts`:
```typescript
export function useContracts(provider: BrowserProvider | null) {
    const contracts = useMemo(() => {
        // logic
    }, [provider]);

    return contracts;
}
```

## Solidity-Specific Conventions

**State Variables:**
- Private with underscore prefix (e.g., `_nextTokenId`, `_activeListingIds`)
- Public variables documented (e.g., `commissionRate`)
- Constants in UPPER_SNAKE_CASE (e.g., `COMMISSION_DENOMINATOR`)

**Function Modifiers:**
- Order: visibility, mutability, custom modifiers
- Example: `function buyItem(uint256 listingId) external payable nonReentrant whenNotPaused`

**Events:**
- Named with past tense (e.g., `ItemListed`, `ItemSold`, `NFTMinted`)
- Indexed parameters for filtering (e.g., `listingId`, `seller`, `tokenId`)

**Organization:**
- Comments section headers in ASCII art
- Order: Types, State, Events, Constructor, Core Functions, View Functions, Admin, Internal

---

*Convention analysis: 2026-02-21*
