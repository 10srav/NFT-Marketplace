import { Card, Typography, Button, Tag } from "antd";
import { ShoppingCartOutlined, EyeOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { formatEther } from "ethers";
import { ipfsToHttp } from "../services/ipfs";

const { Text, Title } = Typography;

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

export default function NFTCard({
    tokenId,
    name,
    image,
    price,
    owner,
    listingId,
    showBuy,
    onBuy,
}: NFTCardProps) {
    const navigate = useNavigate();

    const truncateAddr = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    return (
        <Card
            hoverable
            onClick={() => navigate(`/nft/${tokenId}`)}
            cover={
                <div
                    style={{
                        height: 260,
                        overflow: "hidden",
                        borderRadius: "12px 12px 0 0",
                        background: "rgba(255,255,255,0.02)",
                    }}
                >
                    <img
                        alt={name}
                        src={ipfsToHttp(image)}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            transition: "transform 0.4s ease",
                        }}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' fill='%23333'%3E%3Crect width='200' height='200' fill='%2312121a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='40' fill='%23667eea'%3E🖼️%3C/text%3E%3C/svg%3E";
                        }}
                    />
                </div>
            }
            style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                overflow: "hidden",
            }}
            styles={{ body: { padding: "16px" } }}
        >
            <Title level={5} style={{ color: "#fff", margin: 0, marginBottom: 4 }}>
                {name || `NFT #${tokenId}`}
            </Title>

            {owner && (
                <Text style={{ color: "#a0a0b0", fontSize: 12 }}>
                    Owned by {truncateAddr(owner)}
                </Text>
            )}

            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 12,
                }}
            >
                {price !== undefined ? (
                    <Tag
                        style={{
                            background: "rgba(102,126,234,0.15)",
                            border: "1px solid rgba(102,126,234,0.3)",
                            color: "#667eea",
                            fontWeight: 700,
                            fontSize: 14,
                            padding: "4px 10px",
                            borderRadius: 6,
                        }}
                    >
                        {parseFloat(formatEther(price)).toFixed(4)} ETH
                    </Tag>
                ) : (
                    <Tag color="default" style={{ borderRadius: 6 }}>
                        Not Listed
                    </Tag>
                )}

                {showBuy && listingId !== undefined && onBuy ? (
                    <Button
                        type="primary"
                        size="small"
                        icon={<ShoppingCartOutlined />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onBuy(listingId);
                        }}
                        style={{
                            background: "linear-gradient(135deg, #667eea, #764ba2)",
                            border: "none",
                            borderRadius: 6,
                            fontWeight: 600,
                        }}
                    >
                        Buy
                    </Button>
                ) : (
                    <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        style={{ color: "#a0a0b0" }}
                    >
                        View
                    </Button>
                )}
            </div>
        </Card>
    );
}
