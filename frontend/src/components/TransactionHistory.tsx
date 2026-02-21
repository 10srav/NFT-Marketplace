import { Table, Tag, Typography } from "antd";
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
                {price ? `${price} ETH` : "—"}
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
                style={{ color: "#667eea" }}
            >
                {hash.slice(0, 8)}...{hash.slice(-6)}
            </a>
        ),
    },
];

// Demo data for display when no real transactions
const demoData: Transaction[] = [
    {
        key: "1",
        type: "Mint",
        nftName: "Cosmic Dreamer #1",
        price: "",
        date: "2024-01-15",
        txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    },
    {
        key: "2",
        type: "List",
        nftName: "Cosmic Dreamer #1",
        price: "0.5",
        date: "2024-01-16",
        txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    },
    {
        key: "3",
        type: "Buy",
        nftName: "Digital Horizon #7",
        price: "1.2",
        date: "2024-01-17",
        txHash: "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
    },
];

export default function TransactionHistory({
    transactions,
}: TransactionHistoryProps) {
    return (
        <Table
            columns={columns}
            dataSource={transactions || demoData}
            pagination={{ pageSize: 5 }}
            style={{
                background: "transparent",
            }}
            locale={{
                emptyText: (
                    <Text style={{ color: "#a0a0b0" }}>No transactions yet</Text>
                ),
            }}
        />
    );
}
