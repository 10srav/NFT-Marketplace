import { useState } from "react";
import { Modal, InputNumber, Typography, message, Space } from "antd";
import { useWallet } from "../hooks/useWallet";
import { useContracts } from "../hooks/useContracts";
import { CONTRACTS } from "../config/contracts";
import { parseEther } from "ethers";

const { Text } = Typography;

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

    const handleList = async () => {
        if (!nftContract || !marketplaceContract || !price) {
            message.error("Please connect wallet and set a price");
            return;
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
                        value={price}
                        onChange={(val) => setPrice(val || 0)}
                        min={0.0001}
                        step={0.01}
                        precision={4}
                        style={{
                            width: "100%",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                        }}
                        addonAfter="ETH"
                    />
                </div>
                <div
                    style={{
                        padding: 12,
                        borderRadius: 8,
                        background: "rgba(102,126,234,0.08)",
                        border: "1px solid rgba(102,126,234,0.15)",
                    }}
                >
                    <Text style={{ color: "#a0a0b0", fontSize: 12 }}>
                        A 2.5% marketplace fee will be applied on sale.
                        <br />
                        You will receive: <strong style={{ color: "#667eea" }}>
                            {(price * 0.975).toFixed(4)} ETH
                        </strong>
                    </Text>
                </div>
            </Space>
        </Modal>
    );
}
