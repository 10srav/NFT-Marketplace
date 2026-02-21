import { Button, Typography, Space, Tooltip, message } from "antd";
import { WalletOutlined, DisconnectOutlined, CopyOutlined } from "@ant-design/icons";
import { useWallet } from "../hooks/useWallet";

const { Text } = Typography;

export default function WalletConnect() {
    const { account, balance, isConnecting, isConnected, connectWallet, disconnectWallet, error } = useWallet();

    const truncateAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const copyAddress = () => {
        if (account) {
            navigator.clipboard.writeText(account);
            message.success("Address copied!");
        }
    };

    if (error) {
        message.error(error);
    }

    if (isConnected && account) {
        return (
            <Space>
                <div
                    style={{
                        padding: "4px 12px",
                        borderRadius: 8,
                        background: "rgba(102,126,234,0.12)",
                        border: "1px solid rgba(102,126,234,0.25)",
                    }}
                >
                    <Text style={{ color: "#a0a0b0", fontSize: 12 }}>
                        {parseFloat(balance).toFixed(4)} ETH
                    </Text>
                </div>
                <Tooltip title={account}>
                    <Button
                        size="small"
                        onClick={copyAddress}
                        icon={<CopyOutlined />}
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
                <Tooltip title="Disconnect">
                    <Button
                        size="small"
                        danger
                        icon={<DisconnectOutlined />}
                        onClick={disconnectWallet}
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
