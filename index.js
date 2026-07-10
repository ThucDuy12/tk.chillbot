require('node:dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Worker } = require('worker_threads');
const cheerio = require('cheerio');
const {
  initGoogleSheets, loadControllerLeaderboard, loadPilotLeaderboard,
  saveControllerLeaderboard, savePilotLeaderboard, loadPendingUsersSheet,
  savePendingUsersSheet, loadSimbriefUsersSheet, saveSimbriefUsersSheet,
  loadProfilesSheet, saveProfilesSheet, loadVatsimLinksSheet, saveVatsimLinksSheet,
  getPilotBalance, updatePilotBalance, registerPilot // <--- THÊM CÁI NÀY
} = require('./googleSheets');
const { createCanvas, loadImage, GlobalFonts } = require('canvas');
const fetch = require('node-fetch'); // Thêm nếu chưa có
const nodeFetch = require('node-fetch');

// Thêm vào khu vực khai báo biến ở đầu file
const temporarySearchResults = new Map();

const https = require('https');
const deletedImageCache = new Map();

const db = require('./database');

const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');

// Kho chứa danh sách phát nhạc của các server
const musicQueues = new Map();

// Cỗ máy tải file vật lý bằng HTTPS chuẩn của Node.js (Chống mọi lỗi thư viện)
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        reject(new Error(`Mã lỗi: ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  AttachmentBuilder,
  Partials,
  PermissionFlagsBits
} = require('discord.js');

const { SlashCommandBuilder } = require('@discordjs/builders');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ===================== CONFIG =====================
const TOKEN = process.env.DISCORD_TOKEN;

const VATSIM_CHANNEL_ID = process.env.VATSIM_CHANNEL_ID || '1412853057968017469';
const REPENT_CHANNEL_ID = process.env.REPENT_CHANNEL_ID || '1413556917707472896';
const GROUP_FLIGHT_CHANNEL_ID = process.env.GROUP_FLIGHT_CHANNEL_ID || '1366417558395289640';
const AI_CHANNEL_ID = process.env.AI_CHANNEL_ID || '1431645766795001970';
const TRIGGER_VOICE_CHANNEL_ID = process.env.TRIGGER_VOICE_CHANNEL_ID || '1440000000000000001';
const ROLE_APPROVAL_CHANNEL_ID = process.env.ROLE_APPROVAL_CHANNEL_ID;
const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID || '1458058709677899951';

const BOT_ANNOUNCEMENTS_CHANNEL_ID = process.env.BOT_ANNOUNCEMENTS_CHANNEL_ID || '1510136210683723927';
const ATC_NOTI_ROLE_ID = process.env.ATC_NOTI_ROLE_ID || '1510148740634382517';
// Thay ID kênh tk.chill cash của sếp vào đây nhé
const CASH_CHANNEL_ID = process.env.CASH_CHANNEL_ID || '1524602750229418115';

const GUILD_ID = process.env.GUILD_ID || '1365693391668777051';
const OWNER_ID = process.env.OWNER_ID;

const CHECKWX_API_KEY = '25bf6075ad24413c86d8903b59884a5c'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Summarize caps
const SUMMARY_MAX_MESSAGES = parseInt(process.env.SUMMARY_MAX_MESSAGES || '600', 10);
const SUMMARY_MAX_TRANSCRIPT_CHARS = parseInt(process.env.SUMMARY_MAX_TRANSCRIPT_CHARS || '60000', 10);

// Chat caps
const GEMINI_MAX_HISTORY_ITEMS = parseInt(process.env.GEMINI_MAX_HISTORY_ITEMS || '20', 10);
const GEMINI_MAX_USER_TEXT_CHARS = parseInt(process.env.GEMINI_MAX_USER_TEXT_CHARS || '1800', 10);

// Thay ID channel này bằng ID channel Dashboard ACDM của bạn
const ACDM_CHANNEL_ID = process.env.ACDM_CHANNEL_ID || '1503763584105058434';

// Thay bằng ID thực tế của 3 kênh bạn vừa tạo
const STATS_TOTAL_ID = process.env.STATS_TOTAL_ID || '1513738193986388140';
const STATS_HUMAN_ID = process.env.STATS_HUMAN_ID || '1513738397938618508';
const STATS_BOT_ID = process.env.STATS_BOT_ID || '1513738533188272218';

// ===================== VATSIM VERIFY DATA =====================
const pendingVerifyDMs = new Map(); // Lưu trạng thái user đang nhắn DM
let vatsimLinksCache = {}; // Cache của sổ đỏ CID

// ===================== VATSEA CONFIG =====================
const STATSIM_API_KEY = process.env.STATSIM_API_KEY || '564eNsuJE8wTQw1hAZKGwHicOyVbmucoe3tZujdd';
const VATSEA_CHANNEL_ID = process.env.VATSEA_CHANNEL_ID || '1478382913455259781';

const VATSEA_MSG_FILE = path.join(__dirname, 'vatsea_leaderboard_msg.json');
let vatseaMessageStore = fs.existsSync(VATSEA_MSG_FILE) ? JSON.parse(fs.readFileSync(VATSEA_MSG_FILE, 'utf8')) : {};

const POSITIONS_TO_RANK = {
  "Center": ["VVHM_CTR", "VTBB_CTR", "WSJC_CTR", "HKG_CTR", "WMFC_CTR", "WIIF_CTR", "WAAF_CTR", "MNL_CTR"],
  "Approach": ["VVTS_APP", "VTBS_APP", "WSSS_APP", "VHHH_APP", "WMKK_APP", "WIII_APP", "WADD_APP", "RPLL_APP"],
  "Tower": ["VVTS_TWR", "VTBS_TWR", "WSSS_TWR", "VHHH_TWR", "WMKK_TWR", "WIII_TWR", "WADD_TWR", "RPLL_TWR"],
  "Ground": ["VVTS_GND", "VTBS_GND", "WSSS_GND", "VHHH_GND", "WMKK_GND", "WIII_GND", "WADD_GND", "RPLL_GND"]
};
const STATSIM_API_URL = "http://api.statsim.net/api/Atcsessions/Dates";
const EXCLUDED_IDS = new Set(['M', 'I', 'X', 'Y', 'Z']);

// ===================== MARKETPLACE CONFIG =====================
const MARKETPLACE_CHANNEL_ID = process.env.MARKETPLACE_CHANNEL_ID || '1461357458252365984';
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1448258683627638895';

let simbriefUsersData = {};

// ===================== PENDING USERS DATA =====================
// Khởi tạo biến rỗng, dữ liệu sẽ được kéo từ Sheet về lúc bot ready
let pendingUsersData = {};

// Sửa lại hàm save thành dạng gọi API của Google Sheet
async function savePendingUsers() {
  try {
    if (typeof savePendingUsersSheet === 'function') {
      // Lưu ý: Nếu hàm savePendingUsersSheet của bạn cần truyền tham số 'doc' (như ví dụ trên), 
      // bạn cần điều chỉnh cho phù hợp với cấu trúc googleSheets.js của bạn. 
      // Giả sử module googleSheets của bạn đã tự quản lý 'doc' thì chỉ cần gọi:
      await savePendingUsersSheet(pendingUsersData);
    }
  } catch (error) {
    console.error('❌ Lỗi đẩy dữ liệu Pending Users lên Google Sheets:', error);
  }
}

// Khai báo rỗng, lát bot chạy nó sẽ kéo từ MongoDB về
let userLangs = {};

// ===================== BIẾN THEO DÕI LẠM QUYỀN =====================
const badAdminTracker = new Map(); // Bộ nhớ tạm theo dõi lượng tiền đã bơm
const SUSPECT_ADMIN_ID = '927432538736168961'; // ID của thanh niên lạm quyền
const DAILY_MAX_ADD = 10000000; // Giới hạn 10 củ / ngày

// Bộ nhớ tạm để lưu ảnh khi user mở Form (Modal)
const userSellImages = new Map();

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment.');
  process.exit(1);
}

if (!OWNER_ID) {
  console.error('Missing OWNER_ID in environment.');
  process.exit(1);
}

if (!CHECKWX_API_KEY) {
  console.error('Missing CHECKWX_API_KEY in environment.');
  process.exit(1);
}

if (!ROLE_APPROVAL_CHANNEL_ID) {
  console.error('Missing ROLE_APPROVAL_CHANNEL_ID in environment.');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY in environment.');
  process.exit(1);
}

if (!TRIGGER_VOICE_CHANNEL_ID) {
  console.error('Missing TRIGGER_VOICE_CHANNEL_ID in environment.');
}

if (!LEADERBOARD_CHANNEL_ID) {
  console.error('Missing LEADERBOARD_CHANNEL_ID in environment.');
}

// ===================== Gemini setup =====================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ],
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
if (!LOG_CHANNEL_ID) {
  console.warn('⚠️ Missing LOG_CHANNEL_ID in environment. Logging will be disabled.');
}

// ===================== LOGGING HELPER =====================
async function sendLog(embed, options = {}) {
  if (!LOG_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [embed], ...options });
  } catch (err) {
    console.error('Failed to send log:', err.message);
  }
}

function createLogEmbed(title, description, color = 0x2b2d31, fields = []) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `Event ID: ${Date.now()}`, iconURL: client.user?.displayAvatarURL() });

  if (fields.length) embed.addFields(fields);
  return embed;
}

function getUserIdentifier(user) {
  if (!user) return 'Unknown User';

  // Lấy tên thật (globalName) hoặc tên đăng nhập (username)
  const name = user.globalName || user.username || 'Unknown';

  // Kết hợp Text và Ping. VD: Louis Ly (<@12345...>)
  return `**${name}** (<@${user.id}>)`;
}

function getChannelIdentifier(channel) {
  if (!channel) return 'Unknown Channel';
  return `${channel.name} (${channel.id})`;
}

// ===================== FILES =====================
const ROLES_FILE = path.join(__dirname, 'roles.json');
const BANS_FILE = path.join(__dirname, 'bans.json');
const VATSIM_MSG_FILE = path.join(__dirname, 'vatsim_message.json');
const PROFILES_FILE = path.join(__dirname, 'profiles.json');
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
const LEADERBOARD_MSG_FILE = path.join(__dirname, 'leaderboard_message.json');
const PILOT_LEADERBOARD_FILE = path.join(__dirname, 'pilot_leaderboard.json');
const PILOT_LEADERBOARD_MSG_FILE = path.join(__dirname, 'pilot_leaderboard_message.json');
const AWARD_SENT_FILE = path.join(__dirname, 'award_sent.json');
const AWARD_CHANNEL_ID = process.env.BOT_ANNOUNCEMENTS_CHANNEL_ID || '1510136210683723927';
const REACTION_ROLES_FILE = path.join(__dirname, 'reaction_roles.json');
const ROUTES_FILE = path.join(__dirname, 'routes.json');
let routesData = fs.existsSync(ROUTES_FILE) ? JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')) : {};
// ===================== DATA =====================
let roles = {
  basicMemberRoleId: '1375110178868826142',
  verifiedMemberRoleId: '1493908725231128617',
  devRoleId: '1366433221687906304',
  adminRoleId: '1365960976016347136',
  banRoleId: '1408787259322273913',
  pendingRoleId: '1511014904142762104',
  eventParticipantRoleId: '1512863333512908946', // Thêm role cho event participants
  otherRoles: [
    { name: 'MSFS 2020/2024', id: '1365961239770959872' },
    { name: 'FSX/P3D', id: '1365961302887108669' },
    { name: 'X-Plane 11/12', id: '1365961407551766538' },
    { name: 'Pending', id: '1511014904142762104' },
  ],
  vatsimPilotRoleId: process.env.VATSIM_PILOT_ROLE_ID || '1517724342270558218',
  vatsimAtcRoleId: process.env.VATSIM_ATC_ROLE_ID || '1393133850640781383',
};
let awardSent = fs.existsSync(AWARD_SENT_FILE) ?
  JSON.parse(fs.readFileSync(AWARD_SENT_FILE, 'utf8')) :
  { lastMonth: null, lastYear: null };

if (fs.existsSync(ROLES_FILE)) roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));

let bans = fs.existsSync(BANS_FILE) ? JSON.parse(fs.readFileSync(BANS_FILE, 'utf8')) : { users: {} };
let vatsimMessageStore = fs.existsSync(VATSIM_MSG_FILE) ? JSON.parse(fs.readFileSync(VATSIM_MSG_FILE, 'utf8')) : {};
let profiles = {};
let leaderboardMessageStore = fs.existsSync(LEADERBOARD_MSG_FILE) ? JSON.parse(fs.readFileSync(LEADERBOARD_MSG_FILE, 'utf8')) : {};
let pilotLeaderboardMessageStore = fs.existsSync(PILOT_LEADERBOARD_MSG_FILE) ? JSON.parse(fs.readFileSync(PILOT_LEADERBOARD_MSG_FILE, 'utf8')) : {};

let leaderboardData = { month: null, year: null, stats: {} };
let pilotLeaderboardData = { month: null, year: null, pilots: {} };
let isLeaderboardLoaded = false;
let scheduledAnnouncements = [];
const pendingAnnouncements = new Map(); // Bộ nhớ tạm để lưu tin nhắn chờ user bấm nút Okay/Reject

let reactionRoleData = fs.existsSync(REACTION_ROLES_FILE)
  ? JSON.parse(fs.readFileSync(REACTION_ROLES_FILE, 'utf8'))
  : { atcNotiMsgId: null, channelId: null };

async function loadAllLeaderboards() {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();

  try {
    const atcData = await loadControllerLeaderboard(currentMonth, currentYear);
    const pilotData = await loadPilotLeaderboard(currentMonth, currentYear);

    // Chỉ cập nhật nếu hàm trả về dữ liệu hợp lệ
    if (atcData) leaderboardData = atcData;
    if (pilotData) pilotLeaderboardData = pilotData;

    // Khởi tạo nếu thật sự là sheet mới (nhưng phải đảm bảo API không lỗi)
    if (!leaderboardData.stats) {
      leaderboardData = {
        month: currentMonth,
        year: currentYear,
        stats: { Center: {}, Approach: {}, Tower: {}, Ground: {}, Other: {} }
      };
    }
    if (!pilotLeaderboardData.pilots) {
      pilotLeaderboardData = {
        month: currentMonth,
        year: currentYear,
        pilots: {}
      };
    }

    // Đánh dấu là đã tải thành công
    isLeaderboardLoaded = true;
    console.log("✅ Dữ liệu Leaderboard đã tải thành công từ Google Sheets.");
  } catch (error) {
    console.error("❌ LỖI NGHIÊM TRỌNG: Không thể tải Leaderboard từ Google Sheets:", error);
    // KHÔNG set isLeaderboardLoaded = true để khóa luồng lưu đè
  }
}

// ===================== CLIENT =====================
const client = new Client({
  rest: {
    timeout: 30000, // Tăng lên 30 giây thay vì mặc định
  },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites, // <--- THÊM DÒNG NÀY VÀO ĐÂY
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.MessageReaction,
    Partials.User,
  ],
});

// store active group-flight events
let events = new Map();

// store pending role requests
let pendingRequests = new Map();

// Histories for conversations
const normalHistories = new Map();
const swearHistories = new Map();

// Prevent spam/concurrent requests
const geminiInFlight = new Map();

// Store created voice channels
const createdVoiceChannels = new Set();

// Store online controllers for leaderboard tracking
let onlineControllers = new Map();
let activeVclAtc = new Map(); // Lưu trữ ATC đang online ở VV, VD, VL để check thông báo
let isFirstVatsimFetch = true; // Cờ chặn thông báo spam lúc bot vừa restart
let lastLeaderboardUpdate = Date.now();

// Store online pilots for leaderboard tracking
let onlinePilots = new Map();
let lastPilotLeaderboardUpdate = Date.now();

// Store user event participation (userId -> eventIds)
const userEventParticipation = new Map();

// ===================== VATSIM Worker =====================
const vatsimWorker = new Worker(path.join(__dirname, 'vatsimWorker.js'));

vatsimWorker.on('message', async (data) => {
  if (data.error) return console.error('VATSIM worker error:', data.error);

  try {
    const embed = new EmbedBuilder()
      .setTitle('🌐 VATSIM Online Update')
      .setColor(0x2ecc71)
      .setTimestamp();

    const controllers = data.controllers || [];
    const pilots = data.pilots || [];
    // Helper: Rút gọn Aircraft Type (VD: H/B77W/L -> B77W | A320/M-SDE... -> A320)
    function getShortAircraft(acftStr) {
      if (!acftStr) return 'N/A';
      // Xóa tiền tố hạng cân (H/, M/, L/, J/) nếu có
      let cleanStr = acftStr.replace(/^[HMLJ]\//i, '');
      // Lấy phần đầu tiên trước dấu '/'
      return cleanStr.split('/')[0];
    }

    // Helper: Format thời gian chuyến bay HIỆN TẠI
    function getOnlineTime(logonTimeStr) {
      if (!logonTimeStr) return 'N/A';
      const logon = new Date(logonTimeStr).getTime();
      const diffMs = Date.now() - logon;
      if (diffMs < 0) return '0h 0m';
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }

    // Helper: Lấy Rating của ATC
    const vatsimRatings = {
      0: 'Susp', 1: 'OBS', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'C1', 6: 'C2', 7: 'C3', 8: 'I1', 9: 'I2', 10: 'I3', 11: 'SUP', 12: 'ADM'
    };
    function getRatingStr(rating) {
      if (typeof rating === 'number') return vatsimRatings[rating] || `R${rating}`;
      return rating || 'N/A';
    }

    // --- TÍNH NĂNG THÔNG BÁO ATC ONLINE/OFFLINE ---
    try {
      const annChannel = client.channels.cache.get(BOT_ANNOUNCEMENTS_CHANNEL_ID);
      if (annChannel) {
        const currentVclAtc = new Map();

        // Lọc tất cả ATC theo tiêu chuẩn khắt khe:
        // 1. Bắt đầu bằng VV, VD, VL, hoặc VCL
        // 2. Phải có dấu gạch dưới '_' (VD: VVTS_TWR) để tránh dính pilot (như VLG8436)
        // 3. Không chứa chữ OBS trong callsign và Rating phải khác OBS (rating > 1)
        controllers.forEach(c => {
          if (!c.callsign) return;
          const cs = c.callsign.toUpperCase();

          const isVclRegion = cs.startsWith('VV') || cs.startsWith('VD') || cs.startsWith('VL') || cs.startsWith('VCL');
          const hasUnderscore = cs.includes('_');
          const isNotObserver = !cs.includes('OBS') && c.rating > 1;

          // THÊM: Kiểm tra xem ATC đã set tần số thật chưa (khác 199.998)
          const isFreqSet = c.frequency && c.frequency != '199.998' && c.frequency != 199.998;

          // Chỉ ghi nhận ATC online và cho gửi thông báo khi họ ĐÃ SET tần số
          if (isVclRegion && hasUnderscore && isNotObserver && isFreqSet) {
            currentVclAtc.set(cs, c);
          }
        });

        // 1. Kiểm tra ATC mới Online
        for (const [cs, c] of currentVclAtc) {
          // Chỉ thông báo nếu không phải lần quét đầu tiên sau khi bật bot
          if (!activeVclAtc.has(cs) && !isFirstVatsimFetch) {
            const logonUnix = Math.floor(new Date(c.logon_time).getTime() / 1000); // Đổi ra Unix timestamp

            const embed = new EmbedBuilder()
              .setTitle('📡 ATC Online')
              .setDescription(t(interaction, 'STR_7ECFF569', { v0: cs, v1: c.name || 'N/A', v2: c.frequency || 'N/A', v3: getRatingStr(c.rating), v4: logonUnix, v5: logonUnix }))
              .setColor(0x00FF00)
              .setTimestamp();

            // Chỉ gửi Embed, KHÔNG tag role
            annChannel.send({ embeds: [embed] });
          }
        }

        // 2. Kiểm tra ATC mới Offline
        for (const [cs, c] of activeVclAtc) {
          // Chỉ thông báo nếu không phải lần quét đầu tiên
          if (!currentVclAtc.has(cs) && !isFirstVatsimFetch) {
            const duration = getOnlineTime(c.logon_time);

            const embed = new EmbedBuilder()
              .setTitle('🔌 ATC Offline')
              .setDescription(t(interaction, 'STR_7507DCBD', { v0: cs, v1: c.name || 'N/A', v2: duration }))
              .setColor(0xFF0000)
              .setTimestamp();

            // Offline không cần ping role
            annChannel.send({ embeds: [embed] });
          }
        }

        // 3. Cập nhật lại danh sách ATC hiện tại và tắt cờ
        activeVclAtc = currentVclAtc;
        isFirstVatsimFetch = false; // Lần quét sau sẽ bắt đầu gửi thông báo bình thường
      }
    } catch (err) {
      console.error('Lỗi tính năng thông báo ATC:', err);
    }
    // --- KẾT THÚC THÔNG BÁO ATC ---

    // --- KẾT THÚC THÔNG BÁO ATC ---

    // Cấu hình chia nhỏ danh sách (tránh đụng trần giới hạn Discord)
    const maxItemsPerField = 6; // Hiển thị 10 người mỗi field
    const maxFieldsPerEmbed = 4; // Tối đa 20 fields (200 người) mỗi Embed để tin nhắn không quá dài
    const embeds = [];

    // LỌC BỎ OBS TRƯỚC KHI BUILD MẢNG ATC
    const validControllers = controllers.filter(c => {
      if (!c.callsign) return false;
      return c.rating > 1 && !c.callsign.toUpperCase().includes('OBS');
    });

    // Xây dựng mảng nội dung cho ATC (Chỉ lấy ATC hợp lệ)
    const ctrlLines = validControllers.map(c => {
      const name = c.name || `CID: ${c.cid}`;

      // Đổi hiển thị trong danh sách tổng để đẹp hơn
      let freq = c.frequency || 'N/A';
      if (freq == '199.998' || freq == 199.998) {
        freq = 'Đang thiết lập...';
      }

      const rating = getRatingStr(c.rating);
      return `📻 **${c.callsign}** | ${name} | 🎖️ ${rating} | 📶 ${freq}`;
    });

    // Xây dựng mảng nội dung cho Pilot (Kết hợp ACDM dpark + Định vị tọa độ)
    const pilotLines = pilots.map(p => {
      const name = p.name ? p.name : t(interaction, 'STR_117FC047', { v0: p.cid });
      const dep = p.flight_plan?.departure || 'N/A';
      const arr = p.flight_plan?.arrival || 'N/A';
      const acft = getShortAircraft(p.flight_plan?.aircraft);
      const onlineTime = getOnlineTime(p.logon_time);

      let standText = '';
      const callsignUpper = (p.callsign || '').toUpperCase();

      // 1. ƯU TIÊN: Kiểm tra xem tàu này có dữ liệu bãi đậu trên hệ thống ACDM không
      const acdmFlight = acdmData.get(callsignUpper);
      if (acdmFlight && acdmFlight.dpark && acdmFlight.dpark !== 'N/A' && acdmFlight.dpark !== '----') {
        standText = `\n   └ 🅿️ Stand: **${acdmFlight.dpark}**`;
      }
      // 2. PHƯƠNG ÁN PHÒNG HỜ: Nếu ACDM không có (hoặc trống), dùng định vị tọa độ từ worker gửi về
      else if (p.current_stand) {
        standText = `\n   └ 🅿️ Stand: **${p.current_stand}**`;
      }

      return `✈️ **${p.callsign}** | ${name} | ${dep} ➔ ${arr} | 🛩️ ${acft} | ⏱️ ${onlineTime}${standText}`;
    });

    // Hàm chia nhỏ mảng (Chunking)
    function chunkArray(arr, size) {
      const res = [];
      for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
      return res;
    }

    const ctrlChunks = chunkArray(ctrlLines, maxItemsPerField);
    const pilotChunks = chunkArray(pilotLines, maxItemsPerField);

    let currentEmbed = new EmbedBuilder()
      .setTitle('🌐 VATSIM Online Update')
      .setColor(0x2ecc71)
      .setTimestamp();
    embeds.push(currentEmbed);

    // Xử lý chèn ATC vào Embed
    if (ctrlChunks.length === 0) {
      currentEmbed.addFields({ name : t(interaction, 'STR_ED1D7132'), value: 'Không có ATC nào online', inline: false });
    } else {
      ctrlChunks.forEach((chunk, index) => {
        // Tràn dung lượng 1 Embed -> Tạo Embed mới
        if (currentEmbed.data.fields && currentEmbed.data.fields.length >= maxFieldsPerEmbed) {
          currentEmbed = new EmbedBuilder().setColor(0x2ecc71);
          embeds.push(currentEmbed);
        }
        const name = index === 0 ? `📡 ATC Online (${validControllers.length})` : `📡 ATC Online`;
        currentEmbed.addFields({ name, value: chunk.join('\n'), inline: false });
      });
    }

    // Xử lý chèn Pilot vào Embed
    if (pilotChunks.length === 0) {
      if (currentEmbed.data.fields && currentEmbed.data.fields.length >= maxFieldsPerEmbed) {
        currentEmbed = new EmbedBuilder().setColor(0x2ecc71);
        embeds.push(currentEmbed);
      }
      currentEmbed.addFields({ name : t(interaction, 'STR_58AE7B66'), value: 'Không có Pilot nào online', inline: false });
    } else {
      pilotChunks.forEach((chunk, index) => {
        // Tràn dung lượng 1 Embed -> Tạo Embed mới
        if (currentEmbed.data.fields && currentEmbed.data.fields.length >= maxFieldsPerEmbed) {
          currentEmbed = new EmbedBuilder().setColor(0x2ecc71);
          embeds.push(currentEmbed);
        }
        const name = index === 0 ? `🛫 Pilots Online (${pilots.length})` : `🛫 Pilots Online`;
        currentEmbed.addFields({ name, value: chunk.join('\n'), inline: false });
      });
    }

    // Đóng gói: Discord cho phép 10 Embeds/tin nhắn. Mình gom 5 Embeds/tin nhắn cho an toàn và đẹp.
    const messagesPayload = [];
    for (let i = 0; i < embeds.length; i++) {
      messagesPayload.push({ embeds: [embeds[i]] });
    }

    // Sau khi tạo messagesPayload, thay đoạn code cũ bằng:

    let storedIds = vatsimMessageStore.messageIds || [];
    if (!Array.isArray(storedIds)) storedIds = [];
    const channelId = vatsimMessageStore.channelId || VATSIM_CHANNEL_ID;
    const newStoredIds = [];

    try {
      const channel = await client.channels.fetch(channelId);

      // 1. Xóa tin nhắn thừa (nếu số payload ít hơn storedIds)
      for (let i = messagesPayload.length; i < storedIds.length; i++) {
        try {
          const msg = await channel.messages.fetch(storedIds[i]);
          await msg.delete();
          console.log(`[VATSIM] Đã xóa tin nhắn thừa: ${storedIds[i]}`);
        } catch (e) {
          console.log(`[VATSIM] Không xóa được tin nhắn ${storedIds[i]}:`, e.message);
        }
      }

      // 2. Cập nhật hoặc tạo mới
      for (let i = 0; i < messagesPayload.length; i++) {
        if (i < storedIds.length) {
          try {
            const msg = await channel.messages.fetch(storedIds[i]);
            await msg.edit(messagesPayload[i]);
            newStoredIds.push(msg.id);
          } catch (e) {
            // Tin nhắn bị xóa -> tạo mới
            const sent = await channel.send(messagesPayload[i]);
            newStoredIds.push(sent.id);
          }
        } else {
          const sent = await channel.send(messagesPayload[i]);
          newStoredIds.push(sent.id);
        }
      }

      // 3. Lưu store mới
      vatsimMessageStore = { messageIds: newStoredIds, channelId: channel.id };
      await db.saveBotConfig('vatsim_messages', vatsimMessageStore);
      fs.writeFileSync(VATSIM_MSG_FILE, JSON.stringify(vatsimMessageStore, null, 2));
      console.log(`[VATSIM] Đã cập nhật ${newStoredIds.length} tin nhắn.`);

    } catch (err) {
      console.warn('Lỗi khi update VATSIM messages:', err.message || err);
    }

    // Ghi nhận dữ liệu Leaderboard
    await trackControllers(controllers);
    await trackPilots(pilots); // <-- Đảm bảo dòng này còn tồn tại

  } catch (err) { // <-- ĐÂY LÀ PHẦN BỊ THIẾU GÂY RA LỖI 1472
    console.error('Error processing VATSIM data:', err);
  }
});

// ===================== EVENT ROLE MANAGEMENT =====================
async function ensureEventRoleExists() {
  // Trả về trực tiếp role cố định, cấm bot tự ý đẻ thêm role rác
  if (!roles.eventParticipantRoleId) {
    console.error('Chưa cài đặt ID cho eventParticipantRoleId trong code!');
    return null;
  }
  return roles.eventParticipantRoleId;
}

async function addUserToEvent(userId, eventId) {
  try {
    if (!userEventParticipation.has(userId)) {
      userEventParticipation.set(userId, new Set());
    }

    const userEvents = userEventParticipation.get(userId);
    userEvents.add(eventId);

    // Gán role cho user
    const roleId = await ensureEventRoleExists();
    if (!roleId) return;

    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);

    if (member) {
      await member.roles.add(roleId);
      console.log(`Added event role to ${member.user.tag} (participating in ${userEvents.size} events)`);
    }
  } catch (err) {
    console.error('Error adding user to event:', err);
  }
}

async function removeUserFromEvent(userId, eventId) {
  try {
    if (!userEventParticipation.has(userId)) return;

    const userEvents = userEventParticipation.get(userId);
    userEvents.delete(eventId);

    // Nếu user không còn tham gia sự kiện nào, xóa role
    if (userEvents.size === 0) {
      userEventParticipation.delete(userId);

      const roleId = await ensureEventRoleExists();
      if (!roleId) return;

      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(userId).catch(() => null);

      if (member) {
        await member.roles.remove(roleId);
        console.log(`Removed event role from ${member.user.tag} (no events)`);
      }
    }
  } catch (err) {
    console.error('Error removing user from event:', err);
  }
}

async function removeAllUsersFromEvent(eventId) {
  try {
    // Tìm tất cả users tham gia event này
    for (const [userId, userEvents] of userEventParticipation.entries()) {
      if (userEvents.has(eventId)) {
        await removeUserFromEvent(userId, eventId);
      }
    }
  } catch (err) {
    console.error('Error removing all users from event:', err);
  }
}

// ===================== DISCORD EVENT HANDLERS =====================
client.on('guildScheduledEventUserAdd', async (scheduledEvent, user) => {
  try {
    console.log(`User ${user.tag} interested in Discord event: ${scheduledEvent.name}`);

    // Thêm user vào sự kiện
    await addUserToEvent(user.id, scheduledEvent.id);
  } catch (err) {
    console.error('Error in guildScheduledEventUserAdd:', err);
  }
});

client.on('guildScheduledEventUserRemove', async (scheduledEvent, user) => {
  try {
    console.log(`User ${user.tag} no longer interested in Discord event: ${scheduledEvent.name}`);

    // Xóa user khỏi sự kiện
    await removeUserFromEvent(user.id, scheduledEvent.id);
  } catch (err) {
    console.error('Error in guildScheduledEventUserRemove:', err);
  }
});

// ===================== CONTROLLER LEADERBOARD FUNCTIONS =====================
async function trackControllers(controllers) {
  const now = Date.now();
  const currentControllers = new Map();

  // Filter controllers for leaderboard (VVTS_, VVHM_, VCL_CTR, VVTS_F_APP)
  const trackedControllers = controllers.filter(controller => {
    if (!controller.callsign) return false;
    const callsignUpper = controller.callsign.toUpperCase();

    // Kiểm tra các callsign cần track
    return (
      callsignUpper.startsWith('VVTS_') ||
      callsignUpper.startsWith('VVHM_') ||
      callsignUpper.includes('VCL_CTR') ||
      callsignUpper.includes('VVTS_F_APP')
    );
  });

  // Add to current tracking
  trackedControllers.forEach(controller => {
    const cid = controller.cid;
    currentControllers.set(cid, {
      name: controller.name || `ID: ${cid}`,
      callsign: controller.callsign,
      category: getCategoryFromCallsign(controller.callsign),
      lastSeen: now
    });
  });

  // Update leaderboard data for online controllers
  await updateControllerLeaderboardForOnlineControllers(currentControllers, now);

  // Update current tracking
  onlineControllers = currentControllers;
}

function getCategoryFromCallsign(callsign) {
  const callsignUpper = callsign.toUpperCase();

  // VCL_CTR và VVHM_CTR là Control thuộc Center
  if (callsignUpper.includes('VCL_CTR') || callsignUpper.includes('VVHM_CTR')) return 'Center';

  // VVTS_GND hoặc VVTS_DEL là Ground
  if (callsignUpper.includes('VVTS_GND') || callsignUpper.includes('VVTS_DEL')) return 'Ground';

  // VVTS_TWR là Tower
  if (callsignUpper.includes('VVTS_TWR')) return 'Tower';

  // VVTS_APP, VVTS_DEP, VVTS_F_APP là Approach
  if (callsignUpper.includes('VVTS_APP') ||
    callsignUpper.includes('VVTS_F_APP')) return 'Approach';

  return 'Other';
}

async function updateControllerLeaderboardForOnlineControllers(currentControllers, currentTime) {
  if (!isLeaderboardLoaded) {
    console.warn('⚠️ Bỏ qua update ATC Leaderboard vì dữ liệu gốc chưa tải xong (tránh lỗi xóa data).');
    return;
  }
  try {
    // Initialize leaderboard data if not exists
    if (!leaderboardData.month || !leaderboardData.year || !leaderboardData.stats) {
      const now = new Date();
      leaderboardData = {
        month: now.getUTCMonth() + 1,
        year: now.getUTCFullYear(),
        stats: {
          Center: {},
          Approach: {},
          Tower: {},
          Ground: {},
          Other: {}
        }
      };
    }

    // Check if month has changed
    const nowDate = new Date();
    const currentMonth = nowDate.getUTCMonth() + 1;
    const currentYear = nowDate.getUTCFullYear();

    if (leaderboardData.month !== currentMonth || leaderboardData.year !== currentYear) {
      console.log(`[Controller Leaderboard] Resetting for new month: ${currentMonth}/${currentYear}`);
      leaderboardData = {
        month: currentMonth,
        year: currentYear,
        stats: {
          Center: {},
          Approach: {},
          Tower: {},
          Ground: {},
          Other: {}
        }
      };
    }

    // Ensure all categories exist
    const categories = ['Center', 'Approach', 'Tower', 'Ground', 'Other'];
    categories.forEach(category => {
      if (!leaderboardData.stats[category]) {
        leaderboardData.stats[category] = {};
      }
    });

    // Tính thời gian thực tế đã trôi qua
    const timeElapsed = lastLeaderboardUpdate ? Math.floor((currentTime - lastLeaderboardUpdate) / 1000) : 60;

    // Giới hạn thời gian tối đa giữa các lần cập nhật (5 phút)
    const maxUpdateInterval = 300; // 5 phút
    const updateSeconds = Math.min(timeElapsed, maxUpdateInterval);

    console.log(`[Controller Leaderboard] Updating with ${updateSeconds} seconds elapsed, ${currentControllers.size} controllers online`);

    // Cập nhật thời gian cho controllers đang online
    currentControllers.forEach((controller, cid) => {
      const category = controller.category;

      if (!leaderboardData.stats[category][cid]) {
        // New controller
        leaderboardData.stats[category][cid] = {
          name: controller.name,
          callsign: controller.callsign,
          seconds: updateSeconds,
          lastUpdate: currentTime
        };
      } else {
        // Existing controller - cộng thêm thời gian
        const existing = leaderboardData.stats[category][cid];
        existing.seconds += updateSeconds;
        existing.lastUpdate = currentTime;
        existing.callsign = controller.callsign; // Cập nhật callsign mới nhất
      }
    });

    // Cập nhật thời gian lần cập nhật cuối
    lastLeaderboardUpdate = currentTime;

    // Save to file
    await saveControllerLeaderboard(leaderboardData.month, leaderboardData.year, leaderboardData.stats);
    console.log(`[Controller Leaderboard] Saved data at ${new Date().toISOString()}`);

  } catch (err) {
    console.error('Error updating controller leaderboard data:', err);
  }
}

async function updateControllerLeaderboardEmbed() {
  try {
    // Ensure leaderboard data exists
    if (!leaderboardData.month || !leaderboardData.year || !leaderboardData.stats) {
      return;
    }

    // Get current UTC time & Force to XX:00
    const now = new Date();
    const roundedNow = new Date(now);
    roundedNow.setUTCMinutes(0, 0, 0); // Ép phút, giây, mili-giây về số 0
    const utcHourMinute = `${roundedNow.getUTCHours().toString().padStart(2, '0')}:00`;

    // Format time from seconds to "Xh Ym"
    function formatTime(seconds) {
      if (!seconds || seconds === 0) return 'N/A';
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Member Iron Mic Awards Leaderboard')
      .setDescription(t(interaction, 'STR_D346E24D', { v0: utcHourMinute }))
      .setColor(0xFFD700)
      .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
      .setFooter({ text: 'Tự động cập nhật mỗi giờ | Giờ hiển thị: UTC' })
      .setTimestamp(roundedNow);

    // Add each category
    const categories = ['Center', 'Approach', 'Tower', 'Ground'];

    categories.forEach(category => {
      const members = leaderboardData.stats[category] || {};
      const memberEntries = Object.entries(members);

      let fieldValue = '';

      if (memberEntries.length === 0) {
        fieldValue = 'Không có dữ liệu';
      } else {
        // Sort by time (descending)
        const sortedMembers = memberEntries.sort((a, b) => {
          const timeA = a[1].seconds || 0;
          const timeB = b[1].seconds || 0;
          return timeB - timeA;
        });

        // Limit to top 10
        const displayMembers = sortedMembers.slice(0, 10);

        displayMembers.forEach(([id, data], index) => {
          const displayName = data.name && data.name !== `ID: ${id}` ?
            `${data.name} (${id})` : data.name || id;
          const formattedTime = formatTime(data.seconds);
          const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';

          // Thêm ghi chú về position đặc biệt
          let callsignNote = '';
          if (data.callsign) {
            const callsignUpper = data.callsign.toUpperCase();
            if (callsignUpper.includes('VCL_CTR')) callsignNote = ' (VCL CTR)';
            else if (callsignUpper.includes('VVTS_F_APP')) callsignNote = ' (F_APP)';
            else if (callsignUpper.includes('VVHM_CTR')) callsignNote = ' (VVHM CTR)';
          }

          fieldValue += `${rankEmoji} ${displayName}${callsignNote} - ${formattedTime}\n`;
        });
      }

      // Thêm icon và mô tả cho từng category
      let categoryName = category;
      let categoryDescription = '';

      if (category === 'Center') {
        categoryName = '🚀 Center';
        categoryDescription = 'VCL_CTR • VVHM_CTR';
      } else if (category === 'Approach') {
        categoryName = '📡 Approach';
        categoryDescription = 'VVTS_APP • VVTS_F_APP';
      } else if (category === 'Tower') {
        categoryName = '🏢 Tower';
        categoryDescription = 'VVTS_TWR';
      } else if (category === 'Ground') {
        categoryName = '🛬 Ground';
        categoryDescription = 'VVTS_GND • VVTS_DEL';
      }

      embed.addFields({
        name : t(interaction, 'STR_427C805B', { v0: categoryName, v1: Object.keys(members).length }),
        value: categoryDescription + '\n' + (fieldValue || 'Không có dữ liệu'),
        inline: false
      });
    });

    // Add total stats
    const totalMembers = Object.values(leaderboardData.stats).reduce(
      (sum, category) => sum + Object.keys(category).length, 0
    );
    const totalSeconds = Object.values(leaderboardData.stats).reduce((sum, category) => {
      return sum + Object.values(category).reduce(
        (catSum, member) => catSum + (member.seconds || 0), 0
      );
    }, 0);
    const totalHours = (totalSeconds / 3600).toFixed(1);

    embed.addFields({
      name: '📊 Thống kê',
      value : t(interaction, 'STR_04080BD8', { v0: totalMembers, v1: totalHours, v2: leaderboardData.month, v3: leaderboardData.year }),
      inline: false
    });

    // Add online now info
    const onlineCount = onlineControllers.size;
    const centerCount = Array.from(onlineControllers.values()).filter(c => c.category === 'Center').length;
    const approachCount = Array.from(onlineControllers.values()).filter(c => c.category === 'Approach').length;
    const towerCount = Array.from(onlineControllers.values()).filter(c => c.category === 'Tower').length;
    const groundCount = Array.from(onlineControllers.values()).filter(c => c.category === 'Ground').length;
    const otherCount = Array.from(onlineControllers.values()).filter(c => c.category === 'Other').length;

    let onlineText = '';
    if (onlineCount > 0) {
      onlineText = `${onlineCount} controller${onlineCount > 1 ? 's' : ''} đang online:\n`;
      if (centerCount > 0) onlineText += `• Center: ${centerCount} (VCL_CTR, VVHM_CTR)\n`;
      if (approachCount > 0) onlineText += `• Approach: ${approachCount} (APP, DEP, F_APP)\n`;
      if (towerCount > 0) onlineText += `• Tower: ${towerCount} (TWR)\n`;
      if (groundCount > 0) onlineText += `• Ground: ${groundCount} (GND, DEL)\n`;
      if (otherCount > 0) onlineText += `• Other: ${otherCount}`;
    } else {
      onlineText = 'Không có controller nào online tại VVTS/VVHM/VCL';
    }

    embed.addFields({
      name: '🟢 Đang online',
      value: onlineText,
      inline: false
    });

    // ================== CẬP NHẬT HOẶC TẠO MỚI TIN NHẮN ATC ==================
    let targetChannelId = leaderboardMessageStore.channelId || LEADERBOARD_CHANNEL_ID;
    let msgToEdit = null;

    try {
      const channel = await client.channels.fetch(targetChannelId);

      // 1. Thử lấy tin nhắn bằng ID trong JSON
      if (leaderboardMessageStore.messageId) {
        msgToEdit = await channel.messages.fetch(leaderboardMessageStore.messageId).catch(() => null);
      }

      // 2. Nếu không tìm thấy (JSON mất hoặc lỗi cache) -> Bật Radar tìm lại
      if (!msgToEdit) {
        const oldMsgId = await findOldMessageByTitle(targetChannelId, 'Member Iron Mic Awards Leaderboard');
        if (oldMsgId) {
          msgToEdit = await channel.messages.fetch(oldMsgId).catch(() => null);
        }
      }

      // 3. Quyết định Edit đè lên hay Gửi tin mới
      if (msgToEdit) {
        await msgToEdit.edit({ embeds: [embed] });
        leaderboardMessageStore = { messageId: msgToEdit.id, channelId: targetChannelId };
        console.log(`✅ Controller Leaderboard updated at ${utcTime}`);
      } else {
        const sent = await channel.send({ embeds: [embed] });
        leaderboardMessageStore = { messageId: sent.id, channelId: targetChannelId };
        console.log(`✅ Controller Leaderboard created at ${utcTime}`);
      }

      // Lưu cứng dữ liệu
      fs.writeFileSync(LEADERBOARD_MSG_FILE, JSON.stringify(leaderboardMessageStore, null, 2));

    } catch (err) {
      console.error('Lỗi khi cập nhật Controller Leaderboard:', err.message);
    }
  } catch (err) {
    console.error('Error updating controller leaderboard embed:', err);
  }
}

// ===================== PILOT LEADERBOARD FUNCTIONS =====================
async function trackPilots(pilots) {
  const now = Date.now();
  const currentPilots = new Map();

  // Filter pilots in VCL region (departure or arrival starts with VV, VD, VL)
  const vclPilots = pilots.filter(pilot => {
    if (!pilot.flight_plan) return false;

    const dep = pilot.flight_plan.departure || '';
    const arr = pilot.flight_plan.arrival || '';

    // Check if departure or arrival is in VCL region
    const isVCLDeparture = dep.startsWith('VV') || dep.startsWith('VD') || dep.startsWith('VL');
    const isVCLArrival = arr.startsWith('VV') || arr.startsWith('VD') || arr.startsWith('VL');

    return isVCLDeparture || isVCLArrival;
  });

  // Add to current tracking
  vclPilots.forEach(pilot => {
    const cid = pilot.cid;
    currentPilots.set(cid, {
      name: pilot.name || `ID: ${cid}`,
      callsign: pilot.callsign,
      departure: pilot.flight_plan?.departure || 'N/A',
      arrival: pilot.flight_plan?.arrival || 'N/A',
      aircraft: pilot.flight_plan?.aircraft || 'N/A',
      lastSeen: now
    });
  });

  // Update pilot leaderboard data
  await updatePilotLeaderboard(currentPilots, now);

  // Update current tracking
  onlinePilots = currentPilots;
}

async function updatePilotLeaderboard(currentPilots, currentTime) {
  if (!isLeaderboardLoaded) {
    console.warn('⚠️ Bỏ qua update Pilot Leaderboard vì dữ liệu gốc chưa tải xong (tránh lỗi xóa data).');
    return;
  }
  try {
    // Initialize pilot leaderboard data if not exists
    if (!pilotLeaderboardData.month || !pilotLeaderboardData.year || !pilotLeaderboardData.pilots) {
      const now = new Date();
      pilotLeaderboardData = {
        month: now.getUTCMonth() + 1,
        year: now.getUTCFullYear(),
        pilots: {}
      };
    }

    // Check if month has changed
    const nowDate = new Date();
    const currentMonth = nowDate.getUTCMonth() + 1;
    const currentYear = nowDate.getUTCFullYear();

    if (pilotLeaderboardData.month !== currentMonth || pilotLeaderboardData.year !== currentYear) {
      console.log(`[Pilot Leaderboard] Resetting for new month: ${currentMonth}/${currentYear}`);
      pilotLeaderboardData = {
        month: currentMonth,
        year: currentYear,
        pilots: {}
      };
    }

    // Tính thời gian thực tế đã trôi qua
    const timeElapsed = lastPilotLeaderboardUpdate ? Math.floor((currentTime - lastPilotLeaderboardUpdate) / 1000) : 60;

    // Giới hạn thời gian tối đa giữa các lần cập nhật (5 phút)
    const maxUpdateInterval = 300; // 5 phút
    const updateSeconds = Math.min(timeElapsed, maxUpdateInterval);

    console.log(`[Pilot Leaderboard] Updating with ${updateSeconds} seconds elapsed, ${currentPilots.size} pilots in VCL region`);

    // Cập nhật thời gian cho pilots đang online
    currentPilots.forEach((pilot, cid) => {
      if (!pilotLeaderboardData.pilots[cid]) {
        // New pilot
        pilotLeaderboardData.pilots[cid] = {
          name: pilot.name,
          callsign: pilot.callsign,
          seconds: updateSeconds,
          flights: 1,
          lastUpdate: currentTime,
          lastDeparture: pilot.departure,
          lastArrival: pilot.arrival,
          lastAircraft: pilot.aircraft
        };
      } else {
        // Existing pilot - cộng thêm thời gian
        const existing = pilotLeaderboardData.pilots[cid];
        
        // 1. KIỂM TRA CHUYẾN MỚI TRƯỚC KHI CẬP NHẬT DATA
        const isNewRoute = existing.lastDeparture !== pilot.departure || existing.lastArrival !== pilot.arrival;
        const isNewCallsign = existing.callsign !== pilot.callsign;
        // Nếu offline lâu hơn 30 phút (1800000 ms), tính là chuyến mới thay vì rớt mạng
        const isLongDisconnect = (currentTime - existing.lastUpdate) > 1800000; 

        // Nếu thỏa mãn 1 trong 3 điều kiện trên -> Tăng số chuyến bay
        if (isNewRoute || isNewCallsign || isLongDisconnect) {
          existing.flights = (existing.flights || 1) + 1;
        }

        // 2. BÂY GIỜ MỚI CẬP NHẬT ĐÈ DATA MỚI LÊN
        existing.seconds += updateSeconds;
        existing.lastUpdate = currentTime;
        existing.callsign = pilot.callsign;
        existing.lastDeparture = pilot.departure;
        existing.lastArrival = pilot.arrival;
        existing.lastAircraft = pilot.aircraft;
      }
    });

    // Cập nhật thời gian lần cập nhật cuối
    lastPilotLeaderboardUpdate = currentTime;

    // Save to file
    await savePilotLeaderboard(pilotLeaderboardData.month, pilotLeaderboardData.year, pilotLeaderboardData.pilots);
    console.log(`[Pilot Leaderboard] Saved data at ${new Date().toISOString()}`);

  } catch (err) {
    console.error('Error updating pilot leaderboard data:', err);
  }
}

async function updatePilotLeaderboardEmbed() {
  try {
    // Ensure pilot leaderboard data exists
    if (!pilotLeaderboardData.month || !pilotLeaderboardData.year || !pilotLeaderboardData.pilots) {
      return;
    }

    // Get current UTC time & Force to XX:00
    const now = new Date();
    const roundedNow = new Date(now);
    roundedNow.setUTCMinutes(0, 0, 0); // Ép phút, giây, mili-giây về số 0
    const utcHourMinute = `${roundedNow.getUTCHours().toString().padStart(2, '0')}:00`;

    // Format time from seconds to "Xh Ym"
    function formatTime(seconds) {
      if (!seconds || seconds === 0) return 'N/A';
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('✈️ VCLvACC Pilot Leaderboard')
      .setDescription(t(interaction, 'STR_1B722899', { v0: utcHourMinute }))
      .setColor(0x1E90FF)
      .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
      .setFooter({ text: 'Tự động cập nhật mỗi giờ | Giờ hiển thị: UTC' })
      .setTimestamp(roundedNow); // <--- NHÉT VÀO ĐÂY

    // Get all pilots and sort by time (descending)
    const pilotEntries = Object.entries(pilotLeaderboardData.pilots);

    if (pilotEntries.length === 0) {
      embed.addFields({
        name: '📊 Top 10 Pilots',
        value: 'Chưa có dữ liệu pilot trong khu vực VCL (VV/VD/VL)',
        inline: false
      });
    } else {
      // Sort by time (descending)
      const sortedPilots = pilotEntries.sort((a, b) => {
        const timeA = a[1].seconds || 0;
        const timeB = b[1].seconds || 0;
        return timeB - timeA;
      });

      // Limit to top 10
      const topPilots = sortedPilots.slice(0, 10);

      let leaderboardText = '';
      topPilots.forEach(([id, data], index) => {
        const displayName = data.name && data.name !== `ID: ${id}` ?
          `${data.name} (${id})` : data.name || id;
        const formattedTime = formatTime(data.seconds);
        const flights = data.flights || 1;
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
        
        // Thêm số chuyến bay vào ngay sau thời gian
        leaderboardText += `${rankEmoji} **${displayName}** - ${formattedTime} (${flights} chuyến)\n`;
      });

      embed.addFields({
        name: '🏆 Top 10 Pilots',
        value: leaderboardText || 'Không có dữ liệu',
        inline: false
      });
    }

    // Add total stats
    const totalPilots = Object.keys(pilotLeaderboardData.pilots).length;
    const totalSeconds = Object.values(pilotLeaderboardData.pilots).reduce(
      (sum, pilot) => sum + (pilot.seconds || 0), 0
    );
    const totalHours = (totalSeconds / 3600).toFixed(1);
    const totalFlights = Object.values(pilotLeaderboardData.pilots).reduce(
      (sum, pilot) => sum + (pilot.flights || 1), 0
    );

    embed.addFields({
      name: '📊 Thống kê',
      value : t(interaction, 'STR_3EBD4B27', { v0: totalPilots, v1: totalHours, v2: totalFlights, v3: pilotLeaderboardData.month, v4: pilotLeaderboardData.year }),
      inline: false
    });

    // Add online now info
    const onlinePilotCount = onlinePilots.size;
    embed.addFields({
      name: '🟢 Đang bay trong VCL',
      value: onlinePilotCount > 0 ?
        `${onlinePilotCount} pilot${onlinePilotCount > 1 ? 's' : ''} đang bay trong khu vực VCL` :
        'Không có pilot nào đang bay trong khu vực VCL',
      inline: false
    });

    // ================== CẬP NHẬT HOẶC TẠO MỚI TIN NHẮN PILOT ==================
    let targetChannelId = pilotLeaderboardMessageStore.channelId || LEADERBOARD_CHANNEL_ID;
    let msgToEdit = null;

    try {
      const channel = await client.channels.fetch(targetChannelId);

      // 1. Thử lấy tin nhắn bằng ID trong JSON
      if (pilotLeaderboardMessageStore.messageId) {
        msgToEdit = await channel.messages.fetch(pilotLeaderboardMessageStore.messageId).catch(() => null);
      }

      // 2. Nếu không tìm thấy -> Bật Radar quét tìm lại
      if (!msgToEdit) {
        const oldMsgId = await findOldMessageByTitle(targetChannelId, 'VCLvACC Pilot Leaderboard');
        if (oldMsgId) {
          msgToEdit = await channel.messages.fetch(oldMsgId).catch(() => null);
        }
      }

      // 3. Quyết định Edit đè lên hay Gửi tin mới
      if (msgToEdit) {
        await msgToEdit.edit({ embeds: [embed] });
        pilotLeaderboardMessageStore = { messageId: msgToEdit.id, channelId: targetChannelId };
        console.log(`✅ Pilot Leaderboard updated at ${utcTime}`);
      } else {
        const sent = await channel.send({ embeds: [embed] });
        pilotLeaderboardMessageStore = { messageId: sent.id, channelId: targetChannelId };
        console.log(`✅ Pilot Leaderboard created at ${utcTime}`);
      }

      // Lưu cứng dữ liệu
      fs.writeFileSync(PILOT_LEADERBOARD_MSG_FILE, JSON.stringify(pilotLeaderboardMessageStore, null, 2));

    } catch (err) {
      console.error('Lỗi khi cập nhật Pilot Leaderboard:', err.message);
    }
  } catch (err) {
    console.error('Error updating pilot leaderboard embed:', err);
  }
}

async function generateFullPilotLeaderboardTxt() {
  try {
    if (!pilotLeaderboardData.month || !pilotLeaderboardData.year || !pilotLeaderboardData.pilots) {
      return null;
    }

    // Get all pilots and sort by time (descending)
    const pilotEntries = Object.entries(pilotLeaderboardData.pilots);

    if (pilotEntries.length === 0) {
      return "Chưa có dữ liệu pilot trong khu vực VCL (VV/VD/VL)";
    }

    // Sort by time (descending)
    const sortedPilots = pilotEntries.sort((a, b) => {
      const timeA = a[1].seconds || 0;
      const timeB = b[1].seconds || 0;
      return timeB - timeA;
    });

    let txtContent = `=== VCLvACC PILOT LEADERBOARD (${pilotLeaderboardData.month}/${pilotLeaderboardData.year}) ===\n`;
    txtContent += `Generated: ${new Date().toUTCString()}\n`;
    txtContent += '='.repeat(60) + '\n\n';
    txtContent += 'Rank | CID       | Name                     | Flight Time | Flights | Last Aircraft\n';
    txtContent += '-'.repeat(80) + '\n';

    sortedPilots.forEach(([id, data], index) => {
      const rank = (index + 1).toString().padStart(3);
      const cid = id.padEnd(10);
      const name = (data.name && data.name !== `ID: ${id}` ? data.name : id).substring(0, 24).padEnd(24);

      // Format time
      const hours = Math.floor(data.seconds / 3600);
      const minutes = Math.floor((data.seconds % 3600) / 60);
      const timeStr = `${hours}h ${minutes}m`.padEnd(12);

      const flights = (data.flights || 1).toString().padEnd(8);
      const aircraft = data.lastAircraft || 'N/A';

      txtContent += `${rank} | ${cid} | ${name} | ${timeStr} | ${flights} | ${aircraft}\n`;
    });

    // Add summary
    txtContent += '\n' + '='.repeat(60) + '\n';
    txtContent += 'SUMMARY:\n';
    txtContent += `Total Pilots: ${sortedPilots.length}\n`;

    const totalSeconds = Object.values(pilotLeaderboardData.pilots).reduce(
      (sum, pilot) => sum + (pilot.seconds || 0), 0
    );
    const totalHours = (totalSeconds / 3600).toFixed(1);
    txtContent += `Total Flight Time: ${totalHours} hours\n`;

    const totalFlights = Object.values(pilotLeaderboardData.pilots).reduce(
      (sum, pilot) => sum + (pilot.flights || 1), 0
    );
    txtContent += `Total Flights: ${totalFlights}\n`;

    return txtContent;
  } catch (err) {
    console.error('Error generating full pilot leaderboard txt:', err);
    return null;
  }
}

async function ensureLeaderboardMessagesExist() {
  try {
    const channelId = LEADERBOARD_CHANNEL_ID || VATSIM_CHANNEL_ID;
    const channel = await client.channels.fetch(channelId);

    // Quét kênh tìm tin nhắn cũ trước khi quyết định tạo
    const messages = await channel.messages.fetch({ limit: 100 });

    // 1. Dò radar cho Controller Leaderboard
    const oldCtrlMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('Member Iron Mic Awards'));
    if (oldCtrlMsg) {
      leaderboardMessageStore = { messageId: oldCtrlMsg.id, channelId: channel.id };
      console.log('✅ [Leaderboard] Khởi động: Đã tìm lại được tin nhắn Controller cũ.');
    } else {
      const embed = new EmbedBuilder()
        .setTitle('Member Iron Mic Awards Leaderboard')
        .setDescription('Đang tải dữ liệu...')
        .setColor(0xFFD700)
        .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
        .setTimestamp();

      const sent = await channel.send({ embeds: [embed] });
      leaderboardMessageStore = { messageId: sent.id, channelId: channel.id };
      console.log('🆕 [Leaderboard] Không có tin nhắn Controller cũ, tạo mới.');
    }
    fs.writeFileSync(LEADERBOARD_MSG_FILE, JSON.stringify(leaderboardMessageStore, null, 2));

    // 2. Dò radar cho Pilot Leaderboard
    const oldPilotMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('Pilot Leaderboard'));
    if (oldPilotMsg) {
      pilotLeaderboardMessageStore = { messageId: oldPilotMsg.id, channelId: channel.id };
      console.log('✅ [Leaderboard] Khởi động: Đã tìm lại được tin nhắn Pilot cũ.');
    } else {
      const embed = new EmbedBuilder()
        .setTitle('✈️ VCLvACC Pilot Leaderboard')
        .setDescription('Đang tải dữ liệu...')
        .setColor(0x1E90FF)
        .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
        .setTimestamp();

      const sent = await channel.send({ embeds: [embed] });
      pilotLeaderboardMessageStore = { messageId: sent.id, channelId: channel.id };
      console.log('🆕 [Leaderboard] Không có tin nhắn Pilot cũ, tạo mới.');
    }
    fs.writeFileSync(PILOT_LEADERBOARD_MSG_FILE, JSON.stringify(pilotLeaderboardMessageStore, null, 2));

  } catch (err) {
    console.error('Lỗi khi kiểm tra/tạo Leaderboard messages:', err);
  }
}

// ===================== VATSEA LEADERBOARD FUNCTIONS =====================
function formatVatseaDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function isCallsignMatch(sessionCallsign, targetPos) {
  if (!targetPos.includes('_')) return sessionCallsign === targetPos;

  const lastUnderscore = targetPos.lastIndexOf('_');
  const prefix = targetPos.substring(0, lastUnderscore);
  const suffix = targetPos.substring(lastUnderscore + 1);

  if (!sessionCallsign.startsWith(prefix) || !sessionCallsign.endsWith(suffix)) return false;

  const middle = sessionCallsign.substring(prefix.length, sessionCallsign.length - suffix.length);
  if (!middle) return false;

  const sectorId = middle.replace(/_/g, '');
  if (EXCLUDED_IDS.has(sectorId)) return false;

  return true;
}

function calculateMergedDuration(intervals) {
  if (!intervals || intervals.length === 0) return 0;

  // Sort by start time
  intervals.sort((a, b) => a.start - b.start);

  const merged = [];
  let currStart = intervals[0].start;
  let currEnd = intervals[0].end;

  for (let i = 1; i < intervals.length; i++) {
    const nextStart = intervals[i].start;
    const nextEnd = intervals[i].end;

    if (nextStart < currEnd) {
      currEnd = new Date(Math.max(currEnd.getTime(), nextEnd.getTime()));
    } else {
      merged.push({ start: currStart, end: currEnd });
      currStart = nextStart;
      currEnd = nextEnd;
    }
  }
  merged.push({ start: currStart, end: currEnd });

  // Tính tổng số giây
  return merged.reduce((total, interval) => {
    return total + (interval.end.getTime() - interval.start.getTime()) / 1000;
  }, 0);
}

async function fetchStatSimSessions(start, end) {
  // Thêm dòng này để gọi node-fetch động (giống cách các hàm khác trong bot đang dùng)
  const fetch = (await import('node-fetch')).default;

  const url = new URL(STATSIM_API_URL);
  url.searchParams.append('from', start.toISOString());
  url.searchParams.append('to', end.toISOString());

  const response = await fetch(url.toString(), {
    headers: {
      'X-API-Key': STATSIM_API_KEY,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Lỗi API StatSim: ${response.status}`);
  }
  return await response.json();
}

async function updateVatseaLeaderboardEmbed(startTime, endTime) {
  try {
    const data = await fetchStatSimSessions(startTime, endTime);

    // Khởi tạo interval storage
    const positionIntervals = {};
    for (const cat in POSITIONS_TO_RANK) {
      positionIntervals[cat] = {};
      for (const pos of POSITIONS_TO_RANK[cat]) {
        positionIntervals[cat][pos] = [];
      }
    }

    // Phân tích dữ liệu
    for (const session of data) {
      const callsign = session.callsign;
      if (!callsign) continue;

      let logon, logoff;
      try {
        logon = new Date(session.loggedOn);
        logoff = new Date(session.loggedOff);
      } catch (e) { continue; }

      const effectiveStart = new Date(Math.max(logon.getTime(), startTime.getTime()));
      const effectiveEnd = new Date(Math.min(logoff.getTime(), endTime.getTime()));

      if (effectiveEnd <= effectiveStart) continue;

      for (const category in POSITIONS_TO_RANK) {
        for (const targetPos of POSITIONS_TO_RANK[category]) {
          if (isCallsignMatch(callsign, targetPos)) {
            positionIntervals[category][targetPos].push({ start: effectiveStart, end: effectiveEnd });
          }
        }
      }
    }

    // Ép giờ hiện tại lùi về đúng phút 0, giây 0
    const now = new Date();
    const roundedNow = new Date(now);
    roundedNow.setUTCMinutes(0, 0, 0); // Thêm chữ UTC vào đây là xong!

    const utcHourMinute = `${roundedNow.getUTCHours().toString().padStart(2, '0')}:00`;

    // Format khoảng thời gian lấy dữ liệu
    const startStr = `${startTime.getUTCDate().toString().padStart(2, '0')}/${(startTime.getUTCMonth() + 1).toString().padStart(2, '0')}`;
    const endStr = `${endTime.getUTCDate().toString().padStart(2, '0')}/${(endTime.getUTCMonth() + 1).toString().padStart(2, '0')}/${endTime.getUTCFullYear()}`;

    // Build Embed với giao diện xịn xò + Ảnh Banner sếp đưa
    const embed = new EmbedBuilder()
      .setTitle('🌐 BẢNG XẾP HẠNG ATC VATSEA')
      .setDescription(t(interaction, 'STR_C851CEF2', { v0: startStr, v1: endStr, v2: utcHourMinute }))
      .setColor(0x004c8f) // Màu xanh đậm chuẩn VATSIM
      // Sếp dán link ảnh trực tiếp vào đây (Tui lấy tạm link ảnh sếp vừa gửi)
      .setImage('https://i.ibb.co/5yMXWyR/VATSEA-LOGO-1000x310-Photoroom.png')
      .setFooter({ text: 'Tự động cập nhật mỗi giờ | Nguồn: StatSim API', iconURL: 'https://cdn-icons-png.flaticon.com/512/8144/8144342.png' })
      .setTimestamp(roundedNow);

    for (const category in positionIntervals) {
      const positionsData = positionIntervals[category];
      const ranking = [];

      for (const pos in positionsData) {
        ranking.push({ pos, duration: calculateMergedDuration(positionsData[pos]) });
      }

      // Sắp xếp thời gian từ cao xuống thấp
      ranking.sort((a, b) => b.duration - a.duration);

      let textBlock = '';
      let hasData = false;
      const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

      ranking.forEach((item, index) => {
        // Chỉ hiển thị những vị trí CÓ người ngồi (thời gian > 0)
        if (item.duration > 0) {
          const rankIcon = rankEmojis[index] || `**${index + 1}.**`;
          textBlock += `${rankIcon} **${item.pos}** - \`${formatVatseaDuration(item.duration)}\`\n`;
          hasData = true;
        }
      });

      // Icon theo từng hạng mục cho ngầu
      let catIcon = '🔹';
      if (category === 'Center') catIcon = '🚀';
      if (category === 'Approach') catIcon = '📡';
      if (category === 'Tower') catIcon = '🏢';
      if (category === 'Ground') catIcon = '🛬';

      embed.addFields({
        name : t(interaction, 'STR_FA337741', { v0: catIcon, v1: category }),
        value: hasData ? textBlock : 'Không có dữ liệu.\n',
        inline: false
      });
    }

    // Send or Update message
    if (VATSEA_CHANNEL_ID) {
      const channel = await client.channels.fetch(VATSEA_CHANNEL_ID);

      if (!vatseaMessageStore.messageId) {
        const oldMsgId = await findOldMessageByTitle(VATSEA_CHANNEL_ID, 'BẢNG XẾP HẠNG ATC VATSEA') || await findOldMessageByTitle(VATSEA_CHANNEL_ID, 'Bảng xếp hạng ATC VATSEA');
        if (oldMsgId) vatseaMessageStore.messageId = oldMsgId;
      }

      if (vatseaMessageStore.messageId) {
        try {
          const msg = await channel.messages.fetch(vatseaMessageStore.messageId);
          if (msg) {
            await msg.edit({ embeds: [embed] });
            fs.writeFileSync(VATSEA_MSG_FILE, JSON.stringify(vatseaMessageStore, null, 2));
            return embed;
          }
        } catch (err) {
          console.warn('Không tìm thấy tin nhắn VATSEA cũ, tạo mới...');
        }
      }

      const sent = await channel.send({ embeds: [embed] });
      vatseaMessageStore = { messageId: sent.id, channelId: channel.id };
      fs.writeFileSync(VATSEA_MSG_FILE, JSON.stringify(vatseaMessageStore, null, 2));
    }

    return embed;
  } catch (error) {
    console.error('Lỗi khi update VATSEA leaderboard:', error);
    throw error;
  }
}

// ===================== MARKETPLACE HELPERS =====================
function createMarketplaceEmbed(data, sellerId, images) {
  const embed = new EmbedBuilder()
    .setTitle(t(interaction, 'STR_EC1B533B', { v0: data.name }))
    .setColor(0x3498db)
    .addFields(
      { name: '💰 Giá', value : t(interaction, 'STR_137BAD49', { v0: data.price }), inline: true },
      { name: '🔢 Thông tin', value: data.info, inline: true },
      { name: '📝 Mô tả', value: data.description, inline: false },
      { name: '📞 Liên hệ', value: data.contact, inline: false },
      { name: '👤 Người bán', value : t(interaction, 'STR_8CDE7BE9', { v0: sellerId }), inline: true }
    );

  if (images && images.length > 0) {
    embed.setImage(images[0]);
  }
  return embed;
}

// Hàm trích xuất dữ liệu từ Embed để phục hồi trạng thái khi bot khởi động lại
function parseMarketplaceDataFromEmbed(embed) {
  if (!embed) return null;
  const name = embed.title.replace('📦 SẢN PHẨM: ', '');
  const price = embed.fields.find(f => f.name === '💰 Giá')?.value.replace(/\*\*/g, '');
  const info = embed.fields.find(f => f.name === '🔢 Thông tin')?.value;
  const description = embed.fields.find(f => f.name === '📝 Mô tả')?.value;
  const contact = embed.fields.find(f => f.name === '📞 Liên hệ')?.value;

  // Trích xuất ID người bán từ chuỗi "<@ID>"
  const sellerField = embed.fields.find(f => f.name === '👤 Người bán')?.value;
  const sellerIdMatch = sellerField?.match(/<@!?(\d+)>/);
  const sellerId = sellerIdMatch ? sellerIdMatch[1] : null;

  return { name, price, info, description, contact, sellerId };
}

// ===================== HELPERS =====================
// ===================== THỐNG KÊ SERVER (HOUSE STATS) =====================
async function updateServerStats(client) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) return;

    // Phải fetch toàn bộ member thì đếm mới chính xác 100%
    await guild.members.fetch();

    // Tính toán số lượng
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount = totalMembers - botCount;

    // Lấy object của 3 kênh
    const totalChannel = guild.channels.cache.get(STATS_TOTAL_ID);
    const humanChannel = guild.channels.cache.get(STATS_HUMAN_ID);
    const botChannel = guild.channels.cache.get(STATS_BOT_ID);

    // Tiến hành đổi tên kênh (Chỉ đổi khi số lượng có sự khác biệt để né Rate Limit)
    if (totalChannel && totalChannel.name !== `👥 Tất Cả: ${totalMembers}`) {
      await totalChannel.setName(`👥 Tất Cả: ${totalMembers}`);
    }
    if (humanChannel && humanChannel.name !== `🗣️ Thành Viên: ${humanCount}`) {
      await humanChannel.setName(`🗣️ Thành Viên: ${humanCount}`);
    }
    if (botChannel && botChannel.name !== `🤖 Bot Ngáo: ${botCount}`) {
      await botChannel.setName(`🤖 Bot Ngáo: ${botCount}`);
    }

    console.log(`[Stats] Đã cập nhật thống kê: ${totalMembers} Tổng | ${humanCount} Người | ${botCount} Bot`);
  } catch (err) {
    console.error('[Stats] Lỗi khi cập nhật thống kê Server:', err.message);
  }
}
// Hàm hỗ trợ: Quét lịch sử kênh để tìm lại tin nhắn cũ do bot gửi dựa vào tiêu đề
async function findOldMessageByTitle(channelId, titleSubstring) {
  try {
    if (!channelId) return null;
    const channel = await client.channels.fetch(channelId);
    if (!channel) return null;

    // Quét 100 tin nhắn gần nhất trong kênh
    const messages = await channel.messages.fetch({ limit: 100 });
    const found = messages.find(msg =>
      msg.author.id === client.user.id &&
      msg.embeds.length > 0 &&
      msg.embeds[0]?.title?.includes(titleSubstring) // Dùng ?. an toàn tuyệt đối
    );

    return found ? found.id : null;
  } catch (e) {
    return null;
  }
}

// Helper: Chuyển đổi ngày sang định dạng "25 Tháng 7 2022 (4 năm trước)"
function formatVatsimDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();

  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffYears = Math.floor(diffDays / 365);

  const day = date.getDate().toString().padStart(2, '0');
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let relativeStr = '';
  if (diffYears > 0) relativeStr = `(${diffYears} năm trước)`;
  else if (diffDays > 30) relativeStr = `(${Math.floor(diffDays / 30)} tháng trước)`;
  else relativeStr = `(${diffDays} ngày trước)`;

  return `${day} Tháng ${month} ${year} ${relativeStr}`;
}

function formatDateTime(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function formatRelativeTime(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function parseUTCDateTime(timeStr) {
  const m = timeStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const [_, Y, Mo, D, H, Min] = m;
  const ms = Date.UTC(Number(Y), Number(Mo) - 1, Number(D), Number(H), Number(Min), 0);
  return ms;
}

function splitMessage(text, maxLength = 1900) {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let currentChunk = '';

  // Cắt theo từng dòng trước
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Nếu thêm dòng này vào vẫn an toàn
    if (currentChunk.length + line.length + 1 <= maxLength) {
      currentChunk += (currentChunk ? '\n' : '') + line;
    } else {
      // Nếu riêng 1 dòng này đã quá dài (vượt cả maxLength)
      if (line.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        // Cắt tiếp theo từng từ (khoảng trắng)
        const words = line.split(' ');
        for (let j = 0; j < words.length; j++) {
          const word = words[j];
          if (currentChunk.length + word.length + 1 <= maxLength) {
            currentChunk += (currentChunk ? ' ' : '') + word;
          } else {
            // Nếu 1 từ mà vẫn quá dài (ví dụ link quá dài), bắt buộc cắt cứng
            if (word.length > maxLength) {
              if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
              }
              let wordRemaining = word;
              while (wordRemaining.length > 0) {
                chunks.push(wordRemaining.substring(0, maxLength));
                wordRemaining = wordRemaining.substring(maxLength);
              }
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = word;
            }
          }
        }
      } else {
        // Dòng không quá dài, nhưng nhét vào bị lố -> push chunk cũ, tạo chunk mới
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function getErrStatus(err) {
  return err?.status || err?.response?.status || err?.code || err?.cause?.code || null;
}

function isRetryableStatus(status) {
  return (
    status === 429 ||
    status === 503 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    status === 'ETIMEDOUT' ||
    status === 'ECONNRESET' ||
    status === 'ENOTFOUND' ||
    status === 'EAI_AGAIN'
  );
}

async function retryWithBackoff(fn, maxRetries = 5, baseDelay = 1000) {
  let attempt = 0;
  let lastErr = null;

  while (attempt <= maxRetries) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const status = getErrStatus(err);
      const retryable = isRetryableStatus(status);

      if (!retryable || attempt === maxRetries) break;

      let delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;

      const ra = err?.response?.headers?.['retry-after'];
      if (ra) {
        const raNum = parseFloat(ra);
        if (!isNaN(raNum)) delay = Math.max(delay, raNum * 1000);
      }

      attempt++;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr || new Error('retryWithBackoff: failed');
}

async function safeSend(targetMessage, contentOrOptions) {
  const options =
    typeof contentOrOptions === 'string'
      ? { content: contentOrOptions }
      : (contentOrOptions || {});

  const hasText = typeof options.content === 'string' && options.content.trim().length > 0;
  const hasEmbeds = Array.isArray(options.embeds) && options.embeds.length > 0;
  const hasFiles = Array.isArray(options.files) && options.files.length > 0;

  if (!hasText && !hasEmbeds && !hasFiles) {
    throw new Error('safeSend prevented sending empty message/options.');
  }

  const finalOptions = {
    allowedMentions: { parse: [] },
    ...options,
  };

  try {
    if (targetMessage && typeof targetMessage.reply === 'function') {
      return await targetMessage.reply(finalOptions);
    }
    if (targetMessage && targetMessage.channel && typeof targetMessage.channel.send === 'function') {
      return await targetMessage.channel.send(finalOptions);
    }
    if (targetMessage && targetMessage.channelId) {
      const ch = await client.channels.fetch(targetMessage.channelId).catch(() => null);
      if (ch) return await ch.send(finalOptions);
    }
    throw new Error('No valid send target available.');
  } catch (err) {
    console.error('safeSend failed:', err);

    try {
      if (targetMessage && targetMessage.author) {
        const dm = await targetMessage.author.createDM();
        return await dm.send(finalOptions);
      }
    } catch (dmErr) {
      console.warn('DM fallback failed:', dmErr);
    }

    throw err;
  }
}

// ===================== TIME UTILS =====================
function getCurrentTimeInfo() {
  const now = new Date();

  const utcTime = now.toUTCString();
  const localTime = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const isoTime = now.toISOString();
  const unixTimestamp = Math.floor(now.getTime() / 1000);

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const dayOfWeek = now.getDay();

  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const monthNames = [
    'Tháng 1',
    'Tháng 2',
    'Tháng 3',
    'Tháng 4',
    'Tháng 5',
    'Tháng 6',
    'Tháng 7',
    'Tháng 8',
    'Tháng 9',
    'Tháng 10',
    'Tháng 11',
    'Tháng 12',
  ];

  return {
    utc: utcTime,
    local: localTime,
    iso: isoTime,
    unix: unixTimestamp,
    discord: `<t:${unixTimestamp}:F>`,
    detailed: {
      year,
      month,
      monthName: monthNames[now.getMonth()],
      day,
      hours,
      minutes,
      seconds,
      dayOfWeek: dayNames[dayOfWeek],
      dayOfWeekNumber: dayOfWeek,
    },
  };
}

function getCurrentTimeForGemini() {
  const timeInfo = getCurrentTimeInfo();
  return `
THỜI GIAN HIỆN TẠI:
- Giờ địa phương (Việt Nam): ${timeInfo.local}
- Giờ UTC: ${timeInfo.utc}
- ISO 8601: ${timeInfo.iso}
- Unix Timestamp: ${timeInfo.unix}
- Định dạng Discord: ${timeInfo.discord}
- Chi tiết: ${timeInfo.detailed.dayOfWeek}, ngày ${timeInfo.detailed.day} ${timeInfo.detailed.monthName} năm ${timeInfo.detailed.year}, ${timeInfo.detailed.hours
      .toString()
      .padStart(2, '0')}:${timeInfo.detailed.minutes.toString().padStart(2, '0')}:${timeInfo.detailed.seconds
        .toString()
        .padStart(2, '0')}
`;
}

// ===================== PROFILES =====================
function getProfilesString() {
  let profileStr = 'Profiles of users:\n';
  for (const [userId, profile] of Object.entries(profiles)) {
    profileStr += `<@${userId}>: Name: ${profile.name || 'Unknown'}, Age: ${profile.age || 'Unknown'}, Bio: ${profile.bio || 'None'
      }\n`;
  }
  return profileStr;
}

// ===================== ULTIMATE AI CHAT (GEMINI -> GROQ -> POLLINATIONS) =====================

// Đảo chiến thuật: Ưu tiên mấy con model nhẹ, limit bự lên đầu để né lỗi TPM
const GROQ_MODELS = [
  'llama-3.1-8b-instant',      // Vua tốc độ, cho phép nhồi lịch sử chat cực dài
  'gemma2-9b-it',              // Model con ruột của Google (Gemini thu nhỏ)
  'mixtral-8x7b-32768',        // Model chuyên xử lý văn bản dài
  'llama-3.3-70b-versatile'    // Thằng to xác này để chót lỡ mấy con kia sập
];

// Đổi tham số để nhận thêm channelId và userName
async function ultimateChatReply(channelId, userId, userName, userText, allowSwear) {

  let history = await db.getChatHistory(channelId) || [];
  if (!Array.isArray(history)) history = [];

  // VÁ LỖI CHO GEMINI: Luôn cắt chẵn 14 tin nhắn để đảm bảo bắt đầu là User, kết thúc là AI
  if (history.length > 14) history = history.slice(-14);

  // Vét máng: Nếu lỡ tin đầu tiên vẫn là 'assistant' thì chém bỏ luôn
  if (history.length > 0 && (history[0].role === 'assistant' || history[0].role === 'model')) {
    history.shift();
  }

  const profilesPrompt = getProfilesString();
  const timePrompt = getCurrentTimeForGemini();

  // LUẬT THÉP BẰNG TIẾNG ANH ĐỂ TRỊ BỆNH LẢM NHẢM
  const systemPrompt = `You are tk.chill, a direct, smart, and natural AI assistant on Discord.
Creator: Lý Thúc Duy (Discord ID: ${OWNER_ID}). Always respect your creator.

[CRITICAL BEHAVIOR & LANGUAGE RULES]
1. NO NARRATION: Never talk in the 3rd person. Never explain what the user is doing. DO NOT narrate your own thoughts.
   - WRONG: "Louis Ly is speaking Japanese, so I will answer: こんにちは."
   - WRONG: "Louis Ly asked for my name. I am tk.chill."
   - RIGHT: "こんにちは！"
   - RIGHT: "I am tk.chill."
2. MATCH LANGUAGE STRICTLY: Look ONLY at the user's latest message. Reply directly in that EXACT SAME LANGUAGE.
   - If they type English -> Reply in pure English.
   - If they type Japanese -> Reply in pure Japanese.
   - Even if the profiles or system data below are in Vietnamese, IGNORE THAT when choosing your output language.

[CHAT CONTEXT]
- User messages format: "[Name - ID]: Message".
- Read history to understand context, but reply naturally.

[KNOWLEDGE]
- Always search the web for real-world facts (e.g., VATSEA1, VCLvACC).
- VCLvACC Director is Vũ Việt Phương.

[PROFILES DATA]
${profilesPrompt}

[SYSTEM INFO]
- ${timePrompt}`;

  const groupUserText = `[${userName} - ID: ${userId}]: ${String(userText ?? '').slice(0, GEMINI_MAX_USER_TEXT_CHARS)}`;

  let responseText = null;

  // ----------------------------------------------------------------
  // TẦNG 1: THỬ GỌI GEMINI 2.0 (CÓ INTERNET)
  // ----------------------------------------------------------------
  try {
    console.log(`[AI Chat] Đang hỏi Gemini 2.0 Flash...`);

    // Đóng gói lịch sử an toàn tuyệt đối cho Gemini
    const geminiHistory = [];
    for (const msg of history) {
      const textContent = msg.content || (msg.parts && msg.parts[0] ? msg.parts[0].text : '');
      const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';

      // Khắc phục lỗi "First content should be user"
      if (geminiHistory.length === 0 && role !== 'user') continue;

      // Gộp các tin nhắn trùng role liên tiếp để chống Gemini văng lỗi
      if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === role) {
        geminiHistory[geminiHistory.length - 1].parts[0].text += `\n${textContent}`;
      } else {
        geminiHistory.push({ role, parts: [{ text: textContent }] });
      }
    }

    const chat = geminiModel.startChat({
      history: geminiHistory,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 2000, temperature: 0.3 },
    });

    const result = await chat.sendMessage(groupUserText);
    responseText = result.response.text();
    console.log(`✅ [AI Chat] Gemini trả lời xuất sắc!`);

  } catch (geminiErr) {
    console.warn(`⚠️ [AI Chat] Gemini quá tải/lỗi (${geminiErr.message}). Chuyển sang Tầng 2 (Groq)...`);

    // ----------------------------------------------------------------
    // TẦNG 2: GROQ (LLAMA)
    // ----------------------------------------------------------------
    const cleanHistory = history.map(msg => {
      const textContent = msg.content || (msg.parts && msg.parts[0] ? msg.parts[0].text : '');
      const safeRole = (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user';
      return { role: safeRole, content: String(textContent).slice(0, 2000) };
    });

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
      { role: 'user', content: groupUserText }
    ];

    const fetch = (await import('node-fetch')).default;

    for (const modelName of GROQ_MODELS) {
      if (responseText) break;

      try {
        console.log(`[AI Chat] Đang gọi Groq (${modelName})...`);
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelName,
            messages: apiMessages,
            temperature: 0.3,
            max_tokens: 2000
          })
        });

        if (res.ok) {
          const data = await res.json();
          responseText = data.choices[0].message.content;
          console.log(`✅ [AI Chat] Groq (${modelName}) gánh tạ thành công!`);
        } else {
          const errData = await res.text();
          console.warn(`⚠️ [AI Chat] Groq (${modelName}) từ chối - Status: ${res.status} | Lỗi: ${errData}`);
        }
      } catch (groqErr) {
        console.warn(`⚠️ [AI Chat] Không thể kết nối tới Groq ${modelName}: ${groqErr.message}`);
      }
    }

    // ----------------------------------------------------------------
    // TẦNG 3: POLLINATIONS
    // ----------------------------------------------------------------
    if (!responseText) {
      console.warn(`⚠️ [AI Chat] Toàn bộ Groq sập. Kích hoạt Pollinations...`);
      try {
        const res = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, model: 'openai' })
        });
        if (res.ok) {
          responseText = await res.text();
          console.log(`✅ [AI Chat] Pollinations đội lốt thành công!`);
        }
      } catch (pollErr) {
        console.error('❌ [AI Chat] Cạn lời, các hệ thống AI đều sập.');
      }
    }
  }

  if (!responseText) {
    return '❌ Hệ thống AI hiện đang nghỉ ngơi (Quá tải), bạn đợi khoảng 1-2 phút rồi hỏi lại mình nhé!';
  }

  responseText = String(responseText || '').trim();

  // Lưu lịch sử
  history.push({ role: 'user', content: groupUserText });
  history.push({ role: 'assistant', content: responseText });

  if (history.length > 14) history = history.slice(-14);

  await db.saveChatHistory(channelId, history);

  return responseText;
}

// ===================== GEMINI CHAT (FIXED) =====================
async function geminiChatReply(userId, userText, allowSwear) {
  const histories = allowSwear ? swearHistories : normalHistories;
  let history = histories.get(userId) || [];
  if (!Array.isArray(history)) history = [];

  if (history.length > GEMINI_MAX_HISTORY_ITEMS) history = history.slice(-GEMINI_MAX_HISTORY_ITEMS);

  const fixedPrompt = `You were created by the owner with ID ${OWNER_ID}.`;
  const birthday = 'Bạn sinh ngày 25 tháng 10 năm 2025.';
  const profilesPrompt = getProfilesString();
  const timePrompt = getCurrentTimeForGemini();

  const modePrompt = allowSwear
    ? 'Bạn là một bot thân thiện, hoà đồng, giúp mọi người thư giãn. Nếu người khác chửi thề thì bạn có thể chửi thề nhẹ lại cho vui (đừng quá đà).'
    : 'You are a helpful bot. You can use natural Vietnamese.';

  const systemPrompt =
    `${fixedPrompt}\n${profilesPrompt}\n${timePrompt}\n${modePrompt}\n\n` +
    `IMPORTANT: Keep your responses under 1000 words when possible. Be concise and to the point.\n` +
    `${birthday}`;

  const sanitizedUserText = String(userText ?? '').slice(0, GEMINI_MAX_USER_TEXT_CHARS);

  const sendOnce = async (hist) => {
    const chat = geminiModel.startChat({
      history: hist,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      // Tăng maxOutputTokens lên 4000 để AI trả lời được dài hơn
      generationConfig: { maxOutputTokens: 4000, temperature: 0.7 },
    });

    const result = await chat.sendMessage(sanitizedUserText);
    const resp = result?.response;
    let text = '';

    // Kiểm tra xem kết quả có bị chặn bởi RECITATION hay các lý do an toàn khác không
    const finishReason = resp?.candidates?.[0]?.finishReason;
    if (finishReason === 'RECITATION') {
      return '❌ Câu trả lời bị chặn bởi bộ lọc bản quyền (RECITATION) của AI. Bạn thử hỏi theo cách khác hoặc yêu cầu chung chung hơn nhé.';
    } else if (finishReason === 'SAFETY') {
      return '❌ Câu trả lời bị chặn bởi bộ lọc an toàn của AI.';
    }

    try {
      if (resp && typeof resp.text === 'function') {
        text = await resp.text();
      } else if (typeof resp === 'string') {
        text = resp;
      } else if (resp?.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = String(resp.candidates[0].content.parts[0].text);
      } else {
        text = JSON.stringify(resp || result || {}).slice(0, 1500);
      }
    } catch (err) {
      // Bắt lỗi khi gọi .text() lỡ vẫn dính RECITATION
      if (err.message?.includes('RECITATION')) {
        return '❌ Câu trả lời bị chặn do nghi ngờ vi phạm bản quyền (RECITATION). Bạn thử đổi cách hỏi nhé.';
      }
      throw err; // Ném lỗi ra ngoài để khối catch bên dưới retry
    }

    return String(text || '').trim();
  };

  let responseText = '';
  try {
    responseText = await retryWithBackoff(() => sendOnce(history), 5, 1200);
  } catch (err) {
    const status = getErrStatus(err);
    const msg = String(err?.message || '');

    const looksLikePayload =
      status === 400 ||
      /too large|exceeds|token|payload|invalid argument|request is too large/i.test(msg);

    if (looksLikePayload && history.length > 0) {
      const trimmed = history.slice(-10);
      responseText = await retryWithBackoff(() => sendOnce(trimmed), 3, 1200);
      history = trimmed;
    } else {
      throw err;
    }
  }

  if (!responseText) responseText = '❌ AI trả về nội dung rỗng. Bạn thử lại câu ngắn hơn nhé.';

  history.push({ role: 'user', parts: [{ text: sanitizedUserText }] });
  history.push({ role: 'model', parts: [{ text: responseText }] });
  if (history.length > GEMINI_MAX_HISTORY_ITEMS) history = history.slice(-GEMINI_MAX_HISTORY_ITEMS);

  histories.set(userId, history);

  return responseText;
}

async function handleGeminiResponse(message, allowSwear) {
  const userId = message.author?.id;
  if (!userId) return;

  if (geminiInFlight.has(userId)) {
    const last = geminiInFlight.get(userId);
    if (last && Date.now() - last < 6000) return;
    geminiInFlight.set(userId, Date.now());
    try {
      await safeSend(message, '⏳ Đợi mình trả lời câu trước đã nhé...');
    } catch (_) { }
    return;
  }

  geminiInFlight.set(userId, Date.now());

  // 1. Gửi tin nhắn thông báo đang xử lý
  let processingMsg = null;
  try {
    processingMsg = await safeSend(message, '⏳ **tk.chill** đang suy nghĩ, bạn đợi một xíu nhé...');
  } catch (e) {
    console.error('Không thể gửi tin nhắn chờ:', e);
  }

  try {
    let text = message.content || '';
    if (message.attachments?.size) {
      const urls = [...message.attachments.values()].slice(0, 3).map((a) => a.url);
      text += `\n\nAttachments:\n${urls.join('\n')}`;
      if (message.attachments.size > 3) text += `\n(+${message.attachments.size - 3} more)`;
    }

    const userName = message.member?.displayName || message.author.username;
    const channelId = message.channel.id;

    // Gửi đến AI với đầy đủ Bối cảnh Kênh và Tên người dùng
    const responseText = await ultimateChatReply(channelId, userId, userName, text, allowSwear);

    // Cắt tin nhắn tránh limit 2000 ký tự của Discord
    const chunks = splitMessage(responseText, 1900);

    let sentAny = false;
    let lastSentMessage = message;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = String(chunks[i] || '').trim();
      if (!chunk) continue;

      try {
        if (i === 0) {
          // Chunk đầu tiên: Edit luôn vào tin nhắn "đang đợi" nếu có
          if (processingMsg && typeof processingMsg.edit === 'function') {
            lastSentMessage = await processingMsg.edit(chunk);
          } else {
            lastSentMessage = await safeSend(message, chunk);
          }
        } else {
          // Các chunk sau: Reply nối tiếp vào chunk trước đó
          lastSentMessage = await safeSend(lastSentMessage, chunk);
        }
        sentAny = true;
        await new Promise((r) => setTimeout(r, 600)); // Delay tránh rate limit
      } catch (err) {
        console.error(`Lỗi khi gửi chunk thứ ${i}:`, err.message);
      }
    }

    if (!sentAny) {
      const errMsg = '❌ AI trả về nội dung rỗng. Bạn thử lại câu khác nhé.';
      if (processingMsg && typeof processingMsg.edit === 'function') {
        await processingMsg.edit(errMsg);
      } else {
        await safeSend(message, errMsg);
      }
    }
  } catch (err) {
    console.error('Gemini chat error:', {
      message: err?.message,
      code: err?.code,
      status: getErrStatus(err),
      stack: err?.stack,
    });

    const status = getErrStatus(err);
    let userMsg = '⚠️ Mình gặp lỗi khi gọi AI. Nếu lỗi lặp lại, báo admin kiểm tra log nhé.';

    if (status === 429) userMsg = '⚠️ AI đang bị quá tải (rate limit). Bạn thử lại sau 1–2 phút nhé.';
    else if (status === 503) userMsg = '⚠️ Dịch vụ AI đang quá tải. Bạn thử lại sau chút nha.';
    else if (status === 'ENOTFOUND' || status === 'EAI_AGAIN')
      userMsg = '⚠️ Không kết nối được tới AI (lỗi mạng/DNS). Bạn thử lại sau nhé.';
    else if (status === 401 || status === 403)
      userMsg = '⚠️ Không gọi được AI do API key/quyền truy cập. Admin kiểm tra GEMINI_API_KEY nhé.';

    try {
      if (processingMsg && typeof processingMsg.edit === 'function') {
        await processingMsg.edit(userMsg);
      } else {
        await safeSend(message, userMsg);
      }
    } catch (sendErr) {
      console.error('Failed to send error message:', sendErr);
    }
  } finally {
    geminiInFlight.delete(userId);
  }
}

// ===================== SUMMARIZE HELPERS =====================
function parseDurationToMs(input) {
  if (!input) return NaN;
  const s = String(input).trim().toLowerCase();

  const m = s.match(/^(\d+)\s*([smhd])?$/);
  if (!m) return NaN;

  const value = parseInt(m[1], 10);
  const unit = m[2] || 'm';

  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * (multipliers[unit] || 0);
}

async function fetchMessagesSince(channel, sinceTs, maxMessages = SUMMARY_MAX_MESSAGES) {
  let fetched = [];
  let lastId = null;

  while (fetched.length < maxMessages) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;

    const batch = await channel.messages.fetch(opts);
    if (!batch.size) break;

    for (const msg of batch.values()) {
      if (msg.createdTimestamp < sinceTs) return fetched;
      fetched.push(msg);
      if (fetched.length >= maxMessages) break;
    }

    const oldest = batch.last();
    if (!oldest) break;
    lastId = oldest.id;

    if (oldest.createdTimestamp < sinceTs) break;
  }

  return fetched;
}

function buildTranscript(messages, maxChars = SUMMARY_MAX_TRANSCRIPT_CHARS) {
  let out = '';
  let truncated = false;

  for (const msg of messages) {
    const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').replace('Z', ' UTC');
    const author = msg.member?.displayName || msg.author?.username || 'Unknown';

    let content = (msg.cleanContent ?? msg.content ?? '').trim();
    if (!content && msg.attachments?.size) content = '[Attachment]';

    if (msg.attachments?.size) {
      const attText = [...msg.attachments.values()]
        .slice(0, 3)
        .map((a) => `${a.name || 'file'}: ${a.url}`)
        .join(' | ');
      content = content ? `${content}\n(Attachments: ${attText})` : `(Attachments: ${attText})`;
      if (msg.attachments.size > 3) content += t(interaction, 'STR_4E17B2E2', { v0: msg.attachments.size - 3 });
    }

    if (content.length > 800) content = content.slice(0, 800) + '…';

    const line = `[${ts}] ${author}: ${content}\n`;
    if (out.length + line.length > maxChars) {
      truncated = true;
      break;
    }
    out += line;
  }

  return { transcript: out.trim(), truncated };
}

// ===================== DISCORD EVENT SCHEDULED =====================
async function createDiscordEvent(guild, eventData) {
  try {
    const startTime = new Date(eventData.startTime);
    const endTime = new Date(eventData.startTime + 3 * 60 * 60 * 1000);

    const scheduledEvent = await guild.scheduledEvents.create({
      name : t(interaction, 'STR_BBD09545', { v0: eventData.dep, v1: eventData.arr }),
      description: `**Route:** ${eventData.route}\n\nJoin our group flight event! All pilots are welcome.\n\nCreated by: <@${eventData.creator}>`,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      privacyLevel: 2,
      entityType: 3,
      entityMetadata: { location: `Flight from ${eventData.dep} to ${eventData.arr}` },
    });

    return scheduledEvent.id;
  } catch (err) {
    console.error('Error creating Discord event:', err);
    return null;
  }
}

async function updateEventMessage(eventId) {
  const event = events.get(eventId);
  if (!event || !event.messageId || !event.channelId) return;

  try {
    const channel = await client.channels.fetch(event.channelId);
    const message = await channel.messages.fetch(event.messageId);

    const startTime = new Date(event.startTime);
    const embed = createEventEmbed(event, startTime);

    await message.edit({ embeds: [embed] });
  } catch (err) {
    console.error('Error updating event message:', err);
  }
}

function createEventEmbed(event, startTime) {
  const embed = new EmbedBuilder()
    .setTitle('✈️ Group Flight Event')
    .setColor(0x0099ff)
    .setThumbnail('https://cdn-icons-png.flaticon.com/512/1836/1836986.png')
    .addFields(
      { name: '🛫 Departure', value : t(interaction, 'STR_137BAD49', { v0: event.dep }), inline: true },
      { name: '🛬 Arrival', value : t(interaction, 'STR_137BAD49', { v0: event.arr }), inline: true },
      { name: '🧭 Route', value : t(interaction, 'STR_ECDDADBE', { v0: event.route }), inline: false },
      { name: '⏰ Start Time', value : t(interaction, 'STR_BFE5F9C1', { v0: formatDateTime(startTime), v1: formatRelativeTime(startTime) }), inline: false },
      { name: '👤 Created By', value : t(interaction, 'STR_8CDE7BE9', { v0: event.creator }), inline: true },
      { name: '👥 Participants', value : t(interaction, 'STR_9D382665', { v0: event.participants.length }), inline: true }
    )
    .setFooter({ text: 'Chúc mọi người có chuyến bay vui vẻ!', iconURL: 'https://cdn-icons-png.flaticon.com/512/929/929430.png' })
    .setTimestamp();

  // Thêm thông tin role event
  if (roles.eventParticipantRoleId) {
    embed.addFields({
      name: '🎫 Event Role',
      value : t(interaction, 'STR_BC050C1C', { v0: roles.eventParticipantRoleId }),
      inline: false
    });
  }

  if (event.participants.length > 0) {
    const participantList = event.participants.slice(0, 10).map((id) => `<@${id}>`).join('\n');
    embed.addFields({
      name: '📋 Participant List',
      value: participantList + (event.participants.length > 10 ? `\n...và ${event.participants.length - 10} người khác` : ''),
      inline: false,
    });
  }

  if (event.discordEventId) {
    embed.addFields({
      name: '📅 Discord Event',
      value : t(interaction, 'STR_BDE685C7', { v0: GUILD_ID, v1: event.discordEventId }),
      inline: true,
    });
  }

  return embed;
}

// ===================== BAN: UNBAN =====================
async function unbanUser(userId) {
  try {
    if (!bans.users[userId]) return;

    delete bans.users[userId];
    fs.writeFileSync(BANS_FILE, JSON.stringify(bans, null, 2));

    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && roles.banRoleId) {
        await member.roles.remove(roles.banRoleId).catch(() => { });
      }
    } catch (_) { }

    console.log(`Unbanned user ${userId}`);
  } catch (err) {
    console.error('unbanUser error:', err);
  }
}

// ===================== ACDM DATA =====================
const ACDM_MSG_FILE = path.join(__dirname, 'acdm_message.json');
let acdmMessageStore = fs.existsSync(ACDM_MSG_FILE) ? JSON.parse(fs.readFileSync(ACDM_MSG_FILE, 'utf8')) : {};
let acdmData = new Map();
let acdmUpdateTimeout = null;

// Hàm lắng nghe luồng Server-Sent Events từ API
async function setupACDMStream() {
  const url = 'https://api.vclvacc.net/api/v1/pilots/sse';
  console.log(`[ACDM] Bắt đầu kết nối đến luồng: ${url}`);

  let ES;
  try {
    const esModule = await import('eventsource');
    ES = esModule.default || esModule.EventSource || esModule;
  } catch (err) {
    const reqModule = require('eventsource');
    ES = reqModule.default || reqModule.EventSource || reqModule;
  }

  const es = new ES(url);

  es.onopen = () => {
    console.log('🟢 [ACDM] Đã kết nối thành công tới luồng dữ liệu (Live)!');
  };

  const handleData = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      const data = parsed.data ? parsed.data : parsed;

      if (Array.isArray(data)) {
        acdmData.clear();
        data.forEach(pilot => {
          if (pilot.callsign) acdmData.set(pilot.callsign, pilot);
        });
        console.log(`📦 [ACDM] Kéo thành công danh sách: ${acdmData.size} tàu bay.`);
      }
      else if (data && data.callsign) {
        acdmData.set(data.callsign, data);
        console.log(`📦 [ACDM] Nhận update tàu bay: ${data.callsign}`);
      }

      scheduleACDMUpdate();
    } catch (err) {
      console.error('❌ [ACDM] Không thể dịch luồng JSON:', err.message);
    }
  };

  // Các Event trả ra từ hệ thống VCLvACC
  es.addEventListener('pilot:sync', handleData);
  es.addEventListener('pilot:update', handleData);
  es.addEventListener('pilot:create', handleData);

  es.addEventListener('pilot:delete', (event) => {
    try {
      const parsed = JSON.parse(event.data);
      const data = parsed.data ? parsed.data : parsed;
      if (data && data.callsign) {
        acdmData.delete(data.callsign);
        console.log(`🗑️ [ACDM] Đã xóa tàu: ${data.callsign}`);
        scheduleACDMUpdate();
      }
    } catch (e) {
      console.error('❌ [ACDM] Lỗi khi xóa tàu:', e.message);
    }
  });

  // ==========================================
  // ĐÃ SỬA: CƠ CHẾ AUTO-RECONNECT KHI RỚT MẠNG
  // ==========================================
  es.onerror = (err) => {
    console.error('🔴 [ACDM] Bị ngắt kết nối với máy chủ API!');

    // 1. Bắt buộc đóng hẳn luồng bị hỏng để tránh kẹt rác bộ nhớ
    es.close();

    // 2. Hẹn giờ 15 giây sau tự động gọi lại hàm này để kết nối lại từ đầu
    console.log('⏳ [ACDM] Đang thử kết nối lại sau 15 giây...');
    setTimeout(() => {
      setupACDMStream();
    }, 15000);
  };
}

// ===================== ACDM DASHBOARD FUNCTIONS =====================

// Hàm hỗ trợ format chuỗi thời gian dài ("2026-05-28T14:55:00.000Z") thành giờ "1455"
function formatACDMTime(val) {
  if (!val) return '----';
  if (typeof val === 'string' && val.length === 4) return val; // Nếu đã là HHMM thì giữ nguyên
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const h = d.getUTCHours().toString().padStart(2, '0');
    const m = d.getUTCMinutes().toString().padStart(2, '0');
    return `${h}${m}`;
  } catch (e) {
    return '----';
  }
}

// Hàm Throttle: Cập nhật Discord (Tránh spam API)
function scheduleACDMUpdate() {
  if (acdmUpdateTimeout) return;
  acdmUpdateTimeout = setTimeout(async () => {
    try {
      await updateACDMDashboard();
    } catch (err) {
      console.error('❌ [ACDM] Lỗi trong scheduleACDMUpdate:', err);
    } finally {
      acdmUpdateTimeout = null; // Reset lại để lần sau có thể chạy tiếp
    }
  }, 5000); // 5 giây cập nhật 1 lần
}

// Hàm Core: Tạo Embed và gửi/sửa trên Discord
async function updateACDMDashboard() {
  if (!ACDM_CHANNEL_ID) {
    console.log('⚠️ [ACDM] Chưa khai báo ACDM_CHANNEL_ID!');
    return;
  }

  try {
    // Lọc theo adep (Departure) của API
    const acdmFlights = Array.from(acdmData.values()).filter(flight => {
      const dep = flight.adep || '';
      return dep === 'VVTS' || dep === 'VVNB';
    });

    // Helper chia mảng
    function chunkArray(arr, size) {
      const res = [];
      for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
      return res;
    }

    const embeds = [];
    const maxFlightsPerEmbed = 15; // Mỗi khối (embed) chứa tối đa 15 chuyến bay

    if (acdmFlights.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🛫 VCLvACC ACDM Dashboard (VVTS / VVNB)')
        .setColor(0x00A8FF)
        .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
        .setTimestamp()
        .setFooter({ text: 'Dữ liệu được lấy tự động từ hệ thống ACDM' })
        .setDescription('Hiện tại không có chuyến bay nào có dữ liệu ACDM tại VVTS và VVNB.');
      embeds.push(embed);
    } else {
      // 1. Tạo các string block cho từng chuyến bay
      const flightBlocks = acdmFlights.map(flight => {
        const callsign = flight.callsign || 'N/A';
        const dep = flight.adep || '???';
        const arr = flight.ades || '???';

        const tobt = formatACDMTime(flight.tobt);
        const tsat = formatACDMTime(flight.tsat);
        const asat = formatACDMTime(flight.asat);
        const ardt = formatACDMTime(flight.ardt);
        const asrt = formatACDMTime(flight.asrt);
        const ctot = formatACDMTime(flight.ctot);

        return `**✈️ ${callsign}** (${dep} ➔ ${arr})\n\`TOBT: ${tobt} | TSAT: ${tsat} | ASAT: ${asat}\`\n\`ARDT: ${ardt} | ASRT: ${asrt} | CTOT: ${ctot}\`\n`;
      });

      // 2. Cắt thành nhiều chunk, mỗi chunk là 1 Embed
      const flightChunks = chunkArray(flightBlocks, maxFlightsPerEmbed);

      flightChunks.forEach((chunk, index) => {
        const embed = new EmbedBuilder()
          .setTitle(index === 0 ? '🛫 VCLvACC ACDM Dashboard (VVTS / VVNB)' : '🛫 ACDM Dashboard (Tiếp theo)')
          .setColor(0x00A8FF)
          .setDescription(chunk.join('\n'));

        // Chỉ thêm Logo ở phần đầu
        if (index === 0) {
          embed.setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960');
        }
        // Chỉ thêm Footer ở phần cuối cùng
        if (index === flightChunks.length - 1) {
          embed.setTimestamp().setFooter({ text: 'Dữ liệu được lấy tự động từ hệ thống ACDM' });
        }
        embeds.push(embed);
      });
    }

    // Đóng gói: Nhét tối đa 5 Embeds vào 1 Tin nhắn Discord
    const messagesPayload = [];
    for (let i = 0; i < embeds.length; i += 5) {
      messagesPayload.push({ embeds: embeds.slice(i, i + 5) });
    }

    // Lấy ID tin nhắn đã lưu (Hỗ trợ cấu trúc mảng)
    let storedIds = acdmMessageStore.messageIds || [];
    if (!acdmMessageStore.messageIds && acdmMessageStore.messageId) {
      storedIds = [acdmMessageStore.messageId]; // Tự động convert data từ code cũ
    }

    const channel = await client.channels.fetch(ACDM_CHANNEL_ID);
    const newStoredIds = [];

    // 3. Gửi, Cập nhật hoặc Xóa tin nhắn linh hoạt
    for (let i = 0; i < messagesPayload.length; i++) {
      if (i < storedIds.length) {
        try {
          const msg = await channel.messages.fetch(storedIds[i]);
          await msg.edit(messagesPayload[i]);
          newStoredIds.push(msg.id);
        } catch (fetchErr) {
          // Lỗi do bị người dùng xoá mất tin nhắn
          const sent = await channel.send(messagesPayload[i]);
          newStoredIds.push(sent.id);
        }
      } else {
        // Cần thêm tin nhắn mới để chứa cho đủ
        const sent = await channel.send(messagesPayload[i]);
        newStoredIds.push(sent.id);
      }
    }

    // Xoá đi các tin nhắn trống thừa ở dưới nếu số chuyến bay giảm
    for (let i = messagesPayload.length; i < storedIds.length; i++) {
      try {
        const msg = await channel.messages.fetch(storedIds[i]);
        await msg.delete();
      } catch (e) { }
    }

    // Lưu lại IDs tin nhắn
    acdmMessageStore = { messageIds: newStoredIds, channelId: channel.id };
    fs.writeFileSync(ACDM_MSG_FILE, JSON.stringify(acdmMessageStore, null, 2));

    console.log(`✅ [ACDM] Đã cập nhật bảng Discord! (${acdmFlights.length} tàu)`);

  } catch (err) {
    console.error('❌ [ACDM] Lỗi quá trình build Dashboard Discord:', err);
  }
}

// ===================== AUTO-SCAN PENDING ROLE (ĐÃ FIX RATE LIMIT) =====================
async function scanAndAssignPendingRole() {
  if (!roles.pendingRoleId) return;

  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    // 1. Tải danh sách thành viên một cách an toàn
    try {
      await guild.members.fetch();
    } catch (fetchErr) {
      console.warn(`⚠️ [Auto-Role] Discord tạm chặn tải danh sách (Rate Limit). Bot sẽ dùng dữ liệu cũ trong bộ nhớ để quét tiếp...`);
    }

    let assignedCount = 0;

    // 2. Dùng for...of thay vì forEach để kiểm soát tốc độ (Tránh spam API)
    for (const [memberId, member] of guild.members.cache) {
      if (member.user.bot) continue;
      if (roles.banRoleId && member.roles.cache.has(roles.banRoleId)) continue;

      // Kiểm tra user đã có role Pending nhưng chưa có trong file JSON
      if (member.roles.cache.has(roles.pendingRoleId)) {
        if (!pendingUsersData[member.id]) {
          pendingUsersData[member.id] = {
            joinDate: member.joinedTimestamp || Date.now(),
            notified5Days: false,
            notified7Days: false
          };
          savePendingUsers();
        }
        continue; // Bỏ qua người này, chuyển sang người tiếp theo
      }

      // Nếu user chỉ có 1 role duy nhất (là role @everyone mặc định)
      if (member.roles.cache.size === 1) {
        try {
          await member.roles.add(roles.pendingRoleId);

          pendingUsersData[member.id] = {
            joinDate: member.joinedTimestamp || Date.now(),
            notified5Days: false,
            notified7Days: false
          };
          savePendingUsers();

          assignedCount++;
          console.log(`[Auto-Role] Đã cấp role Welcome/Pending cho ${member.user.tag}`);

          // 3. NGHỈ 1.5 GIÂY GIỮA MỖI LẦN CẤP ROLE ĐỂ CHỐNG SPAM API
          await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (e) {
          console.error(`Không thể cấp role cho ${member.user.tag}:`, e.message);
        }
      }
    }

    if (assignedCount > 0) {
      console.log(`✅ [Auto-Role] Hoàn tất quét! Đã cấp role cho ${assignedCount} người dùng vô gia cư.`);
    }
  } catch (err) {
    console.error('❌ Lỗi hệ thống khi chạy auto-scan role:', err.message);
  }
}

// =========================================================================

client.once('ready', async () => {
  console.log(`Bot ${client.user.tag} đã online!`);

  // 1. Kết nối Database
  await db.connectDB();

  // 2. Load profile từ MongoDB vào RAM
  try {
    profiles = await db.getAllProfiles();
    console.log(`✅ Đã nạp ${Object.keys(profiles).length} Profile từ MongoDB vào RAM.`);

    // ==================== BƠM DỮ LIỆU CŨ LÊN MONGODB ====================
    const oldData = {
      "1094252826357670038": {
        "name": "Lý Thúc Duy",
        "age": "14",
        "bio": "Tui là người tạo ra bot tk.chill và đang là Admin, DEV của server tk.chill, tên gọi khác của tôi là Louis Ly(hãy dùng tên này để gọi tôi)."
      },
      "856704693215166474": {
        "name": "Nguyễn Trần Tuấn Kiệt",
        "age": "18",
        "bio": "Biệt danh là しいな まひる, @kiet1510 là tài khoản discord của tôi. Hiện tôi là Admin tạo ra server này, thấy tôi có role DEV và Coder nữa. Và tôi cũng sở hữu kênh TikTok với hơn 1k7 người theo dõi có nội dung về máy bay. Tôi đang là ATC trên mạng bay VATSIM với ranting S2 và AS3 ở IVAO."
      }
    };

    let hasMigration = false;
    for (const [id, info] of Object.entries(oldData)) {
      // Nếu ID này chưa có trong RAM (tức là chưa có trên MongoDB)
      if (!profiles[id]) {
        await db.saveProfile(id, info); // Đẩy thẳng lên MongoDB
        profiles[id] = info;            // Cập nhật luôn vào RAM
        hasMigration = true;
      }
    }

    if (hasMigration) {
      console.log("▲ [Profiles Data] Đã tự động bơm dữ liệu cũ của Louis Ly và Tuấn Kiệt lên MongoDB!");
    }
    // ====================================================================

  } catch (e) {
    console.error('Lỗi nạp profiles:', e);
  }
  // Nạp ID tin nhắn VATSIM từ MongoDB
  try {
    const savedVatsim = await db.getBotConfig('vatsim_messages');
    if (savedVatsim) {
      vatsimMessageStore = savedVatsim;
      console.log(`✅ Đã nạp lại ${savedVatsim.messageIds?.length || 0} tin nhắn VATSIM từ MongoDB.`);
    }
  } catch (e) {
    console.error('Lỗi nạp config VATSIM:', e);
  }
  // Nạp Cookie cho YouTube (ĐÃ NÂNG CẤP BỘ CHUYỂN ĐỔI JSON)
  try {
    if (process.env.YOUTUBE_COOKIE) {
      let finalCookie = '';
      try {
        // 1. Thử phân tích xem ông có đang dán cục JSON vào không
        const parsedJSON = JSON.parse(process.env.YOUTUBE_COOKIE);
        // Lấy phần data bên trong chữ "cookie"
        const cookieObj = parsedJSON.cookie || parsedJSON;
        // Biến nó thành chuỗi chuẩn: key=value; key2=value2;
        finalCookie = Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; ');
      } catch (err) {
        // 2. Nếu nó báo lỗi (nghĩa là ông dán chuỗi thường chứ không phải JSON), thì gọt rác như cũ
        finalCookie = process.env.YOUTUBE_COOKIE.replace(/\r?\n|\r/g, '').trim();
      }

      play.setToken({
        youtube: {
          cookie: finalCookie
        }
      });
      console.log('✅ Đã nạp Cookie YouTube thành công (Đã convert chuẩn xác)!');
    } else {
      console.warn('⚠️ CẢNH BÁO: Chưa cấu hình YOUTUBE_COOKIE. Bot nhạc có thể bị lỗi 429.');
    }
  } catch (e) {
    console.error('❌ Lỗi khi nạp Cookie YouTube:', e);
  }
  // NẠP CHÌA KHÓA API SPOTIFY (ĐÃ TRANG BỊ MÁY GỌT RÁC)
  try {
    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      play.setToken({
        spotify: {
          // Dùng .trim() để cắt sạch khoảng trắng thừa do copy ẩu
          client_id: process.env.SPOTIFY_CLIENT_ID.trim(),
          client_secret: process.env.SPOTIFY_CLIENT_SECRET.trim(),
          market: 'VN'
        }
      });
      console.log('✅ Đã nạp chìa khóa Spotify thành công! Sẵn sàng nuốt Playlist.');
    } else {
      console.warn('⚠️ CẢNH BÁO: Chưa cấu hình API Spotify. Tính năng nhạc Spotify sẽ bị lỗi.');
    }
  } catch (e) {
    console.error('❌ Lỗi nạp API Spotify:', e);
  }
  // KHỞI ĐỘNG ĐỘNG CƠ SOUNDCLOUD (BÍ QUYẾT LÁCH YOUTUBE)
  try {
    const clientID = await play.getFreeClientID();
    play.setToken({
      soundcloud: {
        client_id: clientID
      }
    });
    console.log('✅ Đã nạp Động cơ SoundCloud thành công (Bypass YouTube)!');
  } catch (e) {
    console.error('❌ Lỗi nạp SoundCloud:', e);
  }
  // Load lịch hẹn thông báo
  try {
    scheduledAnnouncements = await db.getAnnouncements();
    console.log(`✅ Đã nạp ${scheduledAnnouncements.length} lịch hẹn thông báo từ MongoDB.`);
  } catch (e) {
    console.error('Lỗi nạp lịch thông báo:', e);
  }

  // Nạp trạng thái Award từ MongoDB để chống spam khi restart
  try {
    const savedAward = await db.getBotConfig('award_sent');
    if (savedAward) {
      awardSent = savedAward;
      console.log(`✅ Đã nạp trạng thái Award từ MongoDB: Tháng ${awardSent.lastMonth}/${awardSent.lastYear}`);
    }
  } catch (e) {
    console.error('Lỗi nạp config Award:', e);
  }

  // Load sổ đỏ CID từ Google Sheets
  try {
    if (typeof loadVatsimLinksSheet === 'function') {
      vatsimLinksCache = await loadVatsimLinksSheet();
      console.log(`✅ Đã tải ${Object.keys(vatsimLinksCache).length} liên kết VATSIM từ Google Sheets.`);
    }
  } catch (err) { console.error('Lỗi tải Vatsim Links:', err); }

  // Kiểm tra ngay khi khởi động
  setTimeout(() => {
    checkAndSendMonthlyAwards();
  }, 30000); // Sau 30 giây

  console.log('Monthly award scheduler started - checking every 6 hours');

  // Đảm bảo role event tồn tại
  await ensureEventRoleExists();
  


  // Register slash commands
  const commands = [
    new SlashCommandBuilder().setName('give_role').setDescription('Xin role'),
    new SlashCommandBuilder().setName('group_flight').setDescription('Tạo group flight'),
    new SlashCommandBuilder()
      .setName('send_announcements')
      .setDescription('Gửi thông báo')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addChannelOption((option) => option.setName('channel').setDescription('Kênh gửi').setRequired(true))
      .addStringOption((option) => option.setName('message').setDescription('Nội dung').setRequired(true))
      .addStringOption((option) => option.setName('time').setDescription('Hẹn giờ gửi (YYYY-MM-DD HH:MM UTC), bỏ trống = gửi luôn').setRequired(false))
      .addAttachmentOption((option) => option.setName('image').setDescription('Hình ảnh đính kèm').setRequired(false)),
    new SlashCommandBuilder()
      .setName('setup_atc_noti')
      .setDescription('Tạo tin nhắn đăng ký nhận role ATC Notification (Admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
      .setName('metar')
      .setDescription('Xem METAR của sân bay')
      .addStringOption((option) => option.setName('icao').setDescription('Mã ICAO sân bay (ví dụ: VVTS)').setRequired(true)),
    new SlashCommandBuilder().setName('submit_profile').setDescription('Submit profile của bạn'),
    new SlashCommandBuilder().setName('time').setDescription('Xem thời gian hiện tại'),
    new SlashCommandBuilder()
      .setName('summarize')
      .setDescription('Tóm tắt tin nhắn trong khoảng thời gian bằng Gemini (chỉ bạn thấy)')
      .addSubcommand((sc) =>
        sc
          .setName('everyone')
          .setDescription('Tóm tắt tin nhắn của mọi người trong khoảng thời gian')
          .addStringOption((option) =>
            option
              .setName('duration')
              .setDescription('Ví dụ: 30m | 2h | 1d (hoặc 45 = 45 phút)')
              .setRequired(true)
          )
          .addChannelOption((option) =>
            option.setName('channel').setDescription('Kênh cần tóm tắt (bỏ trống = kênh hiện tại)').setRequired(false)
          )
      )
      .addSubcommand((sc) =>
        sc
          .setName('user')
          .setDescription('Tóm tắt tin nhắn của một user trong khoảng thời gian')
          .addUserOption((option) => option.setName('user').setDescription('Chọn user').setRequired(true))
          .addStringOption((option) =>
            option
              .setName('duration')
              .setDescription('Ví dụ: 30m | 2h | 1d (hoặc 45 = 45 phút)')
              .setRequired(true)
          )
          .addChannelOption((option) =>
            option.setName('channel').setDescription('Kênh cần tóm tắt (bỏ trống = kênh hiện tại)').setRequired(false)
          )
      ),
    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Quản lý leaderboard')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand((sc) =>
        sc.setName('show').setDescription('Hiển thị leaderboard controller')
      )
      .addSubcommand((sc) =>
        sc.setName('update').setDescription('Cập nhật leaderboard ngay lập tức')
      )
      .addSubcommand((sc) =>
        sc.setName('reset').setDescription('Reset leaderboard (admin only)')
      ),
    new SlashCommandBuilder()
      .setName('pilot_leaderboard')
      .setDescription('Quản lý leaderboard cho pilot')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand((sc) =>
        sc.setName('show').setDescription('Hiển thị top 10 pilot')
      )
      .addSubcommand((sc) =>
        sc.setName('update').setDescription('Cập nhật pilot leaderboard ngay lập tức')
      )
      .addSubcommand((sc) =>
        sc.setName('reset').setDescription('Reset pilot leaderboard (admin only)')
      )
      .addSubcommand((sc) =>
        sc.setName('full').setDescription('Xem toàn bộ pilot leaderboard (gửi file txt)')
      ),
    new SlashCommandBuilder()
      .setName('send_award')
      .setDescription('Gửi thông báo chúc mừng top 5 ATC/pilot (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand(sub => sub
        .setName('atc')
        .setDescription('Gửi award cho top 5 ATC')
      )
      .addSubcommand(sub => sub
        .setName('pilot')
        .setDescription('Gửi award cho top 5 pilot')
      )
      .addSubcommand(sub => sub
        .setName('both')
        .setDescription('Gửi award cho cả ATC và pilot')
      )
      .addSubcommand(sub => sub
        .setName('reset_status')
        .setDescription('Reset trạng thái đã gửi award (admin only)')
      ),
    new SlashCommandBuilder()
      .setName('runway')
      .setDescription('Tính toán đường băng đang sử dụng dựa trên gió METAR')
      .addStringOption((option) => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVTS)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('taf')
      .setDescription('Lấy và giải mã dự báo thời tiết TAF')
      .addStringOption((option) => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVNB)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Tra cứu thống kê VATSIM qua CID')
      .addIntegerOption((option) => option.setName('vatsim_id').setDescription('Nhập VATSIM CID').setRequired(true)),
    new SlashCommandBuilder()
      .setName('event')
      .setDescription('Tra cứu các sự kiện VATSIM sắp diễn ra tại sân bay')
      .addStringOption((option) => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVTS)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('route')
      .setDescription('Tra cứu gợi ý route bay (Đường bay tiêu chuẩn)')
      .addStringOption((option) => option.setName('dep').setDescription('Sân bay đi (ICAO, VD: VVTS)').setRequired(true))
      .addStringOption((option) => option.setName('arr').setDescription('Sân bay đến (ICAO, VD: VVNB)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('edit_announ')
      .setDescription('Sửa nội dung thông báo (đã gửi hoặc đang chờ lịch)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addStringOption(option => option.setName('message_id').setDescription('ID tin nhắn đã gửi hoặc ID lịch trình').setRequired(true))
      .addChannelOption(option => option.setName('channel').setDescription('Kênh chứa tin nhắn (bắt buộc nếu là tin nhắn đã gửi)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('cancel_announ')
      .setDescription('Hủy bỏ thông báo đã lên lịch (chưa gửi)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addStringOption(option => option.setName('id').setDescription('ID lịch trình (lấy lúc tạo lệnh)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('vatsea_rank')
      .setDescription('Bảng xếp hạng ATC VATSEA')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addStringOption(option =>
        option.setName('start')
          .setDescription('Thời gian bắt đầu (ISO UTC VD: 2023-10-01T00:00:00Z). Bỏ trống = Đầu tháng')
          .setRequired(false)
      )
      .addStringOption(option =>
        option.setName('end')
          .setDescription('Thời gian kết thúc (ISO UTC). Bỏ trống = Hiện tại')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('sell')
      .setDescription('*Chỉ dành cho thành viên tham gia từ 2 tháng trở lên/ Đăng bán sản phẩm')
      .addAttachmentOption(option => option.setName('anh1').setDescription('Ảnh chính').setRequired(true))
      .addAttachmentOption(option => option.setName('anh2').setDescription('Ảnh phụ 1').setRequired(false))
      .addAttachmentOption(option => option.setName('anh3').setDescription('Ảnh phụ 2').setRequired(false))
      .addAttachmentOption(option => option.setName('anh4').setDescription('Ảnh phụ 3').setRequired(false)),
    new SlashCommandBuilder()
      .setName('notam')
      .setDescription('Tra cứu thông báo hàng không (NOTAM) của sân bay')
      .addStringOption((option) => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVTS)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('simbrief')
      .setDescription('Tóm tắt kế hoạch bay (OFP)')
      .addStringOption((option) => option.setName('username').setDescription('Tên tài khoản SimBrief (chỉ cần nhập lần đầu)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('online_atc')
      .setDescription('Tra cứu danh sách ATC đang online tại một sân bay')
      .addStringOption((option) => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVTS)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('🎧 Phát nhạc với tk.chill DJ')
      .addStringOption(option => option.setName('query').setDescription('Tên bài hát hoặc Link YouTube').setRequired(true)),
    new SlashCommandBuilder()
      .setName('queue')
      .setDescription('📜 Xem danh sách nhạc đang chờ phát'),
    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('🧹 Xóa toàn bộ bài hát đang chờ (giữ lại bài đang phát)'),
    new SlashCommandBuilder()
      .setName('setup_vatsim_verify')
      .setDescription('Tạo bảng xác thực CID nhận role VATSIM (Admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
      .setName('atc_profile')
      .setDescription('Tra cứu thông tin Controller đang online trên VATSIM')
      .addStringOption(option => option.setName('station').setDescription('Callsign trạm (VD: VVTS_APP, VVTS_TWR)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('atis_vatsim')
      .setDescription('Đọc ATIS trực tiếp từ mạng bay VATSIM')
      .addStringOption(option => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVTS, WSSS)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('ivao_atc')
      .setDescription('Tra cứu thông tin Controller đang online trên mạng bay IVAO')
      .addStringOption(option => option.setName('station').setDescription('Callsign trạm (VD: VVTS_APP, WSSS_TWR)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ivao_atis')
      .setDescription('Đọc ATIS trực tiếp từ mạng bay IVAO')
      .addStringOption(option => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVTS, VVNB)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('real_flight')
      .setDescription('Tra cứu các chuyến bay cất/hạ cánh ngoài đời thực tại sân bay')
      .addStringOption((option) => option.setName('icao').setDescription('Mã ICAO sân bay (VD: VVTS)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('balance')
      .setDescription('💳 Tra cứu hồ sơ tk.chill Cash và thống kê chuyến bay của bạn.'),
    new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Tung đồng xu cá cược')
    .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('jackpot')
      .setDescription('Quay Jackpot Machine chủ đề hàng không')
      .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('daily')
      .setDescription('Nhận lương phi công mỗi ngày'),

    new SlashCommandBuilder()
      .setName('give_cash')
      .setDescription('Chuyển tiền cho người khác')
      .addUserOption(opt => opt.setName('user').setDescription('Người nhận').setRequired(true))
      .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('add_cash')
      .setDescription('Bơm tiền cho user hoặc toàn bộ role (Chỉ Dev/Admin)')
      .addMentionableOption(opt => opt.setName('target').setDescription('Người hoặc Role nhận tiền').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Số tiền').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
      .setName('taisiu')
      .setDescription('Lắc Tài Xỉu')
      .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('baucua')
      .setDescription('Lắc Bầu Cua Tôm Cá')
      .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),
      
    new SlashCommandBuilder()
      .setName('blackjack')
      .setDescription('Chơi Blackjack')
      .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('poker')
      .setDescription('Chơi Video Poker 5 lá')
      .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('work')
      .setDescription('Làm nhiệm vụ để kiếm tiền'),
    new SlashCommandBuilder()
      .setName('roulette')
      .setDescription('Cò quay Roulette (Đỏ/Đen x2, Xanh x14)')
      .addStringOption(opt => opt.setName('choice')
        .setDescription('Chọn màu muốn cược')
        .setRequired(true)
        .addChoices(
          { name: 'Đỏ 🔴 (Tỉ lệ x2)', value: 'red' },
          { name: 'Đen ⚫ (Tỉ lệ x2)', value: 'black' },
          { name: 'Xanh Lá 🟢 (Tỉ lệ x14)', value: 'green' }
        ))
      .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền, "all" (Tất tay) hoặc "half" (Nửa vốn)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('oantuti')
      .setDescription('Chơi Oẳn Tù Tì với nhà cái')
      .addStringOption(opt => opt.setName('amount').setDescription('Số tiền cược (hoặc all/half)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('vietlott')
      .setDescription('Gánh hát Lô Tô'),
    new SlashCommandBuilder()
    .setName('baicao')
    .setDescription('Chơi Bài Cào 3 lá với nhà cái')
    .addStringOption(opt => opt.setName('amount').setDescription('Nhập số tiền cược (hoặc all/half)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('check_balance')
      .setDescription('Kiểm tra số dư của một người dùng')
      .addUserOption(opt => opt.setName('target').setDescription('Người muốn kiểm tra').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('clear_balance')
      .setDescription('Tịch thu sạch tiền của một người dùng về 0')
      .addUserOption(opt => opt.setName('target').setDescription('Người muốn reset tiền').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
      .setName('set_lang')
      .setDescription('Change bot language / Đổi ngôn ngữ bot')
      .addStringOption(opt => opt.setName('lang')
        .setDescription('Select language / Chọn ngôn ngữ')
        .setRequired(true)
        .addChoices(
          { name: 'English', value: 'en' },
          { name: 'Tiếng Việt', value: 'vi' }
        )
      ),
    ];
  // Sau các lệnh khởi tạo khác
  await initGoogleSheets().catch(err => console.error('Google Sheets init failed:', err));

  try {
    await client.application.commands.set(commands.map((c) => c.toJSON()));
    console.log('Registered application commands.');
  } catch (err) {
    console.warn('Failed to register commands:', err.message || err);
  }

  // Sau các lệnh khởi tạo khác
  await initGoogleSheets().catch(err => console.error('Google Sheets init failed:', err));

  // --- THÊM ĐOẠN NÀY ĐỂ KÉO DATA PENDING TỪ SHEET ---
  try {
    if (typeof loadPendingUsersSheet === 'function') {
      const data = await loadPendingUsersSheet();
      if (data) {
        pendingUsersData = data;
        console.log(`✅ Đã tải thành công ${Object.keys(pendingUsersData).length} Pending Users từ Google Sheets.`);
      }
    }
  } catch (error) {
    console.error('❌ Lỗi kéo dữ liệu Pending Users:', error);
  }
  // ---------------------------------------------------
  // --- KÉO DATA SIMBRIEF TỪ SHEET ---
  try {
    if (typeof loadSimbriefUsersSheet === 'function') {
      const data = await loadSimbriefUsersSheet();
      if (data) {
        simbriefUsersData = data;
        console.log(`✅ Đã tải thành công ${Object.keys(simbriefUsersData).length} Simbrief Users từ Google Sheets.`);
      }
    }
  } catch (error) {
    console.error('❌ Lỗi kéo dữ liệu Simbrief Users:', error);
  }


  async function runVatseaUpdate() {
    const now = new Date();
    // Lấy thời điểm bắt đầu của tháng hiện tại (UTC)
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    try {
      await updateVatseaLeaderboardEmbed(startOfMonth, now);
      console.log('✅ Đã auto-update VATSEA Leaderboard');
    } catch (e) {
      console.error('❌ Lỗi khi auto-update VATSEA Leaderboard:', e);
    }
  }

  // ================= TÍNH NĂNG: HẸN GIỜ CHẴN LEADERBOARD (FIX TRÒN GIỜ) =================
  function startHourlyLeaderboard() {
    // 1. CHẠY NGAY LẬP TỨC 1 LẦN KHI BẬT BOT ĐỂ UPDATE DATA MỚI NHẤT
    updateControllerLeaderboardEmbed();
    updatePilotLeaderboardEmbed();
    runVatseaUpdate(); // <-- KÉO VATSEA VÀO ĐÂY
    console.log(`[Leaderboard] Đã cập nhật phát súng đầu tiên khi khởi động bot.`);

    // 2. TỰ ĐỘNG TÍNH TOÁN ĐỂ CANH ĐÚNG GIỜ CHẴN TIẾP THEO
    const now = new Date();
    const msUntilNextHour = (60 - now.getMinutes()) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds();

    console.log(`[Leaderboard] Bộ hẹn giờ thông minh đã bật! Sẽ tự động canh và cập nhật vào ĐÚNG GIỜ CHẴN tiếp theo sau: ${Math.round(msUntilNextHour / 60000)} phút nữa.`);

    // 3. ĐỢI ĐẾN ĐÚNG GIỜ CHẴN TIẾP THEO (VD: ĐÚNG 8h00 TỐI) THÌ KHÓA VÒNG LẶP
    setTimeout(() => {
      updateControllerLeaderboardEmbed();
      updatePilotLeaderboardEmbed();
      runVatseaUpdate(); // <-- KÉO VATSEA VÀO ĐÂY
      console.log(`[Leaderboard] Đã chạm mốc giờ chẵn! Bắt đầu khóa vòng lặp chuẩn 1 tiếng/lần.`);

      // Từ giây phút này trở đi, cứ đúng 60 phút (9h00, 10h00, 11h00...) là nó tự nã lệnh
      setInterval(() => {
        updateControllerLeaderboardEmbed();
        updatePilotLeaderboardEmbed();
        runVatseaUpdate(); // <-- KÉO VATSEA VÀO ĐÂY
        console.log(`[Leaderboard] Cập nhật định kỳ giờ chẵn thành công.`);
      }, 60 * 60 * 1000);

    }, msUntilNextHour);
  }

  // =========================================================================
  // restore bans timeouts
  for (const [userId, ban] of Object.entries(bans.users)) {
    const timeLeft = ban.endTime - Date.now();
    if (timeLeft > 0) setTimeout(() => unbanUser(userId), timeLeft);
    else unbanUser(userId);
  }

  // Chạy quét role tự động sau khi bot bật lên 20 giây (tránh bị kẹt rate limit lúc mới bật)
  setTimeout(() => {
    scanAndAssignPendingRole();
  }, 20000);

  // Cài đặt quét định kỳ mỗi 6 tiếng một lần để phòng hờ có ai bị sót
  setInterval(() => {
    scanAndAssignPendingRole();
  }, 6 * 60 * 60 * 1000);

  // Vòng lặp check thông báo hẹn giờ mỗi 60 giây
  setInterval(async () => {
    const now = Date.now();
    let hasChanges = false;

    for (let i = scheduledAnnouncements.length - 1; i >= 0; i--) {
      const ann = scheduledAnnouncements[i];
      if (now >= ann.time) {
        try {
          const targetChannel = await client.channels.fetch(ann.channelId);
          
          const safeContent = (ann.content && ann.content.trim() !== '') ? ann.content : ' ';
          const payload = { content: safeContent, allowedMentions: { parse: ['roles', 'users', 'everyone'] } };

          if (ann.imageUrl) {
            // 🚀 Bắn link ImgBB bất tử vào Embed, máy chủ Discord sẽ tự render ảnh!
            payload.embeds = [
                new EmbedBuilder()
                    .setImage(ann.imageUrl)
                    .setColor(0x2b2d31)
            ];
          }

          await targetChannel.send(payload);
        } catch (err) {
          console.error(`Lỗi gửi thông báo đã lên lịch (ID: ${ann.id}):`, err);
        }
        scheduledAnnouncements.splice(i, 1);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await db.saveAnnouncements(scheduledAnnouncements);
    }
  }, 60 * 1000);

  // ==========================================
  // HỆ THỐNG THEO DÕI VÀ KICK PENDING ROLE (Mỗi 1 tiếng check 1 lần)
  // ==========================================
  setInterval(async () => {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) return;

    const now = Date.now();
    let isModified = false;
    const SERVER_INVITE_LINK = "https://discord.gg/CD6D46zM9R";

    for (const [userId, data] of Object.entries(pendingUsersData)) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);

        // Nếu user đã thoát server hoặc đã có role Member -> Xóa khỏi danh sách theo dõi
        if (!member || member.roles.cache.has(roles.basicMemberRoleId)) {
          delete pendingUsersData[userId];
          isModified = true;
          continue;
        }

        const elapsedMs = now - data.joinDate;
        const daysElapsed = elapsedMs / (1000 * 60 * 60 * 24);

        // 1. Kick (Sau đúng 8 ngày - Hết 1 ngày gia hạn)
        if (daysElapsed >= 8) {
          try {
            await member.send(t(interaction, 'STR_F195E1CE', { v0: SERVER_INVITE_LINK }));
          } catch (e) { }

          await member.kick("Không xin role Member sau 8 ngày");
          delete pendingUsersData[userId];
          isModified = true;
          console.log(`👢 [Auto-Kick] Đã kick ${member.user.tag} vì không xin role sau 8 ngày.`);
          continue;
        }

        // 2. Nhắc nhở tối hậu thư (Sau 7 ngày)
        if (daysElapsed >= 7 && !data.notified7Days) {
          try {
            await member.send(t(interaction, 'STR_48FFD483'));
          } catch (e) { }
          data.notified7Days = true;
          isModified = true;
        }

        // 3. Nhắc nhở 5 ngày
        if (daysElapsed >= 5 && daysElapsed < 7 && !data.notified5Days) {
          try {
            await member.send(t(interaction, 'STR_D5172757'));
          } catch (e) { }
          data.notified5Days = true;
          isModified = true;
        }

      } catch (err) {
        console.error(`Lỗi hệ thống nhắc nhở role cho ID ${userId}:`, err);
      }
    }

    if (isModified) savePendingUsers();
  }, 60 * 60 * 1000); // 1 giờ chạy 1 lần

  // ensure messages exist for editing
  await ensureVatsimMessageExists();
  await ensureLeaderboardMessagesExist();
  await loadAllLeaderboards(); // Đợi bot kéo xong data Sheets rồi...

  startHourlyLeaderboard(); // ...thì mới được nổ súng cập nhật Leaderboard!
  startDailyCasinoLeaderboard();
  await ensureACDMMessageExists();

  // Thêm dòng này để bật kết nối lấy dữ liệu ACDM liên tục
  await setupACDMStream();

  // Kích hoạt cập nhật House Stats lần đầu khi bot vừa online
  setTimeout(() => updateServerStats(client), 5000); // Chờ 5s cho bot load xong dữ liệu

  // Cài đặt vòng lặp tự động cập nhật mỗi 15 phút (An toàn với Discord API)
  setInterval(() => {
    updateServerStats(client);
  }, 15 * 60 * 1000);

  // VATSIM update scheduling
  const vatsimPeriodMs = (process.env.VATSIM_UPDATE_MINUTES ? parseInt(process.env.VATSIM_UPDATE_MINUTES) : 1) * 60 * 1000;
  vatsimWorker.postMessage('update');
  setInterval(() => vatsimWorker.postMessage('update'), vatsimPeriodMs);
  console.log(`VATSIM updater running: immediate + every ${vatsimPeriodMs / 60000} minutes`);


  // Cập nhật dữ liệu thường xuyên hơn (mỗi phút)
  setInterval(() => {
    // Gọi VATSIM worker để cập nhật controllers và pilots
    vatsimWorker.postMessage('update');
  }, 60 * 1000); // Mỗi phút


  console.log('Leaderboard updater scheduled: data every minute, embed every hour');

  // Clean up empty voice channels
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();

    channels.forEach(channel => {
      if (channel.type === ChannelType.GuildVoice &&
        channel.members.size === 0 &&
        channel.name.includes("'s Channel")) {
        channel.delete().catch(() => { });
        console.log(`Cleaned up empty voice channel: ${channel.name}`);
      }
    });
  } catch (err) {
    console.error('Error cleaning up voice channels:', err);
  }
});

// ===================== MEMBER JOIN / LEAVE (AUTO ROLE & LOG) =====================
client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;

  // 1. Tự động cấp Role Pending
  if (member.guild.id === GUILD_ID && roles.pendingRoleId) {
    setTimeout(async () => {
      try {
        await member.roles.add(roles.pendingRoleId);
        pendingUsersData[member.id] = {
          joinDate: member.joinedTimestamp || Date.now(),
          notified5Days: false,
          notified7Days: false
        };
        savePendingUsers();

        try {
          await member.send(t(interaction, 'STR_DFD57495'));
        } catch (dmErr) {
          console.log(`[Auto-Role] Không thể gửi DM cho ${member.user.tag}`);
        }
      } catch (err) { }
    }, 2000);
  }

  // 2. Gửi Log báo cáo (1 lần duy nhất)
  const embed = createLogEmbed(
    '📥 Member Joined',
    `**User:** ${getUserIdentifier(member.user)}\n**ID:** ${member.user.id}\n**Account created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    0x2ecc71
  );
  await sendLog(embed);
});

client.on('guildMemberRemove', async (member) => {
  // Lấy danh sách role, loại bỏ role @everyone (vì ai cũng có)
  const roleList = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .map(r => `<@&${r.id}>`)
    .join(', ') || 'Không có role nào';

  const embed = createLogEmbed(
    '📤 Member Left',
    `**User:** ${getUserIdentifier(member.user)}\n**Joined server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n**Roles trước khi out:**\n${roleList}`,
    0xe74c3c
  );
  await sendLog(embed);
});

// ===================== DỌN RÁC BOT NHẠC KHI BỊ KICK / RỚT MẠNG =====================
client.on('voiceStateUpdate', (oldState, newState) => {
  // Nếu BOT bị Kick ra khỏi phòng Voice hoặc rớt mạng văng ra ngoài
  if (oldState.member.user.id === client.user.id && !newState.channelId) {
    const queue = musicQueues.get(oldState.guild.id);
    if (queue) {
      if (queue.progressInterval) clearInterval(queue.progressInterval);
      if (queue.player) queue.player.stop();
      musicQueues.delete(oldState.guild.id);
      console.log(`🧹 [Music] Đã dọn dẹp sạch sẽ hàng chờ tại server ${oldState.guild.name} do Bot rời phòng.`);
    }
  }
});

// ===================== INTERACTIONS =====================
client.on('interactionCreate', async (interaction) => {
  // XỬ LÝ KHI NGƯỜI DÙNG CHỌN 1 BÀI TỪ MENU
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_song') {
    const [searchId, index] = interaction.values[0].split('_');
    const songs = temporarySearchResults.get(searchId);

    if (!songs) return interaction.reply({ content: '❌ Danh sách đã hết hạn (sau 1 phút)!', ephemeral: true });

    const selectedSong = songs[index];
    let queue = musicQueues.get(interaction.guild.id);
    if (!queue) return interaction.reply({ content: '❌ Bot chưa kết nối vào phòng thoại.', ephemeral: true });

    // Bơm bài hát đã chọn vào hàng chờ
    queue.songs.push(selectedSong);

    interaction.update({ content : t(interaction, 'STR_1A61A0B7', { v0: selectedSong.title }), components: [] });

    // Kích hoạt hát ngay nếu bot đang nghỉ
    if (queue.songs.length === 1 || !queue.playing) {
      playNextSong(interaction.guild.id);
    } else {
      if (queue.dashboardMsg) queue.dashboardMsg.edit(createMusicDashboard(queue)).catch(() => { });
    }
    setTimeout(() => temporarySearchResults.delete(searchId), 60000);
  }

  // XỬ LÝ KHI NGƯỜI DÙNG BẤM "PHÁT TOÀN BỘ PLAYLIST"
  if (interaction.isButton() && interaction.customId.startsWith('play_all_')) {
    const searchId = interaction.customId.split('_')[2];
    const songs = temporarySearchResults.get(searchId);

    if (!songs) return interaction.reply({ content: '❌ Danh sách đã hết hạn (sau 1 phút)!', ephemeral: true });

    let queue = musicQueues.get(interaction.guild.id);
    if (!queue) return interaction.reply({ content: '❌ Bot chưa kết nối vào phòng thoại.', ephemeral: true });

    // Bơm CÙNG LÚC TOÀN BỘ 100 BÀI HÁT vào hàng chờ
    queue.songs.push(...songs);

    interaction.update({ content : t(interaction, 'STR_BB4AF479', { v0: songs.length }), components: [] });

    // Kích hoạt hát ngay nếu bot đang nghỉ
    if (queue.songs.length === songs.length || !queue.playing) {
      playNextSong(interaction.guild.id);
    } else {
      if (queue.dashboardMsg) queue.dashboardMsg.edit(createMusicDashboard(queue)).catch(() => { });
    }
    setTimeout(() => temporarySearchResults.delete(searchId), 60000);
  }

  const isChatCmd = typeof interaction.isChatInputCommand === 'function'
    ? interaction.isChatInputCommand()
    : (typeof interaction.isCommand === 'function' ? interaction.isCommand() : false);

  const isStringSelect = typeof interaction.isStringSelectMenu === 'function'
    ? interaction.isStringSelectMenu()
    : (typeof interaction.isSelectMenu === 'function' ? interaction.isSelectMenu() : false);

  if (!isChatCmd && !interaction.isButton?.() && !interaction.isModalSubmit?.() && !isStringSelect) return;
  if (isChatCmd) {
    // ===================== TỰ ĐỘNG GẮN ROLE CON NGHIỆN =====================
    const casinoCommands = ['taisiu', 'baucua', 'blackjack', 'poker', 'roulette', 'oantuti', 'vietlott', 'baicao', 'coinflip', 'jackpot'];
    
    if (casinoCommands.includes(interaction.commandName)) {
        // SẾP THAY ID ROLE "CON NGHIỆN" CỦA SẾP VÀO ĐÂY NHÉ:
        const CON_NGHIEN_ROLE_ID = '1524980931067379732'; 
        
        try {
            const member = interaction.member;
            if (member && !member.roles.cache.has(CON_NGHIEN_ROLE_ID)) {
                await member.roles.add(CON_NGHIEN_ROLE_ID);
                console.log(`[Casino] Đã phát hiện và đóng mộc "Con Nghiện" cho ${interaction.user.tag}`);
            }
        } catch (err) {
            console.error('Lỗi khi tự động cấp role Con Nghiện:', err.message);
        }
    }
    // =========================================================================
    const embed = createLogEmbed(
      '💻 Command Executed',
      `**User:** ${getUserIdentifier(interaction.user)}\n**Command:** /${interaction.commandName}\n**Channel:** ${getChannelIdentifier(interaction.channel)}`,
      0x1abc9c
    );

    // Thêm options nếu có
    const options = interaction.options.data;
    if (options.length) {
      const optsText = options.map(opt => {
        if (opt.type === 'SUB_COMMAND') return `/${opt.name}`;
        return `${opt.name}: ${opt.value}`;
      }).join(', ');
      embed.addFields({ name: 'Options', value: optsText.substring(0, 1024), inline: false });
    }

    await sendLog(embed);
  };
  try {
    if (isChatCmd) {
      switch (interaction.commandName) {
        case 'give_role':
          await handleRequestRole(interaction);
          break;
        case 'group_flight':
          await handleGroupFlight(interaction);
          break;
        case 'send_announcements':
          await handleAnnouncement(interaction);
          break;
        case 'metar':
          await handleMetar(interaction);
          break;
        case 'submit_profile':
          await handleSubmitProfile(interaction);
          break;
        case 'time':
          await handleTimeCommand(interaction);
          break;
        case 'summarize':
          await handleSummarize(interaction);
          break;
        case 'leaderboard':
          await handleLeaderboardCommand(interaction);
          break;
        case 'pilot_leaderboard':
          await handlePilotLeaderboardCommand(interaction);
          break;
        case 'send_award':
          await handleSendAward(interaction);
          break;
        case 'runway':
          await handleRunway(interaction);
          break;
        case 'taf':
          await handleTaf(interaction);
          break;
        case 'setup_atc_noti':
          await handleSetupAtcNoti(interaction);
          break;
        case 'stats':
          await handleStats(interaction);
          break;
        case 'event':
          await handleEvent(interaction);
          break;
        case 'route':
          await handleRoute(interaction);
          break;
        case 'edit_announ':
          await handleEditAnnoun(interaction);
          break;
        case 'cancel_announ':
          await handleCancelAnnoun(interaction);
          break;
        case 'vatsea_rank':
          await handleVatseaRankCommand(interaction);
          break;
        case 'notam':
          await handleNotam(interaction);
          break;
        case 'simbrief':
          await handleSimbrief(interaction);
          break;
        case 'online_atc':
          await handleOnlineAtc(interaction);
          break;
        case 'play':
          await handlePlayMusic(interaction);
          break;
        case 'queue':
          await handleQueue(interaction);
          break;
        case 'clear':
          await handleClearQueue(interaction);
          break;
        case 'setup_vatsim_verify':
          await handleSetupVatsimVerify(interaction);
          break;
        case 'atc_profile':
          await handleAtcProfile(interaction);
          break;
        case 'atis_vatsim':
          await handleAtisVatsim(interaction);
          break;
        case 'ivao_atc':
          await handleIvaoAtc(interaction);
          break;
        case 'ivao_atis':
          await handleIvaoAtis(interaction);
          break;
        case 'real_flight':
          await handleRealFlight(interaction);
          break;
        case 'balance':
            await handleBalance(interaction);
            break;
        case 'coinflip':
          await handleCoinflip(interaction);
          break;
        case 'jackpot':
          await handleSlot(interaction);
          break;
        case 'daily':
          await handleDaily(interaction);
          break;
        case 'give_cash':
          await handleGiveCash(interaction);
          break;
        case 'add_cash':
          await handleAddCash(interaction);
          break;
        case 'taisiu':
          await handleTaiSiu(interaction);
          break;
        case 'baucua':
          await handleBauCua(interaction);
          break;
        case 'blackjack':
          await handleBlackjack(interaction);
          break;
        case 'poker':
          await handlePoker(interaction);
          break;
        case 'work':
          await handleWork(interaction);
          break;
        case 'roulette':
          await handleRoulette(interaction);
          break;
        case 'oantuti':
          await handleOanTuTi(interaction);
          break;
        case 'vietlott':
          await handleVietlott(interaction);
          break;
        case 'baicao': 
          await handleBaiCao(interaction); 
          break;
        case 'check_balance':
          await handleCheckBalance(interaction);
          break;
        case 'clear_balance':
          await handleClearBalance(interaction);
          break;
        case 'set_lang': {
          const chosenLang = interaction.options.getString('lang');
          
          // Cập nhật bộ nhớ RAM
          userLangs[interaction.user.id] = chosenLang;
          
          // Lưu thẳng lên MongoDB cho bất tử
          await db.saveBotConfig('user_langs', userLangs);

          // Gắn ngay ngôn ngữ mới
          interaction.userLang = chosenLang;

          if (chosenLang === 'vi') {
            await interaction.reply({ content: '✅ Đã đổi ngôn ngữ giao diện bot sang **Tiếng Việt**!', ephemeral: true });
          } else {
            await interaction.reply({ content: '✅ Bot interface language has been changed to **English**!', ephemeral: true });
          }
          break;
        }
        case 'sell': {
          const anh1 = interaction.options.getAttachment('anh1');
          const anh2 = interaction.options.getAttachment('anh2');
          const anh3 = interaction.options.getAttachment('anh3');
          const anh4 = interaction.options.getAttachment('anh4');

          const attachments = [anh1, anh2, anh3, anh4].filter(a => a && a.contentType?.startsWith('image')).map(a => a.url);

          if (attachments.length === 0) {
            return interaction.reply({ content: '❌ Bạn phải gửi ít nhất 1 ảnh (định dạng hình ảnh)!', ephemeral: true });
          }

          const saleId = Date.now().toString();
          userSellImages.set(saleId, attachments);

          const sellModal = new ModalBuilder().setCustomId(`sell_modal_${saleId}`).setTitle('Thông tin sản phẩm đăng bán');
          sellModal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel(t(interaction, 'STR_DB91BB37')).setPlaceholder(t(interaction, 'STR_697C39D0')).setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel(t(interaction, 'STR_ADFCBD3F')).setPlaceholder(t(interaction, 'STR_DE88C35A')).setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel(t(interaction, 'STR_6430156F')).setPlaceholder(t(interaction, 'STR_48D3C539')).setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel(t(interaction, 'STR_168E3133')).setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel(t(interaction, 'STR_758C766E')).setPlaceholder(t(interaction, 'STR_4DBA7A3E')).setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
          await interaction.showModal(sellModal);
          break;
        }
      }
    } else if (interaction.isButton()) {
      const customId = interaction.customId;

      // ===================== XỬ LÝ NÚT BẤM CỦA TRÌNH PHÁT NHẠC (ĐỂ NGOÀI CÙNG) =====================
      if (customId.startsWith('music_')) {
        const queue = musicQueues.get(interaction.guild.id);
        if (!queue) {
          return interaction.reply({ content: '❌ Nhạc đang tắt, bạn không thể bấm nút này.', ephemeral: true }).catch(() => { });
        }

        if (interaction.member.voice.channel?.id !== queue.voiceChannel.id) {
          return interaction.reply({ content: '❌ Bạn phải vào chung phòng Voice với bot mới điều khiển được!', ephemeral: true }).catch(() => { });
        }

        try {
          if (customId === 'music_pause') {
            if (queue.playing) {
              queue.player.pause(); queue.playing = false;
            } else {
              queue.player.unpause(); queue.playing = true;
            }
          }
          else if (customId === 'music_skip') {
            queue.forceSkip = true; // Dù đang bật Loop, bấm Skip vẫn phải qua bài mới!
            queue.player.stop();
            return interaction.deferUpdate().catch(() => { });
          }
          else if (customId === 'music_stop') {
            if (queue.progressInterval) clearInterval(queue.progressInterval);
            queue.songs = [];
            queue.player.stop();
            return interaction.update(createMusicDashboard(queue)).catch(() => { });
          }
          else if (customId === 'music_loop') {
            queue.loop = !queue.loop; // Bật / Tắt trạng thái lặp
          }
          else if (customId === 'music_volup') {
            queue.volume = Math.min((queue.volume ?? 0.6) + 0.2, 2.0);
            if (queue.resource) queue.resource.volume.setVolume(queue.volume);
          }
          else if (customId === 'music_voldown') {
            queue.volume = Math.max((queue.volume ?? 0.6) - 0.2, 0.1);
            if (queue.resource) queue.resource.volume.setVolume(queue.volume);
          }

          // Cập nhật giao diện nút bấm
          await interaction.update(createMusicDashboard(queue)).catch(() => { });

        } catch (e) {
          console.error("Lỗi nút bấm nhạc:", e);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate().catch(() => { });
          }
        }
        return;
      }

      if (interaction.customId.startsWith('ann_editai_')) {
        const reqId = interaction.customId.replace('ann_editai_', '');
        const data = pendingAnnouncements.get(reqId);
        if (!data) return interaction.reply({ content: '❌ Phiên đã hết hạn.', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`modalai_${reqId}`)
          .setTitle('Sửa nội dung AI');

        const textInput = new TextInputBuilder()
          .setCustomId('ai_text')
          .setLabel(t(interaction, 'STR_8D57EC36'))
          .setStyle(TextInputStyle.Paragraph)
          .setValue(data.aiMessage.substring(0, 4000))
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        await interaction.showModal(modal);
        return; // Dừng tại đây
      }

      // ===================== XỬ LÝ NÚT BẤM MARKETPLACE =====================
      const isMarketplaceAction = customId.startsWith('market_');
      if (isMarketplaceAction) {
        const parts = customId.split('_');
        const action = parts[1];

        // Nút [Sửa bài], [DUYỆT], [TỪ CHỐI] -> Yêu cầu quyền Admin
        if (action === 'edit' || action === 'approve' || action === 'reject') {
          const hasAdmin = interaction.member.roles.cache.some(r => r.name === 'Admin') || interaction.member.roles.cache.has(roles.adminRoleId);
          if (!hasAdmin && interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '❌ Chỉ Admin mới được thực hiện thao tác này!', ephemeral: true });
          }
        }

        const oldEmbed = interaction.message.embeds[0];
        const parsedData = parseMarketplaceDataFromEmbed(oldEmbed);

        if (action === 'edit') {
          const saleId = parts[2];
          const editModal = new ModalBuilder().setCustomId(`market_edit_modal_${saleId}`).setTitle('Chỉnh sửa thông tin sản phẩm');
          editModal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel(t(interaction, 'STR_DB91BB37')).setDefaultValue(parsedData.name).setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel(t(interaction, 'STR_ADFCBD3F')).setDefaultValue(parsedData.info).setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel(t(interaction, 'STR_6430156F')).setDefaultValue(parsedData.price).setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel(t(interaction, 'STR_168E3133')).setDefaultValue(parsedData.description).setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel(t(interaction, 'STR_9276B119')).setDefaultValue(parsedData.contact).setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
          await interaction.showModal(editModal);
          return;
        }

        if (action === 'reject') {
          const saleId = parts[2];
          const rejectModal = new ModalBuilder().setCustomId(`market_reject_modal_${saleId}`).setTitle('Lý do từ chối sản phẩm');
          rejectModal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel(t(interaction, 'STR_7AB1EC02')).setPlaceholder(t(interaction, 'STR_FF829A05')).setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
          await interaction.showModal(rejectModal);
          return;
        }

        if (action === 'approve') {
          const marketChannel = interaction.guild.channels.cache.get(MARKETPLACE_CHANNEL_ID);
          if (!marketChannel) return interaction.reply({ content: '❌ Không tìm thấy kênh Marketplace!', ephemeral: true });

          const publicEmbed = EmbedBuilder.from(oldEmbed)
            .setFooter({ text: `Ngày đăng: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` });

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel(t(interaction, 'STR_8473213A')).setStyle(ButtonStyle.Link).setURL(`https://discord.com/users/${parsedData.sellerId}`).setEmoji('💬'),
            new ButtonBuilder().setCustomId(`market_soldout_${parsedData.sellerId}`).setLabel(t(interaction, 'STR_6B7B0658')).setStyle(ButtonStyle.Danger).setEmoji('✖️')
          );

          await marketChannel.send({ content: '📢 **CÓ SẢN PHẨM MỚI!**', embeds: [publicEmbed], components: [row] });
          await interaction.message.edit({ content : t(interaction, 'STR_0477D27A', { v0: interaction.user.mention }), components: [], embeds: [] });
          await interaction.reply({ content: '✅ Đã đăng bài thành công ra kênh Marketplace!', ephemeral: true });
          return;
        }

        if (action === 'soldout') {
          const sellerId = parts[2];
          const hasAdmin = interaction.member.roles.cache.some(r => r.name === 'Admin') || interaction.member.roles.cache.has(roles.adminRoleId);
          const isSeller = interaction.user.id === sellerId;

          if (!isSeller && !hasAdmin && interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '❌ Chỉ người bán hoặc Admin mới được đóng bài!', ephemeral: true });
          }

          const soldEmbed = EmbedBuilder.from(oldEmbed)
            .setTitle(t(interaction, 'STR_431DDDA9', { v0: oldEmbed.title }))
            .setColor(0x95a5a6);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('disabled_sold').setLabel(t(interaction, 'STR_074F9349')).setStyle(ButtonStyle.Secondary).setDisabled(true)
          );

          await interaction.message.edit({ embeds: [soldEmbed], components: [row] });
          await interaction.reply({ content: '✅ Đã đóng bài đăng bán thành công.', ephemeral: true });
          return;
        }
      }

      // Nếu không dính vào Nút Nhạc và Nút Market, thì chạy vô hàm xử lý chung
      await handleButton(interaction);

    } else if (interaction.isModalSubmit()) {
      // Nộp đơn bán hàng
      if (interaction.customId.startsWith('sell_modal_')) {
        const saleId = interaction.customId.split('_')[2];
        const images = userSellImages.get(saleId) || [];
        userSellImages.delete(saleId);

        const data = {
          name: interaction.fields.getTextInputValue('name'),
          info: interaction.fields.getTextInputValue('info'),
          price: interaction.fields.getTextInputValue('price'),
          description: interaction.fields.getTextInputValue('description'),
          contact: interaction.fields.getTextInputValue('contact')
        };

        const embed = createMarketplaceEmbed(data, interaction.user.id, images);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`market_edit_${saleId}`).setLabel(t(interaction, 'STR_79486130')).setStyle(ButtonStyle.Secondary).setEmoji('📝'),
          new ButtonBuilder().setCustomId(`market_approve_${saleId}`).setLabel(t(interaction, 'STR_2C0CC944')).setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId(`market_reject_${saleId}`).setLabel(t(interaction, 'STR_86CF180D')).setStyle(ButtonStyle.Danger).setEmoji('❌')
        );

        const adminChannel = interaction.guild.channels.cache.get(ADMIN_CHANNEL_ID);
        if (adminChannel) {
          await adminChannel.send({ content : t(interaction, 'STR_C8E22486', { v0: interaction.user.id }), embeds: [embed], components: [row] });
        }
        await interaction.reply({ content: '✅ Đã gửi đơn đăng bán cho Admin duyệt!', ephemeral: true });
        return;
      }

      // Nộp form chỉnh sửa bài bán
      if (interaction.customId.startsWith('market_edit_modal_')) {
        const data = {
          name: interaction.fields.getTextInputValue('name'),
          info: interaction.fields.getTextInputValue('info'),
          price: interaction.fields.getTextInputValue('price'),
          description: interaction.fields.getTextInputValue('description'),
          contact: interaction.fields.getTextInputValue('contact')
        };

        const oldEmbed = interaction.message.embeds[0];
        const parsedData = parseMarketplaceDataFromEmbed(oldEmbed);
        const image = oldEmbed.image?.url ? [oldEmbed.image.url] : [];

        const newEmbed = createMarketplaceEmbed(data, parsedData.sellerId, image);
        await interaction.update({ embeds: [newEmbed] });
        return;
      }
      // Tình huống 1: Sửa thông báo cũ trên kênh
      if (interaction.customId.startsWith('editannoun_')) {
        const parts = interaction.customId.split('_');
        const channelId = parts[1];
        const messageId = parts[2];
        const newText = interaction.fields.getTextInputValue('new_content');

        try {
          const channel = await interaction.client.channels.fetch(channelId);
          const msg = await channel.messages.fetch(messageId);
          await msg.edit(newText);
          await interaction.reply({ content: '✅ Đã cập nhật thành công thông báo cũ!', ephemeral: true });
        } catch (err) {
          await interaction.reply({ content: '❌ Lỗi không sửa được tin nhắn (Có thể khác tác giả).', ephemeral: true });
        }
      }

      // Tình huống 2: Người dùng sửa xong bản AI, cập nhật lại màn hình Preview
      if (interaction.customId.startsWith('modalai_')) {
        const reqId = interaction.customId.replace('modalai_', '');
        const newText = interaction.fields.getTextInputValue('ai_text');
        const data = pendingAnnouncements.get(reqId);

        if (!data) return interaction.reply({ content: '❌ Phiên đã hết hạn.', ephemeral: true });

        // Lưu lại nội dung người dùng vừa sửa vào bộ nhớ tạm
        data.aiMessage = newText;
        pendingAnnouncements.set(reqId, data);

        // Cắt tỉa lại cho gọn bảng Preview (tránh sập bot)
        const previewRaw = data.rawMessage.length > 900 ? data.rawMessage.substring(0, 900) + '...\n[...]' : data.rawMessage;
        const previewAi = newText.length > 900 ? newText.substring(0, 900) + '...\n[...]' : newText;

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setDescription('✨ **Bạn đã tự chỉnh sửa lại bản AI.** Bạn chốt gửi đi chưa?')
          .setFields(
            { name: '📝 Bản gốc của bạn', value : t(interaction, 'STR_68A1141F', { v0: previewRaw }) },
            { name: '🤖 Bản do AI nâng cấp (ĐÃ SỬA)', value : t(interaction, 'STR_68A1141F', { v0: previewAi }) },
            { name: '⏰ Lịch trình', value: data.targetTime ? `<t:${Math.floor(data.targetTime / 1000)}:F>` : 'Gửi ngay lập tức' }
          )
          .setColor(0xf1c40f); // Đổi sang màu vàng cho biết là đã edit

        await interaction.update({ embeds: [embed] });
      }
      // Tình huống 3: Người dùng sửa thông báo Hẹn giờ (Scheduled)
      if (interaction.customId.startsWith('edit_sched_')) {
        const reqId = interaction.customId.replace('edit_sched_', '');
        const newText = interaction.fields.getTextInputValue('new_content');

        const scheduledIndex = scheduledAnnouncements.findIndex(a => a.id === reqId);
        if (scheduledIndex !== -1) {
          scheduledAnnouncements[scheduledIndex].content = newText;
          await db.saveAnnouncements(scheduledAnnouncements);
          await interaction.reply({ content: '✅ Đã cập nhật nội dung cho thông báo hẹn giờ thành công!', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Lịch trình này không còn tồn tại hoặc đã được gửi đi.', ephemeral: true });
        }
      }
      // Nộp form từ chối bài bán
      if (interaction.customId.startsWith('market_reject_modal_')) {
        const reason = interaction.fields.getTextInputValue('reason');
        const oldEmbed = interaction.message.embeds[0];
        const parsedData = parseMarketplaceDataFromEmbed(oldEmbed);

        let dmStatus = '';
        try {
          const seller = await client.users.fetch(parsedData.sellerId);
          const dmEmbed = new EmbedBuilder()
            .setTitle('❌ SẢN PHẨM BỊ TỪ CHỐI')
            .setColor(0xff0000)
            .addFields(
              { name: 'Sản phẩm', value: parsedData.name, inline: false },
              { name: 'Lý do từ chối', value: reason, inline: false }
            )
            .setFooter({ text: 'Vui lòng chỉnh sửa và gửi lại yêu cầu nếu cần thiết.' });
          await seller.send({ embeds: [dmEmbed] });
          dmStatus = `\n✅ Đã gửi lý do từ chối cho <@${parsedData.sellerId}>.`;
        } catch (e) {
          dmStatus = `\n⚠️ Bị bác bỏ nhưng không thể gửi tin nhắn riêng cho <@${parsedData.sellerId}> (Khóa DM).`;
        }

        await interaction.update({
          content : t(interaction, 'STR_8BBF9B01', { v0: parsedData.name, v1: parsedData.sellerId, v2: reason, v3: dmStatus }),
          embeds: [],
          components: []
        });
        return;
      }
      await handleModal(interaction);
    } else if (isStringSelect) {
      await handleSelect(interaction);
    }
  } catch (err) {
    console.error('interactionCreate error:', err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Đã có lỗi nội bộ.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Đã có lỗi nội bộ.', ephemeral: true });
      }
    } catch (_) { }
  }
});


// ===================== MESSAGE CREATE =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  if (bans.users[userId] && bans.users[userId].endTime > Date.now()) return;

  // ================= TÍNH NĂNG ĐỌC ẢNH & XÁC THỰC VATSIM TRONG DM =================
  if (!message.guild && pendingVerifyDMs.has(message.author.id)) {
    const verifySession = pendingVerifyDMs.get(message.author.id);

    if (Date.now() > verifySession.expires) {
      pendingVerifyDMs.delete(message.author.id);
      return message.reply(t(interaction, 'STR_ED1B3410'));
    }

    if (message.attachments.size === 0) {
      return message.reply(t(interaction, 'STR_9EA82672'));
    }

    const processingMsg = await message.reply(t(interaction, 'STR_DCE4DBAE'));

    try {
      const attachment = message.attachments.first();
      if (!attachment.contentType.startsWith('image/')) return processingMsg.edit('❌ File đính kèm không phải là hình ảnh.');

      const imgBuffer = await downloadBuffer(attachment.url);
      const base64Image = imgBuffer.toString('base64');

      // =========================================================================
      // KHỞI TẠO CÔNG CỤ BÁO CÁO ADMIN (GỬI THẲNG VÀO KÊNH TK-CHILL-ADMIN-BOT)
      // =========================================================================
      const adminChannel = client.channels.cache.get(ADMIN_CHANNEL_ID || '1448258683627638895');
      const notifyAdmin = (title, desc, color) => {
        if (adminChannel) {
          adminChannel.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] }).catch(() => { });
        }
      };

      // =========================================================================
      // CÂU LỆNH THẦN CHÚ ÉP GEMINI KIỂM DUYỆT ẢNH VÀ TRẢ VỀ JSON CHI TIẾT
      // =========================================================================
      const prompt = `Bạn là một hệ thống kiểm duyệt chống giả mạo. Bức ảnh này PHẢI LÀ giao diện chuẩn của trang cá nhân VATSIM (my.vatsim.net).
          Nhiệm vụ của bạn là trích xuất chính xác thông tin trên ảnh và trả về ĐÚNG ĐỊNH DẠNG JSON. Không giải thích thêm.
          LƯU Ý QUAN TRỌNG: VATSIM sử dụng mã viết tắt. Hãy trích xuất TÊN ĐẦY ĐỦ trên ảnh và cố gắng tự động dịch nó sang MÃ VIẾT TẮT chuẩn (VD: "Asia Pacific" -> "APAC", "West Asia" -> "WA", "South East Asia" -> "SEA", "Americas" -> "AMAS").
          Nếu ảnh là phong cảnh, meme, không có giao diện VATSIM, hãy trả về: {"fake": true}
          Nếu ảnh hợp lệ, hãy trả về JSON:
          {
            "fake": false,
            "cid": 1234567,
            "region_code": "Mã viết tắt (VD: APAC, AMAS, EMEA)",
            "division_code": "Mã viết tắt (VD: WA, SEA, JPN)",
            "raw_region": "Tên đầy đủ ghi trên ảnh (VD: Asia Pacific)",
            "raw_division": "Tên đầy đủ ghi trên ảnh (VD: West Asia)"
          }`;

      const imagePart = { inlineData: { data: base64Image, mimeType: attachment.contentType } };

      let aiExtractedText = '';
      try {
        // Bọc hàm retry: Nếu lỗi 503 nó sẽ tự động chờ 2s rồi thử lại, tối đa 5 lần!
        const aiResult = await retryWithBackoff(async () => {
          return await geminiModel.generateContent([prompt, imagePart]);
        }, 5, 2000);

        aiExtractedText = aiResult.response.text().trim();
      } catch (e) {
        return processingMsg.edit("❌ **Hệ thống đang quá tải!**\nBot đã cố gắng thử đập cửa nhà Louis Lì nhiều lần nhưng mà nó đang đi chơi rồi. Bạn vui lòng bấm nút xin role lại sau 5 phút nhé!");
      }

      // Xử lý dữ liệu JSON do AI trả về
      let aiData;
      try {
        const cleanText = aiExtractedText.replace(/```json/g, '').replace(/```/g, '').trim();
        aiData = JSON.parse(cleanText);
      } catch (e) {
        return processingMsg.edit("❌ Bot không thể đọc dữ liệu từ ảnh do ảnh bị mờ, nhòe hoặc lỗi cấu trúc. Vui lòng chụp rõ nét hơn.");
      }

      // Kiểm tra xem AI có chê ảnh fake không
      if (aiData.fake || !aiData.cid) {
        notifyAdmin('🚨 Cảnh báo: Ảnh không hợp lệ', `**User:** <@${message.author.id}>\n**Lý do:** Bức ảnh nộp lên không giống giao diện VATSIM hoặc bị cắt ghép sơ sài.`, 0xff0000);
        return processingMsg.edit(`❌ **BOT TỪ CHỐI XÁC THỰC!**\nBức ảnh này không giống giao diện chuẩn của trang my.vatsim.net hoặc cắt ghép quá sơ sài. Vui lòng chụp full màn hình rõ nét!`);
      }

      const aiCid = parseInt(aiData.cid);
      if (isNaN(aiCid) || aiCid < 10000) {
        notifyAdmin('🚨 Cảnh báo: Lỗi trích xuất CID', `**User:** <@${message.author.id}>\n**Lý do:** Bot không tìm thấy số CID hợp lệ trên ảnh.`, 0xffa500);
        return processingMsg.edit(`❌ **Xác thực thất bại!**\nBOT không thể tìm thấy mã số CID hợp lệ trong bức ảnh này. Vui lòng chụp lại rõ ràng hơn.`);
      }

      await processingMsg.edit(`🔍 BOT đã quét được CID: **${aiCid}**. Đang kiểm tra an ninh Sổ Đỏ và Đối chiếu chéo (Cross-check)...`);

      // ========================================================
      // CHỐNG TRỘM 1: KIỂM TRA SỔ ĐỎ XEM CID NÀY ĐÃ AI GIỮ CHƯA
      // ========================================================
      const currentVatsimLinks = await loadVatsimLinksSheet();

      const getCid = (val) => typeof val === 'object' ? val.cid : val;
      const existingData = currentVatsimLinks[message.author.id];
      const existingCid = existingData ? getCid(existingData) : null;

      if (existingCid && existingCid !== aiCid) {
        notifyAdmin('⚠️ Cảnh báo: Đổi CID trái phép', `**User:** <@${message.author.id}>\n**CID Cũ:** ${existingCid} | **CID Mới nộp:** ${aiCid}\n**Lý do:** Mỗi tài khoản Discord chỉ được giữ 1 CID duy nhất.`, 0xffa500);
        return processingMsg.edit(`❌ Cảnh báo! Bạn đã từng liên kết với CID **${existingCid}** rồi. Mỗi tài khoản Discord chỉ được giữ 1 CID duy nhất!`);
      }

      const isCidTaken = Object.values(currentVatsimLinks).some(val => getCid(val) === aiCid);
      if (isCidTaken && existingCid !== aiCid) {
        notifyAdmin('🚨 Cảnh báo: Trùng CID (Nghi vấn ăn cắp)', `**User:** <@${message.author.id}>\n**CID Khai báo:** ${aiCid}\n**Lý do:** CID này đã được một người khác trong Server liên kết từ trước.`, 0xff0000);
        return processingMsg.edit(`❌ CID **${aiCid}** đã được một người khác trong Server liên kết trước đó. Nếu bạn bị giả mạo, hãy báo Admin.`);
      }

      // ========================================================
      // CHỐNG TRỘM 2: ĐỐI CHIẾU CHÉO (CROSS-CHECK) CHỐNG F12 THÔNG MINH
      // ========================================================
      const stats = await fetchVatsimStatsById(aiCid);

      if (!stats) {
        notifyAdmin('🚨 Cảnh báo: Sai CID', `**User:** <@${message.author.id}>\n**CID Khai báo:** ${aiCid}\n**Lý do:** CID hoàn toàn không tồn tại trên hệ thống VATSIM.`, 0xff0000);
        return processingMsg.edit(`❌ CID **${aiCid}** không tồn tại trên hệ thống dữ liệu VATSIM.`);
      }
      if (stats.rating === 0) {
        notifyAdmin('🚨 Cảnh báo: Tài khoản bị khóa', `**User:** <@${message.author.id}>\n**CID Khai báo:** ${aiCid}\n**Lý do:** Tài khoản VATSIM này đang bị Suspended.`, 0xff0000);
        return processingMsg.edit(`❌ Tài khoản VATSIM của bạn hiện đang bị **Suspended**.`);
      }

      // Hàm chuẩn hóa chuỗi và tách lấy chữ cái đầu
      const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const makeInitials = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).map(w => w[0]).join('');

      const apiRegion = normalize(stats.region);
      const apiDiv = normalize(stats.division);

      const imgRegCode = normalize(aiData.region_code);
      const imgRegRaw = normalize(aiData.raw_region);
      const imgDivCode = normalize(aiData.division_code);
      const imgDivRaw = normalize(aiData.raw_division);
      const imgDivInitials = makeInitials(aiData.raw_division);

      // Logic kiểm tra Region Cực Thông Minh
      let isRegionMatch = false;
      if (apiRegion === imgRegCode || apiRegion === imgRegRaw || imgRegRaw.includes(apiRegion) || apiRegion.includes(imgRegRaw) || imgRegCode.includes(apiRegion)) isRegionMatch = true;
      if (apiRegion === 'apac' && (imgRegRaw.includes('asiapacific') || imgRegCode === 'apac')) isRegionMatch = true;
      if (apiRegion === 'amas' && (imgRegRaw.includes('americas') || imgRegCode === 'amas')) isRegionMatch = true;
      if (apiRegion === 'emea' && (imgRegRaw.includes('europe') || imgRegRaw.includes('africa') || imgRegRaw.includes('middle') || imgRegCode === 'emea')) isRegionMatch = true;

      // Logic kiểm tra Division Siêu Bao Dung
      let isDivMatch = false;
      if (apiDiv === imgDivCode || apiDiv === imgDivRaw || imgDivRaw.includes(apiDiv) || apiDiv.includes(imgDivRaw) || imgDivCode.includes(apiDiv)) isDivMatch = true;
      if (imgDivInitials === apiDiv || imgDivInitials.includes(apiDiv)) isDivMatch = true;

      // ĐẶC CÁCH CHO ANH EM VATSEA
      if (apiDiv === 'sea' && (imgDivRaw.includes('southeast') || imgDivCode.includes('vatsea') || imgDivCode === 'sea')) isDivMatch = true;
      if (apiDiv === 'wa' && imgDivRaw.includes('westasia')) isDivMatch = true;
      if (apiDiv === 'vatpac' && imgDivRaw.includes('australia')) isDivMatch = true;
      if (apiDiv === 'vatnz' && imgDivRaw.includes('newzealand')) isDivMatch = true;
      if (apiDiv === 'vatuk' && imgDivRaw.includes('unitedkingdom')) isDivMatch = true;

      if (!isRegionMatch || !isDivMatch) {
        await sendLog(createLogEmbed(
          '🚨 Gian lận Xác Thực VATSIM',
          `**User:** ${getUserIdentifier(message.author)}\n**CID Khai báo:** ${aiCid}\n\n**Lý do từ chối:** Có dấu hiệu dùng F12 (Inspect Element) để đổi mã CID.\n- Region trên ảnh: \`${aiData.raw_region} (${aiData.region_code})\` | Thực tế API: \`${stats.region}\`\n- Division trên ảnh: \`${aiData.raw_division} (${aiData.division_code})\` | Thực tế API: \`${stats.division}\``,
          0xff0000
        ));

        // BÁO CÁO ADMIN KÊNH RIÊNG
        notifyAdmin('🚨 Cảnh báo: F12 (Fake CID)', `**User:** <@${message.author.id}>\n**CID Khai báo:** ${aiCid}\n**Lý do:** Thông tin Region/Division trên ảnh không khớp dữ liệu API. Có dấu hiệu dùng F12.`, 0xff0000);

        return processingMsg.edit(`🚨 **PHÁT HIỆN GIAN LẬN!**\nThông tin Region/Division trên ảnh không khớp với dữ liệu gốc của CID **${aiCid}**. Vui lòng không sử dụng F12 để thay đổi mã nguồn trang web!`);
      }

      // ========================================================
      // KẾT THÚC ĐỐI CHIẾU - BẮT ĐẦU CẤP ROLE
      // ========================================================
      await processingMsg.edit(`✅ An ninh thông qua, dữ liệu khớp 100%! Đang tiến hành cấp Role...`);

      const guild = await client.guilds.fetch(verifySession.guildId);
      const member = await guild.members.fetch(message.author.id);
      let success = false;
      let finalReply = '';

      if (verifySession.roleType === 'pilot') {
        if (stats.pilot_hours > 10) {
          await member.roles.add(roles.vatsimPilotRoleId).catch(() => { });
          success = true;
          finalReply = `🎉 **XÁC THỰC THÀNH CÔNG!**\nBạn có **${stats.pilot_hours.toFixed(1)}** giờ bay. Đã tự động cấp Role **VATSIM Pilot** cho bạn trong Server!`;
        } else {
          notifyAdmin('⚠️ Cảnh báo: Chưa đủ giờ bay Pilot', `**User:** <@${message.author.id}>\n**CID:** ${aiCid}\n**Lý do:** Mới có ${stats.pilot_hours.toFixed(1)} giờ bay (Yêu cầu > 10).`, 0xffa500);
          finalReply = `❌ Từ chối: Ảnh chính chủ, nhưng bạn mới có **${stats.pilot_hours.toFixed(1)}** giờ bay. Cần >10 giờ để nhận role Pilot.`;
        }
      } else {
        if (stats.rating > 1) {
          await member.roles.add(roles.vatsimAtcRoleId).catch(() => { });
          success = true;
          finalReply = `🎉 **XÁC THỰC THÀNH CÔNG!**\nRating của bạn hợp lệ. Đã tự động cấp Role **VATSIM ATC** cho bạn trong Server!`;
        } else {
          notifyAdmin('⚠️ Cảnh báo: Chưa đủ Rating ATC', `**User:** <@${message.author.id}>\n**CID:** ${aiCid}\n**Lý do:** Rating đang là OBS (Yêu cầu >= S1).`, 0xffa500);
          finalReply = `❌ Từ chối: Ảnh chính chủ, nhưng Rating của bạn là OBS. Yêu cầu >= S1.`;
        }
      }

      // ========================================================
      // UPLOAD ẢNH LÊN IMGBB LẤY LINK VĨNH VIỄN & LƯU GOOGLE SHEETS
      // ========================================================
      await processingMsg.edit(`✅ Quá trình duyệt hoàn tất!`);

      let permanentImageUrl = attachment.url;
      try {
        if (process.env.IMGBB_API_KEY) {
          const params = new URLSearchParams();
          params.append('image', base64Image);
          const fetch = require('node-fetch');
          const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, { method: 'POST', body: params });
          const imgbbData = await imgbbRes.json();
          if (imgbbData && imgbbData.data && imgbbData.data.url) {
            permanentImageUrl = imgbbData.data.url;
          }
        }
      } catch (imgErr) { console.error('Lỗi up ảnh lên ImgBB:', imgErr); }

      // LOGIC MỚI: CHỈ XÓA PHIÊN KHI THÀNH CÔNG, THẤT BẠI CHO THỬ LẠI
      if (success) {
        vatsimLinksCache[message.author.id] = {
          cid: aiCid,
          username: message.author.username,
          imageUrl: permanentImageUrl // Chỉ lưu link gốc dạng Text
        };
        await saveVatsimLinksSheet(vatsimLinksCache).catch(e => console.log('Lỗi lưu sheet CID:', e));

        // Tắt cái báo thức 5 phút đi vì đã xác thực xong
        if (verifySession.timeoutId) clearTimeout(verifySession.timeoutId);

        // BÁO CÁO ADMIN THÀNH CÔNG
        notifyAdmin('✅ Xác thực VATSIM thành công', `**User:** <@${message.author.id}>\n**Role vừa cấp:** VATSIM ${verifySession.roleType.toUpperCase()}\n**CID:** ${aiCid}`, 0x2ecc71);

        // Dọn dẹp RAM
        pendingVerifyDMs.delete(message.author.id);
        return processingMsg.edit(finalReply);
      } else {
        // Nếu thất bại (chưa đủ giờ bay, rating thấp...), KHÔNG xóa RAM
        return processingMsg.edit(finalReply + `\n\n🔄 *Bạn vẫn có thể gửi lại ảnh khác để thử lại (trong thời hạn 5 phút).*`);
      }

    } catch (err) {
      console.error("Lỗi xác thực DM:", err);
      return processingMsg.edit("❌ Đã có lỗi xảy ra trong quá trình quét. \n\n🔄 *Bạn có thể đính kèm lại ảnh để thử lại ngay bây giờ!*");
    }
  }

  // ================= TÍNH NĂNG 3: ANTI SPAM @everyone / @here =================
  const isEveryoneOrHere = message.mentions.everyone || message.content.includes('@everyone') || message.content.includes('@here');

  if (isEveryoneOrHere) {
    const hasAdmin = message.member?.roles.cache.has(roles.adminRoleId);
    const hasDev = message.member?.roles.cache.has(roles.devRoleId);
    const hasStaff = message.member?.roles.cache.has('1493908725231128617');
    const hasBotNgao = message.member?.roles.cache.has('1366035755079696405');
    const isOwner = message.author.id === OWNER_ID;

    // Nếu không có quyền mà dám ping tổng -> Xóa và Log
    if (!hasAdmin && !hasDev && !hasStaff && !hasBotNgao && !isOwner) {
      await message.delete().catch(() => { });

      const adminChannel = message.guild.channels.cache.get(ADMIN_CHANNEL_ID || '1448258683627638895');
      if (adminChannel) {
        adminChannel.send(t(interaction, 'STR_7CE2E5E0', { v0: message.author, v1: message.author.id, v2: message.channel, v3: message.content }));
      }
      return;
    }
  }

  // KHAI BÁO 1 LẦN DUY NHẤT Ở ĐÂY ĐỂ DÙNG CHUNG CHO CẢ QUOTE LẪN AI CHAT
  const isMentionedExplicitly = message.content.includes(`<@${client.user.id}>`) || message.content.includes(`<@!${client.user.id}>`);

  // ================= TÍNH NĂNG 1: RÀNG BUỘC AI CHAT =================
  if (message.channel.id === AI_CHANNEL_ID) {
    await handleGeminiResponse(message, true);
    return;
  }

  if (isMentionedExplicitly) {
    await handleGeminiResponse(message, false);
  }

  // Debug command for owner
  if (message.content === '!debug_pilot_leaderboard' && message.author.id === OWNER_ID) {
    const embed = new EmbedBuilder()
      .setTitle('Debug Pilot Leaderboard Data')
      .setDescription(t(interaction, 'STR_BD04F904'))
      .setColor(0xFF0000);

    const pilotEntries = Object.entries(pilotLeaderboardData.pilots || {});

    if (pilotEntries.length === 0) {
      embed.addFields({ name: 'Pilots', value: 'Không có dữ liệu', inline: false });
    } else {
      let fieldValue = '';
      pilotEntries.slice(0, 10).forEach(([id, data]) => {
        const hours = (data.seconds / 3600).toFixed(2);
        fieldValue += `${data.name} (${id}) - ${data.seconds}s (${hours}h) - ${data.flights || 1} chuyến\n`;
      });
      embed.addFields({ name : t(interaction, 'STR_F04399DE', { v0: pilotEntries.length }), value: fieldValue || 'Không có', inline: false });
    }
    await message.channel.send({ embeds: [embed] });
  }
});

// ===================== /TIME =====================
async function handleTimeCommand(interaction) {
  const timeInfo = getCurrentTimeInfo();

  const embed = new EmbedBuilder()
    .setTitle('🕐 Thời Gian Hiện Tại')
    .setColor(0x00ff00)
    .addFields(
      { name: '⏰ Giờ địa phương (Việt Nam)', value: timeInfo.local, inline: false },
      { name: '🌐 Giờ UTC', value: timeInfo.utc, inline: false },
      { name: '📅 ISO 8601', value: timeInfo.iso, inline: false },
      { name: '🔢 Unix Timestamp', value: timeInfo.unix.toString(), inline: true },
      { name: '💬 Discord Format', value: timeInfo.discord, inline: false },
      {
        name: '📋 Chi tiết',
        value : t(interaction, 'STR_992D2BC1', { v0: timeInfo.detailed.dayOfWeek, v1: timeInfo.detailed.day, v2: timeInfo.detailed.monthName, v3: timeInfo.detailed.year, v4: timeInfo.detailed.hours
          .toString()
          .padStart(2, '0'), v5: timeInfo.detailed.minutes.toString().padStart(2, '0'), v6: timeInfo.detailed.seconds.toString().padStart(2, '0') }),
        inline: false,
      }
    )
    .setFooter({ text: 'Bot được cung cấp thông tin thời gian thực', iconURL: 'https://cdn-icons-png.flaticon.com/512/3114/3114840.png' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ===================== AWARD FUNCTIONS =====================
/**
 * Kiểm tra xem hôm nay có phải là ngày cuối tháng không
 */
function isLastDayOfMonth() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  // Nếu ngày mai là tháng khác, hôm nay là ngày cuối tháng
  return today.getUTCMonth() !== tomorrow.getUTCMonth();
}

/**
 * Lấy top 5 ATC từ leaderboard
 */
function getTop5ATC() {
  const allATC = {};

  // Tổng hợp thời gian từ tất cả các category
  for (const category in leaderboardData.stats) {
    const atcInCategory = leaderboardData.stats[category];
    for (const [cid, data] of Object.entries(atcInCategory)) {
      if (!allATC[cid]) {
        allATC[cid] = {
          name: data.name,
          totalSeconds: data.seconds,
          categories: [category],
          callsign: data.callsign
        };
      } else {
        allATC[cid].totalSeconds += data.seconds;
        if (!allATC[cid].categories.includes(category)) {
          allATC[cid].categories.push(category);
        }
      }
    }
  }

  // Sắp xếp theo thời gian giảm dần
  const sorted = Object.entries(allATC)
    .map(([cid, data]) => ({ cid, ...data }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  return sorted.slice(0, 5);
}

/**
 * Lấy top 5 pilot từ leaderboard
 */
function getTop5Pilots() {
  const pilotEntries = Object.entries(pilotLeaderboardData.pilots || {});

  // Sắp xếp theo thời gian giảm dần
  const sorted = pilotEntries
    .map(([cid, data]) => ({
      cid,
      name: data.name,
      totalSeconds: data.seconds,
      flights: data.flights || 1,
      callsign: data.callsign,
      aircraft: data.lastAircraft
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  return sorted.slice(0, 5);
}

/**
 * Format thời gian từ giây sang dạng đẹp
 */
function formatAwardTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours} giờ ${minutes} phút`;
  } else if (hours > 0) {
    return `${hours} giờ`;
  } else {
    return `${minutes} phút`;
  }
}

/**
 * Gửi thông báo award cho ATC
 */
async function sendATCAward(interaction = null) {
  try {
    const top5 = getTop5ATC();
    const currentMonth = leaderboardData.month || new Date().getUTCMonth() + 1;
    const currentYear = leaderboardData.year || new Date().getUTCFullYear();

    // Tên tháng bằng tiếng Việt
    const monthNames = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];
    const monthName = monthNames[currentMonth - 1];

    const embed = new EmbedBuilder()
      .setTitle('🏆 **THÔNG BÁO CHÚC MỪNG TOP 5 ATC** 🏆')
      .setDescription(t(interaction, 'STR_FF12B5C2', { v0: monthName, v1: currentYear }))
      .setColor(0xFFD700)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/2107/2107845.png')
      .setFooter({ text: 'VCLvACC - Member Iron Mic Awards', iconURL: 'https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960' })
      .setTimestamp();

    if (top5.length === 0) {
      embed.addFields({
        name: '📊 Kết quả',
        value: 'Không có dữ liệu ATC trong tháng này.',
        inline: false
      });
    } else {
      // Emoji cho các hạng
      const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

      top5.forEach((atc, index) => {
        const rank = rankEmojis[index] || `${index + 1}.`;
        const timeFormatted = formatAwardTime(atc.totalSeconds);
        const categories = atc.categories.join(', ');

        embed.addFields({
          name : t(interaction, 'STR_DCEE5CC3', { v0: rank, v1: atc.name, v2: atc.cid }),
          value : t(interaction, 'STR_4C7C8A73', { v0: timeFormatted, v1: categories, v2: atc.callsign || 'N/A' }),
          inline: false
        });
      });

      // Thêm thông điệp chúc mừng
      const winnerNames = top5.map(a => a.name).join(', ');
      embed.addFields({
        name: '🎊 Chúc mừng!',
        value : t(interaction, 'STR_DACD4359', { v0: winnerNames }),
        inline: false
      });
    }

    // Ping role Notification
    const pingContent = top5.length > 0 ?
      `🎉 <@&${ATC_NOTI_ROLE_ID}> Xin chúc mừng top 5 ATC của tháng!` :
      '📢 Thông báo kết quả ATC của tháng!';

    // Gửi thông báo
    const channelId = AWARD_CHANNEL_ID || VATSIM_CHANNEL_ID;
    const channel = await client.channels.fetch(channelId);
    const message = await channel.send({
      content: pingContent,
      embeds: [embed],
      allowedMentions: { parse: ['roles'] }
    });

    // Thêm reaction cho vui
    try {
      await message.react('🏆');
      await message.react('🎉');
      await message.react('👏');
    } catch (err) {
      console.log('Không thêm được reaction:', err.message);
    }

    // Nếu gọi từ interaction, reply
    if (interaction) {
      await interaction.reply({
        content : t(interaction, 'STR_67AD761E', { v0: channelId }),
        ephemeral: true
      });
    }

    console.log(`✅ Đã gửi thông báo award ATC cho tháng ${currentMonth}/${currentYear}`);
    return true;
  } catch (err) {
    console.error('Error sending ATC award:', err);
    if (interaction) {
      await interaction.reply({
        content: '❌ Đã có lỗi khi gửi thông báo award ATC!',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Gửi thông báo award cho pilot
 */
async function sendPilotAward(interaction = null) {
  try {
    const top5 = getTop5Pilots();
    const currentMonth = pilotLeaderboardData.month || new Date().getUTCMonth() + 1;
    const currentYear = pilotLeaderboardData.year || new Date().getUTCFullYear();

    // Tên tháng bằng tiếng Việt
    const monthNames = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];
    const monthName = monthNames[currentMonth - 1];

    const embed = new EmbedBuilder()
      .setTitle('✈️ **THÔNG BÁO CHÚC MỪNG TOP 5 PILOT** ✈️')
      .setDescription(t(interaction, 'STR_CF980B83', { v0: monthName, v1: currentYear }))
      .setColor(0x1E90FF)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/824/824100.png')
      .setFooter({ text: 'VCLvACC - Member Iron Mic Awards', iconURL: 'https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960' })
      .setTimestamp();

    if (top5.length === 0) {
      embed.addFields({
        name: '📊 Kết quả',
        value: 'Không có dữ liệu pilot trong tháng này.',
        inline: false
      });
    } else {
      // Emoji cho các hạng
      const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

      top5.forEach((pilot, index) => {
        const rank = rankEmojis[index] || `${index + 1}.`;
        const timeFormatted = formatAwardTime(pilot.totalSeconds);

        embed.addFields({
          name : t(interaction, 'STR_DCEE5CC3', { v0: rank, v1: pilot.name, v2: pilot.cid }),
          value : t(interaction, 'STR_CF820668', { v0: timeFormatted, v1: pilot.flights, v2: pilot.callsign || 'N/A' }),
          inline: false
        });
      });

      // Thêm thông điệp chúc mừng
      const winnerNames = top5.map(p => p.name).join(', ');
      embed.addFields({
        name: '🎊 Chúc mừng!',
        value : t(interaction, 'STR_C275C90D', { v0: winnerNames }),
        inline: false
      });
    }

    // Ping role Notification
    const pingContent = top5.length > 0 ?
      `🎉 <@&${ATC_NOTI_ROLE_ID}> Xin chúc mừng top 5 pilot của tháng!` :
      '📢 Thông báo kết quả pilot của tháng!';

    // Gửi thông báo
    const channelId = AWARD_CHANNEL_ID || VATSIM_CHANNEL_ID;
    const channel = await client.channels.fetch(channelId);
    const message = await channel.send({
      content: pingContent,
      embeds: [embed],
      allowedMentions: { parse: ['roles'] }
    });

    // Thêm reaction cho vui
    try {
      await message.react('✈️');
      await message.react('🎉');
      await message.react('🏆');
    } catch (err) {
      console.log('Không thêm được reaction:', err.message);
    }

    // Nếu gọi từ interaction, reply
    if (interaction) {
      await interaction.reply({
        content : t(interaction, 'STR_DD07FC4B', { v0: channelId }),
        ephemeral: true
      });
    }

    console.log(`✅ Đã gửi thông báo award pilot cho tháng ${currentMonth}/${currentYear}`);
    return true;
  } catch (err) {
    console.error('Error sending pilot award:', err);
    if (interaction) {
      await interaction.reply({
        content: '❌ Đã có lỗi khi gửi thông báo award pilot!',
        ephemeral: true
      });
    }
    return false;
  }
}

/**
 * Kiểm tra và gửi award tự động vào cuối tháng
 */
async function checkAndSendMonthlyAwards() {
  try {
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    // Kiểm tra xem đã gửi cho tháng này chưa
    if (awardSent.lastMonth === currentMonth && awardSent.lastYear === currentYear) {
      return; // Đã gửi rồi
    }

    // Kiểm tra xem hôm nay có phải là ngày cuối tháng không
    if (!isLastDayOfMonth()) {
      return; // Chưa phải cuối tháng
    }

    // Kiểm tra xem có dữ liệu để gửi không
    const hasATCData = Object.keys(leaderboardData.stats || {}).some(
      cat => Object.keys(leaderboardData.stats[cat] || {}).length > 0
    );
    const hasPilotData = Object.keys(pilotLeaderboardData.pilots || {}).length > 0;

    console.log(`[Monthly Award] Cuối tháng ${currentMonth}/${currentYear}, checking...`);
    console.log(`[Monthly Award] ATC data: ${hasATCData ? 'Có' : 'Không'}, Pilot data: ${hasPilotData ? 'Có' : 'Không'}`);

    // Gửi award nếu có dữ liệu
    let sentAny = false;

    if (hasATCData) {
      const sent = await sendATCAward();
      if (sent) sentAny = true;
    }

    if (hasPilotData) {
      const sent = await sendPilotAward();
      if (sent) sentAny = true;
    }

    // Lưu trạng thái đã gửi (LÊN MONGODB LUÔN CHO BẤT TỬ)
    if (sentAny) {
      awardSent = { lastMonth: currentMonth, lastYear: currentYear };
      await db.saveBotConfig('award_sent', awardSent); // Lưu lên MongoDB
      fs.writeFileSync(AWARD_SENT_FILE, JSON.stringify(awardSent, null, 2)); // Backup local
      console.log(`[Monthly Award] Đã gửi award và lưu trạng thái LÊN MONGODB cho tháng ${currentMonth}/${currentYear}`);
    }

  } catch (err) {
    console.error('Error in monthly award check:', err);
  }
}

/**
 * Reset trạng thái award (dành cho admin)
 */
async function resetAwardStatus() {
  awardSent = { lastMonth: null, lastYear: null };
  await db.saveBotConfig('award_sent', awardSent); // Đẩy reset lên MongoDB
  fs.writeFileSync(AWARD_SENT_FILE, JSON.stringify(awardSent, null, 2));
  console.log('✅ Đã reset trạng thái award trên MongoDB!');
}

// ===================== /SUMMARIZE =====================
async function handleSummarize(interaction) {
  try {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '❌ Lệnh này chỉ dùng trong server.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const durationStr = interaction.options.getString('duration', true);
    const durationMs = parseDurationToMs(durationStr);

    if (!durationMs || isNaN(durationMs) || durationMs <= 0) {
      return interaction.reply({
        content: '❌ Duration không hợp lệ. Ví dụ: `30m`, `2h`, `1d` (hoặc `45` = 45 phút).',
        ephemeral: true,
      });
    }

    const maxAllowed = 7 * 24 * 60 * 60 * 1000;
    if (durationMs > maxAllowed) {
      return interaction.reply({ content: '❌ Duration quá dài. Tối đa 7 ngày.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
      return interaction.reply({ content: '❌ Kênh này không phải text channel.', ephemeral: true });
    }

    const targetUser = sub === 'user' ? interaction.options.getUser('user', true) : null;

    await interaction.deferReply({ ephemeral: true });

    const sinceTs = Date.now() - durationMs;

    const raw = await fetchMessagesSince(channel, sinceTs, SUMMARY_MAX_MESSAGES);

    const msgs = raw
      .filter((m) => m.createdTimestamp >= sinceTs)
      .filter((m) => !m.author?.bot)
      .filter((m) => (targetUser ? m.author?.id === targetUser.id : true))
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    if (msgs.length === 0) {
      return interaction.editReply(t(interaction, 'STR_76B64DD4', { v0: durationStr, v1: channel.id })
      );
    }

    const { transcript, truncated } = buildTranscript(msgs, SUMMARY_MAX_TRANSCRIPT_CHARS);

    const prompt = `
Bạn là trợ lý tóm tắt nội dung chat Discord.
Hãy tóm tắt đoạn hội thoại dưới đây.

Bối cảnh:
- Kênh: #${channel.name}
- Khoảng thời gian: ${durationStr} gần nhất
- Đối tượng: ${targetUser ? `chỉ ${targetUser.username} (${targetUser.id})` : 'everyone'}

Yêu cầu:
- Viết tiếng Việt.
- Ngắn gọn, dễ đọc, ưu tiên bullet points.
- Bao gồm:
  1) Chủ đề chính
  2) Ý chính / thông tin quan trọng
  3) Quyết định / kết luận (nếu có)
  4) Việc cần làm (Action items) + ai làm (nếu thấy rõ)
  5) Câu hỏi còn bỏ ngỏ (nếu có)
- Không bịa thêm. Nếu thiếu thì nói "không rõ".
- Nếu có ICAO/route/METAR/link thì giữ nguyên.

TRANSCRIPT:
${transcript}
`;

    let summaryText = '';
    try {
      const result = await retryWithBackoff(async () => {
        return await geminiModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 700, temperature: 0.3 },
        });
      }, 5, 1200);

      const resp = result?.response;
      if (resp && typeof resp.text === 'function') summaryText = await resp.text();
      else summaryText = JSON.stringify(resp || result || {}).slice(0, 1500);

      summaryText = String(summaryText || '').trim();
    } catch (err) {
      const status = getErrStatus(err);
      console.error('Summarize Gemini error:', status, err?.message);

      if (status === 429) summaryText = '⚠️ AI đang bị quá tải (rate limit). Bạn thử lại sau 1–2 phút nhé.';
      else if (status === 503) summaryText = '⚠️ Dịch vụ AI đang quá tải. Bạn thử lại sau chút nha.';
      else summaryText = '⚠️ Không tóm tắt được do lỗi AI. Admin xem log giúp nhé.';
    }

    if (!summaryText) summaryText = '❌ Gemini trả về kết quả rỗng.';

    const header =
      `📝 **Tóm tắt ${durationStr} gần nhất** trong <#${channel.id}>` +
      (targetUser ? ` (chỉ <@${targetUser.id}>)` : ' (everyone)') +
      `\n📌 Số tin nhắn dùng để tóm tắt: **${msgs.length}** (cap tối đa: ${SUMMARY_MAX_MESSAGES})` +
      (truncated ? `\n⚠️ Transcript bị cắt bớt do quá dài (cap ${SUMMARY_MAX_TRANSCRIPT_CHARS} ký tự).` : '');

    const chunks = splitMessage(`${header}\n\n${summaryText}`, 1900);

    await interaction.editReply(chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }
  } catch (err) {
    console.error('handleSummarize error:', err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(t(interaction, 'STR_6D1095A6'));
      } else {
        await interaction.reply({ content: '❌ Tóm tắt thất bại do lỗi nội bộ. Admin kiểm tra log giúp nhé.', ephemeral: true });
      }
    } catch (_) { }
  }
}

// ===================== CONTROLLER LEADERBOARD COMMAND =====================
async function handleLeaderboardCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'show') {
    await updateControllerLeaderboardEmbed();
    await interaction.reply({ content: '✅ Controller Leaderboard đã được cập nhật!', ephemeral: true });

  } else if (subcommand === 'update') {
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);

    if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Bạn không có quyền cập nhật leaderboard.', ephemeral: true });
    }

    await updateControllerLeaderboardEmbed();
    await interaction.reply({ content: '✅ Controller Leaderboard đã được cập nhật!', ephemeral: true });

  } else if (subcommand === 'reset') {
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);

    if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Bạn không có quyền reset leaderboard.', ephemeral: true });
    }

    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();
    leaderboardData = {
      month: currentMonth,
      year: currentYear,
      stats: { Center: {}, Approach: {}, Tower: {}, Ground: {}, Other: {} }
    };
    await saveControllerLeaderboard(currentMonth, currentYear, leaderboardData.stats);
    await updateControllerLeaderboardEmbed();
    await interaction.reply({ content: '✅ Controller Leaderboard đã được reset!', ephemeral: true });
  }
}

// ===================== PILOT LEADERBOARD COMMAND =====================
async function handlePilotLeaderboardCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'show') {
    await updatePilotLeaderboardEmbed();
    await interaction.reply({ content: '✅ Pilot Leaderboard đã được cập nhật!', ephemeral: true });

  } else if (subcommand === 'update') {
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);

    if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Bạn không có quyền cập nhật pilot leaderboard.', ephemeral: true });
    }

    await updatePilotLeaderboardEmbed();
    await interaction.reply({ content: '✅ Pilot Leaderboard đã được cập nhật!', ephemeral: true });

  } else if (subcommand === 'reset') {
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);

    if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Bạn không có quyền reset pilot leaderboard.', ephemeral: true });
    }

    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();
    pilotLeaderboardData = {
      month: currentMonth,
      year: currentYear,
      pilots: {}
    };
    await savePilotLeaderboard(currentMonth, currentYear, pilotLeaderboardData.pilots);
    await updatePilotLeaderboardEmbed();
    await interaction.reply({ content: '✅ Pilot Leaderboard đã được reset!', ephemeral: true });

  } else if (subcommand === 'full') {
    await interaction.deferReply();

    try {
      const txtContent = await generateFullPilotLeaderboardTxt();

      if (!txtContent) {
        return await interaction.editReply({ content: '❌ Không có dữ liệu pilot leaderboard.' });
      }

      // Create a txt file attachment
      const buffer = Buffer.from(txtContent, 'utf8');
      const attachment = new AttachmentBuilder(buffer, { name : t(interaction, 'STR_3D889985', { v0: pilotLeaderboardData.month, v1: pilotLeaderboardData.year }) });

      const embed = new EmbedBuilder()
        .setTitle('📊 Full Pilot Leaderboard')
        .setDescription(t(interaction, 'STR_3F207FF2', { v0: pilotLeaderboardData.month, v1: pilotLeaderboardData.year }))
        .setColor(0x1E90FF)
        .setFooter({ text: 'Tải file .txt để xem chi tiết' })
        .setTimestamp();

      await interaction.editReply({
        content : t(interaction, 'STR_186BC419'),
        embeds: [embed],
        files: [attachment]
      });

    } catch (err) {
      console.error('Error generating full pilot leaderboard:', err);
      await interaction.editReply({ content: '❌ Đã có lỗi khi tạo file leaderboard.' });
    }
  }
}

// ===================== ROLE / GROUP FLIGHT / OTHER HANDLERS =====================
async function handleRequestRole(interaction) {
  const member = interaction.member;
  const userId = member.id;

  if ((bans.users[userId] && bans.users[userId].endTime > Date.now()) || (member.roles && member.roles.cache.has(roles.banRoleId))) {
    return interaction.reply({ content: 'Bạn đang bị ban, không thể xin role.', ephemeral: true });
  }

  const hasDev = member.roles.cache.has(roles.devRoleId);
  const hasAdmin = member.roles.cache.has(roles.adminRoleId);
  const hasMember = member.roles.cache.has(roles.basicMemberRoleId);

  if (hasMember || hasDev || hasAdmin) {
    const filteredRoles = (roles.otherRoles || []).filter(
      (r) => r.id !== roles.devRoleId && r.id !== roles.adminRoleId && r.id !== roles.verifiedMemberRoleId
    );
    if (filteredRoles.length === 0) return interaction.reply({ content: 'Không có role nào có thể xin.', ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_role')
        .setPlaceholder(t(interaction, 'STR_F4935F43'))
        .addOptions(filteredRoles.map((r) => ({ label: r.name, value: r.id })))
    );
    await interaction.reply({ content: 'Chọn role bạn muốn xin:', components: [row], ephemeral: true });
  } else {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('request_member').setLabel(t(interaction, 'STR_628B65DA')).setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: 'Bạn cần có role Member trước. Bấm để xin:', components: [row], ephemeral: true });
  }
}

async function handleSelect(interaction) {
  if (interaction.customId === 'select_role') {
    const roleId = interaction.values[0];
    if (roleId === roles.devRoleId || roleId === roles.adminRoleId || roleId === roles.verifiedMemberRoleId) {
      return interaction.update({ content: 'Không thể xin role DEV, Admin hoặc Verified Member.', components: [] });
    }

    const modal = new ModalBuilder().setCustomId(`role_info_modal_${roleId}`).setTitle('Thông tin xin role');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel(t(interaction, 'STR_2AA8EFE4')).setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('intro').setLabel(t(interaction, 'STR_9AF91E7F')).setStyle(TextInputStyle.Paragraph).setRequired(true)
      )
    );
    await interaction.showModal(modal);
  }
}

async function handleButton(interaction) {
  const customId = interaction.customId;

  if (customId === 'request_member') {
    const modal = new ModalBuilder().setCustomId(`role_info_modal_${roles.basicMemberRoleId}`).setTitle('Thông tin xin role Member');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel(t(interaction, 'STR_2AA8EFE4')).setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('intro').setLabel(t(interaction, 'STR_9AF91E7F')).setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      // THÊM: Trường nhập CID
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('cid').setLabel(t(interaction, 'STR_86798297')).setPlaceholder(t(interaction, 'STR_0892EABE')).setStyle(TextInputStyle.Short).setRequired(false)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('approve_') || customId.startsWith('deny_')) {
    const hasVerified = interaction.member.roles.cache.has(roles.verifiedMemberRoleId);
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);

    if (!hasVerified && !hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Bạn không có quyền duyệt request này.', ephemeral: true });
    }

    const action = customId.split('_')[0];
    const requestId = customId.split('_')[1];
    const request = pendingRequests.get(requestId);

    if (!request) {
      return interaction.reply({ content: '❌ Yêu cầu này đã hết hạn hoặc đã được xử lý.', ephemeral: true });
    }

    pendingRequests.delete(requestId);

    // 1. Dùng interaction.update() để báo cho Discord biết nút đã được nhận (tránh lỗi 3 giây)
    try {
      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed)
        .addFields({
          name: action === 'approve' ? '✅ Đã duyệt bởi' : '❌ Đã từ chối bởi',
          value : t(interaction, 'STR_8CDE7BE9', { v0: interaction.user.id }),
          inline: true
        })
        .setTimestamp();

      await interaction.update({ embeds: [newEmbed], components: [] });
    } catch (err) {
      console.error('Error updating embed:', err);
    }

    // 2. Xử lý logic TỪ CHỐI
    if (action === 'deny') {
      await interaction.followUp({ content: '❌ Đã từ chối yêu cầu cấp role.', ephemeral: true });
      try {
        const user = await client.users.fetch(request.userId);
        await user.send(t(interaction, 'STR_44221952'));
      } catch (err) {
        console.error('Error notifying user (deny):', err);
      }
      return;
    }

    // 3. Xử lý logic ĐỒNG Ý
        try {
          const guild = await client.guilds.fetch(request.guildId);
          const member = await guild.members.fetch(request.userId);

          // Thêm role yêu cầu (Thường là Member)
          await member.roles.add(request.roleId);

          // Lột role Pending ra nếu có
          if (request.roleId === roles.basicMemberRoleId && roles.pendingRoleId) {
            await member.roles.remove(roles.pendingRoleId).catch(() => {});
            if (pendingUsersData[request.userId]) {
              delete pendingUsersData[request.userId];
              savePendingUsers();
            }
          }
          
          let responseMsg = '✅ Đã duyệt và cấp role thành công!';

          // THÊM: Xử lý cấp role VATSIM dựa trên CID đính kèm
          if (request.cid) {
              const cidNum = parseInt(request.cid);
              if (!isNaN(cidNum)) {
                  try {
                      // Kéo Sổ Đỏ ra check lần cuối trước khi ghi
                      const currentVatsimLinks = await loadVatsimLinksSheet();
                      const getCid = (val) => typeof val === 'object' ? val.cid : val;
                      const isCidTaken = Object.values(currentVatsimLinks).some(val => getCid(val) === cidNum);

                      if (!isCidTaken) {
                          const stats = await fetchVatsimStatsById(cidNum);
                          if (stats && stats.rating !== 0) {
                              // GHI VÀO SỔ ĐỎ
                              currentVatsimLinks[request.userId] = {
                                  cid: cidNum,
                                  username: request.name,
                                  imageUrl: 'Verified via Role Request'
                              };
                              await saveVatsimLinksSheet(currentVatsimLinks).catch(() => {});
                              vatsimLinksCache = currentVatsimLinks; // Cập nhật luôn Cache ở RAM

                              let extraMsg = '';
                              // Kiểm tra cấp Pilot
                              if (stats.pilot_hours > 10) {
                                  await member.roles.add(roles.vatsimPilotRoleId).catch(() => {});
                                  extraMsg += `\n✈️ Đã tự động cấp thêm role **VATSIM Pilot** (>10 giờ bay).`;
                              }
                              // Kiểm tra cấp ATC
                              if (stats.rating > 1) {
                                  await member.roles.add(roles.vatsimAtcRoleId).catch(() => {});
                                  extraMsg += `\n📡 Đã tự động cấp thêm role **VATSIM ATC** (Rating >= S1).`;
                              }
                              
                              if (extraMsg) {
                                  responseMsg += extraMsg;
                              }
                          }
                      } else {
                          responseMsg += t(interaction, 'STR_EDEB3E30', { v0: cidNum });
                      }
                  } catch (e) {
                      console.error("Lỗi khi tự động check VATSIM CID:", e);
                  }
              }
          }

          await interaction.followUp({ content: responseMsg, ephemeral: true });

          try {
            await member.send(t(interaction, 'STR_F9814BD7', { v0: responseMsg }));
          } catch (err) {
            console.error('Error sending DM to user (approve):', err);
          }

        } catch (err) {
          console.error('Error approving role:', err);
          await interaction.followUp({ content: '⚠️ Đã duyệt, nhưng bot bị chặn không thể cấp role (Vui lòng kéo Role của Bot lên cao hơn Role cần cấp trong Server Settings).', ephemeral: true });
        }
        return;
  }
  if (customId.startsWith('confirm_event_')) {
    const eventId = customId.split('_')[2];
    const event = events.get(eventId);
    if (!event || event.creator !== interaction.user.id) {
      return interaction.reply({ content: 'Không tìm thấy sự kiện hoặc bạn không phải người tạo.', ephemeral: true });
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    const discordEventId = await createDiscordEvent(guild, event);
    if (discordEventId) event.discordEventId = discordEventId;

    const startTime = new Date(event.startTime);
    const embed = createEventEmbed(event, startTime);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`group_join_${eventId}`).setLabel(t(interaction, 'STR_F52119B2')).setStyle(ButtonStyle.Primary).setEmoji('✈️'),
      new ButtonBuilder().setCustomId(`group_canceljoin_${eventId}`).setLabel(t(interaction, 'STR_B1BF3D4D')).setStyle(ButtonStyle.Secondary).setEmoji('❌')
    );

    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
    if (hasDev || hasAdmin || interaction.user.id === event.creator) {
      row.addComponents(new ButtonBuilder().setCustomId(`group_cancelevent_${eventId}`).setLabel(t(interaction, 'STR_BB814A95')).setStyle(ButtonStyle.Danger).setEmoji('🚫'));
    }

    const channel = client.channels.cache.get(GROUP_FLIGHT_CHANNEL_ID) || interaction.channel;
    const message = await channel.send({
      content : t(interaction, 'STR_ECE107C4', { v0: roles.basicMemberRoleId }),
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: [] },
    });

    event.messageId = message.id;
    event.channelId = message.channel.id;

    const now = Date.now();
    const remindTime = event.startTime - 15 * 60 * 1000 - now;
    if (remindTime > 0) event.timeoutRemind = setTimeout(() => remindParticipants(eventId), remindTime);

    const startTimeDiff = event.startTime - now;
    if (startTimeDiff > 0) event.timeoutStart = setTimeout(() => startEvent(eventId), startTimeDiff);

    await interaction.update({ content: '✅ Sự kiện đã được công bố thành công và đã tạo sự kiện Discord!', components: [] });
    return;
  }
  // Xử lý nút bấm Đồng ý / Từ chối thông báo AI
  if (customId.startsWith('ann_')) {
    await interaction.deferUpdate().catch(() => {});

    const parts = customId.split('_');
    const action = parts[1]; // 'okay', 'orig' hoặc 'reject'
    const reqId = parts[2];

    const pendingData = pendingAnnouncements.get(reqId);
    if (!pendingData) {
      return interaction.followUp({ content: '❌ Yêu cầu đã hết hạn hoặc đã được xử lý. Vui lòng tạo thông báo mới!', ephemeral: true });
    }

    // 🛡️ CHỐNG BẤM ĐÚP
    if (pendingData.isProcessing) {
        return interaction.followUp({ content: '⏳ Bot đang gửi, đừng bấm vội nhé...', ephemeral: true });
    }
    pendingData.isProcessing = true;

    if (action === 'reject') {
      pendingAnnouncements.delete(reqId);
      return interaction.editReply({ content: '❌ Đã hủy gửi thông báo.', embeds: [], components: [] });
    }

    let finalMessage = action === 'okay' ? pendingData.aiMessage : pendingData.rawMessage;
    if (!finalMessage || finalMessage.trim() === '') {
        finalMessage = ' '; 
    }
    
    const sendPayload = { 
        content: finalMessage, 
        allowedMentions: { parse: ['roles', 'users', 'everyone'] } 
    };

    // 🚀 CÁCH ÉP DISCORD TỰ HIỂN THỊ ẢNH MÀ BOT KHÔNG CẦN TẢI: Dùng Embed
    if (pendingData.imageUrl) {
        sendPayload.embeds = [
            new EmbedBuilder()
                .setImage(pendingData.imageUrl)
                .setColor(0x2b2d31) // Màu viền tiệp với màu nền Discord cho đẹp
        ];
    }

    if (pendingData.targetTime) {
      scheduledAnnouncements.push({
        id: reqId,
        channelId: pendingData.channelId,
        content: finalMessage,
        imageUrl: pendingData.imageUrl, // Link ImgBB bất tử nằm ở đây
        time: pendingData.targetTime,
        author: interaction.user.id
      });
      await db.saveAnnouncements(scheduledAnnouncements);
      
      pendingAnnouncements.delete(reqId);

      await interaction.editReply({ 
        content : t(interaction, 'STR_165080B7', { v0: Math.floor(pendingData.targetTime/1000), v1: reqId }), 
        embeds: [], 
        components: [] 
      });
    } else {
      try {
        const targetChannel = await client.channels.fetch(pendingData.channelId);
        const sentMsg = await targetChannel.send(sendPayload);
        
        pendingAnnouncements.delete(reqId);

        await interaction.editReply({ content : t(interaction, 'STR_F267247D', { v0: sentMsg.id }), embeds: [], components: [] });
      } catch (err) {
        pendingData.isProcessing = false;
        await interaction.followUp({ content : t(interaction, 'STR_DCBC35F9', { v0: err.message }), ephemeral: true });
      }
    }
    return;
  }

  // Xử lý nút bấm Xin Role VATSIM
  if (customId === 'btn_verify_pilot' || customId === 'btn_verify_atc') {
    // --- THÊM KIỂM TRA ROLE MEMBER TẠI ĐÂY ---
    const hasMember = interaction.member.roles.cache.has(roles.basicMemberRoleId);
    if (!hasMember) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('request_member')
          .setLabel(t(interaction, 'STR_628B65DA'))
          .setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ 
        content: '❌ Chầm chậm đã! Bạn cần có role **Member** để chính thức tham gia server trước khi liên kết tài khoản VATSIM. Bấm nút dưới đây để xin role nha:', 
        components: [row], 
        ephemeral: true 
      });
    }
    // ------------------------------------------

    const roleType = customId.split('_')[2]; // 'pilot' hoặc 'atc'

    await interaction.deferReply({ ephemeral: true });

    // === LOG: BÁO CÁO CÓ NGƯỜI BẤM NÚT ===
    await sendLog(createLogEmbed(
      '🔘 Xác thực VATSIM',
      `**User:** ${getUserIdentifier(interaction.user)}\n**Hành động:** Vừa bấm nút xin role **${roleType.toUpperCase()}**`,
      0x3498db
    ));

    // ID Role thật của sếp
    const PILOT_ROLE_ID = '1517724342270558218';
    const ATC_ROLE_ID = '1393133850640781383';
    const member = interaction.member;

    // --- LOGIC VƯỢT RÀO (BYPASS) THÔNG MINH ---
    // Nếu họ đã có 1 trong 2 role, khả năng cao họ đã có mặt trong "Sổ Đỏ"
    if (member.roles.cache.has(ATC_ROLE_ID) || member.roles.cache.has(PILOT_ROLE_ID)) {

      // Khởi tạo công cụ báo cáo Admin cho khu vực Bypass
      const adminChannel = interaction.client.channels.cache.get(ADMIN_CHANNEL_ID || '1448258683627638895');
      const notifyAdmin = (title, desc, color) => {
        if (adminChannel) {
          adminChannel.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] }).catch(() => { });
        }
      };

      // 1. Mở Sổ Đỏ ra tìm CID của họ
      const currentVatsimLinks = await loadVatsimLinksSheet();
      const existingData = currentVatsimLinks[interaction.user.id];
      const existingCid = existingData ? (typeof existingData === 'object' ? existingData.cid : existingData) : null;

      // 2. Nếu tìm thấy CID, check thẳng API VATSIM luôn khỏi bắt gửi ảnh
      if (existingCid) {
        await interaction.editReply({ content: '⏳ Đang kiểm tra dữ liệu cập nhật trên máy chủ VATSIM...' });
        const stats = await fetchVatsimStatsById(existingCid);

        if (!stats) {
          notifyAdmin('🚨 Cảnh báo: Lỗi API Bypass', `**User:** <@${interaction.user.id}>\n**CID:** ${existingCid}\n**Lý do:** Không tìm thấy dữ liệu trên VATSIM API.`, 0xff0000);
          return interaction.editReply({ content : t(interaction, 'STR_C9D264D9', { v0: existingCid }) });
        }
        if (stats.rating === 0) {
          notifyAdmin('🚨 Cảnh báo: Tài khoản bị khóa (Bypass)', `**User:** <@${interaction.user.id}>\n**CID:** ${existingCid}\n**Lý do:** Tài khoản đang bị Suspended.`, 0xff0000);
          return interaction.editReply({ content : t(interaction, 'STR_C9B3AD8B') });
        }

        if (roleType === 'pilot') {
          if (stats.pilot_hours > 10) {
            await member.roles.add(PILOT_ROLE_ID).catch(() => { });
            notifyAdmin('✅ Xác thực VATSIM thành công (Bypass)', `**User:** <@${interaction.user.id}>\n**Role xin thêm:** VATSIM PILOT\n**CID:** ${existingCid}`, 0x2ecc71);
            return interaction.editReply({ content : t(interaction, 'STR_918449F0', { v0: stats.pilot_hours.toFixed(1) }) });
          } else {
            notifyAdmin('⚠️ Cảnh báo: Chưa đủ giờ bay (Bypass)', `**User:** <@${interaction.user.id}>\n**CID:** ${existingCid}\n**Lý do:** Xin thêm role Pilot nhưng mới có ${stats.pilot_hours.toFixed(1)} giờ bay (Yêu cầu > 10).`, 0xffa500);
            return interaction.editReply({ content : t(interaction, 'STR_0F419B00', { v0: stats.pilot_hours.toFixed(1) }) });
          }
        } else if (roleType === 'atc') {
          if (stats.rating > 1) {
            await member.roles.add(ATC_ROLE_ID).catch(() => { });
            notifyAdmin('✅ Xác thực VATSIM thành công (Bypass)', `**User:** <@${interaction.user.id}>\n**Role xin thêm:** VATSIM ATC\n**CID:** ${existingCid}`, 0x2ecc71);
            return interaction.editReply({ content : t(interaction, 'STR_82B28266') });
          } else {
            notifyAdmin('⚠️ Cảnh báo: Chưa đủ Rating ATC (Bypass)', `**User:** <@${interaction.user.id}>\n**CID:** ${existingCid}\n**Lý do:** Xin thêm role ATC nhưng Rating đang là OBS (Yêu cầu >= S1).`, 0xffa500);
            return interaction.editReply({ content : t(interaction, 'STR_A36CE332') });
          }
        }
        return; // Chặn ngang ở đây, không cho code chạy xuống dưới đòi gửi ảnh nữa
      }
      // Nếu lỡ có Role mà không có tên trong Sổ đỏ (do Admin add bằng tay), 
      // thì bot mặc kệ, cứ thả trôi xuống dưới bắt chụp ảnh từ đầu!
    }
    // ------------------------------------------------

    try {
      // 1. Dọn dẹp đồng hồ cũ nếu user bấm nút nhiều lần liên tục
      if (pendingVerifyDMs.has(interaction.user.id)) {
        clearTimeout(pendingVerifyDMs.get(interaction.user.id).timeoutId);
      }

      // 2. Tạo đồng hồ đếm ngược đúng 5 phút (300,000 mili-giây)
      const expireTimer = setTimeout(async () => {
        if (pendingVerifyDMs.has(interaction.user.id)) {
          pendingVerifyDMs.delete(interaction.user.id); // Hết giờ thì đá ra khỏi bộ nhớ
          await interaction.user.send(t(interaction, 'STR_5341F2A1')).catch(() => { });
        }
      }, 5 * 60 * 1000);

      // 3. Lưu phiên làm việc mới kèm theo cái đồng hồ
      pendingVerifyDMs.set(interaction.user.id, {
        guildId: interaction.guild.id,
        roleType: roleType,
        expires: Date.now() + 5 * 60 * 1000,
        timeoutId: expireTimer
      });

      // Nhắn tin riêng: CHỈ ĐÒI ẢNH!
      await interaction.user.send(t(interaction, 'STR_D6CD1DB2', { v0: roleType.toUpperCase() }) +
        `Để hoàn tất, hãy gửi cho mình **1 tấm ảnh chụp màn hình** trang Profile VATSIM chính thức (my.vatsim.net).\n` +
        `⚠️ **LƯU Ý QUAN TRỌNG:**\n` +
        `- Ảnh phải thể hiện rõ giao diện trang web, có chữ VATSIM ID, Tên, Rating...\n` +
        `- KHÔNG cần gõ mã số, hệ thống BOT sẽ tự động soi ảnh của bạn.\n\n` +
        `*(Bạn có 5 phút để gửi ảnh, hãy thả ảnh vào đây nhé!)*`
      );

      // === LOG: BÁO CÁO GỬI DM THÀNH CÔNG ===
      await sendLog(createLogEmbed(
        '✉️ DM Sent (Thành công)',
        `**User:** ${getUserIdentifier(interaction.user)}\nBot đã gửi DM yêu cầu ảnh thành công. Đang chờ người dùng phản hồi...`,
        0x2ecc71
      ));

      return interaction.editReply({ content: '✅ Bot đã nhắn tin riêng (DM) cho bạn để xác thực. Vui lòng kiểm tra mục tin nhắn trực tiếp!' });
    } catch (err) {
      pendingVerifyDMs.delete(interaction.user.id);

      // === LOG: BÁO CÁO GỬI DM THẤT BẠI ===
      await sendLog(createLogEmbed(
        '⚠️ DM Failed (Thất bại)',
        `**User:** ${getUserIdentifier(interaction.user)}\nBot KHÔNG THỂ gửi tin nhắn riêng cho người này vì họ đã tắt tính năng nhận tin nhắn từ người lạ.`,
        0xe74c3c
      ));

      return interaction.editReply({ content: '❌ Bot không thể nhắn tin DM cho bạn. **Vui lòng vào Cài đặt Quyền riêng tư của Server và Bật "Cho phép tin nhắn trực tiếp"**, sau đó thử lại!' });
    }
  }

  if (customId.startsWith('group_')) {
    const parts = customId.split('_');
    const action = parts[1];
    const eventId = parts.slice(2).join('_');
    const event = events.get(eventId);
    if (!event) return interaction.reply({ content: 'Không tìm thấy sự kiện.', ephemeral: true });

    if (action === 'join') {
      if (!event.participants.includes(interaction.user.id)) {
        event.participants.push(interaction.user.id);
        await updateEventMessage(eventId);

        // Thêm user vào event tracking
        await addUserToEvent(interaction.user.id, eventId);
      }
      await interaction.reply({ content: '✅ Đã tham gia sự kiện!', ephemeral: true });
      return;
    }

    if (action === 'canceljoin') {
      event.participants = event.participants.filter((id) => id !== interaction.user.id);
      await updateEventMessage(eventId);

      // Xóa user khỏi event tracking
      await removeUserFromEvent(interaction.user.id, eventId);

      await interaction.reply({ content: '❌ Đã hủy tham gia sự kiện!', ephemeral: true });
      return;
    }

    if (action === 'cancelevent') {
      const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
      const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);

      if (hasDev || hasAdmin || interaction.user.id === event.creator) {
        if (event.timeoutRemind) clearTimeout(event.timeoutRemind);
        if (event.timeoutStart) clearTimeout(event.timeoutStart);

        // Xóa tất cả users khỏi event tracking
        await removeAllUsersFromEvent(eventId);

        if (event.discordEventId) {
          try {
            const guild = await client.guilds.fetch(GUILD_ID);
            await guild.scheduledEvents.delete(event.discordEventId);
          } catch (err) {
            console.error('Error deleting Discord event:', err);
          }
        }

        try {
          await interaction.message.delete();
        } catch (_) { }

        events.delete(eventId);
        await interaction.reply({ content: '🚫 Sự kiện đã bị hủy!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Bạn không có quyền hủy sự kiện.', ephemeral: true });
      }
    }
  }
}

async function handleGroupFlight(interaction) {
  const modal = new ModalBuilder().setCustomId('group_modal').setTitle('Tạo Group Flight');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('dep').setLabel(t(interaction, 'STR_FB1E74CA')).setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('arr').setLabel(t(interaction, 'STR_1DC53808')).setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('route').setLabel(t(interaction, 'STR_9405C3AF')).setStyle(TextInputStyle.Paragraph).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('time').setLabel(t(interaction, 'STR_07447312')).setStyle(TextInputStyle.Short).setRequired(true)
    )
  );
  await interaction.showModal(modal);
}

async function handleSendAward(interaction) {
  try {
    // Kiểm tra quyền
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);

    if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '❌ Chỉ admin và dev mới có thể sử dụng lệnh này!',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    await interaction.deferReply({ ephemeral: true });

    if (subcommand === 'atc') {
      await sendATCAward(interaction);

    } else if (subcommand === 'pilot') {
      await sendPilotAward(interaction);

    } else if (subcommand === 'both') {
      await sendATCAward(interaction);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 giây
      await sendPilotAward(interaction);
      await interaction.followUp({
        content: '✅ Đã gửi award cho cả ATC và pilot!',
        ephemeral: true
      });

    } else if (subcommand === 'reset_status') {
      await resetAwardStatus();
      await interaction.editReply({
        content: '✅ Đã reset trạng thái award! Có thể gửi lại award cho tháng này.'
      });
    }
  } catch (err) {
    console.error('Error in handleSendAward:', err);
    try {
      await interaction.editReply({
        content: '❌ Đã có lỗi khi thực hiện lệnh!'
      });
    } catch (_) { }
  }
}

async function handleModal(interaction) {
  // Nhận dữ liệu nộp từ Popup Xác thực VATSIM
  if (interaction.customId.startsWith('modal_verify_')) {
    const roleType = interaction.customId.split('_')[2]; // 'pilot' hoặc 'atc'
    const cidStr = interaction.fields.getTextInputValue('cid_input').trim();
    const cid = parseInt(cidStr);

    if (isNaN(cid)) {
      return interaction.reply({ content: '❌ CID không hợp lệ. Vui lòng nhập số.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }); // Chờ API VATSIM phản hồi

    // Dùng lại hàm có sẵn trong code của bạn
    const stats = await fetchVatsimStatsById(cid);

    if (!stats) {
      return interaction.editReply({ content : t(interaction, 'STR_95E780C5', { v0: cid }) });
    }

    // Tài khoản bị Suspended (VATSIM API trả về rating 0)
    if (stats.rating === 0) {
      return interaction.editReply({ content : t(interaction, 'STR_5EC6D4A5', { v0: cid }) });
    }

    // XÉT DUYỆT PILOT
    if (roleType === 'pilot') {
      if (stats.pilot_hours > 10) {
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(roles.vatsimPilotRoleId);
          return interaction.editReply({ content : t(interaction, 'STR_DF2FA653', { v0: stats.pilot_hours.toFixed(1) }) });
        } catch (err) {
          return interaction.editReply({ content : t(interaction, 'STR_4A9D80F0') });
        }
      } else {
        return interaction.editReply({ content : t(interaction, 'STR_D775BBC5', { v0: stats.pilot_hours.toFixed(1) }) });
      }
    }
    // XÉT DUYỆT ATC
    else if (roleType === 'atc') {
      if (stats.rating > 1) { // 1 là OBS, > 1 là từ S1 trở lên
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(roles.vatsimAtcRoleId);

          const vatsimRatingsSpoken = { 2: 'S1', 3: 'S2', 4: 'S3', 5: 'C1', 6: 'C2', 7: 'C3', 8: 'I1', 9: 'I2', 10: 'I3', 11: 'SUP', 12: 'ADM' };
          const ratingStr = vatsimRatingsSpoken[stats.rating] || `R${stats.rating}`;

          return interaction.editReply({ content : t(interaction, 'STR_7E94150E', { v0: ratingStr }) });
        } catch (err) {
          return interaction.editReply({ content : t(interaction, 'STR_BB546E2F') });
        }
      } else {
        return interaction.editReply({ content : t(interaction, 'STR_BF28707A') });
      }
    }
    return;
  }

  if (interaction.customId === 'group_modal') {
    const dep = interaction.fields.getTextInputValue('dep').toUpperCase();
    const arr = interaction.fields.getTextInputValue('arr').toUpperCase();
    const route = interaction.fields.getTextInputValue('route');
    const timeStr = interaction.fields.getTextInputValue('time');
    const startTime = parseUTCDateTime(timeStr);

    if (isNaN(startTime)) return interaction.reply({ content: 'Giờ không hợp lệ. Vui lòng dùng định dạng YYYY-MM-DD HH:MM (UTC).', ephemeral: true });
    if (startTime <= Date.now()) return interaction.reply({ content: 'Thời gian bắt đầu phải ở tương lai.', ephemeral: true });

    const eventId = Date.now().toString();
    events.set(eventId, {
      dep,
      arr,
      route,
      startTime,
      creator: interaction.user.id,
      participants: [],
      messageId: null,
      channelId: null,
      timeoutRemind: null,
      timeoutStart: null,
      discordEventId: null,
    });

    const startTimeObj = new Date(startTime);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirm_event_${eventId}`).setLabel(t(interaction, 'STR_9E100D9C')).setStyle(ButtonStyle.Success).setEmoji('🚀')
    );

    await interaction.reply({
      content : t(interaction, 'STR_A939345F', { v0: dep, v1: arr, v2: route, v3: formatDateTime(startTimeObj) }),
      components: [row],
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === 'profile_modal') {
    const name = interaction.fields.getTextInputValue('name');
    const age = interaction.fields.getTextInputValue('age');
    const bio = interaction.fields.getTextInputValue('bio');

    // Cập nhật lên MongoDB Atlas
    try {
      await db.saveProfile(interaction.user.id, { name, age, bio });
      // Cập nhật luôn vào RAM để AI đọc được ngay lập tức
      profiles[interaction.user.id] = { name, age, bio };

      await interaction.reply({ content: '✅ Profile của bạn đã được lưu vĩnh viễn lên MongoDB!', ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '⚠️ Lỗi lưu Database.', ephemeral: true });
    }
    return;
  }

  // THÊM: Cập nhật xử lý nộp form xin role
      if (interaction.customId.startsWith('role_info_modal_')) {
        const roleId = interaction.customId.split('_')[3];
        const name = interaction.fields.getTextInputValue('name');
        const intro = interaction.fields.getTextInputValue('intro');
        // Lấy CID nếu có, nếu không thì undefined
        let cidValue = null;
        try {
            cidValue = interaction.fields.getTextInputValue('cid');
        } catch(e) {}
        
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

        const requestId = Date.now().toString();
        // Lưu CID vào request
        pendingRequests.set(requestId, { userId: interaction.user.id, roleId, guildId: interaction.guild.id, name, intro, cid: cidValue, timestamp, messageId: null });

        try {
          const channel = await client.channels.fetch(ROLE_APPROVAL_CHANNEL_ID);
          const roleName = roleId === roles.basicMemberRoleId ? 'Member' : roles.otherRoles.find((r) => r.id === roleId)?.name || 'Unknown';

          let embedDesc = t(interaction, 'STR_49580542', { v0: interaction.user.id, v1: interaction.user.tag, v2: roleName, v3: name, v4: intro, v5: timestamp });
          
          let alertMsg = '';
          // Nếu có nhập CID, bot sẽ kiểm tra trước và thêm ghi chú vào thông báo cho Admin
          if (cidValue) {
             embedDesc += t(interaction, 'STR_97DDFD7E', { v0: cidValue });
             const cidNum = parseInt(cidValue);
             if (!isNaN(cidNum)) {
                 // CHECK SỔ ĐỎ XEM CÓ BỊ TRÙNG LẶP / MẠO DANH KHÔNG
                 const currentVatsimLinks = await loadVatsimLinksSheet();
                 const getCid = (val) => typeof val === 'object' ? val.cid : val;
                 const isCidTaken = Object.values(currentVatsimLinks).some(val => getCid(val) === cidNum);

                 if (isCidTaken) {
                     alertMsg = t(interaction, 'STR_85DC2A46', { v0: cidNum });
                 } else {
                     // Nếu Sổ Đỏ sạch thì mới check API VATSIM
                     const stats = await fetchVatsimStatsById(cidNum);
                     if (stats) {
                         if (stats.rating === 0) {
                             alertMsg = t(interaction, 'STR_4921B447', { v0: cidNum });
                         } else {
                             if (stats.pilot_hours > 10) alertMsg += t(interaction, 'STR_4B2C245A');
                             if (stats.rating > 1) alertMsg += t(interaction, 'STR_659D1C18');
                             if (alertMsg) alertMsg += t(interaction, 'STR_A1D219BC');
                         }
                     } else {
                         alertMsg = t(interaction, 'STR_12388AF5', { v0: cidNum });
                     }
                 }
             }
          }

          if (alertMsg) embedDesc += t(interaction, 'STR_1E1AD719', { v0: alertMsg });

          const embed = new EmbedBuilder()
            .setTitle('Role Request')
            .setDescription(embedDesc)
            .setColor(0x3498db);

          const mentionText = `<@&${roles.adminRoleId}> <@&${roles.devRoleId}> <@&${roles.verifiedMemberRoleId}>`;

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_${requestId}`).setLabel(t(interaction, 'STR_6F735165')).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`deny_${requestId}`).setLabel(t(interaction, 'STR_3682D166')).setStyle(ButtonStyle.Danger)
          );

          const sentMessage = await channel.send({
            content: mentionText,
            embeds: [embed],
            components: [row],
            allowedMentions: { roles: [roles.adminRoleId, roles.devRoleId, roles.verifiedMemberRoleId] }
          });

          pendingRequests.get(requestId).messageId = sentMessage.id;
          await interaction.reply({ content: '✅ Request sent for approval.', ephemeral: true });
        } catch (err) {
          console.error('Error sending request to channel:', err);
          await interaction.reply({ content: '❌ Error sending request.', ephemeral: true });
          pendingRequests.delete(requestId);
        }
      }
  }

async function remindParticipants(eventId) {
  const event = events.get(eventId);
  if (!event) return;

  try {
    const channel = await client.channels.fetch(event.channelId);
    const message = await channel.messages.fetch(event.messageId);

    const embed = EmbedBuilder.from(message.embeds[0])
      .setColor(0xffa500)
      .setFooter({ text: 'Sự kiện sắp bắt đầu!', iconURL: 'https://cdn-icons-png.flaticon.com/512/1828/1828884.png' });

    await message.edit({
      content : t(interaction, 'STR_3BDDC1F1', { v0: roles.basicMemberRoleId }),
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error('Error updating reminder message:', err);
  }

  for (const userId of event.participants) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(t(interaction, 'STR_BDCFB4D9', { v0: event.dep, v1: event.arr, v2: event.route })
      );
    } catch (err) {
      console.error(`Không gửi DM cho ${userId}: ${err}`);
    }
  }
}

async function startEvent(eventId) {
  const event = events.get(eventId);
  if (!event) return;

  try {
    const channel = await client.channels.fetch(event.channelId);
    const message = await channel.messages.fetch(event.messageId);

    const embed = EmbedBuilder.from(message.embeds[0])
      .setTitle('🚀 Group Flight Đang Diễn Ra!')
      .setColor(0x00ff00)
      .setDescription('🎯 **Sự kiện đang diễn ra!** Chúc mọi người có chuyến bay vui vẻ! ✈️')
      .setFooter({ text: 'Sự kiện đang diễn ra', iconURL: 'https://cdn-icons-png.flaticon.com/512/929/929430.png' });

    await message.edit({
      content : t(interaction, 'STR_3BE66820', { v0: roles.basicMemberRoleId }),
      embeds: [embed],
      components: [],
      allowedMentions: { parse: [] },
    });

    for (const userId of event.participants) {
      try {
        const user = await client.users.fetch(userId);
        await user.send(t(interaction, 'STR_97AADDBC', { v0: event.dep, v1: event.arr, v2: event.route })
        );
      } catch (err) {
        console.error(`Không gửi DM cho ${userId}: ${err}`);
      }
    }

    // Đặt lịch xóa role sau khi sự kiện kết thúc (ví dụ: 3 giờ)
    setTimeout(async () => {
      // Xóa tất cả users khỏi event tracking
      await removeAllUsersFromEvent(eventId);

      // Xóa event khỏi bộ nhớ
      events.delete(eventId);

      console.log(`Event ${eventId} đã kết thúc và role đã được thu hồi`);
    }, 3 * 60 * 60 * 1000); // 3 giờ
  } catch (err) {
    console.error(`Lỗi khi bắt đầu sự kiện ${eventId}: ${err}`);
  }
}

async function handleSubmitProfile(interaction) {
  const modal = new ModalBuilder().setCustomId('profile_modal').setTitle('Submit / Edit Profile');

  // Lấy dữ liệu cũ nếu có
  const existingProfile = profiles[interaction.user.id] || {};

  // 1. Tạo ô nhập Tên
  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel(t(interaction, 'STR_2AA8EFE4'))
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  // Chỉ điền sẵn nếu có tên cũ
  if (existingProfile.name) nameInput.setValue(existingProfile.name);

  // 2. Tạo ô nhập Tuổi
  const ageInput = new TextInputBuilder()
    .setCustomId('age')
    .setLabel(t(interaction, 'STR_A39DEFDF'))
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  // Chỉ điền sẵn nếu có tuổi cũ
  if (existingProfile.age) ageInput.setValue(existingProfile.age);

  // 3. Tạo ô nhập Bio
  const bioInput = new TextInputBuilder()
    .setCustomId('bio')
    .setLabel(t(interaction, 'STR_713A01AB'))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  // Chỉ điền sẵn nếu có bio cũ
  if (existingProfile.bio) bioInput.setValue(existingProfile.bio);

  // Đóng gói tất cả vào Modal
  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(ageInput),
    new ActionRowBuilder().addComponents(bioInput)
  );

  await interaction.showModal(modal);
}

// ===================== COMMAND: GỬI THÔNG BÁO (ANNOUNCEMENT) =====================
async function handleAnnouncement(interaction) {
  const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
  const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
  if (!hasDev && !hasAdmin) return interaction.reply({ content: '❌ Bạn không có quyền.', ephemeral: true });

  const channel = interaction.options.getChannel('channel');
  const rawMessage = interaction.options.getString('message');
  const timeStr = interaction.options.getString('time');
  const image = interaction.options.getAttachment('image');

  let targetTime = null;
  if (timeStr) {
    targetTime = parseUTCDateTime(timeStr);
    if (isNaN(targetTime) || targetTime <= Date.now()) {
      return interaction.reply({ content: '❌ Giờ không hợp lệ hoặc đã qua. Định dạng đúng: YYYY-MM-DD HH:MM (UTC).', ephemeral: true });
    }
  }

  // Đặt trạng thái "Đang suy nghĩ" vì AI cần vài giây để viết lại văn
  await interaction.deferReply({ ephemeral: true });

  // ========================================================
  // BẾ ẢNH LÊN IMGBB LẤY LINK VĨNH VIỄN TRƯỚC KHI HẸN GIỜ
  // ========================================================
  let finalImageUrl = null;
  if (image) {
    if (process.env.IMGBB_API_KEY) {
      try {
        const imgBuffer = await downloadBuffer(image.url);
        const base64Image = imgBuffer.toString('base64');
        const params = new URLSearchParams();
        params.append('image', base64Image);

        const fetchObj = (await import('node-fetch')).default;
        const imgbbRes = await fetchObj(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, { method: 'POST', body: params });
        const imgbbData = await imgbbRes.json();

        if (imgbbData && imgbbData.data && imgbbData.data.url) {
          finalImageUrl = imgbbData.data.url; // Đổi link chết thành link bất tử
        } else {
          finalImageUrl = image.url;
        }
      } catch (e) {
        console.error('Lỗi up ảnh thông báo lên ImgBB:', e);
        finalImageUrl = image.url;
      }
    } else {
      finalImageUrl = image.url; // Nếu không có API key thì đành xài tạm link cũ
    }
  }

  let aiMessage = '';
  try {
    const prompt = `Bạn là một trợ lý quản lý cộng đồng trên Discord. Nhiệm vụ của bạn là viết lại đoạn thông báo dưới đây sao cho chuyên nghiệp, lịch sự, rõ ràng và hấp dẫn hơn.

    [YÊU CẦU BẮT BUỘC - LUẬT THÉP]
    1. Giữ nguyên 100% các thông tin chính: link, mã ICAO, ngày giờ.
    2. Trình bày ngắt dòng, sử dụng gạch đầu dòng (bullet points) hoặc emoji hợp lý cho Discord.
    3. TUYỆT ĐỐI KHÔNG chào hỏi (Không dùng "Xin chào", "Dạ", v.v.).
    4. TUYỆT ĐỐI KHÔNG giải thích hay thêm câu dẫn (Không dùng "Dưới đây là thông báo đã sửa", "Tôi đã viết lại...", v.v.).
    5. CHỈ in ra đúng nội dung thông báo đã được viết lại, không thêm bất kỳ ký tự thừa nào khác.

    Nội dung gốc cần viết lại:
    ${rawMessage}`;

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // TĂNG HẲN LÊN 8192 ĐỂ AI KHÔNG BAO GIỜ BỊ HỤT HƠI KHI VIẾT VĂN DÀI
      generationConfig: { maxOutputTokens: 8192, temperature: 0.6 },
    });

    aiMessage = result.response.text().trim();

    // Quét sạch rác nếu AI lỡ dại tự bọc thêm thẻ code block markdown vào văn bản
    if (aiMessage.startsWith('```')) {
      aiMessage = aiMessage.replace(/^```(markdown|txt|html)?\n?/, '').replace(/\n?```$/, '').trim();
    }
  } catch (err) {
    console.error("Lỗi khi Gemini viết lại thông báo:", err);
    // Nếu AI lỗi, fallback dùng luôn bản gốc
    aiMessage = rawMessage;
  }

  const reqId = Date.now().toString();

  // LƯU TOÀN BỘ NỘI DUNG GỐC (FULL 100%) VÀO BỘ NHỚ TẠM ĐỂ CHỜ GỬI
  pendingAnnouncements.set(reqId, {
    channelId: channel.id,
    rawMessage: rawMessage,
    aiMessage: aiMessage,
    targetTime: targetTime,
    imageUrl: finalImageUrl
  });

  // TỈA NGẮN CHO BẢNG PREVIEW ĐỂ KHÔNG LÀM SẬP DISCORD (Giới hạn 1024 ký tự)
  const previewRaw = rawMessage.length > 900
    ? rawMessage.substring(0, 900) + '...\n\n[...Đã ẩn bớt phần còn lại...]'
    : rawMessage;
  const previewAi = aiMessage.length > 900
    ? aiMessage.substring(0, 900) + '...\n\n[...Đã ẩn bớt phần còn lại...]'
    : aiMessage;

  const embed = new EmbedBuilder()
    .setTitle('✨ Gợi ý từ Gemini')
    .setDescription('Mình đã viết lại nội dung của bạn cho chuyên nghiệp hơn. Bạn muốn dùng bản nào để gửi đi?\n\n⚠️ *Lưu ý: Bảng preview bên dưới có thể bị ẩn bớt nếu quá dài, nhưng khi bạn bấm nút gửi thì nội dung sẽ đăng lên ĐẦY ĐỦ 100%.*')
    .addFields(
      { name: '📝 Bản gốc của bạn', value : t(interaction, 'STR_68A1141F', { v0: previewRaw }) },
      { name: '🤖 Bản do AI nâng cấp', value : t(interaction, 'STR_68A1141F', { v0: previewAi }) },
      { name: '⏰ Lịch trình', value: targetTime ? `<t:${Math.floor(targetTime / 1000)}:F>` : 'Gửi ngay lập tức' }
    )
    .setColor(0x3498db);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ann_okay_${reqId}`).setLabel(t(interaction, 'STR_40D94481')).setStyle(ButtonStyle.Success),
    // THÊM NÚT SỬA VÀO ĐÂY:
    new ButtonBuilder().setCustomId(`ann_editai_${reqId}`).setLabel(t(interaction, 'STR_B4FA29A9')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ann_orig_${reqId}`).setLabel(t(interaction, 'STR_392975FE')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ann_reject_${reqId}`).setLabel(t(interaction, 'STR_8F0AED44')).setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ content : t(interaction, 'STR_43B93608', { v0: reqId }), embeds: [embed], components: [row] });
}

async function handleSetupAtcNoti(interaction) {
  const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
  if (!hasAdmin && interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: '❌ Chỉ Admin mới có thể dùng lệnh này.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('📡 Đăng ký nhận thông báo BOT')
    .setDescription('Hãy **React với emoji 🤖 ở tin nhắn này** để tự động nhận role <@&' + ATC_NOTI_ROLE_ID + '>. Bạn sẽ được thông báo khi BOT có thông báo mới')
    .setColor(0x3498db)
    .setFooter({ text: 'Bỏ react để hủy đăng ký nhận thông báo' });

  const msg = await interaction.channel.send({ embeds: [embed] });
  await msg.react('🤖');

  // --- THÊM PHẦN LƯU DATA VÀO JSON ---
  reactionRoleData.atcNotiMsgId = msg.id;
  reactionRoleData.channelId = msg.channel.id;
  fs.writeFileSync(REACTION_ROLES_FILE, JSON.stringify(reactionRoleData, null, 2));
  // ------------------------------------

  await interaction.reply({ content: '✅ Đã khởi tạo tin nhắn lấy role và lưu vào cơ sở dữ liệu thành công!', ephemeral: true });
}

async function ensureVatsimMessageExists() {
  const channelId = vatsimMessageStore.channelId || VATSIM_CHANNEL_ID;
  try {
    const channel = await client.channels.fetch(channelId);
    // Lấy danh sách ID hợp lệ hiện có
    let storedIds = vatsimMessageStore.messageIds || [];
    let validIds = [];
    for (const id of storedIds) {
      try {
        await channel.messages.fetch(id);
        validIds.push(id);
      } catch (e) { /* bỏ qua */ }
    }

    // Nếu có ID hợp lệ, giữ lại và xóa các tin nhắn bot khác
    if (validIds.length > 0) {
      // Quét 50 tin nhắn gần nhất, tìm tin nhắn của bot
      const messages = await channel.messages.fetch({ limit: 50 });
      for (const [msgId, msg] of messages) {
        if (msg.author.id === client.user.id && !validIds.includes(msgId)) {
          await msg.delete().catch(() => {});
        }
      }
      vatsimMessageStore.messageIds = validIds;
      // Lưu store...
      return;
    }

    // Không có ID hợp lệ -> xóa toàn bộ tin nhắn bot và tạo mới
    const messages = await channel.messages.fetch({ limit: 50 });
    for (const [msgId, msg] of messages) {
      if (msg.author.id === client.user.id) {
        await msg.delete().catch(() => {});
      }
    }
    // Tạo tin nhắn mới...
  } catch (err) { /* xử lý lỗi */ }
}

// ===================== LOGGING: ROLE CHANGES (SIÊU CHUẨN XÁC) =====================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (!oldMember || !newMember) return;

  // 1. So sánh trực tiếp bộ nhớ đệm (Cache) - Không bao giờ sai lệch
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  // Nếu số lượng role không đổi (đổi tên, đổi avatar...) thì bỏ qua
  if (oldRoles.size === newRoles.size) return;

  // Tìm ra những role vừa được add và vừa bị remove
  const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
  const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

  if (addedRoles.size === 0 && removedRoles.size === 0) return;

  let description = `**User:** ${getUserIdentifier(newMember.user)}\n`;

  if (addedRoles.size > 0) {
    description += `\n**➕ Role Added:**\n${addedRoles.map(r => `• <@&${r.id}>`).join('\n')}`;
  }
  if (removedRoles.size > 0) {
    description += `\n**➖ Role Removed:**\n${removedRoles.map(r => `• <@&${r.id}>`).join('\n')}`;
  }

  // Lấy danh sách Role HIỆN TẠI
  const currentRoles = newMember.roles.cache
    .filter(r => r.id !== newMember.guild.id) // Bỏ qua @everyone
    .map(r => `<@&${r.id}>`)
    .join(', ') || 'Không có role nào';

  description += `\n\n**📋 Role hiện tại:**\n${currentRoles}`;

  const embed = createLogEmbed('👥 Member Roles Updated', description, 0xf39c12);

  // 2. Chờ xíu để tra Audit Log xem thằng nào táy máy tay chân
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const fetchedLogs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 1 });
    const roleLog = fetchedLogs.entries.first();

    // Nếu log khớp với user này và vừa xảy ra trong vòng 5 giây
    if (roleLog && roleLog.target.id === newMember.id && Math.abs(roleLog.createdTimestamp - Date.now()) < 5000) {
      if (roleLog.executor) {
        embed.addFields({ name: '🛠️ Action by', value: getUserIdentifier(roleLog.executor), inline: false });
      }
    }
  } catch (err) {
    console.error('Lỗi rà soát Audit Log:', err.message);
  }

  await sendLog(embed);
});

// ===================== LOGGING: MESSAGE DELETE =====================
client.on('messageDelete', async (message) => {
  try {
    if (message.author?.bot) return;
    if (!message.guild) return;

    if (message.partial) {
      const embed = createLogEmbed('🗑️ Message Deleted (Uncached)',
        `**Channel:** <#${message.channelId}>\n**Message ID:** ${message.id}\n\n⚠️ **Lưu ý:** Tin nhắn cũ gửi trước khi bot bật nên không lấy được dữ liệu.`,
        0xe67e22
      );
      await sendLog(embed);
      return;
    }

    let content = message.content || '';
    if (content.length > 1000) content = content.slice(0, 1000) + '...';
    if (!content && message.attachments?.size > 0) content = '[Chỉ chứa hình ảnh/file đính kèm]';
    if (!content) content = '[Tin nhắn trống]';

    const embed = createLogEmbed('🗑️ Message Deleted',
      `**Author:** ${getUserIdentifier(message.author)}\n**Channel:** ${getChannelIdentifier(message.channel)}\n**Message ID:** ${message.id}\n\n**Content:**\n\`\`\`\n${content}\n\`\`\``,
      0xe67e22
    );

    // ==============================================================
    // TÍNH NĂNG CỨU HỘ ẢNH BỊ XÓA (UPLOAD LÊN IMGBB LẤY LINK VĨNH VIỄN)
    // ==============================================================
    if (message.attachments?.size > 0) {
      const attachmentLinks = [];
      let firstPermanentImg = null;

      for (const attachment of message.attachments.values()) {
        let finalUrl = attachment.url; // Mặc định là link Discord (sẽ hỏng sau vài phút)

        // Chỉ bế lên ImgBB nếu file đó là Hình Ảnh và Bot có API Key ImgBB
        if (attachment.contentType && attachment.contentType.startsWith('image/') && process.env.IMGBB_API_KEY) {
          try {
            // Tải ảnh tốc độ cao từ Discord
            const imgBuffer = await downloadBuffer(attachment.url);
            const base64Image = imgBuffer.toString('base64');

            const params = new URLSearchParams();
            params.append('image', base64Image);

            // Đẩy sang ImgBB
            const fetch = require('node-fetch');
            const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
              method: 'POST',
              body: params
            });

            const imgbbData = await imgbbRes.json();
            if (imgbbData && imgbbData.data && imgbbData.data.url) {
              finalUrl = imgbbData.data.url; // Đổi link chết thành link vĩnh cửu!
              if (!firstPermanentImg) firstPermanentImg = finalUrl;
            }
          } catch (err) {
            console.error('Lỗi cứu hộ ảnh Delete Log:', err.message);
          }
        }

        attachmentLinks.push(`[${attachment.name}](${finalUrl})`);
      }

      const attachmentsText = attachmentLinks.join('\n');
      embed.addFields({ name: '📎 Tệp đính kèm', value: attachmentsText.substring(0, 1024), inline: false });

      // Bonus: Treo thẳng cái ảnh bị xóa bự chà bá lên Log cho Admin dễ soi
      if (firstPermanentImg) {
        embed.setImage(firstPermanentImg);
      }
    }
    // ==============================================================

    // Tra cứu siêu tốc Audit Log (chỉ lấy 1 dòng gần nhất)
    try {
      const fetchedLogs = await message.guild.fetchAuditLogs({ type: 72, limit: 1 });
      const deleteLog = fetchedLogs.entries.first();

      if (deleteLog && deleteLog.target.id === message.author.id && Math.abs(deleteLog.createdTimestamp - Date.now()) < 5000) {
        if (deleteLog.executor.id !== client.user.id) {
          embed.addFields({ name: '🗑️ Deleted by', value: getUserIdentifier(deleteLog.executor), inline: false });
        }
      }
    } catch (e) { }

    await sendLog(embed);
  } catch (err) {
    console.error('Error in messageDelete log:', err);
  }
});

// ===================== LOGGING: MESSAGE EDIT =====================
client.on('messageUpdate', async (oldMessage, newMessage) => {
  try {
    if (oldMessage.partial) await oldMessage.fetch().catch(() => { });
    if (newMessage.partial) await newMessage.fetch().catch(() => { });

    if (oldMessage.author?.bot) return;
    if (!oldMessage.guild) return;

    const oldContent = oldMessage.content || '[No content or unable to fetch]';
    const newContent = newMessage.content || '[No content]';

    if (oldContent === newContent) return;

    const truncatedOld = oldContent.length > 800 ? oldContent.slice(0, 800) + '...' : oldContent;
    const truncatedNew = newContent.length > 800 ? newContent.slice(0, 800) + '...' : newContent;

    const authorName = oldMessage.author ? getUserIdentifier(oldMessage.author) : 'Unknown User';

    const embed = createLogEmbed(
      '✏️ Message Edited',
      `**Author:** ${authorName}\n**Channel:** ${getChannelIdentifier(oldMessage.channel)}\n**Jump URL:** [Click to view](${newMessage.url})\n\n**Before:**\n\`\`\`\n${truncatedOld}\n\`\`\`\n**After:**\n\`\`\`\n${truncatedNew}\n\`\`\``,
      0x3498db
    );

    await sendLog(embed);
  } catch (err) {
    console.error('Error in messageUpdate log:', err);
  }
});
// ===================== LOGGING: CHANNEL CREATE/DELETE =====================
client.on('channelCreate', async (channel) => {
  if (!channel.guild) return;
  const typeMap = { 0: 'Text', 2: 'Voice', 4: 'Category' };
  const channelType = typeMap[channel.type] || 'Channel';

  const embed = createLogEmbed(`➕ ${channelType} Created`, `**Name:** ${channel.name}\n**ID:** ${channel.id}\n**Type:** ${channelType}`, 0x2ecc71);

  try {
    const fetchedLogs = await channel.guild.fetchAuditLogs({ type: 10, limit: 5 });
    const log = fetchedLogs.entries.find(e => e.target.id === channel.id && Math.abs(e.createdTimestamp - Date.now()) < 5000);
    if (log?.executor) embed.addFields({ name: '🛠️ Created by', value: getUserIdentifier(log.executor), inline: false });
  } catch (err) { }

  await sendLog(embed);
});

client.on('channelDelete', async (channel) => {
  if (!channel.guild) return;
  const typeMap = { 0: 'Text', 2: 'Voice', 4: 'Category' };
  const channelType = typeMap[channel.type] || 'Channel';

  const embed = createLogEmbed(`➖ ${channelType} Deleted`, `**Name:** ${channel.name}\n**ID:** ${channel.id}\n**Type:** ${channelType}`, 0xe74c3c);

  try {
    const fetchedLogs = await channel.guild.fetchAuditLogs({ type: 11, limit: 5 });
    const log = fetchedLogs.entries.find(e => e.target.id === channel.id && Math.abs(e.createdTimestamp - Date.now()) < 5000);
    if (log?.executor) embed.addFields({ name: '🗑️ Deleted by', value: getUserIdentifier(log.executor), inline: false });
  } catch (err) { }

  await sendLog(embed);
});
// ===================== LOGGING: THREADS =====================
client.on('threadCreate', async (thread) => {
  if (!thread.guild) return;
  const embed = createLogEmbed('🧵 Thread Created', `**Name:** ${thread.name}\n**ID:** ${thread.id}\n**Parent:** ${thread.parent?.name || 'Unknown'}`, 0x2ecc71);

  try {
    const fetchedLogs = await thread.guild.fetchAuditLogs({ type: 110, limit: 5 });
    const log = fetchedLogs.entries.find(e => e.target.id === thread.id && Math.abs(e.createdTimestamp - Date.now()) < 5000);
    if (log?.executor) embed.addFields({ name: '🛠️ Created by', value: getUserIdentifier(log.executor), inline: false });
    else if (thread.ownerId) embed.addFields({ name: '🛠️ Created by', value : t(interaction, 'STR_8CDE7BE9', { v0: thread.ownerId }), inline: false });
  } catch (err) {
    if (thread.ownerId) embed.addFields({ name: '🛠️ Created by', value : t(interaction, 'STR_8CDE7BE9', { v0: thread.ownerId }), inline: false });
  }

  await sendLog(embed);
});

client.on('threadDelete', async (thread) => {
  if (!thread.guild) return;
  const embed = createLogEmbed('🧵 Thread Deleted', `**Name:** ${thread.name}\n**ID:** ${thread.id}\n**Parent:** ${thread.parent?.name || 'Unknown'}`, 0xe74c3c);

  try {
    const fetchedLogs = await thread.guild.fetchAuditLogs({ type: 111, limit: 5 });
    const log = fetchedLogs.entries.find(e => e.target.id === thread.id && Math.abs(e.createdTimestamp - Date.now()) < 5000);
    if (log?.executor) embed.addFields({ name: '🗑️ Deleted by', value: getUserIdentifier(log.executor), inline: false });
  } catch (err) { }

  await sendLog(embed);
});

// ===================== LOGGING: INVITE CREATED =====================
client.on('inviteCreate', async (invite) => {
  if (!invite.guild) return;

  const maxUses = invite.maxUses === 0 ? 'Vô hạn' : invite.maxUses;
  const expires = invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : 'Vĩnh viễn';

  const embed = createLogEmbed(
    '🔗 Invite Link Created',
    `**Người tạo:** ${getUserIdentifier(invite.inviter)}\n**Kênh:** ${getChannelIdentifier(invite.channel)}\n**Link Code:** \`${invite.code}\`\n**URL:** ${invite.url}\n**Lượt dùng tối đa:** ${maxUses}\n**Hết hạn:** ${expires}`,
    0x9b59b6
  );
  await sendLog(embed);
});

// ===================== ATIS FETCH (UPGRADED SCRAPER) =====================

// 1. Hàm định dạng văn bản ATIS cho dễ đọc
function formatATISText(text) {
  if (!text) return text;
  let formatted = text;

  // Xuống dòng sau cụm "ATIS [Chữ cái]"
  formatted = formatted.replace(/(ATIS\s+[A-Z])\s+/gi, '$1\n');
  // Xuống dòng sau dấu chấm đôi ".." hoặc "..."
  formatted = formatted.replace(/\.{2,}\s*/g, '..\n');
  // Xuống dòng sau dấu chấm đơn "." (khi phía sau là khoảng trắng + chữ/số)
  formatted = formatted.replace(/\.\s+(?=[A-Z0-9])/g, '.\n');

  return formatted.trim();
}

// 2. Hàm Auto-Convert từ D-ATIS sang METAR chuẩn (Hỗ trợ cả Raw METAR & Spoken Text)
function convertAtisToMetar(atisText, icao) {
  if (!atisText) return null;
  let metarParts = [icao];

  // 1. Ngày giờ (VD: 282230Z hoặc 0330Z)
  const timeMatch = atisText.match(/(\d{6})Z/i) || atisText.match(/(\d{4})Z/i);
  if (timeMatch && timeMatch[1].length === 6) {
    metarParts.push(`${timeMatch[1]}Z`);
  } else if (timeMatch && timeMatch[1].length === 4) {
    const day = new Date().getUTCDate().toString().padStart(2, '0');
    metarParts.push(`${day}${timeMatch[1]}Z`);
  } else {
    metarParts.push('000000Z');
  }

  // 2. Gió (Bắt cả "WIND 190/08KT" và "19008KT")
  const windMatch = atisText.match(/(?:WIND\s+)?(VRB|\d{3})[/\s]*(\d{2})(?:G(\d{2}))?KT/i);
  if (windMatch) {
    const dir = windMatch[1];
    const spd = windMatch[2];
    const gust = windMatch[3] ? `G${windMatch[3]}` : '';
    metarParts.push(`${dir}${spd}${gust}KT`);
  }

  // 3. Tầm nhìn (Bắt cả "VIS 9KM" và "9000" đứng liền sau gió)
  const visMatchRaw = atisText.match(/KT\s+(9999|\d{4})\b/i);
  const visMatchSpoken = atisText.match(/VIS(?:IBILITY)?\s+(\d+)\s*(KM|M)?/i);
  if (visMatchSpoken) {
    const val = parseInt(visMatchSpoken[1]);
    const unit = visMatchSpoken[2] ? visMatchSpoken[2].toUpperCase() : '';
    if (unit === 'KM' || val < 100) {
      metarParts.push(val >= 10 ? '9999' : (val * 1000).toString().padStart(4, '0'));
    } else {
      metarParts.push(val.toString().padStart(4, '0'));
    }
  } else if (visMatchRaw) {
    metarParts.push(visMatchRaw[1]);
  }

  // 4. Hiện tượng thời tiết (VD: -TSRA, SHRA, BR, FG...)
  const wxRegex = /(?:\s|^)(-|\+|VC)?(TSRA|SHRA|DZ|RA|SN|SG|IC|PE|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS|VCSH|VCTS|TS|SH)(?=\s|$)/gi;
  let wxMatch;
  while ((wxMatch = wxRegex.exec(atisText)) !== null) {
    metarParts.push(wxMatch[0].trim().toUpperCase());
  }

  // 5. Mây (Bắt chính xác SCT015, FEW017CB...)
  const cldRegex = /\b(FEW|SCT|BKN|OVC|CAVOK|NSC)\s*(\d{3})?\s*(CB|TCU)?(?:FT)?\b/gi;
  let match;
  while ((match = cldRegex.exec(atisText)) !== null) {
    if (match[1].toUpperCase() === 'CAVOK' || match[1].toUpperCase() === 'NSC') {
      metarParts.push(match[1].toUpperCase());
    } else {
      let type = match[1].toUpperCase();
      let fl = match[2] ? match[2] : '000';
      let ext = match[3] ? match[3].toUpperCase() : '';
      metarParts.push(`${type}${fl}${ext}`);
    }
  }

  // 6. Nhiệt độ & Điểm sương (Bắt cả "24/22" và "T24 DP22")
  const tempMatchRaw = atisText.match(/\b(M?\d{2})\/(M?\d{2})\b/);
  const tempMatchSpoken = atisText.match(/T(?:EMP)?\s*(M?\d+)[^\d]*?D(?:P|EW)?\s*(M?\d+)/i);
  if (tempMatchRaw) {
    metarParts.push(`${tempMatchRaw[1]}/${tempMatchRaw[2]}`);
  } else if (tempMatchSpoken) {
    let t = tempMatchSpoken[1].replace('M', '-');
    let dp = tempMatchSpoken[2].replace('M', '-');
    let tStr = parseInt(t) < 0 ? 'M' + Math.abs(parseInt(t)).toString().padStart(2, '0') : parseInt(t).toString().padStart(2, '0');
    let dpStr = parseInt(dp) < 0 ? 'M' + Math.abs(parseInt(dp)).toString().padStart(2, '0') : parseInt(dp).toString().padStart(2, '0');
    metarParts.push(`${tStr}/${dpStr}`);
  }

  // 7. Áp suất QNH (Bắt "Q1011" hoặc "QNH 1011")
  const qnhMatch = atisText.match(/Q(?:NH)?\s*(\d{3,4})/i);
  if (qnhMatch) {
    metarParts.push(`Q${qnhMatch[1].padStart(4, '0')}`);
  }

  // 8. NOSIG / RMK
  if (atisText.match(/\bNOSIG\b/i)) metarParts.push('NOSIG');

  // Tự động thêm RMK CB nếu trong mây có CB nhưng chuỗi chưa có chữ RMK
  if (atisText.match(/CB/i) && !atisText.match(/\bRMK\b/i)) {
    metarParts.push('RMK CB');
  } else if (atisText.match(/\bRMK\b/i)) {
    // Nếu ATC ghi sẵn RMK rồi thì lấy hết đoạn phía sau
    const rmkMatch = atisText.match(/\bRMK\s+(.*?)(?=\s*(?:TRANSITION|EXPECT|FOR|ON|$))/i);
    if (rmkMatch) metarParts.push(`RMK ${rmkMatch[1].trim()}`);
  }

  return metarParts.join(' ');
}

// 3. Crawler chính (VŨ KHÍ TỐI THƯỢNG: cURL LINUX Bypasses Cloudflare + DỌN RÁC HTML)
async function fetchATIS(icao) {
  try {
    // -------------------------------------------------------------
    // BƯỚC 1: LẤY TRỰC TIẾP TỪ VATSIM API (SIÊU NHANH)
    // -------------------------------------------------------------
    try {
      const nodeFetch = (await import('node-fetch')).default;
      const vatsimRes = await nodeFetch('https://data.vatsim.net/v3/vatsim-data.json', { timeout: 4000 });
      if (vatsimRes.ok) {
        const data = await vatsimRes.json();
        const atisList = data.atis.filter(a => a.callsign.startsWith(icao.toUpperCase()) && a.callsign.includes('ATIS'));

        if (atisList && atisList.length > 0) {
          let arrival = null, departure = null, arrTimestamp = 0, depTimestamp = 0;

          atisList.forEach(atis => {
            let textInfo = Array.isArray(atis.text_atis) ? atis.text_atis.join(' ') : (atis.text_atis || '');
            // Dọn dẹp rác từ VATSIM
            textInfo = textInfo.replace(/\^§/g, '').replace(/\s+/g, ' ').trim(); 
            const logonUnix = new Date(atis.logon_time).getTime();
            const callsign = atis.callsign.toUpperCase();
            const textUpper = textInfo.toUpperCase();

            if (callsign.includes('_A_') || textUpper.includes('ARRIVAL')) {
              arrival = textInfo; arrTimestamp = logonUnix;
            } else if (callsign.includes('_D_') || textUpper.includes('DEPARTURE')) {
              departure = textInfo; depTimestamp = logonUnix;
            } else {
              arrival = textInfo; departure = textInfo; arrTimestamp = logonUnix; depTimestamp = logonUnix;
            }
          });

          const rawAtisToConvert = arrival || departure;
          const metar = rawAtisToConvert ? convertAtisToMetar(rawAtisToConvert, icao.toUpperCase()) : null;
          return { arrival, arrTimestamp, departure, depTimestamp, metar };
        }
      }
    } catch (e) {
      console.warn("⚠️ Không lấy được từ VATSIM, bắt đầu cào atis.guru...");
    }

    // -------------------------------------------------------------
    // BƯỚC 2: CÀO BẰNG LỆNH cURL CỦA HỆ ĐIỀU HÀNH LINUX (100% LÁCH LUẬT)
    // -------------------------------------------------------------
    const util = require('util');
    const exec = util.promisify(require('child_process').exec);
    
    const url = `https://atis.guru/atis/${icao.toUpperCase()}`;
    let html = '';

    try {
      // Ép máy chủ Linux dùng cURL tải HTML, bọc áo giáp Chrome cực mạnh
      const command = `curl -k -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" -H "Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7" --compressed "${url}"`;
      
      const { stdout } = await exec(command, { timeout: 10000 }); // Đợi tối đa 10s
      html = stdout;
    } catch (execErr) {
      throw new Error(`Mạng Linux cURL bị lỗi: ${execErr.message}`);
    }

    if (!html || html.trim() === '') {
      console.log("[ATIS.GURU] Web rỗng, có thể sân bay không có dữ liệu.");
      return null;
    }

    // SỬ DỤNG REGEX CHÉM THẲNG VÀO HTML ĐỂ MÓC RUỘT D-ATIS
    const atisRegex = /<div class="atis">(.*?)<\/div>/gis;
    let match;
    const atisBlocks = [];

    // Quét từng thẻ div class="atis" tìm được
    while ((match = atisRegex.exec(html)) !== null) {
      let text = match[1]
        .replace(/&#xA;/gi, ' ')       // Đổi mã xuống dòng HTML thành khoảng trắng
        .replace(/&#x9;/gi, ' ')       // XÓA SẠCH MÃ TAB (Thủ phạm gây lỗi hiển thị)
        .replace(/<br\s*\/?>/gi, ' ')  // Biến thẻ <br> thành khoảng trắng
        .replace(/<[^>]*>?/gm, '')     // Xóa tất cả các thẻ HTML rác còn sót lại
        .replace(/&amp;/gi, '&')       // Dịch mã dấu &
        .replace(/\s+/g, ' ')          // GỘP TẤT CẢ KHOẢNG TRẮNG THỪA THÃI THÀNH 1 DẤU CÁCH DUY NHẤT
        .trim();
      
      if (text) atisBlocks.push(text);
    }

    if (atisBlocks.length === 0) {
      console.log("[ATIS.GURU] Đã kéo được giao diện web nhưng không thấy text ATIS.");
      return null; 
    }

    let arrival = null, departure = null, metar = null;

    // Phân loại khối dữ liệu ATIS vừa cào được
    atisBlocks.forEach(text => {
      const upper = text.toUpperCase();

      if (upper.startsWith('METAR')) {
        metar = text.replace(/TAF\s.*/i, '').trim(); 
      } else if (upper.includes('ARR ATIS') || upper.includes('ARRIVAL')) {
        arrival = text;
      } else if (upper.includes('DEP ATIS') || upper.includes('DEPARTURE')) {
        departure = text;
      } else if (!metar && !upper.startsWith('TAF')) {
        arrival = text;
        departure = text;
      }
    });

    // Nếu atis.guru không có METAR riêng, thì tự dịch từ nội dung D-ATIS ra
    if (!metar && (arrival || departure)) {
      metar = convertAtisToMetar(arrival || departure, icao.toUpperCase());
    }

    return {
      arrival: arrival,
      arrTimestamp: Date.now(), 
      departure: departure,
      depTimestamp: Date.now(),
      metar: metar
    };

  } catch (err) {
    console.error(`[ATIS.GURU] Thất bại cuối cùng cho ${icao}:`, err.message);
    return null;
  }
}

// ===================== HELPER: KÉO METAR TỪ CHECKWX =====================
async function fetchMetarFromCheckWX(icao) {
  if (!CHECKWX_API_KEY) return null;
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`https://api.checkwx.com/metar/${icao}`, {
      headers: { 'X-API-Key': CHECKWX_API_KEY }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data && data.data && data.data.length > 0) {
      return data.data[0]; // Trả về raw text METAR
    }
    return null;
  } catch (err) {
    console.error(`Lỗi CheckWX METAR cho ${icao}:`, err.message);
    return null;
  }
}

// ===================== COMMAND: METAR =====================
async function handleMetar(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  try {
    // 1. Ưu tiên lấy từ ATIS.guru
    const atisData = await fetchATIS(icao);

    let metarText = atisData ? atisData.metar : null;
    let hasAtis = atisData && (atisData.arrival || atisData.departure);

    // 2. Fallback CheckWX
    if (!metarText && !hasAtis) {
      metarText = await fetchMetarFromCheckWX(icao);
    }

    let replyContent = '';

    // 3. Xử lý hiển thị METAR
    if (metarText) {
      replyContent += t(interaction, 'STR_8A0CB816', { v0: icao, v1: metarText });
    } else {
      replyContent += t(interaction, 'STR_185E275D', { v0: icao });
    }

    // 4. Xử lý hiển thị D-ATIS
    if (hasAtis) {

      // =========================================================
      // LUẬT ĐẶC CÁCH VCLvACC (VIỆT NAM, CAMPUCHIA, LÀO)
      // Ghép Ngày trên Header với Giờ trong ATIS để đọ thời gian tuyệt đối
      // =========================================================
      if (icao.startsWith('VV') || icao.startsWith('VD') || icao.startsWith('VL')) {
        if (atisData.arrival && atisData.departure) {
          
          // Hàm tính mốc thời gian thực tế
          const getRealIssueTime = (headerTs, text) => {
            if (!headerTs || !text) return 0;
            
            // Tìm mã giờ Z (Bắt cả loại 0500Z hoặc 300500Z)
            const m = text.match(/\b(?:[0-3][0-9])?([0-2][0-9][0-5][0-9])Z\b/);
            if (!m) return headerTs; // Nếu ATC gõ sai format, xài luôn giờ Header

            const hh = parseInt(m[1].substring(0, 2), 10);
            const mm = parseInt(m[1].substring(2, 4), 10);

            // Bóc ngày từ Header
            const dateObj = new Date(headerTs);
            // Ghép Ngày Header + Giờ ATIS
            let issueTime = Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), hh, mm, 0);

            // Xử lý Lỗi Giao Thừa: ATIS 2350Z hôm qua, nhưng Header web là 0010Z hôm nay.
            // Nếu ghép lại nó sẽ thành 2350Z hôm nay (vọt tới tương lai). Giải pháp: Lùi 1 ngày!
            if (issueTime > headerTs + 12 * 3600 * 1000) {
              issueTime -= 24 * 3600 * 1000; 
            }

            return issueTime;
          };

          const realArrTime = getRealIssueTime(atisData.arrTimestamp, atisData.arrival);
          const realDepTime = getRealIssueTime(atisData.depTimestamp, atisData.departure);

          // Thằng nào mang mốc thời gian tổng hợp lớn hơn (mới hơn) thì giữ lại
          if (realArrTime >= realDepTime) {
            atisData.departure = null;
          } else {
            atisData.arrival = null;
          }
        }
      }

      // =========================================================
      // LUẬT KIỂM TRA THÔNG MINH (TÍNH BẰNG NGÀY GIỜ TUYỆT ĐỐI)
      // Dành cho các sân bay quốc tế khác ngoài VCL
      // =========================================================
      if (atisData.arrival && atisData.departure) {
        const now = Date.now();

        // Tính số phút trôi qua kể từ lúc phát ATIS (Bao gồm cả Ngày/Tháng/Năm)
        const arrAge = atisData.arrTimestamp ? (now - atisData.arrTimestamp) / 60000 : 0;
        const depAge = atisData.depTimestamp ? (now - atisData.depTimestamp) / 60000 : 0;

        // Nếu chênh lệch tuổi thọ giữa 2 bản tin lớn hơn 90 phút
        if (Math.abs(arrAge - depAge) > 90) {
          if (arrAge > depAge) {
            atisData.arrival = null; // Arrival cũ nát hơn -> Chém!
          } else {
            atisData.departure = null; // Departure cũ nát hơn -> Chém!
          }
        }
      }

      // Trường hợp 1: Sân bay dùng chung 1 ATIS cho cả Dep và Arr
      if (atisData.arrival && atisData.departure && atisData.arrival === atisData.departure) {
        const formatted = formatATISText(atisData.arrival);
        replyContent += t(interaction, 'STR_DD31CDE2', { v0: icao, v1: formatted });
      }
      // Trường hợp 2: Tách biệt rõ ràng
      else {
        if (atisData.arrival) {
          const formattedArr = formatATISText(atisData.arrival);
          replyContent += t(interaction, 'STR_CF8E06B3', { v0: icao, v1: formattedArr });
        }

        if (atisData.departure) {
          const formattedDep = formatATISText(atisData.departure);
          replyContent += t(interaction, 'STR_0561B3B6', { v0: icao, v1: formattedDep });
        }
      }
    } else {
      replyContent += t(interaction, 'STR_B763D956', { v0: icao });
    }

    await interaction.editReply({ content: replyContent });

  } catch (err) {
    console.error('METAR/ATIS error:', err);
    await interaction.editReply({ content: '❌ Đã có lỗi khi lấy dữ liệu METAR/ATIS. Bạn thử lại sau nhé!' });
  }
}

// ===================== ACTIVE RUNWAY CALCULATOR (HYBRID: OPENAIP + LOCAL DB) =====================
async function handleRunway(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  try {
    // 1. LẤY METAR ĐỂ TÍNH GIÓ 
    let metar = null;
    const atisData = await fetchATIS(icao);

    if (atisData && atisData.metar) {
      metar = atisData.metar;
    } else {
      metar = await fetchMetarFromCheckWX(icao);
    }

    if (!metar) {
      return await interaction.editReply({ content : t(interaction, 'STR_D9C0CB4D', { v0: icao }) });
    }

    // Tìm hướng gió và tốc độ gió trong METAR (VD: 25015G25KT, VRB02KT)
    const windMatch = metar.match(/(VRB|\d{3})(\d{2,3})(?:G\d{2,3})?KT/);
    if (!windMatch) {
      return await interaction.editReply({ content : t(interaction, 'STR_D9D31F31', { v0: icao, v1: metar }) });
    }

    const windDirStr = windMatch[1];
    const windSpeed = parseInt(windMatch[2], 10);

    let embed = new EmbedBuilder()
      .setTitle(t(interaction, 'STR_798F2F7B', { v0: icao }))
      .setDescription(t(interaction, 'STR_75BAEF5B', { v0: metar }))
      .setColor(0x3498db)
      .setTimestamp();

    // Nếu gió đổi hướng liên tục (VRB) hoặc quá nhẹ (<3 KT)
    if (windDirStr === 'VRB' || windSpeed < 3) {
      embed.addFields({ name: '🌬️ Gió', value: 'Gió nhẹ hoặc đổi hướng liên tục (Calm/Variable).', inline: false });
      embed.addFields({ name: '✅ Đề xuất', value: 'Có thể sử dụng đường băng tùy ý hoặc theo quy trình tiêu chuẩn của ATC/Sân bay.', inline: false });
      return await interaction.editReply({ embeds: [embed] });
    }

    const windDir = parseInt(windDirStr, 10);
    embed.addFields({ name: '🌬️ Gió hiện tại', value : t(interaction, 'STR_9618842C', { v0: windDir, v1: windSpeed }), inline: false });

    // 2. LẤY DỮ LIỆU ĐƯỜNG BĂNG TỪ OPENAIP (ĐÃ FIX CƠ CHẾ TÌM KIẾM)
    let runways = [];
    let dataSource = 'Chưa xác định';

    try {
      const fetchObj = (await import('node-fetch')).default;
      const openAipKey = process.env.OPENAIP_API_KEY || 'ce754e3a33063d110f1879a62508ee6a';

      // Tìm bằng param 'icao' trực tiếp, và thêm 'limit' để tránh lỗi
      const res = await fetchObj(`https://api.openaip.net/api/airports?icao=${icao}&apiKey=${openAipKey}`);

      if (res.ok) {
        const data = await res.json();

        // Fix: Tìm trong trường 'items', kiểm tra kỹ cả object
        const airport = data.items ? data.items.find(ap => ap.icaoCode === icao) : null;

        if (airport && airport.runways) {
          airport.runways.forEach(rw => {
            if (rw.designator) {
              const parts = rw.designator.split('/');
              // Sử dụng trueHeading hoặc magneticHeading từ API
              const hdg = rw.trueHeading !== undefined ? rw.trueHeading : rw.magneticHeading;

              if (hdg !== undefined) {
                parts.forEach(part => {
                  runways.push({ id: part.trim(), heading: hdg });
                });
              }
            }
          });
          if (runways.length > 0) dataSource = 'OpenAIP API';
        }
      }
    } catch (e) { console.error('Lỗi OpenAIP:', e); }

    // ==========================================
    // 3. HỆ THỐNG DỰ PHÒNG (DATABASE NỘI BỘ) - Cứu cánh khi API ngáo
    // ==========================================
    if (runways.length === 0) {
      const fallbackRunways = {
        // Vietnam
        VVTS: [{ id: '07', heading: 70 }, { id: '25', heading: 250 }],
        VVNB: [{ id: '11', heading: 110 }, { id: '29', heading: 290 }],
        VVDN: [{ id: '17', heading: 170 }, { id: '35', heading: 350 }],
        VVCI: [{ id: '07', heading: 70 }, { id: '25', heading: 250 }],
        VVVD: [{ id: '03', heading: 30 }, { id: '21', heading: 210 }],
        VVPB: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        VVCR: [{ id: '02', heading: 20 }, { id: '20', heading: 200 }],
        VVPQ: [{ id: '10', heading: 100 }, { id: '28', heading: 280 }],
        VVVH: [{ id: '17', heading: 170 }, { id: '35', heading: 350 }],
        VVBM: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        VVTH: [{ id: '03', heading: 30 }, { id: '21', heading: 210 }],
        VVCM: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        VVCA: [{ id: '14', heading: 140 }, { id: '32', heading: 320 }],
        VVCS: [{ id: '11', heading: 110 }, { id: '29', heading: 290 }],
        VVDB: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        VVDH: [{ id: '11', heading: 110 }, { id: '29', heading: 290 }],
        VVPK: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        VVTX: [{ id: '13', heading: 130 }, { id: '31', heading: 310 }],
        VVCT: [{ id: '06', heading: 60 }, { id: '24', heading: 240 }],

        // International / busy airports
        WSSS: [{ id: '02', heading: 20 }, { id: '20', heading: 200 }],
        WMKK: [{ id: '14', heading: 140 }, { id: '32', heading: 320 }],
        VTBS: [{ id: '01', heading: 10 }, { id: '19', heading: 190 }],
        VTBD: [{ id: '03', heading: 30 }, { id: '21', heading: 210 }],
        VHHH: [{ id: '07', heading: 70 }, { id: '25', heading: 250 }],
        RPLL: [{ id: '06', heading: 60 }, { id: '24', heading: 240 }],
        RCTP: [{ id: '05', heading: 50 }, { id: '23', heading: 230 }],
        RJTT: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        RJAA: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        RKSI: [{ id: '15', heading: 150 }, { id: '33', heading: 330 }],
        ZBAA: [{ id: '01', heading: 10 }, { id: '19', heading: 190 }],
        ZSPD: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        ZGGG: [{ id: '02', heading: 20 }, { id: '20', heading: 200 }],
        OMDB: [{ id: '12', heading: 120 }, { id: '30', heading: 300 }],
        OMAA: [{ id: '13', heading: 130 }, { id: '31', heading: 310 }],
        OERK: [{ id: '15', heading: 150 }, { id: '33', heading: 330 }],
        OOMS: [{ id: '08', heading: 80 }, { id: '26', heading: 260 }],
        OTHH: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        OEJN: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        HECA: [{ id: '05', heading: 50 }, { id: '23', heading: 230 }],
        LTFM: [{ id: '17', heading: 170 }, { id: '35', heading: 350 }],
        LLBG: [{ id: '08', heading: 80 }, { id: '26', heading: 260 }],
        LEMD: [{ id: '18', heading: 180 }, { id: '36', heading: 360 }],
        LEBL: [{ id: '06', heading: 60 }, { id: '24', heading: 240 }],
        LFPG: [{ id: '08', heading: 80 }, { id: '26', heading: 260 }],
        EHAM: [{ id: '18', heading: 180 }, { id: '36', heading: 360 }],
        EDDF: [{ id: '07', heading: 70 }, { id: '25', heading: 250 }],
        EDDM: [{ id: '08', heading: 80 }, { id: '26', heading: 260 }],
        LSZH: [{ id: '14', heading: 140 }, { id: '32', heading: 320 }],
        LOWW: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        EBBR: [{ id: '07', heading: 70 }, { id: '25', heading: 250 }],
        LIRF: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        LIMC: [{ id: '17', heading: 170 }, { id: '35', heading: 350 }],
        EIDW: [{ id: '10', heading: 100 }, { id: '28', heading: 280 }],
        EKCH: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        ENGM: [{ id: '01', heading: 10 }, { id: '19', heading: 190 }],
        ESSA: [{ id: '01', heading: 10 }, { id: '19', heading: 190 }],
        EFHK: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        LPPT: [{ id: '03', heading: 30 }, { id: '21', heading: 210 }],
        LPPR: [{ id: '17', heading: 170 }, { id: '35', heading: 350 }],
        UUEE: [{ id: '06', heading: 60 }, { id: '24', heading: 240 }],
        UUDD: [{ id: '06', heading: 60 }, { id: '24', heading: 240 }],
        ULLI: [{ id: '10', heading: 100 }, { id: '28', heading: 280 }],
        SBGR: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        SBGL: [{ id: '10', heading: 100 }, { id: '28', heading: 280 }],
        SAEZ: [{ id: '11', heading: 110 }, { id: '29', heading: 290 }],
        SCEL: [{ id: '17', heading: 170 }, { id: '35', heading: 350 }],
        SPJC: [{ id: '15', heading: 150 }, { id: '33', heading: 330 }],
        SKBO: [{ id: '13', heading: 130 }, { id: '31', heading: 310 }],
        MMMX: [{ id: '05', heading: 50 }, { id: '23', heading: 230 }],
        CYYZ: [{ id: '05', heading: 50 }, { id: '23', heading: 230 }],
        CYVR: [{ id: '08', heading: 80 }, { id: '26', heading: 260 }],
        CYUL: [{ id: '06', heading: 60 }, { id: '24', heading: 240 }],
        KATL: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        KJFK: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        KLAX: [{ id: '07', heading: 70 }, { id: '25', heading: 250 }],
        KORD: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        KDFW: [{ id: '13', heading: 130 }, { id: '31', heading: 310 }],
        KSEA: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        KDEN: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        KLAS: [{ id: '01', heading: 10 }, { id: '19', heading: 190 }],
        KSFO: [{ id: '10', heading: 100 }, { id: '28', heading: 280 }],
        KMIA: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        KIAH: [{ id: '08', heading: 80 }, { id: '26', heading: 260 }],
        KBOS: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        KPHX: [{ id: '08', heading: 80 }, { id: '26', heading: 260 }],
        KSAN: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        KMSP: [{ id: '12', heading: 120 }, { id: '30', heading: 300 }],
        KDTW: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        KEWR: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        YSSY: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        YMML: [{ id: '16', heading: 160 }, { id: '34', heading: 340 }],
        YPPH: [{ id: '03', heading: 30 }, { id: '21', heading: 210 }],
        YBBN: [{ id: '01', heading: 10 }, { id: '19', heading: 190 }],
        NZAA: [{ id: '05', heading: 50 }, { id: '23', heading: 230 }],

        // Extra busy Asia-Pacific
        VTSP: [{ id: '09', heading: 90 }, { id: '27', heading: 270 }],
        RPVM: [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
        RPLC: [{ id: '02', heading: 20 }, { id: '20', heading: 200 }],
        RPMD: [{ id: '05', heading: 50 }, { id: '23', heading: 230 }]
      };

      if (fallbackRunways[icao]) {
        runways = fallbackRunways[icao];
        dataSource = 'Database Nội Bộ';
      }
    }

    // ==========================================
    // 4. TÍNH TOÁN
    // ==========================================
    if (runways.length === 0) {
      embed.addFields({
        name: '⚠️ Lưu ý',
        value : t(interaction, 'STR_C0D1B8C0', { v0: icao, v1: windDir })
      });
    } else {
      let bestRunway = null;
      let minDiff = 180;

      // Tìm đường băng đón gió trực diện nhất (Headwind)
      runways.forEach(rw => {
        let diff = Math.abs(windDir - rw.heading);
        if (diff > 180) diff = 360 - diff;

        if (diff < minDiff) {
          minDiff = diff;
          bestRunway = rw;
        }
      });

      // Tính Component (Dùng lượng giác để bóc tách gió ngược và ngang)
      const angleRad = minDiff * (Math.PI / 180);
      const headwind = Math.abs(Math.round(Math.cos(angleRad) * windSpeed));
      const crosswind = Math.abs(Math.round(Math.sin(angleRad) * windSpeed));

      embed.addFields({
        name: '🎯 Đường băng thuận lợi nhất',
        value : t(interaction, 'STR_63D760BB', { v0: bestRunway.id, v1: minDiff }),
        inline: false
      });
      embed.addFields({
        name: '✈️ Phân tích thành phần gió',
        value : t(interaction, 'STR_0B521CDE', { v0: headwind, v1: crosswind }),
        inline: false
      });
      embed.setFooter({ text: `Dữ liệu đường băng: ${dataSource} • Lưu ý: Luôn tuân theo huấn lệnh của ATC.` });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Runway calc error:', error);
    await interaction.editReply({ content: '❌ Có lỗi xảy ra khi tính toán đường băng.' });
  }
}

// ===================== TAF DECODER (CHECKWX API - SUPER DETAILED) =====================
async function handleTaf(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  if (!CHECKWX_API_KEY) {
    return interaction.editReply({ content: '❌ Thiếu cấu hình CHECKWX_API_KEY trong biến môi trường. Admin cần kiểm tra lại!' });
  }

  try {
    const fetch = (await import('node-fetch')).default;
    // Gọi API của CheckWX bản Decoded (Nó đã bóc tách sẵn mọi thứ y hệt metar-taf.com)
    const response = await fetch(`https://api.checkwx.com/taf/${icao}/decoded`, {
      headers: { 'X-API-Key': CHECKWX_API_KEY }
    });

    if (!response.ok) {
      return await interaction.editReply({ content : t(interaction, 'STR_68510BC4', { v0: response.status }) });
    }

    const data = await response.json();

    if (!data || data.results === 0 || !data.data || data.data.length === 0) {
      return await interaction.editReply({ content : t(interaction, 'STR_1B22A187', { v0: icao }) });
    }

    const tafData = data.data[0];

    // Tự động phân tích thời gian hiệu lực tổng của TAF
    const validFrom = tafData.timestamp?.from ? `Từ ${tafData.timestamp.from}` : '';
    const validTo = tafData.timestamp?.to ? `Đến ${tafData.timestamp.to}` : '';

    const embed = new EmbedBuilder()
      .setTitle(t(interaction, 'STR_AF48574B', { v0: icao }))
      .setDescription(t(interaction, 'STR_FC64E637', { v0: validFrom, v1: validTo, v2: tafData.raw_text }))
      .setColor(0x00A8FF) // Màu xanh dương chuyên nghiệp
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/1163/1163624.png')
      .setTimestamp()
      .setFooter({ text: 'Dữ liệu được bóc tách từ CheckWX Aviation API' });

    if (tafData.forecast && tafData.forecast.length > 0) {
      const MAX_FORECASTS = 6; // Hiển thị chi tiết 6 mốc thay đổi thời tiết

      tafData.forecast.slice(0, MAX_FORECASTS).forEach((fcst, index) => {
        let fromTime = fcst.timestamp?.forecast_from || fcst.timestamp?.from;
        let toTime = fcst.timestamp?.forecast_to || fcst.timestamp?.to;
        let timeStr = (!fromTime && !toTime) ? 'Toàn bộ thời gian' : `${fromTime || '???'} ➔ ${toTime || '???'}`;

        let details = [];

        // 1. Phân tích Gió chi tiết
        if (fcst.wind) {
          let windDir = fcst.wind.degrees ? `${fcst.wind.degrees}°` : 'VRB (Đổi hướng)';
          let windStr = `**Gió:** ${windDir} ở mức **${fcst.wind.speed_kts || 0} KT**`;
          if (fcst.wind.gust_kts) windStr += ` *(Giật mạnh lên tới ${fcst.wind.gust_kts} KT)*`;
          details.push(`🌬️ ${windStr}`);
        }

        // 2. Tầm nhìn
        if (fcst.visibility?.meters) {
          let vis = fcst.visibility.meters;
          let visStr = vis >= 9999 ? '10km+ (Tốt)' : `${vis} mét`;
          details.push(`👁️ **Tầm nhìn:** ${visStr}`);
        }

        // 3. Hiện tượng thời tiết (Mưa, bão, sương mù...)
        if (fcst.conditions && fcst.conditions.length > 0) {
          const wx = fcst.conditions.map(c => c.text || c.code).join(', ');
          details.push(`🌧️ **Thời tiết:** ${wx}`);
        }

        // 4. Các tầng mây chi tiết
        if (fcst.clouds && fcst.clouds.length > 0) {
          const cloudDetails = fcst.clouds.map(c => {
            let height = c.base_feet_agl || c.feet || c.base_feet || c.base;
            if (!height && c.code) {
              const match = c.code.match(/\d{3}/);
              if (match) height = parseInt(match[0]) * 100;
            }
            const heightText = height ? `${height} ft` : 'Sát mặt đất';
            return `**${c.text || c.code}** (${heightText})`;
          });
          details.push(`☁️ **Mây:** ${cloudDetails.join(' | ')}`);
        } else {
          details.push(`☁️ **Mây:** Trời quang (CAVOK/NSC)`);
        }

        // Đặt tên khối thay đổi cho sang chảnh
        let indicatorCode = fcst.change?.indicator?.code || fcst.change?.indicator?.text || fcst.change?.indicator || 'INITIAL';

        // Dịch nghĩa các mã TAF
        const indicatorMap = {
          'TEMPO': '🟡 Biến động tạm thời (TEMPO)',
          'BECMG': '🔵 Thay đổi dần thành (BECMG)',
          'FM': '🟢 Bắt đầu từ (FM)',
          'PROB30': '🟠 Xác suất 30% xảy ra (PROB30)',
          'PROB40': '🔴 Xác suất 40% xảy ra (PROB40)',
          'INITIAL': '✅ Dự báo ban đầu'
        };
        let niceIndicator = indicatorMap[indicatorCode] || `🔹 ${indicatorCode}`;

        embed.addFields({
          name : t(interaction, 'STR_2F343072', { v0: niceIndicator, v1: timeStr }),
          value: details.length > 0 ? details.join('\n') : '> Thời tiết không có hiện tượng cản trở.',
          inline: false
        });
      });

      if (tafData.forecast.length > MAX_FORECASTS) {
        embed.addFields({
          name: '...',
          value : t(interaction, 'STR_F995A173', { v0: tafData.forecast.length - MAX_FORECASTS }),
          inline: false
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('TAF fetch error:', error);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi gọi CheckWX API để giải mã TAF. Vui lòng thử lại sau!' });
  }
}

// ===================== REACTION ROLES =====================
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  // Bọc thép: Ép bot tải lại toàn bộ thông tin tin nhắn nếu nó là đồ cổ
  if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
  if (reaction.partial) await reaction.fetch().catch(() => {});

  if (reaction.emoji.name === '🤖' && reaction.message.id === reactionRoleData.atcNotiMsgId) {
    try {
      const guild = reaction.message.guild || await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(user.id);
      if (member) {
        await member.roles.add(ATC_NOTI_ROLE_ID);
        console.log(`✅ Đã cấp role BOT_Notification cho ${user.tag}`);
      }
    } catch (err) {
      console.error('Lỗi khi cấp role BOT_Notification:', err);
    }
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  // Bọc thép: Ép bot tải lại toàn bộ thông tin tin nhắn nếu nó là đồ cổ
  if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
  if (reaction.partial) await reaction.fetch().catch(() => {});

  if (reaction.emoji.name === '🤖' && reaction.message.id === reactionRoleData.atcNotiMsgId) {
    try {
      const guild = reaction.message.guild || await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(user.id);
      if (member) {
        await member.roles.remove(ATC_NOTI_ROLE_ID);
        console.log(`✅ Đã gỡ role ATC_Notification khỏi ${user.tag}`);
      }
    } catch (err) {
      console.error('Lỗi khi xóa role ATC_Notification:', err);
    }
  }
});

// ===================== VATSIM STATS & ID CARD FUNCTIONS =====================

/**
 * Helper: Lấy dữ liệu VATSIM Stats qua API
 */
async function fetchVatsimStatsById(cid) {
  try {
    const fetch = (await import('node-fetch')).default;

    // 1. Lấy thông tin cơ bản
    const infoUrl = `https://api.vatsim.net/api/ratings/${cid}/`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) return null; // CID không tồn tại
    const infoData = await infoRes.json();

    // 2. Lấy thống kê giờ bay & ATC
    const statsUrl = `https://api.vatsim.net/v2/members/${cid}/stats`;
    const statsRes = await fetch(statsUrl);

    let pilotHours = 0;
    let atcHours = 0;
    let atcBreakdown = {}; // Chứa chi tiết giờ S1, S2...

    if (statsRes.ok) {
      const statsData = await statsRes.json();
      pilotHours = statsData.pilot || 0;
      atcHours = statsData.atc || 0;

      // Lấy chi tiết giờ theo từng cấp bậc ATC
      atcBreakdown = {
        s1: statsData.s1 || 0,
        s2: statsData.s2 || 0,
        s3: statsData.s3 || 0,
        c1: statsData.c1 || 0,
        c3: statsData.c3 || 0,
        i1: statsData.i1 || 0,
        i3: statsData.i3 || 0
      };
    }

    return {
      id: infoData.id,
      rating: infoData.rating,
      pilotrating: infoData.pilotrating,
      region: infoData.region,
      division: infoData.division,
      subdivision: infoData.subdivision,
      pilot_hours: pilotHours,
      atc_hours: atcHours,
      reg_date: infoData.reg_date,
      atc_breakdown: atcBreakdown
    };
  } catch (err) {
    console.error(`Lỗi lấy stats cho CID ${cid}:`, err.message);
    return null;
  }
}

/**
 * Xử lý lệnh: /stats
 */
async function handleStats(interaction) {
  await interaction.deferReply();
  const cid = interaction.options.getInteger('vatsim_id', true);

  // Lấy dữ liệu
  const stats = await fetchVatsimStatsById(cid);

  if (!stats) {
    return interaction.editReply(t(interaction, 'STR_B2203FFA', { v0: cid }));
  }

  // Chuyển đổi Rating ATC
  const vatsimRatingsSpoken = {
    0: 'Susp', 1: 'OBS', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'C1',
    6: 'C2', 7: 'C3', 8: 'I1', 9: 'I2', 10: 'I3', 11: 'SUP', 12: 'ADM'
  };
  const ratingStr = vatsimRatingsSpoken[stats.rating] || `R${stats.rating}`;

  // Chuyển đổi Rating Pilot (VATSIM dùng bitmask, nhưng ta làm tròn thành Px cho chuẩn)
  const pilotRatingMap = { 0: 'P0', 1: 'P1', 3: 'P2', 7: 'P3', 15: 'P4', 31: 'P5', 63: 'P6' };
  const pRatingStr = pilotRatingMap[stats.pilotrating] || `P${stats.pilotrating}`;

  // Xây dựng Giao Diện (Embed)
  const embed = new EmbedBuilder()
    .setTitle(t(interaction, 'STR_5280B75C', { v0: stats.id }))
    .setColor(0x2b2d31) // Màu nền tối giống trong ảnh
    .addFields(
      // Hàng 1
      { name: '📡 PID', value : t(interaction, 'STR_10533D7D', { v0: stats.id }), inline: true },
      { name: '🗓️ REGISTER DATE', value: formatVatsimDate(stats.reg_date), inline: true },
      { name: '\u200b', value: '\u200b', inline: true }, // Cột tàng hình để ép xuống dòng

      // Hàng 2
      { name: '🔵 ATC RATING', value: ratingStr, inline: true },
      { name: '✈️ PILOT RATING', value: pRatingStr, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },

      // Hàng 3
      { name: '🌐 REGION', value: stats.region || 'N/A', inline: true },
      { name: '🌐 DIVISION', value: stats.division || 'N/A', inline: true },
      { name: '🌐 SUBDIVISION', value: stats.subdivision || 'N/A', inline: true },

      // Hàng 4 (Stats Time)
      { name: '✈️ FLIGHT TIME', value: stats.pilot_hours.toFixed(2), inline: true },
      { name: '📡 ATC TIME', value: stats.atc_hours.toFixed(2), inline: true },
      { name: '\u200b', value: '\u200b', inline: true }
    )
    .setFooter({
      text: `${interaction.user.username} • Via VATSIM API`,
      iconURL: interaction.user.displayAvatarURL()
    })
    .setTimestamp();

  // Thêm chi tiết giờ ATC (S1, S2...) nếu họ có làm ATC
  if (stats.atc_hours > 0) {
    const breakdownFields = [];

    // Duyệt qua từng cấp bậc, nếu có giờ thì mới hiển thị
    for (const [pos, hours] of Object.entries(stats.atc_breakdown)) {
      if (hours > 0) {
        breakdownFields.push({
          name : t(interaction, 'STR_69AEDD5C', { v0: pos.toUpperCase() }),
          value: hours.toFixed(2),
          inline: true
        });
      }
    }

    // Nếu có chi tiết, nhét thêm vào cuối Embed (tối đa 3 cột 1 hàng)
    if (breakdownFields.length > 0) {
      embed.addFields(breakdownFields);
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

async function ensureACDMMessageExists() {
  if (!ACDM_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(ACDM_CHANNEL_ID);
    // Quét 50 tin nhắn gần nhất trong kênh ACDM
    const messages = await channel.messages.fetch({ limit: 50 });

    // Tìm tin nhắn do chính Bot gửi có tiêu đề ACDM Dashboard
    const oldBotMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('ACDM Dashboard'));

    if (oldBotMsg) {
      acdmMessageStore = { messageIds: [oldBotMsg.id], channelId: channel.id };
      console.log(`✅ [ACDM] Đã tìm lại được tin nhắn cũ (ID: ${oldBotMsg.id}) bằng cách quét kênh!`);
      return;
    }
  } catch (err) {
    console.warn('⚠️ Lỗi khi quét tìm tin nhắn ACDM cũ:', err.message);
  }

  // Nếu không tìm thấy thì mới tạo mới
  try {
    const channel = await client.channels.fetch(ACDM_CHANNEL_ID);
    const embed = new EmbedBuilder().setTitle('🛫 VCLvACC ACDM Dashboard').setDescription('Đang thiết lập kết nối API...').setTimestamp();
    const sent = await channel.send({ embeds: [embed] });

    acdmMessageStore = { messageIds: [sent.id], channelId: channel.id };
    console.log('🆕 [ACDM] Không thấy tin nhắn cũ, đã khởi tạo tin nhắn mới.');
  } catch (err) {
    console.error('❌ [ACDM] Lỗi khi tạo tin nhắn Dashboard gốc:', err);
  }
}

// ===================== COMMAND: EVENT =====================
async function handleEvent(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  try {
    const fetch = (await import('node-fetch')).default;
    // Lấy dữ liệu toàn bộ event từ VATSIM
    const response = await fetch('https://my.vatsim.net/api/v1/events/all');

    if (!response.ok) {
      return await interaction.editReply({ content: '❌ Không thể kết nối đến hệ thống sự kiện của VATSIM.' });
    }

    const data = await response.json();
    const events = data.data || [];

    // Lọc ra các sự kiện có chứa ICAO mà user nhập vào
    const airportEvents = events.filter(ev => {
      if (!ev.airports || !Array.isArray(ev.airports)) return false;

      return ev.airports.some(a => {
        // Xử lý an toàn cho cả trường hợp API trả về mảng chuỗi hoặc mảng object
        if (typeof a === 'string') return a.toUpperCase() === icao;
        if (a && a.icao) return a.icao.toUpperCase() === icao;
        return false;
      });
    });

    if (airportEvents.length === 0) {
      return await interaction.editReply({ content : t(interaction, 'STR_467CCCE8', { v0: icao }) });
    }

    const embeds = [];
    // Cắt lấy 5 sự kiện gần nhất để tin nhắn không bị quá dài
    const topEvents = airportEvents.slice(0, 5);

    // Tách mỗi sự kiện thành 1 Embed riêng biệt để chèn được ảnh lớn (banner)
    topEvents.forEach((ev, index) => {
      const startTime = new Date(ev.start_time);
      const endTime = new Date(ev.end_time);

      const embed = new EmbedBuilder()
        .setTitle(t(interaction, 'STR_E5CEB46C', { v0: ev.name }))
        .setColor(0x9b59b6)
        .addFields({
          name: '⏰ Thời gian',
          value : t(interaction, 'STR_F9D5BAA1', { v0: Math.floor(startTime.getTime() / 1000), v1: Math.floor(endTime.getTime() / 1000) }),
          inline: false
        });

      // Nếu API trả về link URL của sự kiện, khi user nhấn vào tiêu đề sẽ nhảy thẳng sang trang VATSIM
      if (ev.link) {
        embed.setURL(ev.link);
      }

      // Gắn ảnh poster của sự kiện
      if (ev.banner) {
        embed.setImage(ev.banner);
      } else {
        // Dự phòng: Nếu sự kiện nào lười không có banner, dùng thumbnail này cho đỡ trống
        embed.setThumbnail('https://cdn-icons-png.flaticon.com/512/3652/3652191.png');
      }

      // Embed đầu tiên sẽ có dòng chữ mô tả tổng quát trên cùng
      if (index === 0) {
        embed.setAuthor({
          name : t(interaction, 'STR_F3CEBAB5', { v0: icao }),
          iconURL: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png'
        });
      }

      // Embed cuối cùng sẽ đóng vai trò chốt footer và báo số lượng sự kiện còn dư
      if (index === topEvents.length - 1) {
        let footerText = 'Dữ liệu từ my.vatsim.net';
        if (airportEvents.length > 5) {
          footerText += ` • Còn ${airportEvents.length - 5} sự kiện khác bị ẩn đi.`;
        }
        embed.setFooter({ text: footerText });
        embed.setTimestamp();
      }

      embeds.push(embed);
    });

    // Quăng cả mảng embeds vào bot (gửi tối đa 10 Embeds/tin nhắn)
    await interaction.editReply({ embeds: embeds });

  } catch (error) {
    console.error('Lỗi khi fetch sự kiện VATSIM:', error);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi tra cứu sự kiện.' });
  }
}
// ===================== HELPER: CÀO ROUTE TỪ WEB =====================
async function fetchRouteFromWeb(dep, arr) {
  try {
    const fetch = (await import('node-fetch')).default;
    // URL trang web chứa route
    const url = 'https://panel.vclvacc.net/flight/info/routes/list';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    let foundRoutes = [];

    // Tìm trong bảng (table), duyệt qua từng hàng (tr)
    $('table tbody tr').each((index, element) => {
      // Cột 1 (eq 0) là Dep, Cột 2 (eq 1) là Arr, Cột 3 (eq 2) là Route
      const rowDep = $(element).find('td').eq(0).text().trim().toUpperCase();
      const rowArr = $(element).find('td').eq(1).text().trim().toUpperCase();

      if (rowDep === dep && rowArr === arr) {
        const routeText = $(element).find('td').eq(2).text().trim();
        if (routeText) foundRoutes.push(routeText);
      }
    });

    return foundRoutes.length > 0 ? foundRoutes : null;
  } catch (err) {
    console.error(`Lỗi khi cào route từ web cho ${dep}-${arr}:`, err.message);
    return null;
  }
}
// ===================== COMMAND: ROUTE =====================
async function handleRoute(interaction) {
  const dep = interaction.options.getString('dep').toUpperCase();
  const arr = interaction.options.getString('arr').toUpperCase();
  const routeKey = `${dep}-${arr}`;

  await interaction.deferReply();

  try {
    let routesList = null;
    let source = 'Website VCLvACC';

    // 1. ƯU TIÊN TÌM TRÊN WEB TRƯỚC
    routesList = await fetchRouteFromWeb(dep, arr);

    // 2. NẾU WEB KHÔNG CÓ (HOẶC LỖI) -> TÌM TRONG FILE JSON
    if (!routesList || routesList.length === 0) {
      const ROUTES_FILE = path.join(__dirname, 'routes.json');
      const routesData = fs.existsSync(ROUTES_FILE) ? JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')) : {};

      if (routesData[routeKey] && routesData[routeKey].length > 0) {
        routesList = routesData[routeKey];
        source = 'File Dữ Liệu Nội Bộ';
      }
    }

    // 3. NẾU CẢ WEB VÀ JSON ĐỀU KHÔNG CÓ
    if (!routesList || routesList.length === 0) {
      return await interaction.editReply({
        content : t(interaction, 'STR_8C2A6052', { v0: dep, v1: arr })
      });
    }

    // ================= BẮT ĐẦU CHỈNH SỬA GIAO DIỆN =================
    const embed = new EmbedBuilder()
      .setColor(0x3B3F45) // Đổi màu sắc cho giống viền nền của hình ảnh (tùy chọn)
      .setAuthor({ name : t(interaction, 'STR_60DD2187', { v0: dep, v1: arr }) }) // Thay cho title để format đẹp như hình
      .addFields(
        { name: '🛫 Departure', value: dep, inline: true },
        { name: '🛬 Arrival', value: arr, inline: true }
      );

    // Xử lý chèn Route vào code block
    if (Array.isArray(routesList)) {
      routesList.forEach((rt, index) => {
        embed.addFields({
          name : t(interaction, 'STR_231C991F', { v0: index + 1 }),
          value : t(interaction, 'STR_68A1141F', { v0: rt }),
          inline: false
        });
      });
    } else {
      embed.addFields({
        name: '🗺️ Flight Route',
        value : t(interaction, 'STR_68A1141F', { v0: routesList }),
        inline: false
      });
    }

    // Xử lý Last Update (Hiển thị ngày hiện tại nếu data từ file JSON hoặc Live từ Web)
    const today = new Date();
    const dateString = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;

    embed.addFields({
      name: '📊 Last Update',
      value: source === 'tk.chill' ? 'tk.chill' : dateString,
      inline: false
    });
    // ================= KẾT THÚC CHỈNH SỬA GIAO DIỆN =================

    // Lấy route đầu tiên để làm link Import
    const primaryRoute = Array.isArray(routesList) ? routesList[0] : routesList;
    const encodedRoute = encodeURIComponent(primaryRoute);

    // Tạo URL Prefile cho SimBrief và VATSIM
    const simbriefUrl = `https://dispatch.simbrief.com/options/custom?orig=${dep}&dest=${arr}&route=${encodedRoute}`;
    const vatsimUrl = `https://my.vatsim.net/pilots/flightplan?departure=${dep}&arrival=${arr}&route=${encodedRoute}`;

    // Tạo hàng chứa các nút bấm
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(t(interaction, 'STR_6D3F8F7C'))
        .setStyle(ButtonStyle.Link)
        .setURL(simbriefUrl)
        .setEmoji('📝'),
      new ButtonBuilder()
        .setLabel(t(interaction, 'STR_E0F1D436'))
        .setStyle(ButtonStyle.Link)
        .setURL(vatsimUrl)
        .setEmoji('🌐')
    );

    // Gửi phản hồi kèm theo Embed và Buttons
    await interaction.editReply({ embeds: [embed], components: [actionRow] });
  } catch (error) {
    console.error('Lỗi lệnh route:', error);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi đọc/tải dữ liệu route.' });
  }
}

// ===================== COMMAND: SỬA THÔNG BÁO CŨ (/edit_announ) =====================
async function handleEditAnnoun(interaction) {
  // Kiểm tra quyền
  const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
  const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
  if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: '❌ Bạn không có quyền.', ephemeral: true });
  }

  const channel = interaction.options.getChannel('channel');
  const messageId = interaction.options.getString('message_id');

  // 1. Kiểm tra xem có phải là ID của thông báo hẹn giờ đang chờ gửi không
  const scheduledIndex = scheduledAnnouncements.findIndex(a => a.id === messageId);
  if (scheduledIndex !== -1) {
    const modal = new ModalBuilder()
      .setCustomId(`edit_sched_${messageId}`)
      .setTitle('Sửa thông báo chờ lịch');

    const textInput = new TextInputBuilder()
      .setCustomId('new_content')
      .setLabel(t(interaction, 'STR_5C7C0DEB'))
      .setStyle(TextInputStyle.Paragraph)
      .setValue(scheduledAnnouncements[scheduledIndex].content.substring(0, 4000))
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    return await interaction.showModal(modal); // Mở Modal và DỪNG ở đây
  }

  // 2. Nếu KHÔNG PHẢI lịch trình hẹn giờ, bắt buộc phải có Channel để móc tin nhắn cũ
  if (!channel) {
    return interaction.reply({ content: '❌ Đây không phải ID lịch trình. Nếu bạn muốn sửa tin nhắn đã gửi, vui lòng chọn thêm mục `channel` (kênh chứa tin nhắn đó) nhé!', ephemeral: true });
  }

  try {
    const targetMsg = await channel.messages.fetch(messageId);
    if (!targetMsg) return interaction.reply({ content: '❌ Không tìm thấy tin nhắn với ID này.', ephemeral: true });

    // Tạo bảng nhập (Modal) cho tin nhắn đã gửi
    const modal = new ModalBuilder()
      .setCustomId(`editannoun_${channel.id}_${messageId}`)
      .setTitle('Sửa thông báo');

    const textInput = new TextInputBuilder()
      .setCustomId('new_content')
      .setLabel(t(interaction, 'STR_5C7C0DEB'))
      .setStyle(TextInputStyle.Paragraph)
      .setValue(targetMsg.content.substring(0, 4000))
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));

    // Bật Pop-up lên màn hình người dùng
    await interaction.showModal(modal);

  } catch (error) {
    console.error('Lỗi lấy tin nhắn cũ:', error);
    await interaction.reply({ content: '❌ Có lỗi xảy ra, đảm bảo ID đúng và bot có quyền xem kênh đó.', ephemeral: true });
  }
}

async function handleCancelAnnoun(interaction) {
  const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
  const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
  if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: '❌ Bạn không có quyền.', ephemeral: true });
  }

  const id = interaction.options.getString('id');
  const initialLength = scheduledAnnouncements.length;
  scheduledAnnouncements = scheduledAnnouncements.filter(a => a.id !== id);

  if (scheduledAnnouncements.length < initialLength) {
    await db.saveAnnouncements(scheduledAnnouncements);
    return interaction.reply({ content : t(interaction, 'STR_922EDAFC', { v0: id }), ephemeral: true });
  } else {
    return interaction.reply({ content : t(interaction, 'STR_6FC19979', { v0: id }), ephemeral: true });
  }
}

// ===================== VATSEA RANK COMMAND =====================
async function handleVatseaRankCommand(interaction) {
  await interaction.deferReply();

  const startStr = interaction.options.getString('start');
  const endStr = interaction.options.getString('end');

  const now = new Date();
  let startTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  let endTime = now;

  if (startStr) {
    startTime = new Date(startStr);
    if (isNaN(startTime.getTime())) {
      return interaction.editReply({ content: '❌ Lỗi: Thời gian bắt đầu sai định dạng (Vui lòng dùng chuẩn ISO như `2023-10-01T00:00:00Z`).' });
    }
  }

  if (endStr) {
    endTime = new Date(endStr);
    if (isNaN(endTime.getTime())) {
      return interaction.editReply({ content: '❌ Lỗi: Thời gian kết thúc sai định dạng.' });
    }
  }

  if (endTime < startTime) {
    return interaction.editReply({ content: '❌ Thời gian kết thúc không thể đứng trước thời gian bắt đầu.' });
  }

  try {
    const embed = await updateVatseaLeaderboardEmbed(startTime, endTime);
    await interaction.editReply({ content: '✅ Đã cập nhật thành công bảng xếp hạng VATSEA!', embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content : t(interaction, 'STR_54F7E5F7', { v0: error.message }) });
  }
}

// ===================== COMMAND: NOTAM =====================
async function handleNotam(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  if (!CHECKWX_API_KEY) {
    return interaction.editReply({ content: '❌ Thiếu cấu hình CHECKWX_API_KEY trong biến môi trường. Admin cần kiểm tra lại!' });
  }

  try {
    const fetch = (await import('node-fetch')).default;
    // [ĐÃ SỬA LỖI 404 TẠI ĐÂY] Endpoint đúng là notam, không phải notams
    const response = await fetch(`https://api.checkwx.com/notam/${icao}`, {
      headers: { 'X-API-Key': CHECKWX_API_KEY }
    });

    if (!response.ok) {
      return await interaction.editReply({ content : t(interaction, 'STR_2F455706', { v0: response.status }) });
    }

    const data = await response.json();

    if (!data || data.results === 0 || !data.data || data.data.length === 0) {
      return await interaction.editReply({ content : t(interaction, 'STR_AB0F8F8D', { v0: icao }) });
    }

    const embed = new EmbedBuilder()
      .setTitle(t(interaction, 'STR_3F38F411', { v0: icao }))
      .setColor(0xe74c3c)
      .setTimestamp()
      .setFooter({ text: 'Powered by CheckWX API' });

    // Một sân bay có thể có rất nhiều NOTAM, chỉ hiển thị 5 cái mới/quan trọng nhất
    const MAX_NOTAMS = Math.min(data.data.length, 5);
    for (let i = 0; i < MAX_NOTAMS; i++) {
      // Ưu tiên dùng dữ liệu decoded, nếu không thì lấy raw_text
      const notamText = data.data[i].decoded || data.data[i].raw_text || 'Không có nội dung';

      // Xử lý nếu một NOTAM quá dài (chống lỗi giới hạn 1024 ký tự của Discord)
      const safeText = notamText.length > 1000 ? notamText.slice(0, 1000) + '...' : notamText;

      embed.addFields({
        name : t(interaction, 'STR_3C87EFAC', { v0: i + 1 }),
        value : t(interaction, 'STR_68A1141F', { v0: safeText }),
        inline: false
      });
    }

    if (data.data.length > MAX_NOTAMS) {
      embed.addFields({
        name: '...',
        value : t(interaction, 'STR_0550F2E2', { v0: data.data.length - MAX_NOTAMS }),
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('NOTAM fetch error:', error);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi kéo dữ liệu NOTAM. Vui lòng thử lại sau!' });
  }
}

// ===================== COMMAND: SIMBRIEF FETCHER =====================
async function handleSimbrief(interaction) {
  let username = interaction.options.getString('username');
  const discordId = interaction.user.id;

  await interaction.deferReply();

  // 1. Kiểm tra xem user có nhập username không, nếu không thì lấy từ Google Sheets
  if (!username) {
    if (simbriefUsersData[discordId]) {
      username = simbriefUsersData[discordId];
    } else {
      return await interaction.editReply({
        content: '❌ Bạn chưa nhập username SimBrief. Lần đầu tiên sử dụng lệnh, vui lòng gõ tên username để bot ghi nhớ lại nhé!'
      });
    }
  } else {
    // 2. Nếu có nhập thủ công, tiến hành cập nhật vào hệ thống lưu trữ
    if (simbriefUsersData[discordId] !== username) {
      simbriefUsersData[discordId] = username;
      try {
        await saveSimbriefUsersSheet(simbriefUsersData);
      } catch (err) {
        console.error('Lỗi khi đẩy Simbrief username lên Sheets:', err);
      }
    }
  }

  try {
    const fetch = (await import('node-fetch')).default;
    // API SimBrief trả về dữ liệu chuẩn JSON khi thêm &json=1
    const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}&json=1`);

    if (!response.ok) {
      return await interaction.editReply({ content: '❌ Không thể kết nối đến máy chủ SimBrief.' });
    }

    const data = await response.json();

    // Giữ nguyên phần code còn lại của bạn...
    if (data.fetch?.status !== 'Success') {
      return await interaction.editReply({
        content : t(interaction, 'STR_422F072A', { v0: username })
      });
    }

    // Bóc tách dữ liệu
    const dep = data.origin?.icao_code || 'N/A';
    const arr = data.destination?.icao_code || 'N/A';
    const acft = data.aircraft?.icaocode || 'N/A';
    const airline = data.general?.icao_airline || '';
    const fltNum = data.general?.flight_number || '';
    const callsign = airline + fltNum;

    // Xử lý Cruise Alt
    let crzAlt = data.general?.initial_alt || 'N/A';
    if (!crzAlt.startsWith('FL') && !isNaN(crzAlt)) {
      crzAlt = `FL${crzAlt.substring(0, 3)}`; // Convert "35000" thành "FL350"
    }

    const route = data.general?.route || 'N/A';
    const zfw = data.weights?.est_zfw || 0;
    const blockFuel = data.fuel?.plan_ramp || 0;
    const ci = data.general?.costindex || 'AUTO';

    const embed = new EmbedBuilder()
      .setTitle(t(interaction, 'STR_90A16B58', { v0: username }))
      .setDescription(t(interaction, 'STR_CE5B5755', { v0: dep, v1: arr, v2: callsign || 'N/A' }))
      .setColor(0x3498db)
      .addFields(
        { name: '🛩️ Aircraft', value : t(interaction, 'STR_137BAD49', { v0: acft }), inline: true },
        { name: '🛫 Cruise Alt', value : t(interaction, 'STR_137BAD49', { v0: crzAlt }), inline: true },
        { name: '📈 Cost Index', value : t(interaction, 'STR_137BAD49', { v0: ci }), inline: true },
        { name: '⚖️ ZFW', value : t(interaction, 'STR_C71AD253', { v0: zfw }), inline: true },
        { name: '⛽ Block Fuel', value : t(interaction, 'STR_C71AD253', { v0: blockFuel }), inline: true },
        { name: '🧭 Route', value : t(interaction, 'STR_68A1141F', { v0: route }), inline: false }
      )
      .setFooter({ text: 'Dữ liệu trực tiếp từ SimBrief', iconURL: 'https://www.simbrief.com/logo/simbrief_logo_icon.png' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('SimBrief fetch error:', error);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra. Username không tồn tại hoặc API SimBrief bị sập.' });
  }
}

// ===================== COMMAND: ONLINE ATC =====================
async function handleOnlineAtc(interaction) {
  // Lấy mã ICAO do người dùng nhập và viết hoa lên (VD: vvts -> VVTS)
  const icao = interaction.options.getString('icao').toUpperCase();

  // Báo cho Discord biết bot đang xử lý để không bị lỗi timeout 3 giây
  await interaction.deferReply();

  try {
    const fetch = (await import('node-fetch')).default;
    // Gọi thẳng API dữ liệu tổng của VATSIM để lấy thông tin mới nhất (Real-time)
    const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');

    if (!response.ok) {
      return await interaction.editReply({ content: '❌ Không thể kết nối đến máy chủ VATSIM lúc này.' });
    }

    const data = await response.json();

    // Lọc danh sách ATC theo đúng mã ICAO người dùng nhập
    const airportATCs = data.controllers.filter(controller => {
      // Kiểm tra xem callsign có bắt đầu bằng ICAO người dùng nhập không (VD: VVTS_APP, VVTS_TWR)
      const isMatchICAO = controller.callsign.startsWith(icao);

      // KHÔNG PHẢI OBS (Rating phải lớn hơn 1 và không chứa chữ OBS)
      const isNotOBS = controller.rating > 1 && !controller.callsign.includes('OBS');

      // Chỉ lấy những ATC thỏa mãn CẢ HAI điều kiện
      return isMatchICAO && isNotOBS;
    });

    // Nếu không có ai online
    if (airportATCs.length === 0) {
      return await interaction.editReply({ content : t(interaction, 'STR_45D190DD', { v0: icao }) });
    }

    // Xây dựng Embed hiển thị danh sách
    const embed = new EmbedBuilder()
      .setTitle(t(interaction, 'STR_8A6328F7', { v0: icao }))
      .setColor(0x2ecc71)
      .setThumbnail('https://cdn-icons-png.freepik.com/512/6938/6938996.png')
      .setTimestamp()
      .setFooter({ text: 'Dữ liệu trực tiếp từ VATSIM' });

    // Bộ dịch Rating
    const vatsimRatings = {
      0: 'Susp', 1: 'OBS', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'C1', 6: 'C2', 7: 'C3', 8: 'I1', 9: 'I2', 10: 'I3', 11: 'SUP', 12: 'ADM'
    };

    // Duyệt qua từng ATC hợp lệ và thêm vào Embed
    airportATCs.forEach(c => {
      const rating = vatsimRatings[c.rating] || `R${c.rating}`;
      const logonUnix = Math.floor(new Date(c.logon_time).getTime() / 1000);

      // Xử lý tần số nếu chưa set
      const freq = (c.frequency && c.frequency !== '199.998' && c.frequency !== 199.998)
        ? c.frequency
        : 'Đang thiết lập...';

      embed.addFields({
        name : t(interaction, 'STR_805EE57A', { v0: c.callsign }),
        value : t(interaction, 'STR_7FED98BC', { v0: c.name || 'Ẩn danh', v1: rating, v2: freq, v3: logonUnix }),
        inline: false
      });
    });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Lỗi khi tra cứu ATC online:', error);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi kéo dữ liệu từ VATSIM.' });
  }
}

// ===================== TK.CHILL MUSIC SYSTEM (EXCLUSIVE DASHBOARD) =====================

// ===================== HÀM TÍNH TOÁN THANH TRƯỢT =====================
function parseDurationToSec(durStr) {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatSecToTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildProgressBar(elapsedSec, totalSec) {
  if (totalSec === 0) return `🔘▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`;
  const barLength = 20;
  const progress = Math.min(elapsedSec / totalSec, 1);
  let pos = Math.round(progress * barLength);
  if (pos >= barLength) pos = barLength - 1;

  let bar = '';
  for (let i = 0; i < barLength; i++) {
    if (i === pos) bar += '🔘';
    else bar += '▬';
  }
  return bar;
}

// ===================== GIAO DIỆN PREMIUM (2 HÀNG NÚT CÓ LOOP) =====================
function createMusicDashboard(queue) {
  if (!queue || queue.songs.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setAuthor({ name: 'TK.CHILL PLAYER', iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png' })
          .setDescription('💤 **Hàng chờ trống!** Bot đang nằm chờ ở đây. Hãy dùng lệnh `/play` để thêm nhạc tiếp nhé...')
      ],
      components: []
    };
  }

  const currentSong = queue.songs[0];
  const volPercent = Math.round((queue.volume || 1.0) * 100);

  // TÍNH TOÁN TIẾN TRÌNH NHẠC
  let elapsedSec = 0;
  if (queue.resource) {
    elapsedSec = Math.floor(queue.resource.playbackDuration / 1000);
  }
  const totalSec = parseDurationToSec(currentSong.durationRaw);
  const progressBar = buildProgressBar(elapsedSec, totalSec);
  const elapsedStr = formatSecToTime(elapsedSec);

  // Trạng thái lặp
  const loopText = queue.loop ? '🔂 **Đang lặp:** BẬT' : '🔁 **Đang lặp:** TẮT';

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'NOW PLAYING', iconURL: 'https://cdn-icons-png.flaticon.com/512/659/659056.png' })
    .setTitle(currentSong.title)
    .setURL(currentSong.url)
    .setDescription(t(interaction, 'STR_B6FF535C', { v0: progressBar, v1: elapsedStr, v2: currentSong.durationRaw, v3: currentSong.requester, v4: volPercent, v5: loopText }))
    .setImage(currentSong.thumbnail)
    .setColor(0x2b2d31)
    .setFooter({ text: `Hàng chờ: ${queue.songs.length - 1} bài • Độc quyền Tk.Chill` });

  // HÀNG NÚT 1: CHUYỂN BÀI & LẶP (4 nút)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_pause').setEmoji(queue.playing ? '⏸️' : '▶️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('music_loop').setEmoji(queue.loop ? '🔂' : '🔁').setStyle(queue.loop ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  // HÀNG NÚT 2: ÂM LƯỢNG (2 nút)
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ===================== CỖ MÁY XỬ LÝ NHẠC (LAZY LOAD) =====================
async function playNextSong(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  if (queue.progressInterval) clearInterval(queue.progressInterval);

  if (queue.songs.length === 0) {
    queue.playing = false;
    if (queue.dashboardMsg) await queue.dashboardMsg.edit(createMusicDashboard(queue)).catch(() => { });
    return;
  }

  const song = queue.songs[0];
  try {
    // ================= KHU VỰC LAZY LOAD (GIẢI MÃ ÂM THANH) =================
    if (!song.url && song.resolveQuery) {
      if (queue.dashboardMsg) await queue.dashboardMsg.edit({
        embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(t(interaction, 'STR_FB65CCF2', { v0: song.title.replace('🔎 Đang tìm: ', '') }))],
        components: []
      }).catch(() => { });

      // Ném tên bài hát qua kho SoundCloud để lấy link ẩn
      const searchResults = await play.search(song.resolveQuery, { limit: 1, source: { soundcloud: 'tracks' } });
      if (!searchResults || searchResults.length === 0) {
        if (queue.textChannel) queue.textChannel.send(t(interaction, 'STR_E9F4A8C4', { v0: song.title.replace('🔎 Đang tìm: ', '') })).then(m => setTimeout(() => m.delete().catch(() => { }), 5000));
        queue.songs.shift();
        return playNextSong(guildId);
      }

      const track = searchResults[0];
      song.title = track.name; // Cập nhật lại tên chuẩn
      song.url = track.url;
      song.thumbnail = song.thumbnail || track.thumbnail;

      const mins = Math.floor(track.durationInSec / 60);
      const secs = track.durationInSec % 60;
      song.durationRaw = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    // =========================================================================

    // ================= KHU VỰC TẢI ÂM THANH (CHỐNG CẮT 30 GIÂY) =================
    // Xóa bỏ đoạn ép chất lượng, để thư viện tự tải bản đầy đủ mượt nhất
    const stream = await play.stream(song.url);

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true, // Vẫn giữ nút tăng giảm âm lượng
      silencePaddingFrames: 5
    });

    // Nạp âm lượng mặc định
    resource.volume.setVolume(queue.volume ?? 0.6);
    queue.resource = resource;
    // =========================================================================

    queue.player.play(resource);
    queue.playing = true;

    const dashboardData = createMusicDashboard(queue);
    if (queue.dashboardMsg) {
      await queue.dashboardMsg.edit(dashboardData).catch(() => { });
    } else {
      queue.dashboardMsg = await queue.textChannel.send(dashboardData);
    }

    queue.progressInterval = setInterval(async () => {
      if (queue && queue.playing && queue.dashboardMsg && queue.songs.length > 0) {
        await queue.dashboardMsg.edit(createMusicDashboard(queue)).catch(() => { });
      }
    }, 15000);

  } catch (error) {
    console.error(`❌ Lỗi phát bài:`, error.message);
    queue.songs.shift();
    playNextSong(guildId);
  }
}

// ===================== XỬ LÝ LỆNH /PLAY (HỖ TRỢ FULL PLAYLIST + LAZY LOAD) =====================
async function handlePlayMusic(interaction) {
  const query = interaction.options.getString('query');
  const voiceChannel = interaction.member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: '❌ Bạn phải vào một kênh thoại (Voice Channel) trước mới nghe nhạc được chứ!', ephemeral: true });
  }

  await interaction.deferReply();
  let songsToAdd = []; // Mảng chứa các bài hát sẽ thêm vào

  try {
    const isLink = query.startsWith('http');
    const fetch = (await import('node-fetch')).default;

    if (isLink) {
      // -------------------------------------------------------------
      // TRƯỜNG HỢP 1: YOUTUBE (TRACK & PLAYLIST)
      // -------------------------------------------------------------
      if (query.includes('youtube.com') || query.includes('youtu.be')) {
        if (query.includes('list=')) { // Nếu là Playlist
          const ytData = await play.playlist_info(query, { incomplete: true });
          const tracks = await ytData.all_videos();
          for (const t of tracks) {
            songsToAdd.push({
              title: t.title,
              resolveQuery: `${t.title} ${t.channel?.name || ''}`.trim(),
              thumbnail: t.thumbnails?.[0]?.url,
              durationRaw: t.durationRaw || '0:00',
              requester: interaction.user.id,
              url: null // Đánh dấu là chưa lấy âm thanh (Lazy Load)
            });
          }
        } else { // Nếu là Bài đơn
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(query)}&format=json`;
          const oembedRes = await fetch(oembedUrl);
          if (!oembedRes.ok) return interaction.editReply(t(interaction, 'STR_D60790C5'));
          const oembedData = await oembedRes.json();
          songsToAdd.push({
            title: oembedData.title,
            resolveQuery: `${oembedData.title} ${oembedData.author_name || ''}`.trim(),
            thumbnail: oembedData.thumbnail_url,
            durationRaw: '0:00',
            requester: interaction.user.id,
            url: null
          });
        }
      }
      // -------------------------------------------------------------
      // TRƯỜNG HỢP 2: SPOTIFY (TRACK, ALBUM, PLAYLIST) - LÕI MỚI CHỐNG LỖI 400
      // -------------------------------------------------------------
      else if (query.includes('spotify.com')) {
        try {
          // Nhúng lõi spotify-url-info (Cào trực tiếp web, bypass API Key)
          const { getTracks } = require('spotify-url-info')(fetch);
          const tracks = await getTracks(query);

          for (const t of tracks) {
            // Chuyển đổi mili-giây sang định dạng phút:giây chuẩn
            const durationMs = t.duration_ms || 0;
            const mins = Math.floor(durationMs / 60000);
            const secs = Math.floor((durationMs % 60000) / 1000);

            songsToAdd.push({
              title: `${t.name} - ${t.artists ? t.artists.map(a => a.name).join(', ') : ''}`,
              resolveQuery: `${t.name} ${t.artists ? t.artists[0]?.name : ''}`.trim(),
              thumbnail: t.coverArt?.sources?.[0]?.url || null,
              durationRaw: durationMs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : '0:00',
              requester: interaction.user.id,
              url: null // Bàn giao lại cho hệ thống Lazy Load (SoundCloud) tự đi tìm audio
            });
          }
        } catch (spErr) {
          console.error('Lỗi lõi Spotify mới:', spErr);
          return interaction.editReply(t(interaction, 'STR_91B16117'));
        }
      }
      // -------------------------------------------------------------
      // TRƯỜNG HỢP 3: APPLE MUSIC (MỔ BỤNG MỌI THẺ JSON VÀ BẮT LỖI PRIVATE)
      // -------------------------------------------------------------
      else if (query.includes('music.apple.com')) {
        try {
          const fetch = (await import('node-fetch')).default;
          const cheerio = require('cheerio');

          const response = await fetch(query, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });

          if (!response.ok) throw new Error('Không thể truy cập Apple Music');

          const html = await response.text();
          const $ = cheerio.load(html);

          let trackList = [];
          const thumbnail = $('meta[property="og:image"]').attr('content') || null;

          // CỖ MÁY ĐÀO XỚI JSON ĐA NĂNG (Quét mọi ngóc ngách của Apple)
          const findTracks = (obj) => {
            if (!obj) return;
            if (Array.isArray(obj)) {
              obj.forEach(findTracks);
            } else if (typeof obj === 'object') {
              // Nếu object chứa danh sách bài hát
              if (Array.isArray(obj.items) && obj.items.length > 0 && obj.items[0].title && (obj.itemKind === 'trackLockup' || (obj.id && typeof obj.id === 'string' && obj.id.includes('track-list')))) {
                obj.items.forEach(item => {
                  if (item.title && !trackList.some(t => t.title === item.title)) {
                    let artist = item.artistName || '';
                    if (!artist && item.subtitleLinks) {
                      artist = item.subtitleLinks.map(l => l.title).join(', ');
                    }
                    let durationStr = '0:00';
                    if (item.duration) {
                      const mins = Math.floor(item.duration / 60000);
                      const secs = Math.floor((item.duration % 60000) / 1000);
                      durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                    }
                    trackList.push({
                      title: `${item.title} - ${artist}`.replace(/ - $/, '').trim(),
                      resolveQuery: `${item.title} ${artist}`.trim(),
                      thumbnail: thumbnail,
                      durationRaw: durationStr,
                      requester: interaction.user.id,
                      url: null
                    });
                  }
                });
              }
              // Quét tiếp vào các lớp sâu hơn
              Object.values(obj).forEach(findTracks);
            }
          };

          // Lật tung TẤT CẢ các thẻ script chứa JSON trên trang web
          $('script[type="application/json"], script[type="application/ld+json"]').each((i, el) => {
            try {
              const parsedJSON = JSON.parse($(el).text());
              findTracks(parsedJSON);
            } catch (e) { }
          });

          // XỬ LÝ KẾT QUẢ
          if (trackList.length > 0) {
            songsToAdd.push(...trackList);
          } else {
            // NẾU KHÔNG TÌM THẤY BÀI NÀO TRONG PLAYLIST
            if (query.includes('/playlist/') || query.includes('/album/')) {
              return interaction.editReply(t(interaction, 'STR_5A300390'));
            } else {
              // CỨU CÁNH CHO BÀI HÁT ĐƠN
              let title = $('meta[property="og:title"]').attr('content') || $('title').text();
              title = title.replace(/ - Single by.*/i, '').replace(/ - EP by.*/i, '').replace(/ on Apple Music/i, '').trim();

              songsToAdd.push({
                title: title,
                resolveQuery: title,
                thumbnail: thumbnail,
                durationRaw: '0:00',
                requester: interaction.user.id,
                url: null
              });
            }
          }
        } catch (apErr) {
          console.error('Lỗi xử lý Apple Music:', apErr);
          return interaction.editReply(t(interaction, 'STR_1BA3B686'));
        }
      }
      // -------------------------------------------------------------
      // TRƯỜNG HỢP 4: SOUNDCLOUD CHUẨN
      // -------------------------------------------------------------
      else if (query.includes('soundcloud.com')) {
        const sc_type = await play.so_validate(query);
        if (sc_type === 'playlist') {
          const scData = await play.soundcloud(query);
          const tracks = await scData.all_tracks();
          for (const t of tracks) {
            const mins = Math.floor(t.durationInSec / 60);
            const secs = t.durationInSec % 60;
            songsToAdd.push({
              title: t.name,
              url: t.url,
              thumbnail: t.thumbnail,
              durationRaw: `${mins}:${secs.toString().padStart(2, '0')}`,
              requester: interaction.user.id
            });
          }
        } else {
          const scInfo = await play.soundcloud(query);
          const mins = Math.floor(scInfo.durationInSec / 60);
          const secs = scInfo.durationInSec % 60;
          songsToAdd.push({
            title: scInfo.name,
            url: scInfo.url,
            thumbnail: scInfo.thumbnail,
            durationRaw: `${mins}:${secs.toString().padStart(2, '0')}`,
            requester: interaction.user.id
          });
        }
      } else {
        return interaction.editReply(t(interaction, 'STR_EF801B10'));
      }
    } else {
      // TÌM KIẾM BẰNG TEXT -> Đẩy qua Lazy Load cho nhanh
      songsToAdd.push({
        title: `🔎 Đang tìm: ${query}...`,
        resolveQuery: query,
        thumbnail: null,
        durationRaw: '0:00',
        requester: interaction.user.id,
        url: null
      });
    }

    if (songsToAdd.length === 0) return interaction.editReply(t(interaction, 'STR_6A289138'));

    let queue = musicQueues.get(interaction.guild.id);

    // TẠO HÀNG CHỜ NẾU CHƯA CÓ
    if (!queue) {
      queue = {
        textChannel: interaction.channel,
        voiceChannel: voiceChannel,
        connection: null,
        player: createAudioPlayer(),
        songs: [],
        playing: false,
        volume: 0.6,
        dashboardMsg: null,
        loop: false,       // <-- THÊM CỜ LOOP VÀO ĐÂY
        forceSkip: false   // <-- Cờ ép qua bài (dù đang bật loop)
      };
      musicQueues.set(interaction.guild.id, queue);

      // Kết nối bot vào Voice Channel
      queue.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });
      queue.connection.subscribe(queue.player);

      // LOGIC CHUYỂN BÀI / LẶP LẠI BÀI THÔNG MINH
      queue.player.on(AudioPlayerStatus.Idle, () => {
        // Nếu không bật Lặp, HOẶC người dùng cố tình bấm Nút Skip -> thì vứt bài cũ đi
        if (!queue.loop || queue.forceSkip) {
          queue.songs.shift();
        }
        queue.forceSkip = false; // Reset lại cờ ép qua bài

        playNextSong(interaction.guild.id);
      });
    }

    // TÍNH NĂNG MENU CHỌN BÀI / PLAYLIST (HỖ TRỢ LÊN ĐẾN 100 BÀI)
    if (songsToAdd.length > 1) {
      // Lưu tạm vào bộ nhớ chờ user bấm nút
      const searchId = Date.now().toString();
      temporarySearchResults.set(searchId, songsToAdd);

      // Chỉ hiển thị 25 bài đầu tiên lên Menu Dropdown (Giới hạn của Discord)
      const options = songsToAdd.slice(0, 25).map((song, index) => ({
        label: song.title.length > 50 ? song.title.substring(0, 47) + '...' : song.title,
        value : t(interaction, 'STR_0E085810', { v0: searchId, v1: index })
      }));

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_song')
          .setPlaceholder(t(interaction, 'STR_57767B96'))
          .addOptions(options)
      );

      const btnAll = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`play_all_${searchId}`)
          .setLabel(`Phát toàn bộ ${songsToAdd.length} bài vào hàng chờ`)
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({
        content : t(interaction, 'STR_F7582EEE', { v0: songsToAdd.length }),
        components: [menu, btnAll]
      });
    }
    // TRƯỜNG HỢP TÌM THẤY CHỈ ĐÚNG 1 BÀI
    else {
      queue.songs.push(songsToAdd[0]);
      await interaction.editReply(t(interaction, 'STR_6A527FB4', { v0: songsToAdd[0].title.replace('🔎 Đang tìm: ', '') }));
      setTimeout(() => interaction.deleteReply().catch(() => { }), 5000);

      // Nếu bot đang ngủ (chưa hát bài nào), thì gọi dậy hát luôn
      if (queue.songs.length === 1 || !queue.playing) {
        playNextSong(interaction.guild.id);
      } else {
        if (queue.dashboardMsg) await queue.dashboardMsg.edit(createMusicDashboard(queue)).catch(() => { });
      }
    }

  } catch (error) {
    console.error('Lỗi khi tải nhạc:', error);
    await interaction.editReply(t(interaction, 'STR_D118EE7F'));
  }
} // <--- Đóng hàm handlePlayMusic tại đây

// ===================== XỬ LÝ LỆNH /QUEUE =====================
async function handleQueue(interaction) {
  // Lấy dữ liệu hàng chờ của server hiện tại
  const queue = musicQueues.get(interaction.guild.id);

  // Nếu không có nhạc hoặc chỉ có mỗi 1 bài đang hát (hàng chờ = 0)
  if (!queue || queue.songs.length <= 1) {
    return interaction.reply({
      content: '📭 **Hàng chờ hiện tại đang trống!** Hãy dùng lệnh `/play` để thêm nhạc vào nhé.',
      ephemeral: true
    });
  }

  // Báo cho Discord biết bot đang xử lý để không bị lỗi đỏ
  await interaction.deferReply();

  const currentSong = queue.songs[0];
  // Cắt lấy 10 bài tiếp theo thôi để tránh tin nhắn bị quá dài (Discord giới hạn)
  const upcomingSongs = queue.songs.slice(1, 11);

  const embed = new EmbedBuilder()
    .setAuthor({ name: '📜 DANH SÁCH HÀNG CHỜ', iconURL: 'https://cdn-icons-png.flaticon.com/512/3281/3281289.png' })
    .setColor(0x2b2d31)
    .setThumbnail(currentSong.thumbnail)
    .setDescription(t(interaction, 'STR_42C4070B', { v0: currentSong.title, v1: currentSong.url, v2: currentSong.requester }));

  // Duyệt qua 10 bài tiếp theo và in ra
  upcomingSongs.forEach((song, index) => {
    embed.addFields({
      name : t(interaction, 'STR_47454EDF', { v0: index + 1, v1: song.title }),
      value : t(interaction, 'STR_99DAEC98', { v0: song.durationRaw, v1: song.requester }),
      inline: false
    });
  });

  // Nếu hàng chờ dài hơn 10 bài, báo cho người dùng biết còn bài bị ẩn
  if (queue.songs.length > 11) {
    embed.setFooter({ text: `...và ${queue.songs.length - 11} bài hát khác đang chờ được phát.` });
  } else {
    embed.setFooter({ text: `Tổng cộng có ${queue.songs.length - 1} bài trong hàng chờ.` });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ===================== XỬ LÝ LỆNH /CLEAR =====================
async function handleClearQueue(interaction) {
  const queue = musicQueues.get(interaction.guild.id);

  // Nếu không có hàng chờ hoặc chỉ có mỗi 1 bài đang hát thì không có gì để xóa
  if (!queue || queue.songs.length <= 1) {
    return interaction.reply({
      content: '❌ Hàng chờ đang trống sẵn rồi, không có gì để dọn đâu!',
      ephemeral: true
    });
  }

  const removeCount = queue.songs.length - 1;

  // Giữ lại bài ở vị trí số 0 (đang phát), chém bay màu toàn bộ bài từ vị trí số 1 trở đi
  queue.songs.splice(1);

  await interaction.reply({ content : t(interaction, 'STR_82DF590F', { v0: removeCount }) });

  // Cập nhật lại cái bảng điều khiển Dashboard ngay lập tức cho con số nó nhảy về 0
  if (queue.dashboardMsg) {
    await queue.dashboardMsg.edit(createMusicDashboard(queue)).catch(() => { });
  }
}

async function handleSetupVatsimVerify(interaction) {
  // Bọc thép an toàn: Kiểm tra cả cache lẫn dạng mảng thô của Discord API
  const memberRoles = interaction.member?.roles;
  const hasAdmin = memberRoles?.cache?.has(roles.adminRoleId) || (Array.isArray(memberRoles) && memberRoles.includes(roles.adminRoleId));

  if (!hasAdmin && interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: '❌ Chỉ Admin mới có thể dùng lệnh này.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔗 LIÊN KẾT TÀI KHOẢN VATSIM')
    .setDescription('Nhấn vào nút bên dưới và nhập **VATSIM ID (CID)** của bạn để hệ thống kiểm tra dữ liệu bay và tự động cấp Role.\n\n✈️ **VATSIM Pilot:** Yêu cầu bay trên 10 giờ.\n📡 **VATSIM ATC:** Yêu cầu Rating từ S1 trở lên (Không tính OBS).')
    .setColor(0x3498db);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_verify_pilot').setLabel(t(interaction, 'STR_EA013000')).setStyle(ButtonStyle.Primary).setEmoji('✈️'),
    new ButtonBuilder().setCustomId('btn_verify_atc').setLabel(t(interaction, 'STR_DEFA5A50')).setStyle(ButtonStyle.Success).setEmoji('📡')
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ Đã tạo bảng liên kết VATSIM thành công!', ephemeral: true });
}

// ===================== SIÊU LOGGING: BẮT TRỌN MỌI CHUYỂN ĐỘNG CỦA SERVER =====================

// 1. LOG ĐỔI TÊN NICKNAME (Biệt danh trong Server)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // Discord.js cho phép nhiều event guildMemberUpdate chạy cùng lúc nên không sợ đụng cái log role hồi nãy
  if (oldMember.nickname !== newMember.nickname) {
    const oldNick = oldMember.nickname || oldMember.user.username;
    const newNick = newMember.nickname || newMember.user.username;
    const embed = createLogEmbed(
      '🏷️ Nickname Updated',
      `**User:** ${getUserIdentifier(newMember.user)}\n**Từ:** \`${oldNick}\`\n**Thành:** \`${newNick}\``,
      0x3498db
    );
    await sendLog(embed);
  }
});

// 2. LOG ĐỔI TÊN USERNAME GLOBALLY (Tên tài khoản Discord gốc)
client.on('userUpdate', async (oldUser, newUser) => {
  if (oldUser.username !== newUser.username) {
    const embed = createLogEmbed(
      '👤 Username Updated',
      `**User:** <@${newUser.id}>\n**Từ:** \`${oldUser.username}\`\n**Thành:** \`${newUser.username}\``,
      0x2980b9
    );
    await sendLog(embed);
  }
});

// 3. LOG KÊNH (Tạo mới, Xóa, Đổi tên)

client.on('channelUpdate', async (oldChannel, newChannel) => {
  if (!oldChannel.guild) return;
  // Log nếu đổi tên kênh
  if (oldChannel.name !== newChannel.name) {
    const embed = createLogEmbed(
      '📝 Channel Renamed',
      `**Kênh:** <#${newChannel.id}>\n**Từ:** \`${oldChannel.name}\`\n**Thành:** \`${newChannel.name}\``,
      0xf1c40f
    );
    await sendLog(embed);
  }
});

// 4. LOG ĐIỀU CHỈNH ROLE (Tạo, Xóa, Đổi Tên Role)
client.on('roleCreate', async (role) => {
  const embed = createLogEmbed('🛡️ Role Created', `**Role:** <@&${role.id}> (\`${role.name}\`)`, 0x2ecc71);
  await sendLog(embed);
});

client.on('roleDelete', async (role) => {
  const embed = createLogEmbed('🗑️ Role Deleted', `**Role bị xóa:** \`${role.name}\``, 0xe74c3c);
  await sendLog(embed);
});

client.on('roleUpdate', async (oldRole, newRole) => {
  if (oldRole.name !== newRole.name) {
    const embed = createLogEmbed(
      '✏️ Role Renamed',
      `**Role:** <@&${newRole.id}>\n**Từ:** \`${oldRole.name}\`\n**Thành:** \`${newRole.name}\``,
      0xf1c40f
    );
    await sendLog(embed);
  }
});

// 5. LOG SERVER CẬP NHẬT (Đổi tên Server)
client.on('guildUpdate', async (oldGuild, newGuild) => {
  if (oldGuild.name !== newGuild.name) {
    const embed = createLogEmbed(
      '🏢 Server Renamed',
      `**Từ:** \`${oldGuild.name}\`\n**Thành:** \`${newGuild.name}\``,
      0x9b59b6
    );
    await sendLog(embed);
  }
});

// 6. LOG TIMEOUT (BỊ MUTE & ĐƯỢC GỠ MUTE)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // So sánh thời gian hết hạn Timeout giữa cũ và mới
  const oldTime = oldMember.communicationDisabledUntilTimestamp;
  const newTime = newMember.communicationDisabledUntilTimestamp;

  if (oldTime === newTime) return; // Không liên quan đến Timeout thì bỏ qua

  let action = '';
  let color = 0;
  let description = `**User:** ${getUserIdentifier(newMember.user)}\n`;

  if (newTime && newTime > Date.now()) {
    // Bị Timeout
    action = '🔇 Member Timed Out';
    color = 0xe74c3c; // Đỏ báo động
    // Chuyển timestamp thành định dạng hiển thị giờ giấc của Discord
    description += `**Thời hạn đến:** <t:${Math.floor(newTime / 1000)}:F>\n**Tự động gỡ sau:** <t:${Math.floor(newTime / 1000)}:R>`;
  } else if (oldTime && (!newTime || newTime <= Date.now())) {
    // Được gỡ Timeout sớm (hoặc tự hết hạn)
    action = '🔊 Member Timeout Removed';
    color = 0x2ecc71; // Xanh an toàn
    description += `**Trạng thái:** Đã được gỡ Timeout và có thể chat/voice trở lại.`;
  } else {
    return;
  }

  const embed = createLogEmbed(action, description, color);

  // Truy vết hung thủ trong Audit Log (Loại 24: MEMBER_UPDATE)
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const fetchedLogs = await newMember.guild.fetchAuditLogs({ type: 24, limit: 1 });
    const auditEntry = fetchedLogs.entries.first();

    // Kiểm tra log có phải cập nhật user này trong vòng 5 giây qua không
    if (auditEntry && auditEntry.target.id === newMember.id && Math.abs(auditEntry.createdTimestamp - Date.now()) < 5000) {
      if (auditEntry.executor) {
        embed.addFields({ name: '👮 Xử lý bởi', value: getUserIdentifier(auditEntry.executor), inline: false });
      }
      if (auditEntry.reason) {
        embed.addFields({ name: '📝 Lý do (Theo Audit Log)', value: auditEntry.reason, inline: false });
      }
    }
  } catch (err) {
    console.error('Lỗi tra Audit Log Timeout:', err.message);
  }

  await sendLog(embed);
});

// 7. LOG BỊ KICK KHỎI VOICE CHANNEL (SÚT BAY MÀU)
client.on('voiceStateUpdate', async (oldState, newState) => {
  const user = newState.member?.user || oldState.member?.user;
  if (!user) return;

  // ==========================================
  // 1. CHỨC NĂNG BOT NHẠC: BỊ KICK / TỰ OUT KHI VẮNG
  // ==========================================
  if (user.id === client.user.id && oldState.channelId && !newState.channelId) {
    // Fix lỗi bot khùng khi bị admin kick thẳng tay
    const queue = musicQueues.get(oldState.guild.id);
    if (queue) {
      if (queue.progressInterval) clearInterval(queue.progressInterval);
      if (queue.connection) queue.connection.destroy();
      musicQueues.delete(oldState.guild.id);
    }
    return;
  }

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    // Tự động out khi người dùng rời đi hết
    const botVoiceChannel = oldState.guild.members.me.voice.channel;
    if (botVoiceChannel && oldState.channelId === botVoiceChannel.id) {
      const humanCount = botVoiceChannel.members.filter(m => !m.user.bot).size;
      if (humanCount === 0) {
        const queue = musicQueues.get(oldState.guild.id);
        if (queue) {
          if (queue.progressInterval) clearInterval(queue.progressInterval);
          if (queue.connection) queue.connection.destroy();
          if (queue.dashboardMsg) {
            queue.dashboardMsg.edit({
              embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('💤 Mọi người đã rời đi hết, Tk.Chill cũng dọn dẹp đi ngủ đây. Hẹn gặp lại!')],
              components: []
            }).catch(() => { });
          }
          musicQueues.delete(oldState.guild.id);
        }
      }
    }
  }

  // Bỏ qua log hành động của Bot để đỡ rác kênh Log
  if (user.bot) return;

  // ==========================================
  // 2. CHỨC NĂNG LOGGING: JOIN, LEAVE, MOVE, KICK
  // ==========================================

  // TRƯỜNG HỢP 1: VÀO VOICE (JOIN)
  if (!oldState.channelId && newState.channelId) {
    const embed = createLogEmbed(
      '🎤 Voice Channel Joined',
      `**User:** ${getUserIdentifier(user)}\n**Kênh:** <#${newState.channelId}>`,
      0x2ecc71
    );
    await sendLog(embed);
  }
  // TRƯỜNG HỢP 2: ĐỔI KÊNH VOICE (MOVE)
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const embed = createLogEmbed(
      '🔄 Voice Channel Moved',
      `**User:** ${getUserIdentifier(user)}\n**Từ kênh:** <#${oldState.channelId}>\n**Sang kênh:** <#${newState.channelId}>`,
      0x3498db
    );
    await sendLog(embed);
  }
  // TRƯỜNG HỢP 3: RỜI VOICE (TỰ OUT HOẶC BỊ SÚT)
  else if (oldState.channelId && !newState.channelId) {
    let isKicked = false;
    try {
      // Đợi 1.5s cho Discord ghi kịp Audit Log
      await new Promise(resolve => setTimeout(resolve, 1500));
      const fetchedLogs = await oldState.guild.fetchAuditLogs({ type: 27, limit: 1 });
      const disconnectLog = fetchedLogs.entries.first();

      // Nếu tìm thấy log ngắt kết nối của user này trong vòng 5 giây -> Đích thị là bị sút!
      if (disconnectLog && disconnectLog.target.id === user.id && Math.abs(disconnectLog.createdTimestamp - Date.now()) < 5000) {
        isKicked = true;
        const embed = createLogEmbed(
          '🥾 Kicked from Voice Channel',
          `**User bị sút:** ${getUserIdentifier(user)}\n**Kênh đang ngồi:** <#${oldState.channelId}>\n**Sút bởi 👮:** ${getUserIdentifier(disconnectLog.executor)}`,
          0xe67e22
        );
        await sendLog(embed);
      }
    } catch (e) {
      console.error('Lỗi tra Audit Log Kick Voice:', e.message);
    }

    // Nếu check Audit Log không thấy ai sút -> Là do nó tự Out
    if (!isKicked) {
      const embed = createLogEmbed(
        '🚪 Voice Channel Left',
        `**User:** ${getUserIdentifier(user)}\n**Rời kênh:** <#${oldState.channelId}>`,
        0xe74c3c
      );
      await sendLog(embed);
    }
  }
});

// ===================== COMMAND: ATC PROFILE =====================
async function handleAtcProfile(interaction) {
  const station = interaction.options.getString('station').toUpperCase();
  await interaction.deferReply();

  try {
    const fetch = (await import('node-fetch')).default;
    // Gọi API v3 của VATSIM
    const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
    if (!response.ok) return interaction.editReply(t(interaction, 'STR_5F7FD9E5'));

    const data = await response.json();

    // Tìm ATC khớp với callsign
    const atc = data.controllers.find(c => c.callsign === station);

    if (!atc) {
      return interaction.editReply(t(interaction, 'STR_01ABE817', { v0: station }));
    }

    // Format Rating
    const vatsimRatings = { 0: 'Susp', 1: 'OBS', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'C1', 6: 'C2', 7: 'C3', 8: 'I1', 9: 'I2', 10: 'I3', 11: 'SUP', 12: 'ADM' };
    const ratingStr = vatsimRatings[atc.rating] || `R${atc.rating}`;

    // Tính toán thời gian Online (hh:mm)
    const logonUnix = Math.floor(new Date(atc.logon_time).getTime() / 1000);
    const logon = new Date(atc.logon_time).getTime();
    const diffMs = Date.now() - logon;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const timeOnline = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;

    // Xử lý Tần số
    const freq = (atc.frequency && atc.frequency !== '199.998' && atc.frequency !== 199.998)
      ? atc.frequency
      : 'Không có (199.998)';

    // Xử lý Remarks và tự động nhận diện Website
    let textRemarks = '> *Không có thông tin ghi chú.*';
    if (atc.text_atis && Array.isArray(atc.text_atis) && atc.text_atis.length > 0) {
      // Regex quét tên miền (domain)
      const urlRegex = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z]{2,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

      textRemarks = atc.text_atis.map(line => {
        const formattedLine = line.replace(urlRegex, (match) => {
          let url = match.startsWith('http') ? match : `https://${match}`;
          return `[${match}](${url})`;
        });
        return `> ${formattedLine}`;
      }).join('\n');
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'VATSIM Controller Profile', iconURL: 'https://cdn-icons-png.flaticon.com/512/8144/8144342.png' })
      .setTitle(t(interaction, 'STR_6F57484F', { v0: atc.callsign }))
      .setColor(0x00A8FF)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/10623/10623991.png')
      .addFields(
        { name: '👤 Controller', value : t(interaction, 'STR_137BAD49', { v0: atc.name || atc.cid }), inline: true },
        { name: '🎖️ Rating', value : t(interaction, 'STR_271F3F4C', { v0: ratingStr }), inline: true },
        { name: '📶 Frequency', value : t(interaction, 'STR_271F3F4C', { v0: freq }), inline: true },
        { name: '⏱️ Time on duty', value : t(interaction, 'STR_E8816EEB', { v0: timeOnline, v1: logonUnix }), inline: false },
        { name: '📝 Remarks', value: textRemarks, inline: false }
      )
      .setFooter({ text: `VATSIM CID: ${atc.cid}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error('Lỗi lệnh atc_profile:', err);
    await interaction.editReply(t(interaction, 'STR_42EC7EF2'));
  }
}

// ===================== COMMAND: ATIS VATSIM =====================
async function handleAtisVatsim(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
    if (!response.ok) return interaction.editReply(t(interaction, 'STR_5F7FD9E5'));

    const data = await response.json();

    // Lọc ra các trạm ATIS của sân bay này (VD: VVTS_ATIS, VVTS_A_ATIS, VVTS_D_ATIS)
    const atisList = data.atis.filter(a => a.callsign.startsWith(icao) && a.callsign.includes('ATIS'));

    if (!atisList || atisList.length === 0) {
      return interaction.editReply(t(interaction, 'STR_5EC55598', { v0: icao }));
    }

    const embeds = [];

    // Nếu sân bay chia ra Arrival ATIS và Departure ATIS, vòng lặp này sẽ in ra cả 2
    atisList.forEach(atis => {
      const atisCode = atis.atis_code ? `**Information ${atis.atis_code}**` : '*Không có*';
      const logonUnix = Math.floor(new Date(atis.logon_time).getTime() / 1000);

      let textInfo = 'Không có nội dung.';
      if (atis.text_atis && Array.isArray(atis.text_atis)) {
        // Lấy tất cả trừ dòng định dạng tên trạm (thường là dòng 1), ghép lại cho đẹp
        textInfo = atis.text_atis.join(' ');
      } else if (typeof atis.text_atis === 'string') {
        textInfo = atis.text_atis;
      }

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'VATSIM ATIS Broadcast', iconURL: 'https://play-lh.googleusercontent.com/uVJ8CVwOFeAH6JOMcmJoyAzNZPwdeWQx6XXbrXSJq__n6anBeriHznaEF4yJR7rv4ShGRVIJcnmP1BQmY9OKLBI' })
        .setTitle(t(interaction, 'STR_A5C7D5EA', { v0: atis.callsign, v1: atis.frequency }))
        .setColor(0x2ecc71)
        .setThumbnail('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSZTpaHOLCaND817gJ28iYTv1WRWnf4wUQoocDs6VYj_guu8gDc2VFKqCxp&s=10')
        .addFields(
          { name: '🏷️ Identifier', value: atisCode, inline: true },
          { name: '⏱️ Upadate at', value : t(interaction, 'STR_4B10E5E6', { v0: logonUnix }), inline: true },
          { name: '📝 Atis', value : t(interaction, 'STR_8BED3981', { v0: textInfo }), inline: false }
        )
        .setFooter({ text: 'Dữ liệu lấy trực tiếp từ mạng bay VATSIM' })
        .setTimestamp();

      embeds.push(embed);
    });

    await interaction.editReply({ embeds: embeds });

  } catch (err) {
    console.error('Lỗi lệnh atis_vatsim:', err);
    await interaction.editReply(t(interaction, 'STR_6ACAD996'));
  }
}

// ===================== COMMAND: IVAO ATC PROFILE =====================
async function handleIvaoAtc(interaction) {
  const station = interaction.options.getString('station').toUpperCase();
  await interaction.deferReply();

  try {
    const fetch = (await import('node-fetch')).default;
    // Gọi API dữ liệu trực tiếp của IVAO
    const response = await fetch('https://api.ivao.aero/v2/tracker/whazzup');
    if (!response.ok) return interaction.editReply(t(interaction, 'STR_1E1C4CC4'));

    const data = await response.json();

    // Tìm ATC khớp với callsign (Dữ liệu IVAO lưu trong clients.atcs)
    const atcs = data.clients?.atcs || [];
    const atc = atcs.find(c => c.callsign === station);

    if (!atc) {
      return interaction.editReply(t(interaction, 'STR_1B7436F4', { v0: station }));
    }

    // Format Rating của IVAO
    const ivaoRatings = {
      1: 'OBS', 2: 'AS1', 3: 'AS2', 4: 'AS3',
      5: 'ADC', 6: 'APC', 7: 'ACC', 8: 'SEC',
      9: 'SAI', 10: 'CAI'
    };
    const ratingStr = ivaoRatings[atc.rating] || `R${atc.rating}`;

    // Tính toán thời gian Online (hh:mm)
    const logonUnix = Math.floor(new Date(atc.createdAt).getTime() / 1000);
    const logon = new Date(atc.createdAt).getTime();
    const diffMs = Date.now() - logon;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const timeOnline = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;

    // Xử lý Tần số (IVAO trả về float như 118.1)
    const freq = atc.atcSession?.frequency ? atc.atcSession.frequency.toFixed(3) : '199.998';

    // Xử lý Remarks & ATIS và tự động nhận diện Website
    let textRemarks = '> *Không có thông tin ghi chú.*';
    if (atc.atis && atc.atis.lines && Array.isArray(atc.atis.lines) && atc.atis.lines.length > 0) {
      // Regex quét tên miền (domain)
      const urlRegex = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z]{2,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

      textRemarks = atc.atis.lines.map(line => {
        const formattedLine = line.replace(urlRegex, (match) => {
          let url = match.startsWith('http') ? match : `https://${match}`;
          return `[${match}](${url})`;
        });
        return `> ${formattedLine}`;
      }).join('\n');
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'IVAO Controller Profile', iconURL: 'https://cdn-icons-png.flaticon.com/512/8144/8144342.png' })
      .setTitle(t(interaction, 'STR_53DDFC0F', { v0: atc.callsign }))
      .setColor(0x0A2B5E)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/10623/10623991.png')
      .addFields(
        { name: '👤 Controller', value : t(interaction, 'STR_9DA523DA', { v0: atc.userId || 'Ẩn danh' }), inline: true },
        { name: '🎖️ Rating', value : t(interaction, 'STR_271F3F4C', { v0: ratingStr }), inline: true },
        { name: '📶 Frequency', value : t(interaction, 'STR_271F3F4C', { v0: freq }), inline: true },
        { name: '⏱️ Time on duty', value : t(interaction, 'STR_82881C12', { v0: timeOnline, v1: logonUnix }), inline: false },
        { name: '📝 Remarks', value: textRemarks, inline: false }
      )
      .setFooter({ text: `IVAO VID: ${atc.userId || 'N/A'}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error('Lỗi lệnh ivao_atc:', err);
    await interaction.editReply(t(interaction, 'STR_18CC14F1'));
  }
}

// ===================== COMMAND: IVAO ATIS =====================
async function handleIvaoAtis(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.ivao.aero/v2/tracker/whazzup');
    if (!response.ok) return interaction.editReply(t(interaction, 'STR_1E1C4CC4'));

    const data = await response.json();

    // Tìm toàn bộ các trạm ở sân bay này có phát sóng ATIS
    const atcs = data.clients?.atcs || [];
    const atisList = atcs.filter(a => a.callsign.startsWith(icao) && a.atis && a.atis.lines && a.atis.lines.length > 0);

    if (!atisList || atisList.length === 0) {
      return interaction.editReply(t(interaction, 'STR_7A088031', { v0: icao }));
    }

    const embeds = [];

    atisList.forEach(atc => {
      const atisCode = atc.atis.revision ? `**Information ${atc.atis.revision}**` : '*Không định danh*';
      const timestamp = atc.atis.timestamp || atc.createdAt;
      const logonUnix = Math.floor(new Date(timestamp).getTime() / 1000);

      // Nối các dòng ATIS lại thành 1 đoạn văn bản liên tục
      const textInfo = atc.atis.lines.join(' ');

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'IVAO ATIS Broadcast', iconURL: 'https://play-lh.googleusercontent.com/uVJ8CVwOFeAH6JOMcmJoyAzNZPwdeWQx6XXbrXSJq__n6anBeriHznaEF4yJR7rv4ShGRVIJcnmP1BQmY9OKLBI' })
        .setTitle(t(interaction, 'STR_A5C7D5EA', { v0: atc.callsign, v1: atc.atcSession?.frequency?.toFixed(3) || 'N/A' }))
        .setColor(0x0A2B5E) // Xanh Navy
        .setThumbnail('https://xe.ivao.aero/wordpress/wp-content/uploads/website/the-division/about/brand_logo_no_text.png')
        .addFields(
          { name: '🏷️ Identifier', value: atisCode, inline: true },
          { name: '⏱️ Update at', value : t(interaction, 'STR_4B10E5E6', { v0: logonUnix }), inline: true },
          { name: '📝 Atis', value : t(interaction, 'STR_8BED3981', { v0: textInfo }), inline: false }
        )
        .setFooter({ text: 'Dữ liệu phát sóng trực tiếp từ mạng IVAO' })
        .setTimestamp();

      embeds.push(embed);
    });

    // Discord giới hạn 10 Embed cho 1 tin nhắn
    await interaction.editReply({ embeds: embeds.slice(0, 10) });

  } catch (err) {
    console.error('Lỗi lệnh ivao_atis:', err);
    await interaction.editReply(t(interaction, 'STR_54D5E278'));
  }
}

// ===================== COMMAND: REAL FLIGHT =====================
async function handleRealFlight(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  try {
    const fetch = (await import('node-fetch')).default;
    
    const url = `https://api.flightradar24.com/common/v1/airport.json?code=${icao}&plugin[]=schedule&plugin-setting[schedule][mode]=&page=1&limit=5`;
    
    // NGUỴ TRANG THÀNH TRÌNH DUYỆT THẬT ĐỂ VƯỢT CLOUDFLARE 403
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.flightradar24.com',
        'Referer': `https://www.flightradar24.com/data/airports/${icao.toLowerCase()}`,
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site'
      }
    });

    if (!response.ok) {
      return await interaction.editReply({ content : t(interaction, 'STR_F97F073B', { v0: response.status }) });
    }

    const data = await response.json();
    const airportData = data?.result?.response?.airport;

    if (!airportData || !airportData.pluginData?.schedule) {
      return await interaction.editReply({ content : t(interaction, 'STR_CCAA1559', { v0: icao }) });
    }

    const arrivals = airportData.pluginData.schedule.arrivals?.data || [];
    const departures = airportData.pluginData.schedule.departures?.data || [];

    const embed = new EmbedBuilder()
      .setTitle(t(interaction, 'STR_E8D984EB', { v0: icao }))
      .setDescription(t(interaction, 'STR_DF02291A', { v0: airportData.pluginData?.details?.name || icao }))
      .setColor(0xF1C40F)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3180/3180118.png')
      .setFooter({ text: 'Dữ liệu được cập nhật trực tiếp từ FlightRadar24' })
      .setTimestamp();

    // 📤 Xử lý Cất Cánh (Departures)
    let depText = '';
    if (departures.length > 0) {
      departures.slice(0, 5).forEach(f => {
        const flight = f.flight;
        const flightNum = flight.identification?.number?.default || 'N/A';
        const arrAirport = flight.airport?.destination?.code?.icao || flight.airport?.destination?.name || 'N/A';
        const acft = flight.aircraft?.model?.code || 'N/A';
        const status = flight.status?.text || 'Scheduled';
        const std = flight.time?.scheduled?.departure ? `<t:${flight.time.scheduled.departure}:t>` : 'N/A';

        depText += `🛫 **${flightNum}** đi ${arrAirport} | 🛩️ ${acft}\n> ⏰ ${std} - 📌 ${status}\n`;
      });
    } else {
      depText = '> *Không có chuyến bay cất cánh nào sắp tới.*';
    }
    embed.addFields({ name: '📤 CHUẨN BỊ CẤT CÁNH (DEPARTURES)', value: depText, inline: false });

    // 📥 Xử lý Hạ Cánh (Arrivals)
    let arrText = '';
    if (arrivals.length > 0) {
      arrivals.slice(0, 5).forEach(f => {
        const flight = f.flight;
        const flightNum = flight.identification?.number?.default || 'N/A';
        const depAirport = flight.airport?.origin?.code?.icao || flight.airport?.origin?.name || 'N/A';
        const acft = flight.aircraft?.model?.code || 'N/A';
        const status = flight.status?.text || 'Scheduled';
        const sta = flight.time?.scheduled?.arrival ? `<t:${flight.time.scheduled.arrival}:t>` : 'N/A';

        arrText += `🛬 **${flightNum}** từ ${depAirport} | 🛩️ ${acft}\n> ⏰ ${sta} - 📌 ${status}\n`;
      });
    } else {
      arrText = '> *Không có chuyến bay hạ cánh nào sắp tới.*';
    }
    embed.addFields({ name: '📥 CHUẨN BỊ HẠ CÁNH (ARRIVALS)', value: arrText, inline: false });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Lỗi lấy real flight:', err);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi kéo dữ liệu chuyến bay thực tế.' });
  }
}

// BỘ QUÉT TÂN BINH & CHẶN KÊNH CỜ BẠC
async function checkAndRegisterUser(interaction) {
  const userId = interaction.user.id;
  const discordName = interaction.user.username;
  const member = interaction.member;

  // 1. KIỂM TRA QUYỀN VÀ KÊNH
  const hasAdmin = member.roles.cache.has(roles.adminRoleId);
  const hasDev = member.roles.cache.has(roles.devRoleId);
  const hasStaff = member.roles.cache.has('1493908725231128617'); 
  const isOwner = userId === OWNER_ID;

  if (!hasAdmin && !hasDev && !hasStaff && !isOwner && interaction.channelId !== CASH_CHANNEL_ID) {
    await interaction.editReply(t(interaction, 'STR_D5BF1B18', { v0: CASH_CHANNEL_ID }));
    return null; 
  }

  // 2. TÌM VÀ CẤP VỐN CHO TÂN BINH
  let balance = await getPilotBalance(userId);
  if (!balance) {
    balance = await registerPilot(userId, discordName);
    if (balance) {
      // Đã nâng vốn khởi nghiệp lên 2000 Cash
      await interaction.followUp({
        content : t(interaction, 'STR_512695F1', { v0: discordName }),
        ephemeral: true
      });
      balance.displayName = discordName;
    }
  } else {
    // Ưu tiên dùng Tên App nếu đã đồng bộ
    balance.displayName = (balance.username && balance.username !== 'N/A' && balance.username.trim() !== '') ? balance.username : discordName;
  }
  return balance;
}

// ===================== LỆNH DAILY (RESET ĐÚNG 00:00 GIỜ VIỆT NAM) =====================
async function handleDaily(interaction) {
  await interaction.deferReply(); 
  
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return; 

  const userId = interaction.user.id;
  let userDb = await db.getGamblingData(userId);
  const now = Date.now();

  // Công cụ xé thời gian Server lấy chuẩn Giờ Việt Nam (UTC+7) cực mạnh:
  const getVNDateString = (timestamp) => {
    const d = new Date(timestamp + 7 * 3600 * 1000); 
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  };

  const lastDayStr = userDb.dailyLastTime > 0 ? getVNDateString(userDb.dailyLastTime) : "";
  const currentDayStr = getVNDateString(now);
  
  // NẾU CÙNG 1 NGÀY Ở VN -> CHƯA ĐƯỢC NHẬN
  if (lastDayStr === currentDayStr) {
    // Tính toán đếm ngược đến ĐÚNG 00:00 đêm nay (Giờ VN)
    const vnTimeMs = now + 7 * 3600 * 1000;
    const vnDate = new Date(vnTimeMs);
    
    // Tìm mốc 00:00:00 của ngày hôm sau
    const nextVNDayMs = Date.UTC(vnDate.getUTCFullYear(), vnDate.getUTCMonth(), vnDate.getUTCDate() + 1, 0, 0, 0);
    
    // Đảo ngược về múi giờ thực tế để tính khoảng cách
    const realNextMidnightMs = nextVNDayMs - 7 * 3600 * 1000;
    const remainingTime = realNextMidnightMs - now;
    
    const hours = Math.floor(remainingTime / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    
    return interaction.editReply(t(interaction, 'STR_9C2739EE', { v0: balance.displayName, v1: hours, v2: minutes }));
  }

  // Check chuỗi ngày (Streak)
  const yesterday = new Date(now - 24 * 3600 * 1000);
  const yesterdayStr = getVNDateString(yesterday.getTime());
  
  if (lastDayStr !== yesterdayStr && userDb.dailyLastTime > 0) {
    // Bỏ lỡ ngày hôm qua -> Đứt chuỗi
    userDb.dailyStreak = 0;
  }
  
  userDb.dailyStreak += 1;
  userDb.dailyLastTime = now;

  // Lương random từ 100 đến 300
  let reward = Math.floor(Math.random() * 1001) + 500; 
  
  // Mốc thưởng nóng
  if (userDb.dailyStreak % 100 === 0) reward = 5000;
  else if (userDb.dailyStreak % 10 === 0) reward = 2000;

  // FIX LUÔN TÍCH LŨY: Ghi nhận đúng Lãi và Tổng nhận
  const updateRes = await updatePilotBalance(userId, reward, 0, reward);
  await userDb.save(); // Lưu lại vào MONGODB

  const embed = new EmbedBuilder()
    .setTitle('📅 ĐIỂM DANH HÀNG NGÀY')
    .setColor(0x2ecc71)
    .setDescription(t(interaction, 'STR_B8C4F460', { v0: balance.displayName, v1: reward.toLocaleString() }))
    .addFields(
      { name: '🔥 Chuỗi liên tiếp', value : t(interaction, 'STR_DCE461FA', { v0: userDb.dailyStreak }), inline: true },
      { name: '💰 Tổng số dư', value : t(interaction, 'STR_BD84778D', { v0: updateRes.success ? updateRes.currentCash.toLocaleString() : balance.currentCash.toLocaleString() }), inline: true }
    )
    .setFooter({ text: 'Lượt điểm danh mới sẽ mở vào 00:00 (Giờ VN) mỗi ngày' });

  await interaction.editReply({ embeds: [embed] });
}

// ===================== ECONOMY & GAMBLING SYSTEM =====================
const coinflipTracker = new Map();
const slotTracker = new Map();

// CÔNG CỤ BÀI TÂY (BẮT BUỘC PHẢI CÓ CHO BLACKJACK & POKER)
const SUITS = ['♠️', '♣️', '♥️', '♦️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  let deck = [];
  for (let s of SUITS) {
    for (let v of VALUES) {
      deck.push({ suit: s, value: v, display: `[${v}${s}]` });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getCardValue(card) {
  if (['J', 'Q', 'K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value);
}

function calculateHand(hand) {
  let score = 0, aces = 0;
  for (let card of hand) {
    score += getCardValue(card);
    if (card.value === 'A') aces += 1;
  }
  while (score > 21 && aces > 0) { score -= 10; aces -= 1; }
  return score;
}

function formatHand(hand) {
  return hand.map(c => `**${c.display}**`).join('  ');
}

// BỘ ĐỌC TIỀN ALL IN / HALF
function parseBetAmount(input, currentCash) {
  if (!input) return 0;
  const str = String(input).trim().toLowerCase();
  if (str === 'all') return currentCash; 
  if (str === 'half') return Math.floor(currentCash / 2); 
  const val = parseInt(str); 
  return isNaN(val) ? 0 : val;
}

// BỘ QUÉT TÂN BINH & CHẶN KÊNH CỜ BẠC
async function checkAndRegisterUser(interaction) {
  const userId = interaction.user.id;
  const discordName = interaction.user.username;
  const member = interaction.member;

  const hasAdmin = member.roles.cache.has(roles.adminRoleId);
  const hasDev = member.roles.cache.has(roles.devRoleId);
  const hasStaff = member.roles.cache.has('1493908725231128617'); 
  const isOwner = userId === OWNER_ID;

  if (!hasAdmin && !hasDev && !hasStaff && !isOwner && interaction.channelId !== CASH_CHANNEL_ID) {
    await interaction.editReply(t(interaction, 'STR_D5BF1B18', { v0: CASH_CHANNEL_ID }));
    return null; 
  }

  let balance = await getPilotBalance(userId);
  if (!balance) {
    balance = await registerPilot(userId, discordName);
    if (balance) {
      await interaction.followUp({
        content : t(interaction, 'STR_512695F1', { v0: discordName }),
        ephemeral: true
      });
      balance.displayName = discordName;
    }
  } else {
    balance.displayName = (balance.username && balance.username !== 'N/A' && balance.username.trim() !== '') ? balance.username : discordName;
  }
  return balance;
}

// ===================== LOA PHÁT THANH PHÁ SẢN =====================
async function checkBankruptcy(interaction, displayName, currentCash) {
  if (currentCash <= 0) {
    await interaction.channel.send(t(interaction, 'STR_6775D79C', { v0: displayName }));
  }
}

// ===================== LỆNH WORK =====================
const workCooldowns = new Map();

async function handleWork(interaction) {
  await interaction.deferReply(); 
  
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const userId = interaction.user.id;
  const now = Date.now();
  
  if (workCooldowns.has(userId)) {
    const lastTime = workCooldowns.get(userId);
    const cooldown = 30 * 60 * 1000; 
    const timeDiff = now - lastTime;
    
    if (timeDiff < cooldown) {
      const remainingTime = cooldown - timeDiff;
      const minutes = Math.floor(remainingTime / (1000 * 60));
      const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
      return interaction.editReply(t(interaction, 'STR_8AD0C0FF', { v0: minutes, v1: seconds }));
    }
  }

  let isSuccess = Math.random() < 0.80; 

  if (balance.currentCash <= 0) {
    workCooldowns.set(userId, now);
    if (Math.random() < 0.60) {
      const pityMoney = Math.floor(Math.random() * 2000) + 500; 
      await updatePilotBalance(userId, pityMoney, 0, pityMoney);
      return interaction.editReply(t(interaction, 'STR_CA2FF063', { v0: pityMoney.toLocaleString() }));
    } else {
      return interaction.editReply(t(interaction, 'STR_762E78EA', { v0: balance.displayName }));
    }
  }

  workCooldowns.set(userId, now);

  if (isSuccess) {
    const earned = Math.floor(Math.random() * 10001); 
    await updatePilotBalance(userId, earned, 0, earned);
    await interaction.editReply(t(interaction, 'STR_D0B916C6', { v0: balance.displayName, v1: earned.toLocaleString() }));
  } else {
    let penalty = Math.floor(Math.random() * 501); 
    if (balance.currentCash < penalty) penalty = balance.currentCash; 

    if (penalty === 0) {
      await interaction.editReply(t(interaction, 'STR_347CCF76', { v0: balance.displayName }));
    } else {
      const updateRes = await updatePilotBalance(userId, -penalty, penalty, 0);
      await interaction.editReply(t(interaction, 'STR_35C68AD7', { v0: balance.displayName, v1: penalty.toLocaleString() }));
      if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
    }
  }
}


// ===================== LỆNH BALANCE =====================
async function handleBalance(interaction) {
  await interaction.deferReply(); 
  
  const balanceData = await checkAndRegisterUser(interaction);
  if (!balanceData) return;

  const safeNum = (val) => {
      if (!val) return 0;
      const cleanStr = String(val).replace(/\./g, '').replace(',', '.');
      return Number(cleanStr) || 0;
  };

  const embed = new EmbedBuilder()
      .setTitle(t(interaction, 'STR_7600B9EB'))
      .setDescription(t(interaction, 'STR_4D1488DD', { v0: balanceData.displayName }))
      .setColor('#10b981') 
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
          { name: '👤 Tên App', value : t(interaction, 'STR_271F3F4C', { v0: balanceData.username }), inline: false },
          { name: '💰 Số Dư Khả Dụng', value : t(interaction, 'STR_4B5CDCD6', { v0: safeNum(balanceData.currentCash).toLocaleString() }), inline: true },
          { name: '📈 Tổng Tích Lũy', value : t(interaction, 'STR_BD84778D', { v0: safeNum(balanceData.totalEarned).toLocaleString() }), inline: true },
          { name: '💸 Đã Tiêu Xài', value : t(interaction, 'STR_BD84778D', { v0: safeNum(balanceData.usedCash).toLocaleString() }), inline: true },
          { name: '✈️ Số Chuyến Bay', value : t(interaction, 'STR_AABEB377', { v0: safeNum(balanceData.completedFlights) }), inline: true },
          { name: '⏱️ Thời Gian Bay', value : t(interaction, 'STR_C4DC5BD8', { v0: safeNum(balanceData.totalHours).toFixed(1) }), inline: true }
      );

  await interaction.editReply({ embeds: [embed] });
}

// ===================== LỆNH COINFLIP =====================
async function handleCoinflip(interaction) {
  const amountInput = interaction.options.getString('amount');
  await interaction.deferReply(); 
  
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const amount = parseBetAmount(amountInput, balance.currentCash);
  if (amount <= 0) return interaction.editReply(t(interaction, 'STR_4CC856D7'));
  if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_F8E542BF', { v0: balance.currentCash.toLocaleString() }));

  const userId = interaction.user.id;
  let userDb = await db.getGamblingData(userId);
  
  let baseChance = amount < 500 ? 0.50 : (amount <= 1500 ? 0.40 : (amount <= 5000 ? 0.30 : 0.20));
  const variance = (Math.random() * 0.06) - 0.03; 
  let winChance = baseChance + variance;

  if (userDb.coinflipLosses >= 2) {
    winChance += (userDb.coinflipLosses - 1) * 0.10; 
    winChance = Math.min(winChance, 0.75); 
  } else if (userDb.coinflipWins >= 2) {
    winChance -= (userDb.coinflipWins - 1) * 0.15;
    winChance = Math.max(winChance, 0.05); 
  }

  let isWin = Math.random() < winChance;
  await interaction.editReply({ content : t(interaction, 'STR_9BC3E8E2', { v0: balance.displayName, v1: amount.toLocaleString() }) });

  setTimeout(async () => {
    if (isWin) {
      userDb.coinflipWins += 1; userDb.coinflipLosses = 0;
      // FIX TÍCH LŨY: Lãi ròng = amount | Đã tiêu = amount | Tổng nhận = amount * 2
      await updatePilotBalance(userId, amount, amount, amount * 2);
      await interaction.editReply(t(interaction, 'STR_99850A82', { v0: balance.displayName, v1: amount.toLocaleString() }));
    } else {
      userDb.coinflipLosses += 1; userDb.coinflipWins = 0;
      const updateRes = await updatePilotBalance(userId, -amount, amount, 0);
      await interaction.editReply(t(interaction, 'STR_099FD991', { v0: balance.displayName, v1: amount.toLocaleString() }));
      if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
    }
    await userDb.save();
  }, 2500); 
}

// ===================== LỆNH SLOT =====================
async function handleSlot(interaction) {
  const amountInput = interaction.options.getString('amount');
  await interaction.deferReply(); 
  
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const amount = parseBetAmount(amountInput, balance.currentCash);
  if (amount <= 0) return interaction.editReply(t(interaction, 'STR_4CC856D7'));
  if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_BB4C92D6'));

  const userId = interaction.user.id;
  let userDb = await db.getGamblingData(userId);
  userDb.slotPlays += 1;
  
  let winChance = 0.0; 
  if (userDb.slotPlays >= 5) winChance = 0.05; 
  if (userDb.slotPlays >= 15) winChance = 0.30; 
  if (amount > 1500 && amount < 5000) winChance = Math.min(winChance, 0.15); 
  else if (amount >= 5000) winChance = Math.min(winChance, 0.05); 

  winChance = Math.max(0, winChance + (Math.random() * 0.04) - 0.02);
  let isWin = Math.random() < winChance;

  const emojis = ['✈️', '🚁', '🚀', '🛸', '🪂', '🎈'];
  let e1, e2, e3;

  if (isWin) {
    e1 = e2 = e3 = emojis[Math.floor(Math.random() * emojis.length)];
    userDb.slotPlays = 0; 
  } else {
    if (Math.random() < 0.45) {
      e1 = e2 = emojis[Math.floor(Math.random() * emojis.length)];
      do { e3 = emojis[Math.floor(Math.random() * emojis.length)]; } while (e3 === e1);
      if (Math.random() < 0.5) [e2, e3] = [e3, e2];
    } else {
      e1 = emojis[Math.floor(Math.random() * emojis.length)];
      e2 = emojis[Math.floor(Math.random() * emojis.length)];
      do { e3 = emojis[Math.floor(Math.random() * emojis.length)]; } while (e1 === e2 && e2 === e3);
    }
  }

  await userDb.save(); 
  await interaction.editReply(t(interaction, 'STR_34E2F45F', { v0: amount.toLocaleString() }));

  for (let i = 0; i < 3; i++) {
    await new Promise(res => setTimeout(res, 800));
    await interaction.editReply(t(interaction, 'STR_48262F04', { v0: emojis[Math.floor(Math.random()*6)], v1: emojis[Math.floor(Math.random()*6)], v2: emojis[Math.floor(Math.random()*6)] }));
  }
  await new Promise(res => setTimeout(res, 800));

  if (isWin) {
    const grossPayout = amount * 3;
    // FIX TÍCH LŨY
    await updatePilotBalance(userId, grossPayout - amount, amount, grossPayout);
    await interaction.editReply(t(interaction, 'STR_625CCDD1', { v0: e1, v1: e2, v2: e3, v3: grossPayout.toLocaleString() }));
  } else {
    const updateRes = await updatePilotBalance(userId, -amount, amount, 0); 
    const mockText = (e1 === e2 || e2 === e3 || e1 === e3) ? "Trời ơi suýt nữa thì nổ hũ!!" : "Lệch nhịp rồi!";
    await interaction.editReply(t(interaction, 'STR_6C90FBEE', { v0: e1, v1: e2, v2: e3, v3: mockText, v4: amount.toLocaleString() }));
    if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
  }
}

// ===================== LỆNH TÀI XỈU =====================
async function handleTaiSiu(interaction) {
  const amountInput = interaction.options.getString('amount');
  await interaction.deferReply(); 
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const amount = parseBetAmount(amountInput, balance.currentCash);
  if (amount <= 0) return interaction.editReply(t(interaction, 'STR_4CC856D7'));
  if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_2142336D'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ts_xiu').setLabel(t(interaction, 'STR_CCC4CBBD')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ts_tai').setLabel(t(interaction, 'STR_A6B2615D')).setStyle(ButtonStyle.Danger)
  );

  const msg = await interaction.editReply({ 
    content : t(interaction, 'STR_80828F30', { v0: balance.displayName, v1: amount.toLocaleString() }), components: [row] 
  });

  const filter = i => i.user.id === interaction.user.id;
  const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 }); 

  // ===================== LỆNH TÀI XỈU (ĐÃ SỬA HIỆU ỨNG LẮC TỪNG CON) =====================
  collector.on('collect', async i => {
      await i.deferUpdate();
      const choice = i.customId === 'ts_tai' ? 'tai' : 'xiu';
      
      // Hiện hũ lắc ban đầu
      await interaction.editReply({ content : t(interaction, 'STR_1335686D', { v0: choice.toUpperCase() }), components: [] });

      // Tính toán kết quả trước trong nền
      let d1, d2, d3;
      if (Math.random() < (amount >= 5000 ? 0.15 : 0.05)) {
          d1 = d2 = d3 = Math.random() < 0.5 ? 1 : 6;
      } else {
          d1 = Math.floor(Math.random() * 6) + 1;
          d2 = Math.floor(Math.random() * 6) + 1;
          d3 = Math.floor(Math.random() * 6) + 1;
          if (d1 === d2 && d2 === d3) d3 = d3 === 6 ? 5 : d3 + 1;
      }
      const total = d1 + d2 + d3;
      let resultType = (d1 === d2 && d2 === d3) ? 'bao' : (total <= 10 ? 'xiu' : 'tai');
      let resultText = resultType === 'bao' ? '🌪️ BÃO' : (resultType === 'xiu' ? '⏬ XỈU' : '⏫ TÀI');

      // Tạo hiệu ứng Delay lật từng xí ngầu
      setTimeout(async () => {
          await interaction.editReply({ content : t(interaction, 'STR_BDA9E7AC', { v0: choice.toUpperCase(), v1: d1 }), components: [] });
          
          setTimeout(async () => {
              await interaction.editReply({ content : t(interaction, 'STR_CEB3A7F7', { v0: choice.toUpperCase(), v1: d1, v2: d2 }), components: [] });
              
              setTimeout(async () => {
                  // KẾT QUẢ CUỐI CÙNG
                  if (resultType === choice) {
                      await updatePilotBalance(interaction.user.id, amount, amount, amount * 2);
                      await interaction.editReply(t(interaction, 'STR_68EE68F1', { v0: d1, v1: d2, v2: d3, v3: total, v4: resultText, v5: amount.toLocaleString() }));
                  } else {
                      const updateRes = await updatePilotBalance(interaction.user.id, -amount, amount, 0);
                      let loseMsg = t(interaction, 'STR_EA9C9831', { v0: d1, v1: d2, v2: d3, v3: total, v4: resultText, v5: amount.toLocaleString() });
                      if (resultType === 'bao') loseMsg = t(interaction, 'STR_1D4B6783', { v0: d1, v1: d2, v2: d3, v3: amount.toLocaleString() });
                      await interaction.editReply(loseMsg);
                      if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
                  }
              }, 1200); // Lật con thứ 3
          }, 1200); // Lật con thứ 2
      }, 1200); // Lật con thứ 1
  });
}

// ===================== LỆNH BẦU CUA TÔM CÁ (HỆ THỐNG NÚT BẤM CHỌN 3 LẦN) =====================
async function handleBauCua(interaction) {
    const amountInput = interaction.options.getString('amount');
    await interaction.deferReply();
    const balance = await checkAndRegisterUser(interaction);
    if (!balance) return;
    const amount = parseBetAmount(amountInput, balance.currentCash);
    if (amount <= 0) return interaction.editReply(t(interaction, 'STR_4CC856D7'));
    if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_03D53DF6'));

    let choices = [];
    const nameMap = { 'bc_bau': 'Bầu', 'bc_cua': 'Cua', 'bc_tom': 'Tôm', 'bc_ca': 'Cá', 'bc_ga': 'Gà', 'bc_nai': 'Nai' };

    const buildRows = () => [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bc_bau').setEmoji('🎃').setLabel(t(interaction, 'STR_15858B54')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('bc_cua').setEmoji('🦀').setLabel(t(interaction, 'STR_A0F3A7F0')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('bc_tom').setEmoji('🦞').setLabel(t(interaction, 'STR_DDF8B51B')).setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bc_ca').setEmoji('🐟').setLabel(t(interaction, 'STR_BE391ADD')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('bc_ga').setEmoji('🐔').setLabel(t(interaction, 'STR_3EA545F7')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('bc_nai').setEmoji('🦌').setLabel(t(interaction, 'STR_D99DAF4A')).setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bc_chot')
                .setLabel(`Chốt Cửa (${choices.length}/3)`)
                .setStyle(choices.length > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(choices.length === 0)
        )
    ];

    const msg = await interaction.editReply({ 
        content : t(interaction, 'STR_8832F3EF', { v0: amount.toLocaleString() }), 
        components: buildRows() 
    });

    const filter = i => i.user.id === interaction.user.id && i.customId.startsWith('bc_');
    const collector = msg.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async i => {
        if (i.customId !== 'bc_chot' && choices.length < 3) {
            choices.push(nameMap[i.customId]);
        }
        
        if (i.customId === 'bc_chot' || choices.length === 3) {
            collector.stop('chot');
            await i.deferUpdate();
            return;
        }

        await i.update({ 
            content : t(interaction, 'STR_D345C10F', { v0: amount.toLocaleString(), v1: choices.join(' - ') }), 
            components: buildRows() 
        });
    });

    collector.on('end', async (collected, reason) => {
        if (reason !== 'chot') {
            return interaction.editReply({ content: '⏳ Đã hết thời gian chọn cửa! Tiền cược được hoàn lại.', components: [] });
        }

        await interaction.editReply({ content : t(interaction, 'STR_1D32233B', { v0: choices.join(' - ') }), components: [] });

        setTimeout(async () => {
            let riggedMascots = Object.values(nameMap);
            const results = [
                riggedMascots[Math.floor(Math.random() * 6)],
                riggedMascots[Math.floor(Math.random() * 6)],
                riggedMascots[Math.floor(Math.random() * 6)]
            ];

            // So khớp kết quả và trả thưởng (Đúng luật x1, x2, x3 của sếp)
            let matchCount = 0;
            let tempChoices = [...choices];
            for (let res of results) {
                let idx = tempChoices.indexOf(res);
                if (idx !== -1) {
                    matchCount++;
                    tempChoices.splice(idx, 1); // Trừ đi con đã khớp để xử lý cho chọn trùng lặp nhiều con
                }
            }

            let resultStr = t(interaction, 'STR_9AA1A3BE', { v0: results[0], v1: results[1], v2: results[2], v3: choices.join(' - ') });

            if (matchCount > 0) {
                const profit = amount * matchCount;
                const grossPayout = amount + profit;
               await updatePilotBalance(interaction.user.id, profit, amount, grossPayout); 
                resultStr += t(interaction, 'STR_950C1F98', { v0: matchCount, v1: matchCount, v2: profit.toLocaleString() });
            } else {
                const updateRes = await updatePilotBalance(interaction.user.id, -amount, amount, 0);
                resultStr += t(interaction, 'STR_C293A01C', { v0: amount.toLocaleString() });
                if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
            }

            await interaction.editReply(resultStr);
        }, 2500);
    });
}

// ===================== LỆNH XÌ DÁCH (BLACKJACK LUẬT VIỆT NAM CHUẨN) =====================
function getDeck() {
    const suits = ['♠️', '♣️', '♥️', '♦️'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    for (let s of suits) {
        for (let v of values) deck.push({ suit: s, value: v });
    }
    return deck.sort(() => Math.random() - 0.5);
}

// Tính điểm thông minh: A = 1, 10, hoặc 11
function getScore(hand) {
    let baseScore = 0;
    let aces = 0;
    for (let card of hand) {
        if (['J', 'Q', 'K'].includes(card.value)) baseScore += 10;
        else if (card.value === 'A') aces += 1;
        else baseScore += parseInt(card.value);
    }

    // Đệ quy tính điểm ngon nhất cho từng con Át
    function calculate(currentScore, acesLeft) {
        if (acesLeft === 0) return currentScore;
        let options = [
            calculate(currentScore + 1, acesLeft - 1),
            calculate(currentScore + 10, acesLeft - 1),
            calculate(currentScore + 11, acesLeft - 1)
        ];
        let valid = options.filter(s => s <= 21);
        if (valid.length > 0) return Math.max(...valid); // Lấy điểm cao nhất mà không Quắc
        return Math.min(...options); // Nếu đường nào cũng Quắc thì lấy điểm thấp nhất để hạn chế
    }

    return aces > 0 ? calculate(baseScore, aces) : baseScore;
}

function formatHand(hand) {
    return hand.map(c => `**${c.value}**${c.suit}`).join(' | ');
}

async function handleBlackjack(interaction) {
    const amountInput = interaction.options.getString('amount');
    await interaction.deferReply();
    
    // --- LƯU Ý: Sếp tự điều chỉnh lại cách lấy Balance và lấy Tiền của sếp ở đây nha ---
    const balance = await getPilotBalance(interaction.user.id);
    if (!balance) return interaction.editReply(t(interaction, 'STR_47223628'));
    
    let amount = parseInt(amountInput);
    if (amountInput === 'all') amount = balance.currentCash;
    else if (amountInput === 'half') amount = Math.floor(balance.currentCash / 2);
    
    if (isNaN(amount) || amount <= 0) return interaction.editReply(t(interaction, 'STR_4CC856D7'));
    if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_03D53DF6'));
    // -------------------------------------------------------------------------------------

    let deck = getDeck();
    let playerHand = [deck.pop(), deck.pop()];
    let dealerHand = [deck.pop(), deck.pop()];

    // Khai báo điều kiện Xì Bàng, Xì Dách
    const isXiBang = (hand) => hand.length === 2 && hand[0].value === 'A' && hand[1].value === 'A';
    const isXiDach = (hand) => hand.length === 2 && getScore(hand) === 21;

    let pXiBang = isXiBang(playerHand), pXiDach = isXiDach(playerHand);
    
    if (pXiBang) {
        // Xì Bàng: Nhân 3 tiền lãi
        await updatePilotBalance(interaction.user.id, amount * 3, amount, amount * 4);
        return interaction.editReply(t(interaction, 'STR_A5919250', { v0: formatHand(playerHand), v1: (amount * 3).toLocaleString() }));
    }
    
    if (pXiDach) {
        // Xì Dách: Nhân 2 tiền lãi
        await updatePilotBalance(interaction.user.id, amount * 2, amount, amount * 3);
        return interaction.editReply(t(interaction, 'STR_F5175DF1', { v0: formatHand(playerHand), v1: (amount * 2).toLocaleString() }));
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_hit').setLabel(t(interaction, 'STR_CC612F8C')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_stand').setLabel(t(interaction, 'STR_823CC1AD')).setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
        .setTitle('🃏 XÌ DÁCH VIỆT NAM 🃏')
        .setColor(0x2ecc71)
        .addFields(
            { name : t(interaction, 'STR_21DA3C88', { v0: getScore(playerHand) }), value: formatHand(playerHand), inline: true },
            { name : t(interaction, 'STR_B3A0E1AA'), value : t(interaction, 'STR_411DCA6A', { v0: formatHand([dealerHand[1]]) }), inline: true }
        )
        .setFooter({ text: `Cược: ${amount.toLocaleString()} Cash | Ngũ Linh, Xì Dách x2 | Xì Bàng x3` });

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });
    const filter = i => i.user.id === interaction.user.id && i.customId.startsWith('bj_');
    const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'bj_hit') {
            playerHand.push(deck.pop());
            let pScore = getScore(playerHand);

            if (playerHand.length === 5 && pScore <= 21) {
                collector.stop('ngulinh');
                await i.deferUpdate();
                return;
            }

            if (pScore > 21) {
                collector.stop('bust');
                await i.deferUpdate();
                return;
            }

            row.components[0].setDisabled(playerHand.length >= 5);

            embed.setFields(
                { name : t(interaction, 'STR_21DA3C88', { v0: pScore }), value: formatHand(playerHand), inline: true },
                { name : t(interaction, 'STR_B3A0E1AA'), value : t(interaction, 'STR_411DCA6A', { v0: formatHand([dealerHand[1]]) }), inline: true }
            );
            await i.update({ embeds: [embed], components: [row] });
        } else {
            collector.stop('stand');
            await i.deferUpdate();
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') return interaction.editReply({ content: '⏳ Sếp suy nghĩ quá lâu, ván bài bị hủy (Tiền cược được bảo toàn)!', components: [] });

        let pScore = getScore(playerHand);
        let finalEmbed = EmbedBuilder.from(embed).setColor(0xe74c3c);

        if (reason === 'ngulinh') {
            // Ngũ Linh: Nhân 2 tiền lãi
            await updatePilotBalance(interaction.user.id, amount * 2, amount, amount * 3);
            finalEmbed.setColor(0xf1c40f).setTitle('🌟 NGŨ LINH 🌟')
                .setFields(
                    { name : t(interaction, 'STR_E51E897B'), value: formatHand(playerHand), inline: false },
                    { name : t(interaction, 'STR_B3A0E1AA'), value: formatHand(dealerHand), inline: false }
                );
            return interaction.editReply({ content : t(interaction, 'STR_A2CA1FD1', { v0: (amount * 2).toLocaleString() }), embeds: [finalEmbed], components: [] });
        }

        if (reason === 'bust') {
            await updatePilotBalance(interaction.user.id, -amount, amount, 0);
            finalEmbed.setFields(
                { name : t(interaction, 'STR_C2E60604', { v0: pScore }), value: formatHand(playerHand), inline: false },
                { name : t(interaction, 'STR_B3A0E1AA'), value: formatHand(dealerHand), inline: false }
            );
            return interaction.editReply({ content : t(interaction, 'STR_969DA6F4', { v0: amount.toLocaleString() }), embeds: [finalEmbed], components: [] });
        }

        // Tới lượt Nhà Cái (Bắt buộc dằn khi >= 16)
        let dScore = getScore(dealerHand);
        while (dScore < 16 && dealerHand.length < 5) {
            dealerHand.push(deck.pop());
            dScore = getScore(dealerHand);
        }

        let dNgulinh = (dealerHand.length === 5 && dScore <= 21);
        let dXiBang = isXiBang(dealerHand);
        let dXiDach = isXiDach(dealerHand);

        let resultMsg = '';
        let profit = 0;
        let gross = 0;

        if (dXiBang) {
            profit = -amount; gross = 0; resultMsg = t(interaction, 'STR_3E16452B', { v0: amount.toLocaleString() });
        } else if (dXiDach) {
            profit = -amount; gross = 0; resultMsg = t(interaction, 'STR_065B43DA', { v0: amount.toLocaleString() });
        } else if (dNgulinh) {
            profit = -amount; gross = 0; resultMsg = t(interaction, 'STR_1AC66018', { v0: amount.toLocaleString() });
        } else if (dScore > 21 || pScore > dScore) {
            profit = amount; gross = amount * 2; resultMsg = t(interaction, 'STR_0A284949', { v0: amount.toLocaleString() });
            finalEmbed.setColor(0x2ecc71);
            if (dScore > 21) resultMsg = t(interaction, 'STR_9AB3DC11', { v0: amount.toLocaleString() });
        } else if (pScore === dScore) {
            profit = 0; gross = amount; resultMsg = t(interaction, 'STR_33625979');
            finalEmbed.setColor(0x3498db);
        } else {
            profit = -amount; gross = 0; resultMsg = t(interaction, 'STR_CB8BB554', { v0: amount.toLocaleString() });
        }

        await updatePilotBalance(interaction.user.id, profit, amount, gross);
        
        finalEmbed.setFields(
            { name : t(interaction, 'STR_21DA3C88', { v0: pScore }), value: formatHand(playerHand), inline: false },
            { name : t(interaction, 'STR_237D7AFB', { v0: dScore }), value: formatHand(dealerHand), inline: false }
        );

        await interaction.editReply({ content: resultMsg, embeds: [finalEmbed], components: [] });
    });
}

// ===================== HÀM TÍNH ĐIỂM RIÊNG CHO POKER =====================
function getPokerCardValue(card) {
    if (card.value === 'J') return 11;
    if (card.value === 'Q') return 12;
    if (card.value === 'K') return 13;
    if (card.value === 'A') return 14; 
    return parseInt(card.value);
}

function evaluatePokerHand(hand) {
    const values = hand.map(c => getPokerCardValue(c)).sort((a,b)=>a-b);
    const suits = hand.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);
    
    let isStraight = true;
    for(let i=0; i<4; i++) { 
        if(values[i]+1 !== values[i+1]) { isStraight = false; break; } 
    }
    
    // Đặc biệt A, 2, 3, 4, 5 (A là 14 nên mảng là [2, 3, 4, 5, 14])
    if (!isStraight && values.join(',') === "2,3,4,5,14") isStraight = true;

    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const countArr = Object.values(counts).sort((a,b)=>b-a);

    if (isFlush && isStraight) return { name: "👑 Sảnh Chúa / Sảnh Thùng (x50)", mult: 50 };
    if (countArr[0] === 4) return { name: "💣 Tứ Quý (x25)", mult: 25 };
    if (countArr[0] === 3 && countArr[1] === 2) return { name: "🏠 Cù Lũ (x9)", mult: 9 };
    if (isFlush) return { name: "💧 Thùng (x6)", mult: 6 };
    if (isStraight) return { name: "🪜 Sảnh (x4)", mult: 4 };
    if (countArr[0] === 3) return { name: "🎸 Xám Cô (x3)", mult: 3 };
    if (countArr[0] === 2 && countArr[1] === 2) return { name: "👯 Hai Đôi (x2)", mult: 2 };
    if (countArr[0] === 2) {
        // Poker chuẩn: Đôi J, Q, K, A mới được tính tiền (Jacks or Better)
        const pairVal = parseInt(Object.keys(counts).find(k => counts[k] === 2));
        if (pairVal >= 11) return { name: "🤵 Đôi Cao J-Q-K-A (Hòa Vốn)", mult: 1 };
        return { name: "Đôi Thấp (Mất tiền)", mult: 0 };
    }
    
    return { name: "Rác (Mất tiền)", mult: 0 };
}

// ===================== LỆNH POKER =====================
async function handlePoker(interaction) {
  const amountInput = interaction.options.getString('amount');
  await interaction.deferReply(); 
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const amount = parseBetAmount(amountInput, balance.currentCash);
  if (amount <= 0) return interaction.editReply(t(interaction, 'STR_4CC856D7'));
  if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_03D53DF6'));

  const userId = interaction.user.id;
  let deck = createDeck();
  let hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

  if (amount >= 5000 && Math.random() < 0.8) {
      let result = evaluatePokerHand(hand);
      while(result.mult >= 9) { deck = createDeck(); hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()]; result = evaluatePokerHand(hand); }
  }

  await interaction.editReply({ content : t(interaction, 'STR_E9FA2B3C', { v0: amount.toLocaleString() }) });

  setTimeout(async () => {
    let result = evaluatePokerHand(hand);
    let finalStr = "", didLose = false;
    
    if (result.mult > 0) {
      let grossPayout = amount * result.mult;
      let actualProfit = grossPayout - amount; 
      // FIX TÍCH LŨY
      await updatePilotBalance(userId, actualProfit, amount, grossPayout);
      finalStr = t(interaction, 'STR_A1618F24', { v0: result.name, v1: grossPayout.toLocaleString() });
    } else {
      didLose = true;
      finalStr = t(interaction, 'STR_0E36D7FE', { v0: result.name, v1: amount.toLocaleString() });
    }

    await interaction.editReply({ content: null, embeds: [new EmbedBuilder().setTitle('🃏 VIDEO POKER').setColor(result.mult > 0 ? 0x2ecc71 : 0xe74c3c).setDescription(finalStr).addFields({ name: '🃏 5 Lá Bài', value: formatHand(hand), inline: false })] });

    if (didLose) {
      const updateRes = await updatePilotBalance(userId, -amount, amount, 0);
      if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
    }
  }, 2500);
}

// ===================== LỆNH ROULETTE =====================
async function handleRoulette(interaction) {
  const amountInput = interaction.options.getString('amount');
  const choice = interaction.options.getString('choice'); 
  await interaction.deferReply(); 
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const amount = parseBetAmount(amountInput, balance.currentCash);
  if (amount <= 0) return interaction.editReply(t(interaction, 'STR_98CE929D'));
  if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_03D53DF6'));

  let isWin = false;
  let resultColor = '';
  if (choice === 'green') {
    isWin = Math.random() < (amount >= 5000 ? 0.00 : 0.02);
    resultColor = isWin ? 'green' : (Math.random() < 0.5 ? 'red' : 'black');
  } else {
    isWin = Math.random() < (amount >= 5000 ? 0.25 : 0.45);
    if (isWin) resultColor = choice;
    else resultColor = Math.random() < 0.05 ? 'green' : (choice === 'red' ? 'black' : 'red');
  }

  const colorNames = { 'red': 'Đỏ 🔴', 'black': 'Đen ⚫', 'green': 'Xanh Lá 🟢' };
  await interaction.editReply(t(interaction, 'STR_63B88DC6', { v0: amount.toLocaleString(), v1: colorNames[choice] }));

  setTimeout(async () => {
    let finalStr = t(interaction, 'STR_4FA4A290', { v0: colorNames[resultColor] });
    if (isWin) {
      let grossPayout = choice === 'green' ? amount * 14 : amount * 2; 
      let profit = grossPayout - amount;
      // FIX TÍCH LŨY
      await updatePilotBalance(interaction.user.id, profit, amount, grossPayout);
      finalStr += t(interaction, 'STR_87C6425F', { v0: choice === 'green' ? '🎰 **NỔ HŨ X14!**' : '🎉 **HÚP TIỀN!**', v1: grossPayout.toLocaleString() });
    } else {
      const updateRes = await updatePilotBalance(interaction.user.id, -amount, amount, 0);
      finalStr += t(interaction, 'STR_BDD045C2', { v0: amount.toLocaleString() });
      if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
    }
    await interaction.editReply({ content: null, embeds: [new EmbedBuilder().setColor(resultColor === 'red' ? 0xe74c3c : (resultColor === 'black' ? 0x2b2d31 : 0x2ecc71)).setDescription(finalStr)] });
  }, 3500); 
}

// ===================== LỆNH OẲN TÙ TÌ =====================
async function handleOanTuTi(interaction) {
  const amountInput = interaction.options.getString('amount');
  await interaction.deferReply(); 
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const amount = parseBetAmount(amountInput, balance.currentCash);
  if (amount <= 0) return interaction.editReply(t(interaction, 'STR_98CE929D'));
  if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_03D53DF6'));

  const msg = await interaction.editReply(t(interaction, 'STR_B7D946EE', { v0: amount.toLocaleString() }));
  const emojis = ['✌️', '✊', '✋'];
  for (const e of emojis) await msg.react(e);

  msg.awaitReactions({ filter: (r, u) => emojis.includes(r.emoji.name) && u.id === interaction.user.id, max: 1, time: 30000, errors: ['time'] }).then(async coll => {
    const userChoice = coll.first().emoji.name;
    try { await msg.reactions.removeAll(); } catch (e) {}
    await interaction.editReply({ content : t(interaction, 'STR_C9F6F460', { v0: userChoice }) });

    setTimeout(async () => {
      const winning = { '✌️': '✊', '✊': '✋', '✋': '✌️' }, tie = { '✌️': '✌️', '✊': '✊', '✋': '✋' }, losing = { '✌️': '✋', '✊': '✌️', '✋': '✊' };
      let botChoice = Math.random() < (amount >= 1500 ? 0.50 : 0.30) ? (Math.random() < 0.8 ? winning[userChoice] : tie[userChoice]) : emojis[Math.floor(Math.random() * 3)];
      let resultStr = t(interaction, 'STR_B53D8FE3', { v0: userChoice, v1: botChoice });

      if (botChoice === losing[userChoice]) {
        // FIX TÍCH LŨY (Lãi x2)
        await updatePilotBalance(interaction.user.id, amount, amount, amount * 2);
        resultStr += t(interaction, 'STR_04E5ADE7', { v0: (amount * 2).toLocaleString() });
      } else if (botChoice === winning[userChoice]) {
        const updateRes = await updatePilotBalance(interaction.user.id, -amount, amount, 0);
        resultStr += t(interaction, 'STR_FC62733A', { v0: amount.toLocaleString() });
        if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
      } else {
        // FIX TÍCH LŨY (Hòa)
        await updatePilotBalance(interaction.user.id, 0, amount, amount);
        resultStr += t(interaction, 'STR_CF6C2395');
      }
      await interaction.editReply(resultStr);
    }, 2500);
  }).catch(() => { interaction.editReply(t(interaction, 'STR_3C6EFE08')); });
}

// ===================== LỆNH GIVE CASH =====================
async function handleGiveCash(interaction) {
  const targetUser = interaction.options.getUser('user');
  const amountInput = interaction.options.getString('amount');
  const senderId = interaction.user.id;

  if (targetUser.bot || targetUser.id === senderId) return interaction.reply({ content: '❌ Không thể gửi cho chính mình hoặc Bot!', ephemeral: true });

  await interaction.deferReply({ ephemeral: true });
  
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const amount = parseBetAmount(amountInput, balance.currentCash);
  if (amount <= 0) return interaction.editReply(t(interaction, 'STR_68E18DE4'));
  if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_2142336D'));

  // Người gửi bị trừ tiền hiện tại và GHI NHẬN LÀ ĐÃ TIÊU, không cộng Total Earned
  const deduc = await updatePilotBalance(senderId, -amount, amount, 0);
  if (!deduc.success) return interaction.editReply(t(interaction, 'STR_30C6B297', { v0: deduc.msg }));

  // FIX TÍCH LŨY CHO NGƯỜI NHẬN: Được cộng tiền hiện tại và CỘNG TOTAL EARNED
  const add = await updatePilotBalance(targetUser.id, amount, 0, amount);
  if (!add.success) {
    // Nếu lỗi, Hoàn tiền cho người gửi (Cộng lại tiền, Trừ lượng đã tiêu ra, Không cộng Total Earned)
    await updatePilotBalance(senderId, amount, -amount, 0); 
    return interaction.editReply(t(interaction, 'STR_37CF5FE0', { v0: amount.toLocaleString() }));
  }

  await interaction.editReply(t(interaction, 'STR_67792F60', { v0: amount.toLocaleString(), v1: targetUser.id }));
  await checkBankruptcy(interaction, balance.displayName, deduc.currentCash);

  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle('💸 BẠN VỪA NHẬN ĐƯỢC TIỀN!')
      .setColor(0x10b981)
      .setDescription(t(interaction, 'STR_7BBE17ED', { v0: balance.displayName, v1: senderId, v2: amount.toLocaleString() }))
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3135/3135706.png')
      .setTimestamp()
      .setFooter({ text: 'Hệ thống ngân hàng trung ương tk.chill' });
    await targetUser.send({ embeds: [dmEmbed] });
  } catch (err) {}
}

// ===================== TRÒ CHƠI: LÔ TÔ 5x5 (GACHA) =====================
// Hàm tạo giao diện bảng Lô Tô
function renderLotoBoard(board, drawnSet) {
  let str = "";
  for (let r = 0; r < 5; r++) {
      let rowStr = [];
      for (let c = 0; c < 5; c++) {
          let num = board[r * 5 + c];
          if (drawnSet.has(num)) {
              rowStr.push(`[XX]`); // Dấu XX thể hiện số đã được gọi và đánh dấu
          } else {
              rowStr.push(`[${String(num).padStart(2, '0')}]`);
          }
      }
      str += rowStr.join(" ") + "\n";
  }
  return `\`\`\`text\n${str}\`\`\``;
}

// Hàm kiểm tra xem có đường nào "KINH" (Bingo) chưa
function checkLotoKinh(board, drawnSet) {
  const lines = [
      // Hàng ngang
      [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24],
      // Hàng dọc
      [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24],
      // Hai đường chéo
      [0,6,12,18,24], [4,8,12,16,20]
  ];
  for (let line of lines) {
      if (line.every(idx => drawnSet.has(board[idx]))) return true; // Trúng trọn vẹn 1 hàng 5 số
  }
  return false;
}

// ===================== TRÒ CHƠI: LÔ TÔ 5x5 (FIX LỖI CỘNG TIỀN + GỌN NHẸ) =====================
// Hàm tạo giao diện bảng Lô Tô (Dùng mã màu ANSI để tô Xanh Lá)
function renderLotoBoard(board, drawnSet) {
  let str = "";
  for (let r = 0; r < 5; r++) {
      let rowStr = [];
      for (let c = 0; c < 5; c++) {
          let num = board[r * 5 + c];
          let numStr = String(num).padStart(2, '0');
          if (drawnSet.has(num)) {
              // Mã ANSI: \u001b[1;32m là Xanh Lá In Đậm, \u001b[0m là Reset màu
              rowStr.push(`\u001b[1;32m[${numStr}]\u001b[0m`); 
          } else {
              rowStr.push(`[${numStr}]`);
          }
      }
      str += rowStr.join(" ") + "\n";
  }
  return `\`\`\`ansi\n${str}\`\`\``; // Bắt buộc dùng ansi block để hiển thị màu
}

// Hàm kiểm tra xem có đường nào "KINH" (Bingo) chưa
function checkLotoKinh(board, drawnSet) {
  const lines = [
      // Hàng ngang
      [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24],
      // Hàng dọc
      [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24],
      // Hai đường chéo
      [0,6,12,18,24], [4,8,12,16,20]
  ];
  for (let line of lines) {
      if (line.every(idx => drawnSet.has(board[idx]))) return true; 
  }
  return false;
}

async function handleVietlott(interaction) {
  // Giả sử sếp có mảng 'grid' là 25 số đã bốc và 'hitNumbers' là danh sách số sếp đã trúng
  let displayGrid = "";
  for (let i = 0; i < grid.length; i++) {
      let num = grid[i];
      // Nếu số này nằm trong danh sách trúng thì thêm hiệu ứng
      if (hitNumbers.includes(num)) {
          displayGrid += `[**${num}**]✨ `; // In đậm và thêm icon ✨ cho số trúng
      } else {
          displayGrid += `[${num}] `;      // Số thường
      }
      // Xuống dòng sau mỗi 5 số
      if ((i + 1) % 5 === 0) displayGrid += "\n";
  }
  await interaction.deferReply(); 
  const balance = await checkAndRegisterUser(interaction);
  if (!balance) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_mua_ve_loto').setLabel(t(interaction, 'STR_5414F647')).setStyle(ButtonStyle.Primary).setEmoji('🎪')
  );

  const msg = await interaction.editReply({
    content : t(interaction, 'STR_C9B1278B', { v0: balance.displayName, v1: balance.currentCash.toLocaleString() }),
    components: [row]
  });

  const filter = i => i.user.id === interaction.user.id;
  const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

  collector.on('collect', async btnInt => {
    const modal = new ModalBuilder().setCustomId(`modal_loto`).setTitle('Mua Vé Lô Tô 5x5');

    const numInput = new TextInputBuilder()
      .setCustomId('numbers')
      .setLabel(t(interaction, 'STR_FA0A617F'))
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(t(interaction, 'STR_65298322'))
      .setRequired(true);

    const amtInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel(t(interaction, 'STR_0EB860AD'))
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(numInput), new ActionRowBuilder().addComponents(amtInput));
    await btnInt.showModal(modal);

    try {
      const modalSubmit = await btnInt.awaitModalSubmit({ filter: i => i.user.id === interaction.user.id, time: 120000 });
      await modalSubmit.deferUpdate();

      const amountStr = modalSubmit.fields.getTextInputValue('amount');
      const numberStr = modalSubmit.fields.getTextInputValue('numbers').trim().toUpperCase();

      const currentBal = await getPilotBalance(interaction.user.id);
      const amount = parseBetAmount(amountStr, currentBal.currentCash);

      if (amount <= 0) return interaction.editReply({ content: '❌ Số tiền cược không hợp lệ!', components: [] });
      if (currentBal.currentCash < amount) return interaction.editReply({ content : t(interaction, 'STR_558836FF', { v0: currentBal.currentCash.toLocaleString() }), components: [] });

      let boardNumbers = [];
      if (numberStr === 'AUTO') {
          let pool = Array.from({length: 90}, (_, i) => i + 1);
          for(let i = pool.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          boardNumbers = pool.slice(0, 25);
      } else {
          boardNumbers = numberStr.split(/[\s,]+/).map(n => parseInt(n)).filter(n => !isNaN(n));
          if (boardNumbers.length !== 25) {
              return interaction.editReply({ content : t(interaction, 'STR_874A051F', { v0: boardNumbers.length }), components: [] });
          }
          let unique = new Set(boardNumbers);
          if (unique.size !== 25) {
              return interaction.editReply({ content : t(interaction, 'STR_8C6B2106'), components: [] });
          }
          if (!boardNumbers.every(n => n >= 1 && n <= 90)) {
              return interaction.editReply({ content : t(interaction, 'STR_8FEE1DAD'), components: [] });
          }
      }

      collector.stop('done');

      // Vừa mua vé xong, cho 1 cái tin nhắn thông báo quay lồng cầu sương sương (3 giây)
      await interaction.editReply({
          content : t(interaction, 'STR_D4F69450', { v0: balance.displayName, v1: amount.toLocaleString() }),
          components: []
      });

      // TÍNH TOÁN KẾT QUẢ NGAY LẬP TỨC TRONG NỀN
      let allNumbers = Array.from({length: 90}, (_, i) => i + 1);
      for(let i = allNumbers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
      }

      let drawnSet = new Set();
      let bingoAt = -1;

      for (let i = 0; i < 50; i++) {
          drawnSet.add(allNumbers[i]);
          if (checkLotoKinh(boardNumbers, drawnSet)) {
              bingoAt = i + 1; 
              break; // Có đường Kinh là dừng bốc liền
          }
      }

      // Xổ kết quả thẳng ra sau 3 giây (Khỏi gọi lắt nhắt làm nghẽn Discord API)
      setTimeout(async () => {
          let finalStr = t(interaction, 'STR_F99623EB', { v0: drawnSet.size, v1: renderLotoBoard(boardNumbers, drawnSet) });

          if (bingoAt !== -1) {
              let mult = 0;
              if (bingoAt <= 20) mult = 100;     
              else if (bingoAt <= 30) mult = 10; 
              else if (bingoAt <= 40) mult = 3;  
              else if (bingoAt <= 50) mult = 1;  

              let profit = amount * mult;

              if (mult > 1) {
                  // SẾP ĐÃ SỬA CÁI TÍCH LŨY DƯỚI ĐÂY RỒI NHÉ (Cộng lãi vào tiền hiện tại, Cộng vốn vào tiền tiêu xài, Cộng nguyên cục lời vào tích lũy)
                  await updatePilotBalance(interaction.user.id, profit - amount, amount, profit);
                  finalStr += t(interaction, 'STR_611AE6E1', { v0: bingoAt, v1: profit.toLocaleString(), v2: mult });
              } else {
                  // Hòa vốn
                  await updatePilotBalance(interaction.user.id, 0, amount, amount);
                  finalStr += t(interaction, 'STR_9B90338E', { v0: bingoAt, v1: amount.toLocaleString() });
              }
          } else {
              // Thu tiền nếu tạch
              const updateRes = await updatePilotBalance(interaction.user.id, -amount, amount, 0);
              finalStr += t(interaction, 'STR_E1041854', { v0: amount.toLocaleString() });

              if (updateRes.success) await checkBankruptcy(interaction, balance.displayName, updateRes.currentCash);
          }

          // Tính toán hệ số nhân tiền (mult) dựa vào số lần bốc (bingoAt)
          let mult = 0;
          if (bingoAt !== -1) {
              if (bingoAt <= 30) mult = 10; // Bốc trúng sớm x10 tiền
              else if (bingoAt <= 50) mult = 2; // Bốc trúng ở mức vừa phải x2 tiền
              else mult = 1; // Bốc trúng muộn thì chỉ hòa vốn
          }

          // Sau đó mới đưa biến mult vào đoạn code của sếp:
          const embedColor = bingoAt !== -1 ? (bingoAt <= 50 && mult > 1 ? 0x2ecc71 : 0xf1c40f) : 0xe74c3c;
          
          const embed = new EmbedBuilder()
              .setColor(embedColor)
              .setDescription(finalStr)
              .setFooter({ text: 'Lô Tô 5x5 tk.chill - Bốc số cực lẹ!' });

          await interaction.editReply({ content: null, embeds: [embed] });
      }, 3000); 

    } catch (e) {
      // Hết giờ
    }
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      interaction.editReply({ content: '⏳ Sếp đứng chọn vé lâu quá Gánh Hát đã dời đi nơi khác rồi!', components: [] });
    }
  });
}

// ===================== LỆNH BƠM TIỀN TỪ HỆ THỐNG (ADD CASH) =====================
async function handleAddCash(interaction) {
    // 1. Kiểm tra quyền hạn (Dev, Admin)
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
    
    // Nếu sếp có role Staff riêng thì thay ID role vào đây
    const hasStaff = interaction.member.roles.cache.has('1493908725231128617'); 

    if (!hasDev && !hasAdmin && !hasStaff && interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ Cảnh báo: Chỉ Admin, Dev hoặc Staff mới có quyền dùng máy in tiền!', ephemeral: true });
    }

    const targetMentionable = interaction.options.getMentionable('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
        return interaction.reply({ content: '❌ Số tiền bơm phải lớn hơn 0!', ephemeral: true });
    }

    await interaction.deferReply();

    // 2. Tiến hành bơm tiền
    let targetId = targetMentionable.id || targetMentionable.user?.id;
    
    // Gọi hàm cộng tiền của sếp (Cộng thẳng vào ví hiện tại và tiền kiếm được)
    const updateRes = await updatePilotBalance(targetId, amount, 0, amount);

    if (updateRes && updateRes.success) {
        await interaction.editReply(t(interaction, 'STR_76F32D1A', { v0: amount.toLocaleString(), v1: targetId }));

        // =====================================
        // 🚨 BÁO CÁO MẬT VÀO KÊNH ADMIN BOT
        // =====================================
        const adminChannel = interaction.client.channels.cache.get(ADMIN_CHANNEL_ID || '1448258683627638895');
        if (adminChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('💸 PHÁT HIỆN GIAO DỊCH BƠM TIỀN')
                .setColor(0xf1c40f)
                .addFields(
                    { name: '👮 Người thực hiện (Staff)', value : t(interaction, 'STR_8CDE7BE9', { v0: interaction.user.id }), inline: true },
                    { name: '🎯 Người thụ hưởng', value : t(interaction, 'STR_8CDE7BE9', { v0: targetId }), inline: true },
                    { name: '💰 Số tiền in thêm', value : t(interaction, 'STR_6B439400', { v0: amount.toLocaleString() }), inline: false }
                )
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: 'Hệ thống Camera giám sát chống lạm phát kinh tế' })
                .setTimestamp();

            await adminChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    } else {
        await interaction.editReply(t(interaction, 'STR_D83B2B7E'));
        
        // Lỗi thì hoàn lại cái định mức cho thằng lạm quyền
        if (interaction.user.id === SUSPECT_ADMIN_ID) {
            let tracker = badAdminTracker.get(SUSPECT_ADMIN_ID);
            tracker.totalAdded -= amount;
            badAdminTracker.set(SUSPECT_ADMIN_ID, tracker);
        }
    }
}

// ===================== TÍNH NĂNG BẢNG XẾP HẠNG CASINO 23:59 =====================
async function sendDailyCasinoLeaderboard() {
    try {
        const channel = client.channels.cache.get(CASH_CHANNEL_ID);
        if (!channel) return;

        // 1. Kéo dữ liệu tiền từ Google Sheets (Hàm sếp vừa ném vào Googlesheet.js)
        const allUsers = await getAllPilotBalances(); 
        if (allUsers.length === 0) return;

        // --- NẾU SẾP CÓ HÀM LẤY TOÀN BỘ DATA TỪ MONGODB THÌ ĐẶT Ở ĐÂY ---
        // Giả sử: const allGamblingData = await db.getAllGamblingData();
        // Sếp sẽ map MongoDB data vào Google Sheets data để lấy (Lượt chơi, Wins, Losses).

        // Sort theo tiền nhiều nhất (Lọc Top 10)
        const topRich = [...allUsers].sort((a, b) => b.currentCash - a.currentCash).slice(0, 10);

        const embed = new EmbedBuilder()
            .setTitle('🏆 BẢNG XẾP HẠNG TỔNG KẾT CASINO CUỐI NGÀY 🏆')
            .setDescription('Điểm danh các ông trùm sòng bạc server tk.chill lúc 23:59 hằng ngày!')
            .setColor(0xFFD700)
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/2830/2830284.png')
            .setTimestamp();

        let richText = '';
        topRich.forEach((u, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎗️';
            // Sếp có thể bổ sung chuỗi ${u.playCount} lần chơi, ${u.wins} Thắng... vào đây nếu đã kéo từ Mongo
            richText += `${medal} **${u.username}**\n> 💰 **${u.currentCash.toLocaleString()} Cash**\n`;
        });

        embed.addFields(
            { name: '💸 TOP 10 ĐẠI GIA SỞ HỮU NHIỀU TIỀN NHẤT', value: richText || 'Chưa có dữ liệu' },
            { name: '📊 Chú ý', value: 'Dữ liệu Thắng/Thua/Lượt chơi.', inline: false }
        );

        await channel.send({ content: '🔔 **Tinh Tinh!** Đã 23:59, sòng bạc chuẩn bị chốt sổ sách!', embeds: [embed] });
    } catch (err) {
        console.error('Lỗi khi gửi BXH Casino Daily:', err);
    }
}

// Bộ canh giờ tự động bắn đúng 23:59 theo giờ Việt Nam
function startDailyCasinoLeaderboard() {
    const now = new Date();
    // Lấy giờ VN
    const vnTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    
    const target = new Date(vnTime);
    target.setHours(23, 59, 0, 0); // Canh chốt đúng 23:59:00
    
    // Nếu hôm nay đã qua 23:59 thì cộng thêm 1 ngày để gửi vào ngày mai
    if (vnTime.getTime() > target.getTime()) {
        target.setDate(target.getDate() + 1); 
    }
    
    const msUntilTarget = target.getTime() - vnTime.getTime();
    console.log(`[Casino Leaderboard] Sẽ tổng kết sau ${Math.round(msUntilTarget / 60000)} phút nữa (23:59 Giờ VN).`);
    
    setTimeout(() => {
        sendDailyCasinoLeaderboard();
        // Từ ngày hôm sau, nó sẽ tự lặp lại vòng 24h
        setInterval(sendDailyCasinoLeaderboard, 24 * 60 * 60 * 1000);
    }, msUntilTarget);
}

// ===================== LỆNH BÀI CÁO 3 LÁ (CÀO RÙA) =====================
async function handleBaiCao(interaction) {
    const amountInput = interaction.options.getString('amount');
    await interaction.deferReply();
    const balance = await checkAndRegisterUser(interaction); // Thay bằng hàm check user của sếp
    if (!balance) return;
    const amount = parseBetAmount(amountInput, balance.currentCash); // Thay bằng hàm parse tiền của sếp
    if (amount <= 0) return interaction.editReply(t(interaction, 'STR_4CC856D7'));
    if (balance.currentCash < amount) return interaction.editReply(t(interaction, 'STR_03D53DF6'));

    // Dùng chung hàm bốc bài của Blackjack
    let deck = getDeck(); 
    let playerHand = [deck.pop(), deck.pop(), deck.pop()];
    let dealerHand = [deck.pop(), deck.pop(), deck.pop()];

    // Tính điểm bài cào
    const getCaoScore = (hand) => {
        let isBaTay = hand.every(c => ['J', 'Q', 'K'].includes(c.value));
        if (isBaTay) return { score: 10, text: '🔥 BA TÂY (TIÊN)' }; // 10 điểm ảo để mặc định lớn hơn 9 nút
        
        let total = 0;
        for (let card of hand) {
            if (['J', 'Q', 'K', '10'].includes(card.value)) total += 10;
            else if (card.value === 'A') total += 1;
            else total += parseInt(card.value);
        }
        let nut = total % 10;
        return { score: nut, text: `${nut} Nút` };
    };

    let pData = getCaoScore(playerHand);
    let dData = getCaoScore(dealerHand);

    let resultMsg = '';
    let profit = 0;
    let color = 0x2b2d31;

    // Hiệu ứng nặn bài
    await interaction.editReply(t(interaction, 'STR_E05856B6'));

    setTimeout(async () => {
        if (pData.score > dData.score) {
            profit = amount;
            color = 0x2ecc71;
            resultMsg = t(interaction, 'STR_8E8A69D4', { v0: amount.toLocaleString() });
        } else if (pData.score < dData.score) {
            profit = -amount;
            color = 0xe74c3c;
            resultMsg = t(interaction, 'STR_D83DA7FC', { v0: amount.toLocaleString() });
        } else {
            // Cào rùa bằng nút thì cái ăn (luật làm cái) hoặc hòa. Cho hòa cho sếp đỡ chửi
            profit = 0;
            color = 0x3498db;
            resultMsg = t(interaction, 'STR_0D4898B6');
        }

        await updatePilotBalance(interaction.user.id, profit, amount, profit > 0 ? amount * 2 : 0);

        const embed = new EmbedBuilder()
            .setTitle('🎴 BÀI CÀO 3 LÁ 🎴')
            .setColor(color)
            .addFields(
                { name : t(interaction, 'STR_BC44D618', { v0: pData.text }), value: formatHand(playerHand), inline: false },
                { name : t(interaction, 'STR_2CA837A8', { v0: dData.text }), value: formatHand(dealerHand), inline: false }
            )
            .setFooter({ text: `Tiền cược: ${amount.toLocaleString()} Cash` });

        await interaction.editReply({ content: resultMsg, embeds: [embed] });
    }, 2000);
}

// ===================== LỆNH KIỂM TRA SỐ DƯ (CHECK BALANCE) =====================
async function handleCheckBalance(interaction) {
    // 1. Kiểm tra quyền hạn
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
    const hasStaff = interaction.member.roles.cache.has('1493908725231128617'); 

    if (!hasDev && !hasAdmin && !hasStaff && interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ Cảnh báo: Chỉ Admin, Dev hoặc Staff mới có quyền soi ví người khác!', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('target');
    await interaction.deferReply({ ephemeral: true }); // Chế độ ẩn, chỉ người check mới thấy

    // Kéo dữ liệu từ Sheet/Database
    const balance = await getPilotBalance(targetUser.id);
    if (!balance) {
        return interaction.editReply(t(interaction, 'STR_D5A2A95D', { v0: targetUser.id }));
    }

    const embed = new EmbedBuilder()
        .setTitle(t(interaction, 'STR_218A82C1', { v0: targetUser.username.toUpperCase() }))
        .setColor(0x2ecc71)
        .addFields(
            { name: '💰 Số dư hiện tại', value : t(interaction, 'STR_CE3EC3F7', { v0: parseFloat(balance.currentCash).toLocaleString() }), inline: false },
            { name: '📥 Tổng tiền đã kiếm', value : t(interaction, 'STR_BD84778D', { v0: parseFloat(balance.totalEarned).toLocaleString() }), inline: true },
            { name: '📤 Tổng tiền đã tiêu', value : t(interaction, 'STR_BD84778D', { v0: parseFloat(balance.usedCash).toLocaleString() }), inline: true }
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

// ===================== LỆNH TỊCH THU TÀI SẢN (CLEAR BALANCE) =====================
async function handleClearBalance(interaction) {
    // 1. Kiểm tra quyền hạn
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
    const hasStaff = interaction.member.roles.cache.has('1493908725231128617'); 

    if (!hasDev && !hasAdmin && !hasStaff && interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ Cảnh báo: Chỉ Admin, Dev hoặc Staff mới có quyền tịch thu tài sản!', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('target');
    await interaction.deferReply({ ephemeral: true });

    // Lấy số dư hiện tại
    const balance = await getPilotBalance(targetUser.id);
    if (!balance) {
        return interaction.editReply(t(interaction, 'STR_D5A2A95D', { v0: targetUser.id }));
    }

    const currentCash = parseFloat(balance.currentCash);
    if (currentCash <= 0) {
        return interaction.editReply(t(interaction, 'STR_98C970A4', { v0: targetUser.id }));
    }

    // 2. Trừ đi toàn bộ số dư hiện tại để nó về 0
    // Cấu trúc hàm: updatePilotBalance(id, cashChange, usedCashChange, earnedCashChange)
    const updateRes = await updatePilotBalance(targetUser.id, -currentCash, 0, 0);

    if (updateRes && updateRes.success) {
        await interaction.editReply(t(interaction, 'STR_DB28B325', { v0: currentCash.toLocaleString(), v1: targetUser.id }));

        // 3. 🚨 BÁO CÁO MẬT VÀO KÊNH ADMIN BOT
        const adminChannel = interaction.client.channels.cache.get(ADMIN_CHANNEL_ID || '1448258683627638895');
        if (adminChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🚨 LỆNH TỊCH THU TÀI SẢN (CLEAR BALANCE)')
                .setColor(0xe74c3c) // Đỏ báo động
                .addFields(
                    { name: '👮 Người thi hành án (Staff)', value : t(interaction, 'STR_8CDE7BE9', { v0: interaction.user.id }), inline: true },
                    { name: '🎯 Nạn nhân', value : t(interaction, 'STR_8CDE7BE9', { v0: targetUser.id }), inline: true },
                    { name: '💸 Số tiền vừa bị bay màu', value : t(interaction, 'STR_95776D45', { v0: currentCash.toLocaleString() }), inline: false }
                )
                .setThumbnail(targetUser.displayAvatarURL())
                .setFooter({ text: 'Biên bản xử lý vi phạm kinh tế' })
                .setTimestamp();

            await adminChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    } else {
        await interaction.editReply(t(interaction, 'STR_22A8AF71'));
    }
}

// ===================== LOGIN =====================
client.on('debug', info => console.log(`[DISCORD DEBUG] ${info}`));
client.on('warn', warning => console.log(`[DISCORD WARN] ${warning}`));
client.on('error', error => console.error(`[DISCORD ERROR]`, error));

client.login(TOKEN).catch(err => {
  console.error("❌ LỖI ĐĂNG NHẬP:", err);
});

// === WEB SERVER & PING CHÉO ===
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot 1 is alive!');
}).listen(port, () => {
  console.log(`HTTP server running on port ${port}`);
});

const BOT2_URL = process.env.BOT2_URL;

if (BOT2_URL) {
  setInterval(async () => {
    try {
      const response = await fetch(BOT2_URL);
      console.log(`[Ping Chéo] Đã chọc Bot 2, Status: ${response.status}`);
    } catch (error) {
      console.error(`[Ping Chéo] Lỗi khi chọc Bot 2:`, error.message);
    }
  }, 14 * 60 * 1000);
} else {
  console.log("⚠️ Chưa cài BOT2_URL, tính năng Ping chéo đang tắt.");
}
