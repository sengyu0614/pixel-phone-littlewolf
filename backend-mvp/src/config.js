import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: Number(process.env.PORT || 3030),
  jwtSecret: process.env.JWT_SECRET || "replace-this-in-production",
  dataFile: process.env.DATA_FILE || path.join(__dirname, "..", "data", "db.json")
};
