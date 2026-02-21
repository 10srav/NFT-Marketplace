import { Typography } from "antd";
import MintForm from "../components/MintForm";

const { Title, Paragraph } = Typography;

export default function Create() {
    return (
        <div style={{ padding: "60px 24px", maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
                <Title level={2} style={{ color: "#fff", fontWeight: 800 }}>
                    ✨ Create Your NFT
                </Title>
                <Paragraph style={{ color: "#a0a0b0", fontSize: 16, maxWidth: 500, margin: "0 auto" }}>
                    Upload your artwork, add details, and mint it as an NFT on the blockchain.
                    Your creation will be stored permanently on IPFS.
                </Paragraph>
            </div>
            <MintForm />
        </div>
    );
}
