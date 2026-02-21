import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, formatEther } from "ethers";

declare global {
    interface Window {
        ethereum?: any;
    }
}

interface WalletState {
    account: string | null;
    balance: string;
    chainId: number | null;
    isConnecting: boolean;
    error: string | null;
    provider: BrowserProvider | null;
}

export function useWallet() {
    const [state, setState] = useState<WalletState>({
        account: null,
        balance: "0",
        chainId: null,
        isConnecting: false,
        error: null,
        provider: null,
    });

    const updateBalance = useCallback(async (provider: BrowserProvider, account: string) => {
        try {
            const balance = await provider.getBalance(account);
            setState((prev) => ({ ...prev, balance: formatEther(balance) }));
        } catch {
            // silently fail
        }
    }, []);

    const connectWallet = useCallback(async () => {
        if (!window.ethereum) {
            setState((prev) => ({ ...prev, error: "MetaMask not installed" }));
            return;
        }

        setState((prev) => ({ ...prev, isConnecting: true, error: null }));

        try {
            const provider = new BrowserProvider(window.ethereum);
            const accounts = await provider.send("eth_requestAccounts", []);
            const network = await provider.getNetwork();
            const account = accounts[0];

            setState({
                account,
                balance: "0",
                chainId: Number(network.chainId),
                isConnecting: false,
                error: null,
                provider,
            });

            await updateBalance(provider, account);
        } catch (err: any) {
            setState((prev) => ({
                ...prev,
                isConnecting: false,
                error: err.message || "Connection failed",
            }));
        }
    }, [updateBalance]);

    const disconnectWallet = useCallback(() => {
        setState({
            account: null,
            balance: "0",
            chainId: null,
            isConnecting: false,
            error: null,
            provider: null,
        });
    }, []);

    // Auto-connect if previously connected
    useEffect(() => {
        if (window.ethereum) {
            window.ethereum
                .request({ method: "eth_accounts" })
                .then((accounts: string[]) => {
                    if (accounts.length > 0) {
                        connectWallet();
                    }
                })
                .catch(() => { });

            // Listen for account/chain changes
            window.ethereum.on("accountsChanged", (accounts: string[]) => {
                if (accounts.length === 0) {
                    disconnectWallet();
                } else {
                    connectWallet();
                }
            });

            window.ethereum.on("chainChanged", () => {
                connectWallet();
            });
        }
    }, [connectWallet, disconnectWallet]);

    return {
        ...state,
        connectWallet,
        disconnectWallet,
        isConnected: !!state.account,
    };
}
