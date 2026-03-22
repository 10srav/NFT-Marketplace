import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Typography,
    Row,
    Col,
    Card,
    Button,
    Tag,
    Space,
    Spin,
    Descriptions,
    message,
} from "antd";
import {
    ShoppingCartOutlined,
    TagOutlined,
    ArrowLeftOutlined,
    LinkOutlined,
    UserOutlined,
    NumberOutlined,
    FileTextOutlined,
    ShareAltOutlined,
    CheckCircleOutlined,
} from "@ant-design/icons";
import { formatEther } from "ethers";
import ListingModal from "../components/ListingModal";
import { useWallet } from "../hooks/useWallet";
import { useContracts } from "../hooks/useContracts";
import { ipfsToHttp } from "../services/ipfs";

const { Title, Text, Paragraph } = Typography;

interface NFTData {
    tokenId: number;
    name: string;
    description: string;
    image: string;
    owner: string;
    tokenURI: string;
    listing?: {
        listingId: number;
        price: bigint;
        seller: string;
    };
}

const FALLBACK_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23667eea'/%3E%3Cstop offset='100%25' stop-color='%23764ba2'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='400' fill='%2312121a'/%3E%3Cpolygon points='200,80 320,200 200,320 80,200' fill='none' stroke='url(%23g)' stroke-width='3'/%3E%3Cpolygon points='200,130 270,200 200,270 130,200' fill='url(%23g)' opacity='0.15'/%3E%3C/svg%3E";

