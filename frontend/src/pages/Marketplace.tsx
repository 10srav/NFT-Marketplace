import { useState, useEffect, useCallback } from "react";
import { Row, Col, Typography, Input, Select, Spin, Empty, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import NFTCard from "../components/NFTCard";
import { useWallet } from "../hooks/useWallet";
import { useContracts } from "../hooks/useContracts";
import { ipfsToHttp } from "../services/ipfs";

const { Title } = Typography;

interface NFTListing {
    listingId: number;
    tokenId: number;
    name: string;
    image: string;
    price: bigint;
    seller: string;
}

export default function Marketplace() {
    const { provider, isConnected } = useWallet();
    const { nftContract, marketplaceContract } = useContracts(provider);
    const [listings, setListings] = useState<NFTListing[]>([]);
    const [filtered, setFiltered] = useState<NFTListing[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("newest");

    const fetchListings = useCallback(async () => {
        if (!nftContract || !marketplaceContract) return;
        setLoading(true);
        try {
            const marketplace = await marketplaceContract;
            const nft = await nftContract;
            const activeIds: bigint[] = await marketplace.getActiveListingIds();

            const items: NFTListing[] = [];
            for (const id of activeIds) {
                const listing = await marketplace.listings(id);
                if (listing.active) {
                    let name = `NFT #${listing.tokenId}`;
                    let image = "";
                    try {
                        const uri = await nft.tokenURI(listing.tokenId);
                        const metaUrl = ipfsToHttp(uri);
                        const res = await fetch(metaUrl);
                        const meta = await res.json();
                        name = meta.name || name;
                        image = meta.image || "";
                    } catch { /* use defaults */ }

                    items.push({
                        listingId: Number(listing.listingId),
                        tokenId: Number(listing.tokenId),
                        name,
                        image,
                        price: listing.price,
                        seller: listing.seller,
                    });
                }
            }
            setListings(items);
            setFiltered(items);
        } catch (err) {
            console.error("Fetch listings error:", err);
        } finally {
            setLoading(false);
        }
    }, [nftContract, marketplaceContract]);

    useEffect(() => {
        if (isConnected) fetchListings();
    }, [isConnected, fetchListings]);

    // Filter & sort
    useEffect(() => {
        let result = [...listings];
        if (search) {
            result = result.filter((l) =>
                l.name.toLowerCase().includes(search.toLowerCase())
            );
        }
        if (sort === "price-asc") {
            result.sort((a, b) => (a.price < b.price ? -1 : 1));
        } else if (sort === "price-desc") {
            result.sort((a, b) => (a.price > b.price ? -1 : 1));
        }
        setFiltered(result);
    }, [search, sort, listings]);

    const handleBuy = async (listingId: number) => {
        if (!marketplaceContract) return;
        try {
            const marketplace = await marketplaceContract;
            const listing = await marketplace.listings(listingId);
            message.loading({ content: "Processing purchase...", key: "buy" });
            const tx = await marketplace.buyItem(listingId, {
                value: listing.price,
            });
            await tx.wait();
            message.success({ content: "NFT purchased! 🎉", key: "buy" });
            fetchListings();
        } catch (err: any) {
            message.error({
                content: err.reason || err.message || "Purchase failed",
                key: "buy",
            });
        }
    };

    return (
        <div style={{ padding: "40px 24px", maxWidth: 1200, margin: "0 auto" }}>
            <Title level={2} style={{ color: "#fff", fontWeight: 800, marginBottom: 32 }}>
                🛒 Marketplace
            </Title>

            {/* Filters */}
            <Row gutter={16} style={{ marginBottom: 32 }}>
                <Col xs={24} sm={16}>
                    <Input
                        placeholder="Search NFTs..."
                        prefix={<SearchOutlined style={{ color: "#a0a0b0" }} />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 10,
                            color: "#fff",
                            height: 44,
                        }}
                    />
                </Col>
                <Col xs={24} sm={8}>
                    <Select
                        value={sort}
                        onChange={setSort}
                        style={{ width: "100%" }}
                        options={[
                            { value: "newest", label: "Newest" },
                            { value: "price-asc", label: "Price: Low → High" },
                            { value: "price-desc", label: "Price: High → Low" },
                        ]}
                    />
                </Col>
            </Row>

            {/* Grid */}
            {loading ? (
                <div style={{ textAlign: "center", padding: 80 }}>
                    <Spin size="large" />
                </div>
            ) : filtered.length > 0 ? (
                <Row gutter={[20, 20]}>
                    {filtered.map((item) => (
                        <Col xs={24} sm={12} md={8} lg={6} key={item.listingId}>
                            <NFTCard
                                tokenId={item.tokenId}
                                name={item.name}
                                image={item.image}
                                price={item.price}
                                owner={item.seller}
                                listingId={item.listingId}
                                showBuy
                                onBuy={handleBuy}
                            />
                        </Col>
                    ))}
                </Row>
            ) : (
                <Empty
                    description={
                        <span style={{ color: "#a0a0b0" }}>
                            {isConnected
                                ? "No NFTs listed yet. Be the first to create and list one!"
                                : "Connect your wallet to browse listings"}
                        </span>
                    }
                    style={{ padding: 80 }}
                />
            )}
        </div>
    );
}
