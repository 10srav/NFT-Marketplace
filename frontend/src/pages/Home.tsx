import { useState } from "react";
import { Button, Typography, Row, Col, Card, Space } from "antd";
import {
    RocketOutlined,
    ThunderboltOutlined,
    SafetyOutlined,
    ShopOutlined,
    DollarOutlined,
    EyeOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Title, Text, Paragraph } = Typography;

const stats = [
    { icon: <RocketOutlined />, value: "Instant", label: "Minting Speed" },
    { icon: <DollarOutlined />, value: "2.5%", label: "Platform Fee" },
    { icon: <EyeOutlined />, value: "100%", label: "On-Chain Transparency" },
];

const features = [
    {
        icon: <RocketOutlined style={{ fontSize: 32, color: "#667eea" }} />,
        title: "Easy Minting",
        desc: "Create and mint your NFTs in seconds with IPFS-backed storage",
    },
    {
        icon: <ThunderboltOutlined style={{ fontSize: 32, color: "#667eea" }} />,
        title: "Instant Trading",
        desc: "Buy and sell NFTs on our decentralized marketplace",
    },
    {
        icon: <SafetyOutlined style={{ fontSize: 32, color: "#667eea" }} />,
        title: "Secure & Transparent",
        desc: "Built on Ethereum with audited smart contracts",
    },
];

/* Checks if the user prefers reduced motion */
function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Gradient border wrapper for feature cards */
const gradientBorderStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(102,126,234,0.25), rgba(118,75,162,0.25))",
    borderRadius: 17,
    padding: 1,
    height: "100%",
};

const featureCardBase: React.CSSProperties = {
    textAlign: "center",
    padding: "32px 20px",
    background: "rgba(255,255,255,0.03)",
    border: "none",
    borderRadius: 16,
    height: "100%",
    transition: "transform 0.25s ease, box-shadow 0.25s ease",
    cursor: "default",
};

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
    const [hovered, setHovered] = useState(false);

    return (
        <div style={gradientBorderStyle}>
            <Card
                style={{
                    ...featureCardBase,
                    transform: hovered ? "translateY(-6px)" : "translateY(0)",
                    boxShadow: hovered
                        ? "0 12px 32px rgba(102,126,234,0.15)"
                        : "0 0 0 transparent",
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <div style={{ marginBottom: 16 }}>{icon}</div>
                <Title level={4} style={{ color: "#fff" }}>
                    {title}
                </Title>
                <Text style={{ color: "#a0a0b0" }}>{desc}</Text>
            </Card>
        </div>
    );
}

export default function Home() {
    const navigate = useNavigate();
    const reducedMotion = prefersReducedMotion();

    return (
        <div>
            {/* ── Hero Section ── */}
            <section
                role="banner"
                aria-label="NFT Marketplace hero"
                style={{
                    minHeight: "70vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: "80px 24px 60px",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* Animated background gradient — respects prefers-reduced-motion */}
                <div
                    style={{
                        position: "absolute",
                        top: "-50%",
                        left: "-50%",
                        width: "200%",
                        height: "200%",
                        background:
                            "radial-gradient(ellipse at 30% 50%, rgba(102,126,234,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(118,75,162,0.08) 0%, transparent 60%)",
                        animation: reducedMotion ? "none" : "float 20s ease-in-out infinite",
                    }}
                />

                <div style={{ position: "relative", zIndex: 1, maxWidth: 800 }}>
                    <Title
                        level={1}
                        style={{
                            fontSize: "clamp(36px, 6vw, 64px)",
                            fontWeight: 900,
                            lineHeight: 1.1,
                            marginBottom: 20,
                            color: "#fff",
                        }}
                    >
                        Discover, Collect &{" "}
                        <span
                            style={{
                                background: "linear-gradient(135deg, #667eea, #764ba2)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            Trade NFTs
                        </span>
                    </Title>
                    <Paragraph
                        style={{
                            fontSize: 18,
                            color: "#a0a0b0",
                            maxWidth: 560,
                            margin: "0 auto 32px",
                            lineHeight: 1.7,
                        }}
                    >
                        A decentralized NFT marketplace built on Ethereum. Mint your art,
                        list it for sale, and trade with confidence — all with minimal fees
                        and full on-chain transparency.
                    </Paragraph>
                    <Space size="large" wrap>
                        <Button
                            type="primary"
                            size="large"
                            aria-label="Explore the NFT marketplace"
                            onClick={() => navigate("/marketplace")}
                            style={{
                                background: "linear-gradient(135deg, #667eea, #764ba2)",
                                border: "none",
                                borderRadius: 12,
                                fontWeight: 700,
                                height: 52,
                                padding: "0 36px",
                                fontSize: 16,
                            }}
                        >
                            Explore Marketplace
                        </Button>
                        <Button
                            size="large"
                            aria-label="Create a new NFT"
                            onClick={() => navigate("/create")}
                            style={{
                                borderRadius: 12,
                                fontWeight: 700,
                                height: 52,
                                padding: "0 36px",
                                fontSize: 16,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.15)",
                                color: "#fff",
                            }}
                        >
                            Create NFT
                        </Button>
                    </Space>
                </div>
            </section>

            {/* ── Stats ── */}
            <section aria-label="Platform highlights" style={{ padding: "0 24px 60px" }}>
                <Row gutter={[24, 24]} justify="center" style={{ maxWidth: 900, margin: "0 auto" }}>
                    {stats.map((s, i) => (
                        <Col xs={24} sm={8} key={i}>
                            <Card
                                style={{
                                    textAlign: "center",
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: 16,
                                }}
                            >
                                <div
                                    style={{
                                        marginBottom: 4,
                                        fontSize: 22,
                                        color: "#667eea",
                                    }}
                                >
                                    {s.icon}
                                </div>
                                <div
                                    style={{
                                        color: "#fff",
                                        fontWeight: 800,
                                        fontSize: 28,
                                        marginBottom: 4,
                                    }}
                                >
                                    {s.value}
                                </div>
                                <Text style={{ color: "#a0a0b0" }}>{s.label}</Text>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </section>

            {/* ── Features ── */}
            <section aria-label="Platform features" style={{ padding: "0 24px 80px" }}>
                <Title
                    level={2}
                    style={{
                        textAlign: "center",
                        color: "#fff",
                        marginBottom: 48,
                        fontWeight: 800,
                    }}
                >
                    Why Choose Us
                </Title>
                <Row gutter={[24, 24]} justify="center" style={{ maxWidth: 1100, margin: "0 auto" }}>
                    {features.map((f, i) => (
                        <Col xs={24} sm={8} key={i}>
                            <FeatureCard icon={f.icon} title={f.title} desc={f.desc} />
                        </Col>
                    ))}
                </Row>
            </section>
        </div>
    );
}
