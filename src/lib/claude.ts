import Anthropic from "@anthropic-ai/sdk";

import dotenv from "dotenv";
dotenv.config();

if(!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});