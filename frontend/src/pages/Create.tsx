import { Typography } from "antd";
import MintForm from "../components/MintForm";

const { Title, Paragraph } = Typography;

export default function Create() {
    return (
        <div style={{ padding: "60px 24px", maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
                <Title
                    level={2}
                    style={{
                        fontWeight: 800,
                        fontSize: 36,
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        marginBottom: 12,
                    }}
                >
                    Create Your NFT
                </Title>
                <Paragraph
                    style={{
                        color: "#a0a0b0",
                        fontSize: 16,
                        lineHeight: 1.7,
                        maxWidth: 520,
                        margin: "0 auto",
                    }}
                >
                    Upload your artwork, add details, and mint it as an NFT on the blockchain.
                    Your creation will be stored permanently on IPFS.
                </Paragraph>
            </div>
            <MintForm />
        </div>
    );
}
