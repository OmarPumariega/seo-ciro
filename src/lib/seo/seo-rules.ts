import { readFile } from "fs/promises";
import path from "path";

let cached: string | null = null;

export async function loadSeoRules(): Promise<string> {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "docs", "seo-rules.md");
  cached = await readFile(filePath, "utf-8");
  return cached;
}