export default function NFTDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { provider, account, isConnected } = useWallet();
    const { nftContract, marketplaceContract } = useContracts(provider);

    const [nft, setNft] = useState<NFTData | null>(null);
    const [loading, setLoading] = useState(true);
    const [listingModal, setListingModal] = useState(false);
    const [imageHovered, setImageHovered] = useState(false);
    const [buying, setBuying] = useState(false);
    const [unlisting, setUnlisting] = useState(false);

    const fetchNFT = useCallback(async () => {
        if (!nftContract || !id) return;
        setLoading(true);
        try {
            const contract = await nftContract;
            const tokenId = parseInt(id);
            const owner = await contract.ownerOf(tokenId);
            const tokenURI = await contract.tokenURI(tokenId);

            let name = `NFT #${tokenId}`;
            let description = "";
            let image = "";

            try {
                const metaUrl = ipfsToHttp(tokenURI);
                const res = await fetch(metaUrl);
                const meta = await res.json();
                name = meta.name || name;
                description = meta.description || "";
                image = meta.image || "";
            } catch { /* use defaults */ }

            // Check if listed on marketplace
            let listing;
            if (marketplaceContract) {
                const marketplace = await marketplaceContract;
                const activeIds: bigint[] = await marketplace.getActiveListingIds();
                for (const lid of activeIds) {
                    const l = await marketplace.listings(lid);
                    if (Number(l.tokenId) === tokenId && l.active) {
                        listing = {
                            listingId: Number(l.listingId),
                            price: l.price,
                            seller: l.seller,
                        };
                        break;
                    }
                }
            }

            setNft({ tokenId, name, description, image, owner, tokenURI, listing });
        } catch (err) {
            console.error("Fetch NFT error:", err);
        } finally {
            setLoading(false);
        }
    }, [nftContract, marketplaceContract, id]);

    useEffect(() => {
        if (isConnected) fetchNFT();
    }, [isConnected, fetchNFT]);

    const handleBuy = async () => {
        if (!marketplaceContract || !nft?.listing) return;
        setBuying(true);
        try {
            const marketplace = await marketplaceContract;
            message.loading({ content: "Processing purchase...", key: "buy" });
            const tx = await marketplace.buyItem(nft.listing.listingId, {
                value: nft.listing.price,
            });
            await tx.wait();
            message.success({ content: "NFT purchased successfully", key: "buy" });
            fetchNFT();
        } catch (err: any) {
            message.error({
                content: err.reason || err.message || "Purchase failed",
                key: "buy",
            });
        } finally {
            setBuying(false);
        }
    };

    const handleUnlist = async () => {
        if (!marketplaceContract || !nft?.listing) return;
        setUnlisting(true);
        try {
            const marketplace = await marketplaceContract;
            message.loading({ content: "Unlisting...", key: "unlist" });
            const tx = await marketplace.unlistItem(nft.listing.listingId);
            await tx.wait();
            message.success({ content: "NFT unlisted successfully", key: "unlist" });
            fetchNFT();
        } catch (err: any) {
            message.error({
                content: err.reason || err.message || "Unlisting failed",
                key: "unlist",
            });
        } finally {
            setUnlisting(false);
        }
    };

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            message.success({ content: "Link copied to clipboard", key: "share" });
        } catch {
            message.error({ content: "Failed to copy link", key: "share" });
        }
    };

    const isOwner =
        nft && account && nft.owner.toLowerCase() === account.toLowerCase();

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: 120 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!nft) {
        return (
            <div style={{ textAlign: "center", padding: 120 }}>
                <Title level={3} style={{ color: "#fff" }}>
                    NFT Not Found
                </Title>
                <Button onClick={() => navigate("/marketplace")}>
                    Back to Marketplace
                </Button>
            </div>
        );
    }

    return (
        <div style={{ padding: "40px 24px", maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <Button
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                    style={{ color: "#a0a0b0" }}
                    aria-label="Go back to previous page"
                >
                    Back
                </Button>
                <Button
                    type="text"
                    icon={<ShareAltOutlined />}
                    onClick={handleShare}
                    style={{ color: "#a0a0b0" }}
                    aria-label="Copy link to clipboard"
                >
                    Share
                </Button>
            </div>

            <Row gutter={[40, 40]}>
                {/* Image */}
                <Col xs={24} md={12}>
                    <Card
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 16,
                            overflow: "hidden",
                        }}
                        styles={{ body: { padding: 0 } }}
                    >
                        <img
                            src={ipfsToHttp(nft.image)}
                            alt={nft.name}
                            loading="lazy"
                            onMouseEnter={() => setImageHovered(true)}
                            onMouseLeave={() => setImageHovered(false)}
                            style={{
                                width: "100%",
                                minHeight: 400,
                                objectFit: "cover",
                                display: "block",
                                transition: "transform 0.35s ease",
                                transform: imageHovered ? "scale(1.05)" : "scale(1)",
                            }}
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = FALLBACK_SVG;
                            }}
                        />
                    </Card>
                </Col>

                {/* Details */}
                <Col xs={24} md={12}>
                    <Space direction="vertical" size="large" style={{ width: "100%" }}>
                        <div>
                            <Tag
                                style={{
                                    background: "rgba(102,126,234,0.15)",
                                    border: "1px solid rgba(102,126,234,0.3)",
                                    color: "#667eea",
                                    borderRadius: 6,
                                    marginBottom: 8,
                                }}
                            >
                                Token #{nft.tokenId}
                            </Tag>
                            <Title level={2} style={{ color: "#fff", margin: 0 }}>
                                {nft.name}
                            </Title>
                        </div>

                        {nft.description && (
                            <Paragraph style={{ color: "#a0a0b0", fontSize: 15 }}>
                                {nft.description}
                            </Paragraph>
                        )}

                        {/* Price / Actions */}
                        <Card
                            style={{
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 12,
                            }}
                        >
                            {nft.listing ? (
                                <>
                                    <Text style={{ color: "#a0a0b0", fontSize: 13 }}>
                                        Current Price
                                    </Text>
                                    <Title
                                        level={3}
                                        style={{
                                            color: "#667eea",
                                            margin: "4px 0 16px",
                                            fontWeight: 800,
                                        }}
                                    >
                                        {parseFloat(formatEther(nft.listing.price)).toFixed(4)} ETH
                                    </Title>
                                    {isOwner ? (
                                        <Button
                                            block
                                            danger
                                            onClick={handleUnlist}
                                            loading={unlisting}
                                            style={{ borderRadius: 8, height: 44 }}
                                            aria-label="Unlist this NFT from the marketplace"
                                        >
                                            Unlist NFT
                                        </Button>
                                    ) : (
                                        <Button
                                            block
                                            type="primary"
                                            size="large"
                                            icon={<ShoppingCartOutlined />}
                                            onClick={handleBuy}
                                            loading={buying}
                                            style={{
                                                background:
                                                    "linear-gradient(135deg, #667eea, #764ba2)",
                                                border: "none",
                                                borderRadius: 10,
                                                fontWeight: 700,
                                                height: 48,
                                            }}
                                            aria-label={`Buy this NFT for ${parseFloat(formatEther(nft.listing.price)).toFixed(4)} ETH`}
                                        >
                                            Buy Now
                                        </Button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Tag color="default" style={{ marginBottom: 12 }}>
                                        Not Listed
                                    </Tag>
                                    {isOwner && (
                                        <Button
                                            block
                                            type="primary"
                                            icon={<TagOutlined />}
                                            onClick={() => setListingModal(true)}
                                            style={{
                                                background:
                                                    "linear-gradient(135deg, #667eea, #764ba2)",
                                                border: "none",
                                                borderRadius: 10,
                                                fontWeight: 700,
                                                height: 44,
                                            }}
                                        >
                                            List for Sale
                                        </Button>
                                    )}
                                </>
                            )}
                        </Card>

                        {/* Metadata */}
                        <Descriptions
                            column={1}
                            bordered
                            size="small"
                            style={{ borderRadius: 12 }}
                            labelStyle={{ color: "#a0a0b0", background: "rgba(255,255,255,0.02)" }}
                            contentStyle={{ color: "#fff", background: "rgba(255,255,255,0.01)" }}
                        >
                            <Descriptions.Item label={<span><UserOutlined style={{ marginRight: 6 }} />Owner</span>}>
                                {isOwner ? (
                                    <Tag
                                        icon={<CheckCircleOutlined />}
                                        style={{
                                            background: "rgba(102,126,234,0.15)",
                                            border: "1px solid rgba(102,126,234,0.3)",
                                            color: "#667eea",
                                            borderRadius: 6,
                                        }}
                                    >
                                        Owned by you
                                    </Tag>
                                ) : (
                                    <span>{nft.owner.slice(0, 6)}...{nft.owner.slice(-4)}</span>
                                )}
                            </Descriptions.Item>
                            <Descriptions.Item label={<span><NumberOutlined style={{ marginRight: 6 }} />Token ID</span>}>
                                {nft.tokenId}
                            </Descriptions.Item>
                            <Descriptions.Item label={<span><FileTextOutlined style={{ marginRight: 6 }} />Token URI</span>}>
                                <a
                                    href={ipfsToHttp(nft.tokenURI)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#667eea" }}
                                >
                                    <LinkOutlined /> View Metadata
                                </a>
                            </Descriptions.Item>
                        </Descriptions>
                    </Space>
                </Col>
            </Row>

            <ListingModal
                open={listingModal}
                tokenId={nft.tokenId}
                onClose={() => setListingModal(false)}
            />
        </div>
    );
}
