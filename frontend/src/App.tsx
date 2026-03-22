import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Marketplace from "./pages/Marketplace";
import Create from "./pages/Create";
import Dashboard from "./pages/Dashboard";
import NFTDetail from "./pages/NFTDetail";

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#667eea",
          colorBgBase: "#0a0a0f",
          colorBgContainer: "#12121a",
          colorBorder: "rgba(255,255,255,0.06)",
          colorText: "#ffffff",
          colorTextSecondary: "#a0a0b0",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          borderRadius: 8,
        },
        components: {
          Menu: {
            darkItemBg: "transparent",
            darkItemSelectedBg: "rgba(102,126,234,0.12)",
            darkItemColor: "#a0a0b0",
            darkItemSelectedColor: "#667eea",
          },
          Card: {
            colorBgContainer: "rgba(255,255,255,0.03)",
            colorBorderSecondary: "rgba(255,255,255,0.06)",
          },
          Table: {
            colorBgContainer: "transparent",
            headerBg: "rgba(255,255,255,0.03)",
          },
          Input: {
            colorBgContainer: "rgba(255,255,255,0.04)",
            colorBorder: "rgba(255,255,255,0.1)",
          },
          Select: {
            colorBgContainer: "rgba(255,255,255,0.04)",
            colorBorder: "rgba(255,255,255,0.1)",
          },
          Button: {
            borderRadius: 10,
          },
          Modal: {
            borderRadius: 16,
          },
          Tag: {
            borderRadius: 6,
          },
          Tooltip: {
            colorBgSpotlight: "#1a1a2e",
          },
          Spin: {
            colorPrimary: "#667eea",
          },
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/create" element={<Create />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/nft/:id" element={<NFTDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
