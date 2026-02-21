import axios from "axios";
import { PINATA_CONFIG } from "../config/contracts";

const PINATA_API = "https://api.pinata.cloud";

export async function uploadImageToIPFS(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const metadata = JSON.stringify({ name: file.name });
    formData.append("pinataMetadata", metadata);

    const options = JSON.stringify({ cidVersion: 1 });
    formData.append("pinataOptions", options);

    const response = await axios.post(
        `${PINATA_API}/pinning/pinFileToIPFS`,
        formData,
        {
            maxBodyLength: Infinity,
            headers: {
                "Content-Type": "multipart/form-data",
                pinata_api_key: PINATA_CONFIG.apiKey,
                pinata_secret_api_key: PINATA_CONFIG.apiSecret,
            },
        }
    );

    return response.data.IpfsHash;
}

export async function uploadMetadataToIPFS(metadata: {
    name: string;
    description: string;
    image: string;
    attributes?: Array<{ trait_type: string; value: string }>;
}): Promise<string> {
    const response = await axios.post(
        `${PINATA_API}/pinning/pinJSONToIPFS`,
        {
            pinataContent: metadata,
            pinataMetadata: { name: `${metadata.name}-metadata` },
        },
        {
            headers: {
                "Content-Type": "application/json",
                pinata_api_key: PINATA_CONFIG.apiKey,
                pinata_secret_api_key: PINATA_CONFIG.apiSecret,
            },
        }
    );

    return response.data.IpfsHash;
}

export function ipfsToHttp(ipfsUri: string): string {
    if (ipfsUri.startsWith("ipfs://")) {
        return `${PINATA_CONFIG.gateway}${ipfsUri.replace("ipfs://", "")}`;
    }
    return ipfsUri;
}
