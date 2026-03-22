import { useState } from "react";
import { Modal, InputNumber, Typography, message, Space } from "antd";
import { ExclamationCircleFilled, WarningOutlined } from "@ant-design/icons";
import { useWallet } from "../hooks/useWallet";
import { useContracts } from "../hooks/useContracts";
import { CONTRACTS } from "../config/contracts";
import { parseEther } from "ethers";

const { Text } = Typography;

const MARKETPLACE_FEE_PERCENT = 2.5;
const MIN_RECOMMENDED_PRICE = 0.001;
const HIGH_VALUE_THRESHOLD = 10;

interface ListingModalProps {
    open: boolean;
    tokenId: number;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function ListingModal({
    open,
    tokenId,
    onClose,
    onSuccess,
}: ListingModalProps) {
    const { provider } = useWallet();
    const { nftContract, marketplaceContract } = useContracts(provider);
    const [price, setPrice] = useState<number>(0.01);
    const [loading, setLoading] = useState(false);

    const feeAmount = price * (MARKETPLACE_FEE_PERCENT / 100);
    const netAmount = price - feeAmount;
    const isBelowMinPrice = price > 0 && price < MIN_RECOMMENDED_PRICE;
    const isHighValue = price >= HIGH_VALUE_THRESHOLD;

    const handleList = async () => {
        if (!nftContract || !marketplaceContract || !price) {
            message.error("Please connect wallet and set a price");
            return;
        }

        // High-value listing confirmation
        if (isHighValue) {
            const confirmed = await new Promise<boolean>((resolve) => {
                Modal.confirm({
                    title: (
                        <Text style={{ color: "#fff", fontWeight: 600 }}>
                            High-Value Listing
                        </Text>
                    ),
                    icon: <ExclamationCircleFilled style={{ color: "#faad14" }} />,
                    content: (
                        <div style={{ color: "#a0a0b0" }}>
                            <p>
                                You are about to list NFT #{tokenId} for{" "}
                                <strong style={{ color: "#667eea" }}>{price} ETH</strong>.
                            </p>
                            <p>
                                This is a high-value listing. Please confirm the price is
                                correct before proceeding.
                            </p>
                        </div>
                    ),
                    okText: "Confirm Listing",
                    cancelText: "Review Price",
                    okButtonProps: {
                        style: {
                            background: "linear-gradient(135deg, #667eea, #764ba2)",
                            border: "none",
                            borderRadius: 8,
                            fontWeight: 600,
                        },
                    },
                    styles: {
                        content: { background: "#12121a", border: "1px solid rgba(255,255,255,0.06)" },
                        header: { background: "#12121a" },
                        body: { background: "#12121a" },
                    },
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            });
            if (!confirmed) return;
        }

        setLoading(true);
        try {
            const nft = await nftContract;
            const marketplace = await marketplaceContract;

            // Step 1: Approve marketplace
            message.loading({ content: "Approving marketplace...", key: "list" });
            const approveTx = await nft.approve(
                CONTRACTS.MARKETPLACE.address,
                tokenId
            );
            await approveTx.wait();

            // Step 2: List item
            message.loading({ content: "Listing NFT...", key: "list" });
            const listTx = await marketplace.listItem(
                CONTRACTS.NFT.address,
                tokenId,
                parseEther(price.toString())
            );
            await listTx.wait();

            message.success({
                content: "NFT listed successfully! 🎉",
                key: "list",
                duration: 5,
            });
            onClose();
            onSuccess?.();
        } catch (err: any) {
            console.error("List error:", err);
            message.error({
                content: err.reason || err.message || "Listing failed",
                key: "list",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>
                    List NFT #{tokenId} for Sale
                </Text>
            }
            open={open}
            onCancel={onClose}
            onOk={handleList}
            confirmLoading={loading}
            okText="List for Sale"
            okButtonProps={{
                style: {
                    background: "linear-gradient(135deg, #667eea, #764ba2)",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 600,
                },
            }}
            styles={{
                content: { background: "#12121a", border: "1px solid rgba(255,255,255,0.06)" },
                header: { background: "#12121a", borderBottom: "1px solid rgba(255,255,255,0.06)" },
                footer: { background: "#12121a", borderTop: "1px solid rgba(255,255,255,0.06)" },
            }}
        >
            <Space direction="vertical" size="large" style={{ width: "100%", padding: "16px 0" }}>
                <div>
                    <Text style={{ color: "#a0a0b0", display: "block", marginBottom: 8 }}>
                        Price (ETH)
                    </Text>
                    <InputNumber
                        aria-label="NFT listing price in ETH"
                        value={price}
                        onChange={(val) => setPrice(val || 0)}
                        min={0.0001}
                        step={0.01}
                        precision={4}
                        style={{
                            width: "100%",
                            background: "rgba(255,255,255,0.04)",
                            border: isBelowMinPrice
                                ? "1px solid rgba(250,173,20,0.4)"
                                : "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            transition: "border-color 0.3s ease",
                        }}
                        addonAfter="ETH"
                    />
                    {isBelowMinPrice && (
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                            <WarningOutlined style={{ color: "#faad14", fontSize: 13 }} />
                            <Text style={{ color: "#faad14", fontSize: 12 }}>
                                Price below {MIN_RECOMMENDED_PRICE} ETH may not cover gas fees
                            </Text>
                        </div>
                    )}
                </div>

                {/* Fee breakdown */}
                <div
                    style={{
                        padding: 12,
                        borderRadius: 8,
                        background: "rgba(102,126,234,0.08)",
                        border: "1px solid rgba(102,126,234,0.15)",
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ color: "#a0a0b0", fontSize: 12 }}>Listing price</Text>
                        <Text style={{ color: "#d0d0d8", fontSize: 12, fontWeight: 500 }}>
                            {price.toFixed(4)} ETH
                        </Text>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ color: "#a0a0b0", fontSize: 12 }}>
                            Marketplace fee ({MARKETPLACE_FEE_PERCENT}%)
                        </Text>
                        <Text style={{ color: "#ff7875", fontSize: 12, fontWeight: 500 }}>
                            -{feeAmount.toFixed(4)} ETH
                        </Text>
                    </div>
                    <div
                        style={{
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                            paddingTop: 6,
                            display: "flex",
                            justifyContent: "space-between",
                        }}
                    >
                        <Text style={{ color: "#a0a0b0", fontSize: 12, fontWeight: 600 }}>
                            You will receive
                        </Text>
                        <Text style={{ color: "#667eea", fontSize: 13, fontWeight: 700 }}>
                            {netAmount.toFixed(4)} ETH
                        </Text>
                    </div>
                </div>

                {/* High-value warning */}
                {isHighValue && (
                    <div
                        style={{
                            padding: 10,
                            borderRadius: 8,
                            background: "rgba(250,173,20,0.08)",
                            border: "1px solid rgba(250,173,20,0.2)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <ExclamationCircleFilled style={{ color: "#faad14", fontSize: 16, flexShrink: 0 }} />
                        <Text style={{ color: "#faad14", fontSize: 12 }}>
                            High-value listing. You will be asked to confirm before proceeding.
                        </Text>
                    </div>
                )}
            </Space>
        </Modal>
    );
}
