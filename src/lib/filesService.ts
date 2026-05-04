import path from "path";
import fs from "fs";
import { claude } from "./claude";
import Anthropic, { toFile } from "@anthropic-ai/sdk";

interface UploadedFile {
  fileId: string;
  uploadedAt: string;
  fileName: string;
}

// In-memory store of the uploaded file IDs
// In production this would be in a database per client/tenant
const uploadedFiles = new Map<string, UploadedFile>();

export async function uploadKnowledgeBaseFile(
  filePath: string,
): Promise<string> {
  const fileName = path.basename(filePath);

  // Check if already uploaded this session — avoid re-uploading
  if (uploadedFiles.has(fileName)) {
    const existingFile = uploadedFiles.get(fileName)!;
    console.log(
      `[Files API] Already uploaded: ${fileName} → ${existingFile.fileId}`,
    );
    return existingFile.fileId;
  }

  console.log(`[Files API] Uploading file: ${fileName} from path: ${filePath}`);
  const fileStream = fs.createReadStream(filePath);

  // Uses client.beta.files — Files API is still in beta
  const uploaded = await (claude as Anthropic).beta.files.upload(
    {
      file: await toFile(fileStream, fileName, { type: "text/plain" }),
    },
    {
      headers: {
        "anthropic-beta": "files-api-2025-04-14",
      },
    },
  );

  uploadedFiles.set(fileName, {
    fileId: uploaded.id,
    fileName,
    uploadedAt: new Date().toISOString(),
  });

  console.log(`[Files API] Uploaded: ${fileName} → ${uploaded.id}`);
  return uploaded.id;
}

export async function uploadCustomerAttachment(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  console.log(
    `[Files API] Uploading customer attachment: ${fileName} with MIME type: ${mimeType}`,
  );

  const uploaded = await (claude as Anthropic).beta.files.upload(
    {
      file: await toFile(fileBuffer, fileName, { type: mimeType }),
    },
    {
      headers: {
        "anthropic-beta": "files-api-2025-04-14",
      },
    },
  );

  console.log(`[Files API] Customer attachment uploaded → ${uploaded.id}`);
  return uploaded.id;
}

export async function listUploadedFiles(): Promise<UploadedFile[]> {
  return Array.from(uploadedFiles.values());
}
