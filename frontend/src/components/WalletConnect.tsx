import { useEffect } from "react";
import { Button, Typography, Space, Tooltip, message } from "antd";
import { WalletOutlined, DisconnectOutlined, CopyOutlined } from "@ant-design/icons";
import { useWallet } from "../hooks/useWallet";

const { Text } = Typography;

/** Returns a human-readable chain name and status color. */
function chainMeta(chainId: number | null): { name: string; color: string } {
    switch (chainId) {
        case 31337:
            return { name: "Hardhat", color: "#4ade80" };
        case 11155111:
            return { name: "Sepolia", color: "#4ade80" };
        default:
            return { name: "Unknown", color: "#ef4444" };
    }
}

export default function WalletConnect() {
    const { account, balance, chainId, isConnecting, isConnected, connectWallet, disconnectWallet, error } = useWallet();

    const truncateAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const copyAddress = () => {
        if (account) {
            navigator.clipboard.writeText(account);
            message.success("Address copied!");
        }
    };

    useEffect(() => {
        if (error) {
            message.error(error);
        }
    }, [error]);

    if (isConnected && account) {
        const chain = chainMeta(chainId);

        return (
            <Space>
                {/* Network indicator */}
                <Tooltip title={`Network: ${chain.name}`}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                        }}
                        aria-label={`Connected to ${chain.name} network`}
                    >
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: chain.color,
                                display: "inline-block",
                                boxShadow: `0 0 6px ${chain.color}`,
                            }}
                        />
                        <Text style={{ color: "#a0a0b0", fontSize: 11, fontWeight: 500 }}>
                            {chain.name}
                        </Text>
                    </div>
                </Tooltip>

                {/* Balance */}
                <div
                    style={{
                        padding: "4px 12px",
                        borderRadius: 8,
                        background: "rgba(102,126,234,0.12)",
                        border: "1px solid rgba(102,126,234,0.25)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    <Text style={{ color: "#667eea", fontSize: 12, fontWeight: 600 }}>
                        &Xi;
                    </Text>
                    <Text style={{ color: "#a0a0b0", fontSize: 12 }}>
                        {parseFloat(balance).toFixed(4)} ETH
                    </Text>
                </div>

                {/* Copy address */}
                <Tooltip title={account}>
                    <Button
                        size="small"
                        onClick={copyAddress}
                        icon={<CopyOutlined />}
                        aria-label="Copy wallet address"
                        style={{
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.05)",
                            borderColor: "rgba(255,255,255,0.1)",
                            color: "#fff",
                        }}
                    >
                        {truncateAddress(account)}
                    </Button>
                </Tooltip>

                {/* Disconnect */}
                <Tooltip title="Disconnect">
                    <Button
                        size="small"
                        danger
                        icon={<DisconnectOutlined />}
                        onClick={disconnectWallet}
                        aria-label="Disconnect wallet"
                        style={{ borderRadius: 8 }}
                    />
                </Tooltip>
            </Space>
        );
    }

    return (
        <Button
            type="primary"
            icon={<WalletOutlined />}
            loading={isConnecting}
            onClick={connectWallet}
            aria-label="Connect wallet"
            style={{
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                height: 38,
            }}
        >
            Connect Wallet
        </Button>
    );
}
