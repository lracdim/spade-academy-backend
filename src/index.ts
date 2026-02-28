import express from "express";
import cors from "cors";
import helmet from "helmet";
import * as dotenv from "dotenv";
import apiRoutes from "./routes/api.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(helmet());
app.use(express.json());

// API Routes
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
    res.json({ message: "Academy Backend is running!", status: "healthy" });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
