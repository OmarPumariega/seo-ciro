import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Cifrado AES-256-CBC para secretos que aún no existen en el esquema (tokens
// OAuth de Módulo 6, API keys de DataForSEO/Claude de Módulo 1/5/9). Se deja
// lista para cuando esos módulos añadan las columnas que la consuman.
const ALGORITHM = "aes-256-cbc";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "utf8").slice(0, 32);

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(encrypted: string): string {
  const [ivHex, encryptedHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encryptedBuffer = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]).toString("utf8");
}
