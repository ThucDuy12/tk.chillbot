const mongoose = require('mongoose');

// Kết nối đến MongoDB
async function connectDB() {
  try {
    if (!process.env.MONGO_URI) throw new Error("Thiếu MONGO_URI trong .env");
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Atlas đã kết nối thành công!');
  } catch (err) {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
  }
}

// ================= CÁC BẢN THIẾT KẾ DỮ LIỆU (SCHEMAS) =================

// 1. Schema cho Profile Người dùng
const profileSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  name: String,
  age: String,
  bio: String
});
const Profile = mongoose.model('Profile', profileSchema);

// 2. Schema cho Lịch sử Chat AI (Lưu theo Kênh)
const chatHistorySchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  messages: [{ role: String, content: String }]
});
const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);


// ================= CÁC HÀM XỬ LÝ (Thay thế JSON) =================

// --- XỬ LÝ PROFILES ---
async function getProfile(discordId) {
  const p = await Profile.findOne({ discordId });
  return p ? { name: p.name, age: p.age, bio: p.bio } : null;
}

async function getAllProfiles() {
  const profiles = await Profile.find({});
  const result = {};
  profiles.forEach(p => {
    result[p.discordId] = { name: p.name, age: p.age, bio: p.bio };
  });
  return result;
}

async function saveProfile(discordId, data) {
  await Profile.findOneAndUpdate(
    { discordId },
    { $set: data },
    { upsert: true, new: true } // Có thì sửa, chưa có thì tạo mới
  );
}

// --- XỬ LÝ LỊCH SỬ CHAT AI ---
async function getChatHistory(channelId) {
  const history = await ChatHistory.findOne({ channelId });
  return history ? history.messages : [];
}

async function saveChatHistory(channelId, messages) {
  await ChatHistory.findOneAndUpdate(
    { channelId },
    { $set: { messages } },
    { upsert: true }
  );
}

module.exports = {
  connectDB,
  getProfile,
  getAllProfiles,
  saveProfile,
  getChatHistory,
  saveChatHistory
};