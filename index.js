import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Тестовый маршрут
app.get("/", (req, res) => {
  res.send("🚀 Metronome Proxy Server работает!");
});

// Прокси для Telegram
app.get("/telegram/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    const url = `https://api.telegram.org/bot${token}/getChat?chat_id=${userId}`;
    const response = await fetch(url);
    const data = await response.json();

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Прокси для Pinata (пока заглушка)
app.post("/pinata/upload", (req, res) => {
  res.json({ status: "📦 Заглушка — загрузка в Pinata будет позже" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
