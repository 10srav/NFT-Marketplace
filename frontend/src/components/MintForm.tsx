import { useState } from "react";
import {
    Form,
    Input,
    Button,
    Upload,
    Card,
    Typography,
    Steps,
    message,
    Space,
} from "antd";
import { InboxOutlined, LoadingOutlined, CheckCircleFilled } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload";
import { uploadImageToIPFS, uploadMetadataToIPFS } from "../services/ipfs";
import { useWallet } from "../hooks/useWallet";
import { useContracts } from "../hooks/useContracts";

const { TextArea } = Input;
const { Title, Text } = Typography;
const { Dragger } = Upload;

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function MintForm() {
    const { provider, isConnected } = useWallet();
    const { nftContract } = useContracts(provider);
    const [form] = Form.useForm();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string>("");

    const onFileChange = (info: any) => {
        const file = info.fileList.slice(-1);

        // Validate file size before accepting
        if (file.length > 0 && file[0].originFileObj) {
            const fileSize = file[0].originFileObj.size;
            if (fileSize > MAX_FILE_SIZE_BYTES) {
                message.error(
                    `File size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds the ${MAX_FILE_SIZE_MB}MB limit. Please choose a smaller file.`
                );
                return;
            }
        }

        setFileList(file);
        if (file.length > 0 && file[0].originFileObj) {
            const reader = new FileReader();
            reader.onload = (e) => setPreviewUrl(e.target?.result as string);
            reader.readAsDataURL(file[0].originFileObj);
            setStep(1);
        }
    };

    const handleMint = async (values: { name: string; description: string }) => {
        if (!isConnected || !nftContract) {
            message.error("Please connect your wallet first");
            return;
        }
        if (fileList.length === 0) {
            message.error("Please upload an image");
            return;
        }

        setLoading(true);
        try {
            // Step 1: Upload image to IPFS
            setStep(1);
            message.loading({ content: "Uploading image to IPFS... (Step 1/3 ~33%)", key: "mint" });
            const imageCID = await uploadImageToIPFS(fileList[0].originFileObj as File);

            // Step 2: Upload metadata to IPFS
            setStep(2);
            message.loading({ content: "Uploading metadata... (Step 2/3 ~66%)", key: "mint" });
            const metadataCID = await uploadMetadataToIPFS({
                name: values.name,
                description: values.description,
                image: `ipfs://${imageCID}`,
            });

            // Step 3: Mint NFT on-chain
            message.loading({ content: "Minting NFT on-chain... (Step 3/3 ~90%)", key: "mint" });
            const contract = await nftContract;
            const tx = await contract.mintNFT(`ipfs://${metadataCID}`, 500);
            await tx.wait();

            message.success({ content: "NFT minted successfully! 🎉", key: "mint", duration: 5 });
            form.resetFields();
            setFileList([]);
            setPreviewUrl("");
            setStep(0);
        } catch (err: any) {
            console.error("Mint error:", err);
            message.error({
                content: err.reason || err.message || "Minting failed",
                key: "mint",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card
            style={{
                maxWidth: 560,
                margin: "0 auto",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16,
            }}
        >
            <Title level={4} style={{ color: "#fff", marginBottom: 24 }}>
                Create New NFT
            </Title>

            <Steps
                current={step}
                size="small"
                style={{ marginBottom: 32 }}
                items={[
                    { title: "Upload" },
                    { title: "Details" },
                    { title: "Mint" },
                ]}
            />

            <Form form={form} layout="vertical" onFinish={handleMint}>
                <Form.Item label={<Text style={{ color: "#a0a0b0" }}>Image</Text>}>
                    <Dragger
                        aria-label="Upload NFT image"
                        fileList={fileList}
                        onChange={onFileChange}
                        beforeUpload={() => false}
                        accept="image/*"
                        maxCount={1}
                        style={{
                            background: previewUrl
                                ? "rgba(72,199,142,0.04)"
                                : "rgba(255,255,255,0.02)",
                            border: previewUrl
                                ? "1px dashed rgba(72,199,142,0.4)"
                                : "1px dashed rgba(102,126,234,0.3)",
                            borderRadius: 12,
                            transition: "all 0.3s ease",
                        }}
                    >
                        {previewUrl ? (
                            <div style={{ position: "relative", display: "inline-block" }}>
                                <img
                                    src={previewUrl}
                                    alt="preview"
                                    style={{
                                        maxHeight: 200,
                                        objectFit: "contain",
                                        borderRadius: 8,
                                    }}
                                />
                                <CheckCircleFilled
                                    style={{
                                        position: "absolute",
                                        top: -8,
                                        right: -8,
                                        fontSize: 24,
                                        color: "#48c78e",
                                        background: "#12121a",
                                        borderRadius: "50%",
                                    }}
                                />
                                <p style={{ color: "#48c78e", fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                                    Image uploaded — click or drag to replace
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="ant-upload-drag-icon">
                                    <InboxOutlined style={{ color: "#667eea", fontSize: 40 }} />
                                </p>
                                <p style={{ color: "#a0a0b0" }}>
                                    Click or drag image to upload
                                </p>
                                <p style={{ color: "#666", fontSize: 12 }}>
                                    PNG, JPG, GIF, SVG, WEBP (max 50MB)
                                </p>
                            </>
                        )}
                    </Dragger>
                </Form.Item>

                <Form.Item
                    name="name"
                    label={<Text style={{ color: "#a0a0b0" }}>Name</Text>}
                    rules={[{ required: true, message: "Please enter a name" }]}
                >
                    <Input
                        aria-required="true"
                        placeholder="My Awesome NFT"
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            color: "#fff",
                        }}
                    />
                </Form.Item>

                <Form.Item
                    name="description"
                    label={<Text style={{ color: "#a0a0b0" }}>Description</Text>}
                    rules={[{ required: true, message: "Please enter a description" }]}
                >
                    <TextArea
                        aria-required="true"
                        rows={3}
                        placeholder="Describe your NFT..."
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            color: "#fff",
                        }}
                    />
                </Form.Item>

                <Form.Item>
                    <Space direction="vertical" style={{ width: "100%" }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                            size="large"
                            icon={loading ? <LoadingOutlined /> : undefined}
                            style={{
                                background: "linear-gradient(135deg, #667eea, #764ba2)",
                                border: "none",
                                borderRadius: 10,
                                fontWeight: 700,
                                height: 48,
                            }}
                        >
                            {loading ? "Minting..." : "Mint NFT"}
                        </Button>
                        {!isConnected && (
                            <Text
                                type="warning"
                                style={{ display: "block", textAlign: "center" }}
                            >
                                Connect your wallet to mint
                            </Text>
                        )}
                    </Space>
                </Form.Item>
            </Form>
        </Card>
    );
}
