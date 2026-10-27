import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRouter from "./routes/api.routes";
import { globalErrorHandler } from "./middleware/error.middleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use(apiRouter);
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(
    `[Mela Sales Backend] initialized safely on routing interface context: ${PORT}`,
  );
});
