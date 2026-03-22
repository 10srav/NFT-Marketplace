import { useState } from "react";
import { Layout as AntLayout, Menu, Button, Drawer } from "antd";
import {
    HomeOutlined,
    ShopOutlined,
    PlusCircleOutlined,
    DashboardOutlined,
    MenuOutlined,
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import WalletConnect from "./WalletConnect";

const { Header, Content, Footer } = AntLayout;

const navItems = [
    { key: "/", icon: <HomeOutlined />, label: "Home" },
    { key: "/marketplace", icon: <ShopOutlined />, label: "Marketplace" },
    { key: "/create", icon: <PlusCircleOutlined />, label: "Create" },
    { key: "/dashboard", icon: <DashboardOutlined />, label: "Dashboard" },
];

const footerLinks = [
    { key: "/dashboard", label: "Dashboard" },
    { key: "/marketplace", label: "Marketplace" },
    { key: "/create", label: "Create" },
];

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
        <AntLayout style={{ minHeight: "100vh", background: "#0a0a0f" }}>
            {/* ── Header ── */}
            <Header
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 100,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 24px",
                    background: "rgba(10, 10, 15, 0.85)",
                    backdropFilter: "blur(20px)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    borderTop: "2px solid transparent",
                    borderImage: "linear-gradient(90deg, #667eea, #764ba2, #667eea) 1",
                    borderImageSlice: 1,
                }}
            >
                {/* Logo */}
                <div
                    onClick={() => navigate("/")}
                    role="button"
                    tabIndex={0}
                    aria-label="NFT Market - Home"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") navigate("/");
                    }}
                    style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                    }}
                >
                    <span
                        style={{
                            fontSize: 24,
                            fontWeight: 800,
                            background: "linear-gradient(135deg, #667eea, #764ba2)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            letterSpacing: -0.5,
                        }}
                    >
                        NFT Market
                    </span>
                </div>

                {/* Desktop Nav */}
                <nav role="navigation" aria-label="Main navigation">
                    <Menu
                        mode="horizontal"
                        selectedKeys={[location.pathname]}
                        onClick={({ key }) => navigate(key)}
                        items={navItems}
                        style={{
                            flex: 1,
                            justifyContent: "center",
                            background: "transparent",
                            borderBottom: "none",
                        }}
                        className="desktop-nav"
                    />
                </nav>

                {/* Wallet */}
                <div className="desktop-wallet">
                    <WalletConnect />
                </div>

                {/* Mobile hamburger */}
                <Button
                    className="mobile-menu-btn"
                    type="text"
                    icon={<MenuOutlined style={{ color: "#fff", fontSize: 20 }} />}
                    onClick={() => setDrawerOpen(true)}
                    aria-label="Open mobile menu"
                />
            </Header>

            {/* Mobile Drawer */}
            <Drawer
                title="Menu"
                placement="right"
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                styles={{ body: { padding: 0, background: "#12121a" }, header: { background: "#12121a", borderBottom: "1px solid rgba(255,255,255,0.06)" } }}
            >
                <nav role="navigation" aria-label="Mobile navigation">
                    <Menu
                        mode="vertical"
                        selectedKeys={[location.pathname]}
                        onClick={({ key }) => {
                            navigate(key);
                            setDrawerOpen(false);
                        }}
                        items={navItems}
                        style={{ background: "transparent", borderRight: "none" }}
                    />
                </nav>
                <div style={{ padding: 16 }}>
                    <WalletConnect />
                </div>
            </Drawer>

            {/* ── Content ── */}
            <Content style={{ padding: "0", minHeight: "calc(100vh - 134px)" }}>
                <Outlet />
            </Content>

            {/* ── Footer ── */}
            <Footer
                style={{
                    textAlign: "center",
                    background: "#0a0a0f",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    color: "#a0a0b0",
                    fontSize: 13,
                    padding: "32px 24px 24px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 24,
                        marginBottom: 16,
                        flexWrap: "wrap",
                    }}
                >
                    {footerLinks.map((link) => (
                        <span
                            key={link.key}
                            role="link"
                            tabIndex={0}
                            onClick={() => navigate(link.key)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") navigate(link.key);
                            }}
                            style={{
                                color: "#a0a0b0",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 500,
                                transition: "color 0.2s ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "#667eea")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "#a0a0b0")}
                        >
                            {link.label}
                        </span>
                    ))}
                </div>
                <div style={{ color: "#a0a0b0", opacity: 0.7 }}>
                    NFT Marketplace &copy; {new Date().getFullYear()} &mdash; Built on Ethereum Sepolia
                </div>
            </Footer>
        </AntLayout>
    );
}
