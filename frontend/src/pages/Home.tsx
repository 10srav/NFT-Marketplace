import { Button, Typography, Row, Col, Card, Space, Statistic } from "antd";
import {
    RocketOutlined,
    ThunderboltOutlined,
    SafetyOutlined,
    TeamOutlined,
    ShopOutlined,
    DollarOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Title, Text, Paragraph } = Typography;

const stats = [
    { icon: <ShopOutlined />, value: "10K+", label: "NFTs Created" },
    { icon: <DollarOutlined />, value: "2.5K", label: "ETH Volume" },
    { icon: <TeamOutlined />, value: "5K+", label: "Users" },
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

export default function Home() {
    const navigate = useNavigate();

    return (
        <div>
            {/* ── Hero Section ── */}
            <section
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
                {/* Animated background gradient */}
                <div
                    style={{
                        position: "absolute",
                        top: "-50%",
                        left: "-50%",
                        width: "200%",
                        height: "200%",
                        background:
                            "radial-gradient(ellipse at 30% 50%, rgba(102,126,234,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(118,75,162,0.08) 0%, transparent 60%)",
                        animation: "float 20s ease-in-out infinite",
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
                        The premier NFT marketplace on Ethereum. Mint, list, and trade
                        digital assets with low fees and complete transparency.
                    </Paragraph>
                    <Space size="large">
                        <Button
                            type="primary"
                            size="large"
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
            <section style={{ padding: "0 24px 60px" }}>
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
                                <Statistic
                                    title={
                                        <Text style={{ color: "#a0a0b0" }}>{s.label}</Text>
                                    }
                                    value={s.value}
                                    prefix={s.icon}
                                    valueStyle={{
                                        color: "#fff",
                                        fontWeight: 800,
                                        fontSize: 28,
                                    }}
                                />
                            </Card>
                        </Col>
                    ))}
                </Row>
            </section>

            {/* ── Features ── */}
            <section style={{ padding: "0 24px 80px" }}>
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
                            <Card
                                style={{
                                    textAlign: "center",
                                    padding: "32px 20px",
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: 16,
                                    height: "100%",
                                }}
                            >
                                <div style={{ marginBottom: 16 }}>{f.icon}</div>
                                <Title level={4} style={{ color: "#fff" }}>
                                    {f.title}
                                </Title>
                                <Text style={{ color: "#a0a0b0" }}>{f.desc}</Text>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </section>
        </div>
    );
}
