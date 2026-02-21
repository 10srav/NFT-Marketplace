import { useState, useEffect, useCallback } from "react";
import {
    Typography,
    Row,
    Col,
    Card,
    Statistic,
    Empty,
    Spin,
    Button,
    Divider,
} from "antd";
import {
    PictureOutlined,
    ShopOutlined,
    DollarOutlined,
    WalletOutlined,
} from "@ant-design/icons";
import NFTCard from "../components/NFTCard";
import ListingModal from "../components/ListingModal";
import TransactionHistory from "../components/TransactionHistory";
import { useWallet } from "../hooks/useWallet";
import { useContracts } from "../hooks/useContracts";
import { ipfsToHttp } from "../services/ipfs";
import { useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

interface OwnedNFT {
    tokenId: number;
    name: string;
    image: string;
}

export default function Dashboard() {
    const { provider, account, isConnected, connectWallet } = useWallet();
    const { nftContract } = useContracts(provider);
    const navigate = useNavigate();

    const [ownedNFTs, setOwnedNFTs] = useState<OwnedNFT[]>([]);
    const [loading, setLoading] = useState(false);
    const [listingModal, setListingModal] = useState<{
        open: boolean;
        tokenId: number;
    }>({ open: false, tokenId: 0 });

    const fetchOwnedNFTs = useCallback(async () => {
        if (!nftContract || !account) return;
        setLoading(true);
        try {
            const nft = await nftContract;
            const totalMinted = await nft.totalMinted();
            const items: OwnedNFT[] = [];

            for (let i = 0; i < Number(totalMinted); i++) {
                try {
                    const owner = await nft.ownerOf(i);
                    if (owner.toLowerCase() === account.toLowerCase()) {
                        let name = `NFT #${i}`;
                        let image = "";
                        try {
                            const uri = await nft.tokenURI(i);
                            const metaUrl = ipfsToHttp(uri);
                            const res = await fetch(metaUrl);
                            const meta = await res.json();
                            name = meta.name || name;
                            image = meta.image || "";
                        } catch { /* use defaults */ }

                        items.push({ tokenId: i, name, image });
                    }
                } catch { /* token may be burned */ }
            }
            setOwnedNFTs(items);
        } catch (err) {
            console.error("Fetch owned NFTs error:", err);
        } finally {
            setLoading(false);
        }
    }, [nftContract, account]);

    useEffect(() => {
        if (isConnected) fetchOwnedNFTs();
    }, [isConnected, fetchOwnedNFTs]);

    if (!isConnected) {
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "60vh",
                    textAlign: "center",
                    padding: 24,
                }}
            >
                <WalletOutlined
                    style={{ fontSize: 64, color: "#667eea", marginBottom: 24 }}
                />
                <Title level={3} style={{ color: "#fff" }}>
                    Connect Your Wallet
                </Title>
                <Text style={{ color: "#a0a0b0", marginBottom: 24, fontSize: 16 }}>
                    Connect your MetaMask wallet to view your dashboard
                </Text>
                <Button
                    type="primary"
                    size="large"
                    onClick={connectWallet}
                    style={{
                        background: "linear-gradient(135deg, #667eea, #764ba2)",
                        border: "none",
                        borderRadius: 12,
                        fontWeight: 700,
                        height: 48,
                        padding: "0 32px",
                    }}
                >
                    Connect Wallet
                </Button>
            </div>
        );
    }

    return (
        <div style={{ padding: "40px 24px", maxWidth: 1200, margin: "0 auto" }}>
            <Title level={2} style={{ color: "#fff", fontWeight: 800, marginBottom: 32 }}>
                📊 Dashboard
            </Title>

            {/* Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 40 }}>
                <Col xs={24} sm={8}>
                    <Card
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 12,
                        }}
                    >
                        <Statistic
                            title={<Text style={{ color: "#a0a0b0" }}>Owned NFTs</Text>}
                            value={ownedNFTs.length}
                            prefix={<PictureOutlined />}
                            valueStyle={{ color: "#fff", fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 12,
                        }}
                    >
                        <Statistic
                            title={<Text style={{ color: "#a0a0b0" }}>Listed</Text>}
                            value={0}
                            prefix={<ShopOutlined />}
                            valueStyle={{ color: "#fff", fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 12,
                        }}
                    >
                        <Statistic
                            title={<Text style={{ color: "#a0a0b0" }}>Total Volume</Text>}
                            value="0.0"
                            suffix="ETH"
                            prefix={<DollarOutlined />}
                            valueStyle={{ color: "#fff", fontWeight: 700 }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Owned NFTs */}
            <Title level={4} style={{ color: "#fff", marginBottom: 20 }}>
                Your NFTs
            </Title>
            {loading ? (
                <div style={{ textAlign: "center", padding: 60 }}>
                    <Spin size="large" />
                </div>
            ) : ownedNFTs.length > 0 ? (
                <Row gutter={[20, 20]} style={{ marginBottom: 40 }}>
                    {ownedNFTs.map((nft) => (
                        <Col xs={24} sm={12} md={8} lg={6} key={nft.tokenId}>
                            <div style={{ position: "relative" }}>
                                <NFTCard
                                    tokenId={nft.tokenId}
                                    name={nft.name}
                                    image={nft.image}
                                />
                                <Button
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setListingModal({ open: true, tokenId: nft.tokenId });
                                    }}
                                    style={{
                                        position: "absolute",
                                        top: 12,
                                        right: 12,
                                        background: "rgba(102,126,234,0.9)",
                                        border: "none",
                                        color: "#fff",
                                        borderRadius: 6,
                                        fontWeight: 600,
                                        fontSize: 11,
                                    }}
                                >
                                    List for Sale
                                </Button>
                            </div>
                        </Col>
                    ))}
                </Row>
            ) : (
                <Empty
                    description={
                        <span style={{ color: "#a0a0b0" }}>
                            No NFTs yet.{" "}
                            <a onClick={() => navigate("/create")} style={{ color: "#667eea" }}>
                                Create one!
                            </a>
                        </span>
                    }
                    style={{ padding: 40, marginBottom: 40 }}
                />
            )}

            {/* Transaction History */}
            <Divider style={{ borderColor: "rgba(255,255,255,0.06)" }} />
            <Title level={4} style={{ color: "#fff", marginBottom: 20 }}>
                Transaction History
            </Title>
            <TransactionHistory />

            {/* Listing Modal */}
            <ListingModal
                open={listingModal.open}
                tokenId={listingModal.tokenId}
                onClose={() => setListingModal({ open: false, tokenId: 0 })}
                onSuccess={fetchOwnedNFTs}
            />
        </div>
    );
}
