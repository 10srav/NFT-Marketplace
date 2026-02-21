import { useMemo } from "react";
import { Contract, BrowserProvider } from "ethers";
import { CONTRACTS } from "../config/contracts";

export function useContracts(provider: BrowserProvider | null) {
    const contracts = useMemo(() => {
        if (!provider) return { nftContract: null, marketplaceContract: null };

        const signer = provider.getSigner();

        const nftContract = signer.then(
            (s) => new Contract(CONTRACTS.NFT.address, CONTRACTS.NFT.abi, s)
        );

        const marketplaceContract = signer.then(
            (s) => new Contract(CONTRACTS.MARKETPLACE.address, CONTRACTS.MARKETPLACE.abi, s)
        );

        return { nftContract, marketplaceContract };
    }, [provider]);

    return contracts;
}
