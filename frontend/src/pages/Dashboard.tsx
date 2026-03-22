import { useState, useEffect, useCallback } from "react";
import {
    Typography,
    Row,
    Col,
    Card,
    Statistic,
    Button,
    Divider,
    Skeleton,
} from "antd";
import {
    PictureOutlined,
    ShopOutlined,
    DollarOutlined,
    WalletOutlined,
    RocketOutlined,
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

const gradientIconStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "linear-gradient(135deg, rgba(102,126,234,0.2), rgba(118,75,162,0.2))",
    border: "1px solid rgba(102,126,234,0.3)",
    marginRight: 4,
};

export default function Dashboard() {
    const { provider, account, isConnected, connectWallet } = useWallet();
    const { nftContract, marketplaceContract } = useContracts(provider);
    const navigate = useNavigate();

    const [ownedNFTs, setOwnedNFTs] = useState<OwnedNFT[]>([]);
    const [listedCount, setListedCount] = useState(0);
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

            // Count listed NFTs
            if (marketplaceContract) {
                const marketplace = await marketplaceContract;
                const activeIds: bigint[] = await marketplace.getActiveListingIds();
                let listed = 0;
                for (const lid of activeIds) {
                    const l = await marketplace.listings(lid);
                    if (l.active && l.seller.toLowerCase() === account.toLowerCase()) {
                        listed++;
                    }
                }
                setListedCount(listed);
            }
        } catch (err) {
            console.error("Fetch owned NFTs error:", err);
        } finally {
            setLoading(false);
        }
    }, [nftContract, marketplaceContract, account]);

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
            <Title
                level={2}
                style={{
                    fontWeight: 800,
                    marginBottom: 32,
                    background: "linear-gradient(135deg, #667eea, #764ba2)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                }}
            >
                Dashboard
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
                            prefix={
                                <span style={gradientIconStyle}>
                                    <PictureOutlined style={{ color: "#667eea", fontSize: 16 }} />
                                </span>
                            }
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
                            value={listedCount}
                            prefix={
                                <span style={gradientIconStyle}>
                                    <ShopOutlined style={{ color: "#667eea", fontSize: 16 }} />
                                </span>
                            }
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
                            prefix={
                                <span style={gradientIconStyle}>
                                    <DollarOutlined style={{ color: "#667eea", fontSize: 16 }} />
                                </span>
                            }
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
                <Row gutter={[20, 20]} style={{ marginBottom: 40 }}>
                    {[1, 2, 3, 4].map((i) => (
                        <Col xs={24} sm={12} md={8} lg={6} key={i}>
                            <Card
                                style={{
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: 12,
                                    overflow: "hidden",
                                }}
                                bodyStyle={{ padding: 16 }}
                            >
                                <Skeleton.Image
                                    active
                                    style={{ width: "100%", height: 180, borderRadius: 8 }}
                                />
                                <Skeleton
                                    active
                                    paragraph={{ rows: 1 }}
                                    title={{ width: "60%" }}
                                    style={{ marginTop: 16 }}
                                />
                            </Card>
                        </Col>
                    ))}
                </Row>
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
                                    aria-label={`List ${nft.name} for sale`}
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
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "60px 24px",
                        marginBottom: 40,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px dashed rgba(255,255,255,0.08)",
                        borderRadius: 16,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 72,
                            height: 72,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, rgba(102,126,234,0.15), rgba(118,75,162,0.15))",
                            border: "1px solid rgba(102,126,234,0.2)",
                            marginBottom: 20,
                        }}
                    >
                        <RocketOutlined style={{ fontSize: 32, color: "#667eea" }} />
                    </div>
                    <Text
                        style={{
                            color: "#fff",
                            fontSize: 16,
                            fontWeight: 600,
                            marginBottom: 8,
                        }}
                    >
                        No NFTs in your collection yet
                    </Text>
                    <Text
                        style={{
                            color: "#a0a0b0",
                            fontSize: 14,
                            marginBottom: 24,
                            textAlign: "center",
                            maxWidth: 320,
                        }}
                    >
                        Mint your first NFT and start building your collection on the marketplace.
                    </Text>
                    <Button
                        type="primary"
                        size="large"
                        onClick={() => navigate("/create")}
                        style={{
                            background: "linear-gradient(135deg, #667eea, #764ba2)",
                            border: "none",
                            borderRadius: 10,
                            fontWeight: 700,
                            height: 44,
                            padding: "0 28px",
                        }}
                    >
                        Create Your First NFT
                    </Button>
                </div>
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
