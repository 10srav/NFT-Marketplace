import { Table, Tag, Typography } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

const { Text } = Typography;

interface Transaction {
    key: string;
    type: "Buy" | "Sell" | "Mint" | "List" | "Unlist";
    nftName: string;
    price: string;
    date: string;
    txHash: string;
}

interface TransactionHistoryProps {
    transactions?: Transaction[];
}

const columns: ColumnsType<Transaction> = [
    {
        title: "Type",
        dataIndex: "type",
        key: "type",
        render: (type: string) => {
            const color =
                type === "Buy" ? "blue" : type === "Sell" ? "green" : type === "Mint" ? "purple" : "default";
            return <Tag color={color}>{type}</Tag>;
        },
    },
    {
        title: "NFT",
        dataIndex: "nftName",
        key: "nftName",
        render: (name: string) => (
            <Text style={{ color: "#fff" }}>{name}</Text>
        ),
    },
    {
        title: "Price",
        dataIndex: "price",
        key: "price",
        render: (price: string) => (
            <Text style={{ color: "#667eea", fontWeight: 600 }}>
                {price ? `${price} ETH` : "\u2014"}
            </Text>
        ),
    },
    {
        title: "Date",
        dataIndex: "date",
        key: "date",
        render: (date: string) => (
            <Text style={{ color: "#a0a0b0" }}>{date}</Text>
        ),
    },
    {
        title: "Tx Hash",
        dataIndex: "txHash",
        key: "txHash",
        render: (hash: string) => (
            <a
                href={`https://sepolia.etherscan.io/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View transaction ${hash.slice(0, 8)} on Etherscan`}
                style={{ color: "#667eea" }}
            >
                {hash.slice(0, 8)}...{hash.slice(-6)}
            </a>
        ),
    },
];

export default function TransactionHistory({
    transactions,
}: TransactionHistoryProps) {
    const data = transactions || [];

    return (
        <Table
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: 5 }}
            aria-label="Transaction history"
            style={{
                background: "transparent",
            }}
            locale={{
                emptyText: (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            padding: "40px 16px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 56,
                                height: 56,
                                borderRadius: "50%",
                                background: "linear-gradient(135deg, rgba(102,126,234,0.12), rgba(118,75,162,0.12))",
                                border: "1px solid rgba(102,126,234,0.18)",
                                marginBottom: 16,
                            }}
                        >
                            <SwapOutlined style={{ fontSize: 24, color: "#667eea" }} />
                        </div>
                        <Text style={{ color: "#a0a0b0", fontSize: 14, textAlign: "center", maxWidth: 300 }}>
                            Your transaction history will appear here once you start trading
                        </Text>
                    </div>
                ),
            }}
        />
    );
}
