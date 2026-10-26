import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "mela-sales-api",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Mela Sales API running on port ${PORT}`);
});