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
                }}
            >
                {/* Logo */}
                <div
                    onClick={() => navigate("/")}
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
                }}
            >
                NFT Marketplace © {new Date().getFullYear()} — Built on Ethereum Sepolia
            </Footer>
        </AntLayout>
    );
}
