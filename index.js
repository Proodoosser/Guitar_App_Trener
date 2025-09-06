import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// 🟢 Настройка CSP для разрешения data URI
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Увеличиваем лимит для больших base64 файлов

// 🟢 Корневой маршрут
app.get("/", (req, res) => {
  res.json({ 
    message: "Server is running!",
    endpoints: {
      auth: "POST /api/auth/telegram",
      profile: "GET /api/profile/:id",
      upload: "POST /api/pinata/upload",
      getData: "GET /api/pinata/data/:hash",
      progress: "POST /api/progress",
      notifications: "POST /api/notifications",
      health: "GET /api/health"
    },
    timestamp: new Date().toISOString()
  });
});

// 🟢 Временное "хранилище"
let profiles = {}; // { telegramId: { name, avatar, ... } }

// 🟡 Telegram Auth callback
app.post("/api/auth/telegram", (req, res) => {
  const { id, first_name, last_name, username, photo_url } = req.body;
  if (!id) return res.status(400).json({ error: "No Telegram user id" });

  profiles[id] = {
    id,
    name: `${first_name || ""} ${last_name || ""}`.trim(),
    username,
    avatar: photo_url,
    updatedAt: Date.now(),
  };

  console.log("✅ Telegram user saved:", profiles[id]);
  res.json({ success: true, profile: profiles[id] });
});

// 🟡 Получить профиль
app.get("/api/profile/:id", (req, res) => {
  const profile = profiles[req.params.id];
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

// 🟡 Pinata upload (через API key) - исправленная версия
app.post("/api/pinata/upload", async (req, res) => {
  try {
    const { fileBase64, fileName, fileType } = req.body;
    if (!fileBase64) return res.status(400).json({ error: "No file" });

    // Конвертируем base64 в buffer
    const base64Data = fileBase64.replace(/^data:.+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Создаем form-data для Pinata
    const formData = new FormData();
    const blob = new Blob([buffer], { type: fileType || 'application/octet-stream' });
    formData.append('file', blob, fileName || 'file');

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PINATA_JWT}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    res.json({ ipfsHash: response.data.IpfsHash });
  } catch (err) {
    console.error("Pinata error", err.response?.data || err.message);
    res.status(500).json({ error: "Pinata upload failed" });
  }
});

// 🟡 Новый эндпоинт для получения данных с Pinata по хешу
app.get("/api/pinata/data/:hash", async (req, res) => {
  try {
    const { hash } = req.params;
    const response = await axios.get(
      `https://gateway.pinata.cloud/ipfs/${hash}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        timeout: 10000
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error("Pinata fetch error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch from Pinata" });
  }
});

// 🟡 Прогресс/очки
app.post("/api/progress", (req, res) => {
  const { id, score, level, time } = req.body;
  if (!id || !profiles[id])
    return res.status(400).json({ error: "Unknown user" });

  profiles[id].score = (profiles[id].score || 0) + (score || 0);
  profiles[id].level = Math.max(profiles[id].level || 1, level || 1);
  profiles[id].totalTime = (profiles[id].totalTime || 0) + (time || 0);

  res.json({ success: true, profile: profiles[id] });
});

// 🟡 Новый endpoint для уведомлений
app.post('/api/notifications', async (req, res) => {
  try {
    const { telegramId, message, activityType, userData, metadata } = req.body;
    
    const username = userData?.username || 'unknown';
    const firstName = userData?.firstName || 'unknown';
    const messagePreview = message ? message.substring(0, 100) + (message.length > 100 ? '...' : '') : 'empty message';
    
    console.log('📨 Received notification from Telegram user:', {
      telegramId,
      username,
      firstName,
      activityType,
      message: messagePreview,
      timestamp: new Date().toISOString()
    });
    
    if (telegramId && profiles[telegramId]) {
      if (!profiles[telegramId].notifications) {
        profiles[telegramId].notifications = [];
      }
      profiles[telegramId].notifications.push({
        message,
        activityType,
        timestamp: new Date().toISOString(),
        metadata
      });
      
      if (profiles[telegramId].notifications.length > 50) {
        profiles[telegramId].notifications = profiles[telegramId].notifications.slice(-50);
      }
    }
    
    res.json({ 
      success: true, 
      received: true,
      timestamp: new Date().toISOString(),
      notificationId: Date.now(),
      message: 'Notification processed successfully'
    });
    
  } catch (error) {
    console.error('❌ Error processing notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// 🟡 Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    profilesCount: Object.keys(profiles).length
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /`);
  console.log(`   POST /api/auth/telegram`);
  console.log(`   GET  /api/profile/:id`);
  console.log(`   POST /api/pinata/upload`);
  console.log(`   GET  /api/pinata/data/:hash`);
  console.log(`   POST /api/progress`);
  console.log(`   POST /api/notifications`);
  console.log(`   GET  /api/health`);
});
