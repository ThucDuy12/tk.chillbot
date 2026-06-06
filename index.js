require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Worker } = require('worker_threads');
const cheerio = require('cheerio');
const { initGoogleSheets, loadControllerLeaderboard, loadPilotLeaderboard, saveControllerLeaderboard, savePilotLeaderboard } = require('./googleSheets');
const { createCanvas, loadImage, GlobalFonts } = require('canvas');
const fetch = require('node-fetch'); // Thêm nếu chưa có

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
  PermissionFlagsBits,
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
const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID || '1440000000000000002';

const BOT_ANNOUNCEMENTS_CHANNEL_ID = process.env.BOT_ANNOUNCEMENTS_CHANNEL_ID || '1510136210683723927';
const ATC_NOTI_ROLE_ID = process.env.ATC_NOTI_ROLE_ID || '1510148740634382517';

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

// ===================== PENDING USERS DATA =====================
const PENDING_USERS_FILE = path.join(__dirname, 'pending_users.json');
let pendingUsersData = fs.existsSync(PENDING_USERS_FILE) 
  ? JSON.parse(fs.readFileSync(PENDING_USERS_FILE, 'utf8')) 
  : {};

function savePendingUsers() {
  fs.writeFileSync(PENDING_USERS_FILE, JSON.stringify(pendingUsersData, null, 2));
}

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
  return `<@${user.id}>`; // Ping trực tiếp
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
  verifiedMemberRoleId: '1430517630116036669',
  devRoleId: '1366433221687906304',
  adminRoleId: '1365960976016347136',
  banRoleId: '1408787259322273913',
  pendingRoleId: '1511014904142762104',
  eventParticipantRoleId: '1495788141293076674', // Thêm role cho event participants
  otherRoles: [
    { name: 'MSFS 2020/2024', id: '1365961239770959872' },
    { name: 'FSX/P3D', id: '1365961302887108669' },
    { name: 'X-Plane 11/12', id: '1365961407551766538' },
    { name: 'Pending', id: '1511014904142762104' },
  ],
};
let awardSent = fs.existsSync(AWARD_SENT_FILE) ? 
  JSON.parse(fs.readFileSync(AWARD_SENT_FILE, 'utf8')) : 
  { lastMonth: null, lastYear: null };

if (fs.existsSync(ROLES_FILE)) roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));

let bans = fs.existsSync(BANS_FILE) ? JSON.parse(fs.readFileSync(BANS_FILE, 'utf8')) : { users: {} };
let vatsimMessageStore = fs.existsSync(VATSIM_MSG_FILE) ? JSON.parse(fs.readFileSync(VATSIM_MSG_FILE, 'utf8')) : {};
let profiles = fs.existsSync(PROFILES_FILE) ? JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')) : {};
let leaderboardMessageStore = fs.existsSync(LEADERBOARD_MSG_FILE) ? JSON.parse(fs.readFileSync(LEADERBOARD_MSG_FILE, 'utf8')) : {};
let pilotLeaderboardMessageStore = fs.existsSync(PILOT_LEADERBOARD_MSG_FILE) ? JSON.parse(fs.readFileSync(PILOT_LEADERBOARD_MSG_FILE, 'utf8')) : {};

let leaderboardData = { month: null, year: null, stats: {} };
let pilotLeaderboardData = { month: null, year: null, pilots: {} };
let isLeaderboardLoaded = false;
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'scheduled_announcements.json');
let scheduledAnnouncements = fs.existsSync(ANNOUNCEMENTS_FILE) ? JSON.parse(fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8')) : [];
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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions, // THÊM DÒNG NÀY
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.MessageReaction, // THÊM DÒNG NÀY
    Partials.User,            // THÊM DÒNG NÀY
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
              .setDescription(`**${cs}** (${c.name || 'N/A'}) đang online!\n📶 Tần số: **${c.frequency || 'N/A'}**\n🎖️ Rating: **${getRatingStr(c.rating)}**\n⏰ Online lúc: <t:${logonUnix}:T> (<t:${logonUnix}:R>)`)
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
              .setDescription(`**${cs}** (${c.name || 'N/A'}) đã offline.\n⏱️ Tổng thời gian online: **${duration}**`)
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
    const maxItemsPerField = 10; // Hiển thị 10 người mỗi field
    const maxFieldsPerEmbed = 8; // Tối đa 8 fields (80 người) mỗi Embed để tin nhắn không quá dài
    const embeds = [];

    // Xây dựng mảng nội dung cho ATC
    const ctrlLines = controllers.map(c => {
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
      const name = p.name ? p.name : `CID: ${p.cid}`;
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
      currentEmbed.addFields({ name: `📡 ATC Online (0)`, value: 'Không có ATC nào online', inline: false });
    } else {
      ctrlChunks.forEach((chunk, index) => {
        // Tràn dung lượng 1 Embed -> Tạo Embed mới
        if (currentEmbed.data.fields && currentEmbed.data.fields.length >= maxFieldsPerEmbed) {
          currentEmbed = new EmbedBuilder().setColor(0x2ecc71);
          embeds.push(currentEmbed);
        }
        const name = index === 0 ? `📡 ATC Online (${controllers.length})` : `📡 ATC Online (Tiếp ${index + 1})`;
        currentEmbed.addFields({ name, value: chunk.join('\n'), inline: false });
      });
    }

    // Xử lý chèn Pilot vào Embed
    if (pilotChunks.length === 0) {
      if (currentEmbed.data.fields && currentEmbed.data.fields.length >= maxFieldsPerEmbed) {
          currentEmbed = new EmbedBuilder().setColor(0x2ecc71);
          embeds.push(currentEmbed);
      }
      currentEmbed.addFields({ name: `🛫 Pilots Online (0)`, value: 'Không có Pilot nào online', inline: false });
    } else {
      pilotChunks.forEach((chunk, index) => {
        // Tràn dung lượng 1 Embed -> Tạo Embed mới
        if (currentEmbed.data.fields && currentEmbed.data.fields.length >= maxFieldsPerEmbed) {
          currentEmbed = new EmbedBuilder().setColor(0x2ecc71);
          embeds.push(currentEmbed);
        }
        const name = index === 0 ? `🛫 Pilots Online (${pilots.length})` : `🛫 Pilots Online (Tiếp ${index + 1})`;
        currentEmbed.addFields({ name, value: chunk.join('\n'), inline: false });
      });
    }

    // Đóng gói: Discord cho phép 10 Embeds/tin nhắn. Mình gom 5 Embeds/tin nhắn cho an toàn và đẹp.
    const messagesPayload = [];
    for (let i = 0; i < embeds.length; i += 5) {
      messagesPayload.push({ embeds: embeds.slice(i, i + 5) });
    }

    // Lấy ID tin nhắn đã lưu (Hỗ trợ cấu trúc mảng mới để lưu nhiều tin nhắn)
    let storedIds = vatsimMessageStore.messageIds || [];
    if (!vatsimMessageStore.messageIds && vatsimMessageStore.messageId) {
        storedIds = [vatsimMessageStore.messageId]; // Convert file JSON cũ tự động
    }
    const channelId = vatsimMessageStore.channelId || VATSIM_CHANNEL_ID;
    const newStoredIds = [];

    // Cập nhật, Thêm hoặc Xóa tin nhắn linh hoạt
    try {
      const channel = await client.channels.fetch(channelId);

      for (let i = 0; i < messagesPayload.length; i++) {
        if (i < storedIds.length) {
          // 1. Nếu tin nhắn đã tồn tại -> Edit lại
          try {
            const msg = await channel.messages.fetch(storedIds[i]);
            await msg.edit(messagesPayload[i]);
            newStoredIds.push(msg.id);
          } catch (e) {
            // Lỡ ai tay nhanh xóa mất -> Gửi lại cái mới
            const sent = await channel.send(messagesPayload[i]);
            newStoredIds.push(sent.id);
          }
        } else {
          // 2. Cần thêm dung lượng -> Send tin nhắn mới nối tiếp
          const sent = await channel.send(messagesPayload[i]);
          newStoredIds.push(sent.id);
        }
      }

      // 3. Nếu số lượng bay giảm xuống, xóa đi mấy cái tin nhắn trắng thừa mứa ở dưới
      for (let i = messagesPayload.length; i < storedIds.length; i++) {
        try {
          const msg = await channel.messages.fetch(storedIds[i]);
          await msg.delete();
        } catch(e) {}
      }

      // Lưu lại danh sách IDs vào file
      vatsimMessageStore = { messageIds: newStoredIds, channelId: channel.id };
      fs.writeFileSync(VATSIM_MSG_FILE, JSON.stringify(vatsimMessageStore, null, 2));

    } catch (err) {
      console.warn('Lỗi khi update/send multi VATSIM messages:', err.message || err);
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
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    
    if (!roles.eventParticipantRoleId) {
      const role = await guild.roles.create({
        name: '🎟️ Event Participant',
        color: 0x0099ff,
        reason: 'Role cho người tham gia sự kiện',
        permissions: [],
        mentionable: true
      });
      
      roles.eventParticipantRoleId = role.id;
      fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
      console.log(`Created event participant role: ${role.name} (${role.id})`);
      
      const embed = createLogEmbed('➕ Role Created', `**Name:** ${role.name}\n**ID:** ${role.id}\n**Reason:** Event participant role`, 0x2ecc71);
      await sendLog(embed);
      
      return role.id;
    }
    
    // Kiểm tra role có tồn tại không
    const role = await guild.roles.fetch(roles.eventParticipantRoleId);
    if (!role) {
      const newRole = await guild.roles.create({
        name: '🎟️ Event Participant',
        color: 0x0099ff,
        reason: 'Role cho người tham gia sự kiện (recreated)',
        permissions: [],
        mentionable: true
      });
      
      roles.eventParticipantRoleId = newRole.id;
      fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
      console.log(`Recreated event participant role: ${newRole.name} (${newRole.id})`);
      
      const embed = createLogEmbed('➕ Role Recreated', `**Name:** ${newRole.name}\n**ID:** ${newRole.id}\n**Reason:** Event participant role (recreated)`, 0x2ecc71);
      await sendLog(embed);
      
      return newRole.id;
    }
    
    return roles.eventParticipantRoleId;
  } catch (err) {
    console.error('Error ensuring event role exists:', err);
    return null;
  }
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
    
    // Get current UTC time
    const now = new Date();
    const utcTime = now.toUTCString();
    const utcTimeShort = utcTime.split(' ')[4]; // Get HH:MM:SS part
    const utcHourMinute = utcTimeShort.split(':').slice(0, 2).join(':');
    
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
      .setDescription(`**VCLvACC Controllers**\n\nCập nhật lúc: ${utcHourMinute} UTC`)
      .setColor(0xFFD700)
      .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
      .setFooter({ text: 'Tự động cập nhật mỗi giờ | Giờ hiển thị: UTC' })
      .setTimestamp();
    
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
        name: `${categoryName} (${Object.keys(members).length})`,
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
      value: `• **Tổng controller:** ${totalMembers}\n• **Tổng giờ:** ${totalHours}h\n• **Tháng:** ${leaderboardData.month}/${leaderboardData.year}`,
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
    
    // Update or create leaderboard message
    if (leaderboardMessageStore.messageId && leaderboardMessageStore.channelId) {
      try {
        const channel = await client.channels.fetch(leaderboardMessageStore.channelId);
        const msg = await channel.messages.fetch(leaderboardMessageStore.messageId);
        if (msg) {
          await msg.edit({ embeds: [embed] });
          console.log(`✅ Controller Leaderboard updated at ${utcTime}`);
          return;
        }
      } catch (err) {
        console.warn('Could not fetch/edit stored controller leaderboard message:', err.message || err);
      }
    }
    
    // Create new message
    if (LEADERBOARD_CHANNEL_ID) {
      const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
      const sent = await channel.send({ embeds: [embed] });
      leaderboardMessageStore = { messageId: sent.id, channelId: channel.id };
      fs.writeFileSync(LEADERBOARD_MSG_FILE, JSON.stringify(leaderboardMessageStore, null, 2));
      console.log(`✅ Controller Leaderboard created at ${utcTime}`);
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
        existing.seconds += updateSeconds;
        existing.lastUpdate = currentTime;
        existing.callsign = pilot.callsign;
        existing.lastDeparture = pilot.departure;
        existing.lastArrival = pilot.arrival;
        existing.lastAircraft = pilot.aircraft;
        
        // Nếu có thay đổi sân bay, tăng số chuyến bay
        if (existing.lastDeparture !== pilot.departure || existing.lastArrival !== pilot.arrival) {
          existing.flights += 1;
        }
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
    
    // Get current UTC time
    const now = new Date();
    const utcTime = now.toUTCString();
    const utcTimeShort = utcTime.split(' ')[4]; // Get HH:MM:SS part
    const utcHourMinute = utcTimeShort.split(':').slice(0, 2).join(':');
    
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
      .setDescription(`**Member Iron Mic Awards - Pilots**\n\nCập nhật lúc: ${utcHourMinute} UTC`)
      .setColor(0x1E90FF)
      .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
      .setFooter({ text: 'Tự động cập nhật mỗi giờ | Giờ hiển thị: UTC' })
      .setTimestamp();
    
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
        leaderboardText += `${rankEmoji} **${displayName}** - ${formattedTime}\n`;
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
      value: `• **Tổng pilot:** ${totalPilots}\n• **Tổng giờ bay:** ${totalHours}h\n• **Tổng chuyến bay:** ${totalFlights}\n• **Tháng:** ${pilotLeaderboardData.month}/${pilotLeaderboardData.year}`,
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
    
    // Update or create pilot leaderboard message
    if (pilotLeaderboardMessageStore.messageId && pilotLeaderboardMessageStore.channelId) {
      try {
        const channel = await client.channels.fetch(pilotLeaderboardMessageStore.channelId);
        const msg = await channel.messages.fetch(pilotLeaderboardMessageStore.messageId);
        if (msg) {
          await msg.edit({ embeds: [embed] });
          console.log(`✅ Pilot Leaderboard updated at ${utcTime}`);
          return;
        }
      } catch (err) {
        console.warn('Could not fetch/edit stored pilot leaderboard message:', err.message || err);
      }
    }
    
    // Create new message in the same channel or different channel
    if (LEADERBOARD_CHANNEL_ID) {
      const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
      const sent = await channel.send({ embeds: [embed] });
      pilotLeaderboardMessageStore = { messageId: sent.id, channelId: channel.id };
      fs.writeFileSync(PILOT_LEADERBOARD_MSG_FILE, JSON.stringify(pilotLeaderboardMessageStore, null, 2));
      console.log(`✅ Pilot Leaderboard created at ${utcTime}`);
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
    // Ensure controller leaderboard message exists
    if (leaderboardMessageStore.messageId && leaderboardMessageStore.channelId) {
      const channel = await client.channels.fetch(leaderboardMessageStore.channelId);
      if (!channel) throw new Error('channel not found');
      const msg = await channel.messages.fetch(leaderboardMessageStore.messageId);
      if (!msg) throw new Error('message not found');
      console.log('Found existing controller leaderboard message to edit.');
    } else {
      const channelId = LEADERBOARD_CHANNEL_ID || VATSIM_CHANNEL_ID;
      const channel = await client.channels.fetch(channelId);
      const embed = new EmbedBuilder()
        .setTitle('Member Iron Mic Awards Leaderboard')
        .setDescription('Đang tải dữ liệu...')
        .setColor(0xFFD700)
        .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
        .setTimestamp();
      
      const sent = await channel.send({ embeds: [embed] });
      leaderboardMessageStore = { messageId: sent.id, channelId: channel.id };
      fs.writeFileSync(LEADERBOARD_MSG_FILE, JSON.stringify(leaderboardMessageStore, null, 2));
      console.log('Created initial controller leaderboard message.');
    }
    
    // Ensure pilot leaderboard message exists
    if (pilotLeaderboardMessageStore.messageId && pilotLeaderboardMessageStore.channelId) {
      const channel = await client.channels.fetch(pilotLeaderboardMessageStore.channelId);
      if (!channel) throw new Error('channel not found');
      const msg = await channel.messages.fetch(pilotLeaderboardMessageStore.messageId);
      if (!msg) throw new Error('message not found');
      console.log('Found existing pilot leaderboard message to edit.');
    } else {
      const channelId = LEADERBOARD_CHANNEL_ID || VATSIM_CHANNEL_ID;
      const channel = await client.channels.fetch(channelId);
      const embed = new EmbedBuilder()
        .setTitle('✈️ VCLvACC Pilot Leaderboard')
        .setDescription('Đang tải dữ liệu...')
        .setColor(0x1E90FF)
        .setThumbnail('https://images-ext-1.discordapp.net/external/0i9rb3rLfQjwZmpw62DgOmN_ns75snmwFGO3HeaSbKg/https/i.ibb.co/DPx8jtzS/logo-tk-chill-1.png?format=webp&quality=lossless&width=960&height=960')
        .setTimestamp();
      
      const sent = await channel.send({ embeds: [embed] });
      pilotLeaderboardMessageStore = { messageId: sent.id, channelId: channel.id };
      fs.writeFileSync(PILOT_LEADERBOARD_MSG_FILE, JSON.stringify(pilotLeaderboardMessageStore, null, 2));
      console.log('Created initial pilot leaderboard message.');
    }
    
  } catch (err) {
    console.error('Cannot create leaderboard messages:', err);
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

    // Build Embed
    const embed = new EmbedBuilder()
      .setTitle('🌐 Bảng xếp hạng ATC VATSEA')
      .setDescription(`Dữ liệu từ **${startTime.toISOString().split('T')[0]}** đến **${endTime.toISOString().split('T')[0]}** (UTC)`)
      .setColor(0x3498db)
      .setFooter({ text: 'Tự động cập nhật mỗi giờ (Dữ liệu từ StatSim)' })
      .setTimestamp();

    for (const category in positionIntervals) {
      const positionsData = positionIntervals[category];
      const ranking = [];
      
      for (const pos in positionsData) {
        ranking.push({ pos, duration: calculateMergedDuration(positionsData[pos]) });
      }
      
      ranking.sort((a, b) => b.duration - a.duration);

      let textBlock = '';
      let hasData = false;

      ranking.forEach((item, index) => {
        if (item.duration > 0) {
          textBlock += `**${index + 1}.** ${item.pos}: \`${formatVatseaDuration(item.duration)}\`\n`;
          hasData = true;
        } else {
          textBlock += `**${index + 1}.** ${item.pos}: \`0s\`\n`;
        }
      });

      embed.addFields({
        name: `🔹 ${category}`,
        value: hasData ? textBlock : 'Không có dữ liệu.\n',
        inline: false
      });
    }

    // Send or Update message
    if (VATSEA_CHANNEL_ID) {
      const channel = await client.channels.fetch(VATSEA_CHANNEL_ID);
      
      if (vatseaMessageStore.messageId) {
        try {
          const msg = await channel.messages.fetch(vatseaMessageStore.messageId);
          if (msg) {
            await msg.edit({ embeds: [embed] });
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
    .setTitle(`📦 SẢN PHẨM: ${data.name}`)
    .setColor(0x3498db)
    .addFields(
      { name: '💰 Giá', value: `**${data.price}**`, inline: true },
      { name: '🔢 Thông tin', value: data.info, inline: true },
      { name: '📝 Mô tả', value: data.description, inline: false },
      { name: '📞 Liên hệ', value: data.contact, inline: false },
      { name: '👤 Người bán', value: `<@${sellerId}>`, inline: true }
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
    profileStr += `<@${userId}>: Name: ${profile.name || 'Unknown'}, Age: ${profile.age || 'Unknown'}, Bio: ${
      profile.bio || 'None'
    }\n`;
  }
  return profileStr;
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
    } catch (_) {}
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

    // Gửi đến Gemini
    const responseText = await geminiChatReply(userId, text, allowSwear);

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
      if (msg.attachments.size > 3) content += ` | (+${msg.attachments.size - 3} files)`;
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
      name: `✈️ Group Flight: ${eventData.dep} → ${eventData.arr}`,
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
      { name: '🛫 Departure', value: `**${event.dep}**`, inline: true },
      { name: '🛬 Arrival', value: `**${event.arr}**`, inline: true },
      { name: '🧭 Route', value: `\`\`\`${event.route}\`\`\``, inline: false },
      { name: '⏰ Start Time', value: `${formatDateTime(startTime)}\n(${formatRelativeTime(startTime)})`, inline: false },
      { name: '👤 Created By', value: `<@${event.creator}>`, inline: true },
      { name: '👥 Participants', value: `**${event.participants.length}** người tham gia`, inline: true }
    )
    .setFooter({ text: 'Chúc mọi người có chuyến bay vui vẻ!', iconURL: 'https://cdn-icons-png.flaticon.com/512/929/929430.png' })
    .setTimestamp();

  // Thêm thông tin role event
  if (roles.eventParticipantRoleId) {
    embed.addFields({
      name: '🎫 Event Role',
      value: `Người tham gia sẽ được gán role <@&${roles.eventParticipantRoleId}>`,
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
      value: `[Join Discord Event](https://discord.com/events/${GUILD_ID}/${event.discordEventId})`,
      inline: true,
    });
  }

  return embed;
}

// ===================== VOICE CHANNEL HANDLER =====================
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const member = newState.member || oldState.member;
    if (!member) return;

    // --- Existing voice channel creation logic (giữ nguyên) ---
    if (newState.channelId === TRIGGER_VOICE_CHANNEL_ID) {
      // ... code tạo voice channel hiện tại ...
    }

    const oldChannel = oldState.channel;
    if (oldChannel && createdVoiceChannels.has(oldChannel.id)) {
      if (oldChannel.members.size === 0) {
        try {
          await oldChannel.delete();
          createdVoiceChannels.delete(oldChannel.id);
          console.log(`Deleted empty voice channel ${oldChannel.name}`);
        } catch (deleteErr) {
          console.error(`Error deleting voice channel ${oldChannel.name}:`, deleteErr);
        }
      }
    }
    // --- End existing logic ---

    // --- Logging voice state changes ---
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    
    if (oldChannelId === newChannelId) return;
    
    let action = '';
    let color = 0x9b59b6;
    
    if (!oldChannelId && newChannelId) {
      action = `🔊 Joined Voice Channel: ${newState.channel?.name || 'Unknown'}`;
    } else if (oldChannelId && !newChannelId) {
      action = `🔇 Left Voice Channel: ${oldState.channel?.name || 'Unknown'}`;
    } else if (oldChannelId && newChannelId) {
      action = `🔄 Moved Voice Channels: ${oldState.channel?.name || 'Unknown'} → ${newState.channel?.name || 'Unknown'}`;
    }
    
    if (action) {
      const embed = createLogEmbed(
        '🎙️ Voice State Update',
        `**User:** ${getUserIdentifier(member.user)}\n**Action:** ${action}`,
        color
      );
      await sendLog(embed);
    }
  } catch (err) {
    console.error('Error in voiceStateUpdate:', err);
  }
});

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
        await member.roles.remove(roles.banRoleId).catch(() => {});
      }
    } catch (_) {}

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
  es.addEventListener('pilot:sync', handleData); // THÊM DÒNG NÀY ĐỂ NHẬN LIST TỔNG
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

  es.onerror = (err) => {
    console.error('🔴 [ACDM] Bị ngắt luồng (Hệ thống sẽ tự động thử kết nối lại)');
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
      } catch(e) {}
    }

    // Lưu lại IDs tin nhắn
    acdmMessageStore = { messageIds: newStoredIds, channelId: channel.id };
    fs.writeFileSync(ACDM_MSG_FILE, JSON.stringify(acdmMessageStore, null, 2));

    console.log(`✅ [ACDM] Đã cập nhật bảng Discord! (${acdmFlights.length} tàu)`);

  } catch (err) {
    console.error('❌ [ACDM] Lỗi quá trình build Dashboard Discord:', err);
  }
}

// ===================== AUTO-SCAN PENDING ROLE =====================
async function scanAndAssignPendingRole() {
  if (!roles.pendingRoleId) return;
  
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();
    
    let assignedCount = 0;
    
    guild.members.cache.forEach(async (member) => {
      if (member.user.bot) return; 
      if (roles.banRoleId && member.roles.cache.has(roles.banRoleId)) return;
      
      // Nếu member đã có role Pending nhưng chưa có trong file JSON thì thêm vào (tính từ thời điểm quét)
      if (member.roles.cache.has(roles.pendingRoleId)) {
        if (!pendingUsersData[member.id]) {
          pendingUsersData[member.id] = {
            joinDate: Date.now(),
            notified5Days: false,
            notified7DaysMinus1Hour: false
          };
          savePendingUsers();
        }
        return;
      }

      if (member.roles.cache.size === 1) {
        try {
          await member.roles.add(roles.pendingRoleId);
          
          // Lưu vào database ngày join
          pendingUsersData[member.id] = {
            joinDate: Date.now(),
            notified5Days: false,
            notified7DaysMinus1Hour: false
          };
          savePendingUsers();

          assignedCount++;
          console.log(`[Auto-Role] Đã cấp role Welcome/Pending cho ${member.user.tag}`);
        } catch (e) {
          console.error(`Không thể cấp role cho ${member.user.tag}:`, e.message);
        }
      }
    });
    
    if (assignedCount > 0) {
      console.log(`✅ [Auto-Role] Hoàn tất quét! Đã cấp role cho ${assignedCount} người dùng vô gia cư.`);
    }
  } catch (err) {
    console.error('❌ Lỗi khi chạy auto-scan role:', err);
  }
}

// ===================== READY =====================
client.once('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  // Kiểm tra award mỗi 6 giờ (và khi bot khởi động)
  setInterval(checkAndSendMonthlyAwards, 6 * 60 * 60 * 1000);

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
      .addStringOption((option) => option.setName('time').setDescription('Hẹn giờ gửi (YYYY-MM-DD HH:MM UTC), bỏ trống = gửi luôn').setRequired(false)),
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
      .addStringOption(option => option.setName('id').setDescription('ID tin nhắn đã gửi hoặc ID lịch trình').setRequired(true))
      .addStringOption(option => option.setName('content').setDescription('Nội dung mới muốn sửa').setRequired(true))
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
  ];
  // Sau các lệnh khởi tạo khác
  await initGoogleSheets().catch(err => console.error('Google Sheets init failed:', err));

  try {
    await client.application.commands.set(commands.map((c) => c.toJSON()));
    console.log('Registered application commands.');
  } catch (err) {
    console.warn('Failed to register commands:', err.message || err);
  }

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
    
    // Duyệt ngược mảng để dễ dàng xóa phần tử khi đã gửi xong
    for (let i = scheduledAnnouncements.length - 1; i >= 0; i--) {
      const ann = scheduledAnnouncements[i];
      
      // Nếu thời gian hiện tại đã vượt qua thời gian hẹn giờ
      if (now >= ann.time) {
        try {
          const targetChannel = await client.channels.fetch(ann.channelId);
          if (targetChannel) {
            await targetChannel.send({ 
              content: ann.content, 
              allowedMentions: { parse: ['roles', 'users', 'everyone'] } 
            });
          }
        } catch (err) {
          console.error(`Lỗi gửi thông báo đã lên lịch (ID: ${ann.id}):`, err);
        }
        
        // Gửi xong thì xóa khỏi mảng
        scheduledAnnouncements.splice(i, 1);
        hasChanges = true;
      }
    }
    
    // Nếu có thông báo vừa được gửi/xóa, cập nhật lại file JSON
    if (hasChanges) {
      fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(scheduledAnnouncements, null, 2));
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
        const hoursElapsed = elapsedMs / (1000 * 60 * 60);

        // 1. Kick (Sau đúng 7 ngày)
        if (daysElapsed >= 7) {
          try {
            await member.send(`Đã 1 tuần rồi mà bạn chưa xin role, đây là trách nhiệm của tui. Tạm biệt bạn nhé, bạn có thể rejoin server: ${SERVER_INVITE_LINK}`);
          } catch(e) {} // Lơ lỗi nếu họ khóa DM
          
          await member.kick("Không xin role Member sau 1 tuần");
          delete pendingUsersData[userId];
          isModified = true;
          console.log(`👢 [Auto-Kick] Đã kick ${member.user.tag} vì không xin role sau 7 ngày.`);
          continue;
        }

        // 2. Nhắc nhở trước khi kick 1 tiếng (Tức là đã trôi qua 167 tiếng / 7*24 = 168)
        if (hoursElapsed >= 167 && !data.notified7DaysMinus1Hour) {
          try {
            await member.send("Bạn ơi đã 1 tuần rồi mà sao chưa xin role Member để trò chuyện cùng mọi người nhỉ? Hãy vào <#1405214914662109294> và xin role Member để trò chuyện nhé");
          } catch(e) {}
          data.notified7DaysMinus1Hour = true;
          isModified = true;
        }

        // 3. Nhắc nhở 5 ngày
        if (daysElapsed >= 5 && !data.notified5Days) {
          try {
            await member.send("Bạn ơi đã 5 ngày rồi mà sao chưa xin role Member để trò chuyện cùng tui nhỉ? Hãy vào <#1405214914662109294> và xin role Member để trò chuyện nhé");
          } catch(e) {}
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
  await loadAllLeaderboards();

  await ensureACDMMessageExists();
  
  // Thêm dòng này để bật kết nối lấy dữ liệu ACDM liên tục
  await setupACDMStream();

  // ==========================================
  // CẬP NHẬT VATSEA ATC LEADERBOARD
  // ==========================================
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

  // 1. Chạy ngay lần đầu tiên sau khi bot khởi động (chờ 15 giây cho bot load xong các thứ khác)
  setTimeout(() => {
    runVatseaUpdate();
  }, 15000);

  // 2. Sau đó cứ đúng 1 tiếng (60 * 60 * 1000 ms) lặp lại 1 lần
  setInterval(runVatseaUpdate, 60 * 60 * 1000);

  // VATSIM update scheduling
  const vatsimPeriodMs = (process.env.VATSIM_UPDATE_MINUTES ? parseInt(process.env.VATSIM_UPDATE_MINUTES) : 1) * 60 * 1000;
  vatsimWorker.postMessage('update');
  setInterval(() => vatsimWorker.postMessage('update'), vatsimPeriodMs);
  console.log(`VATSIM updater running: immediate + every ${vatsimPeriodMs / 60000} minutes`);
  
  // Controller leaderboard embed update: mỗi giờ
  setInterval(updateControllerLeaderboardEmbed, 60 * 60 * 1000); // 1 giờ
  
  // Pilot leaderboard embed update: mỗi giờ
  setInterval(updatePilotLeaderboardEmbed, 60 * 60 * 1000); // 1 giờ
  
  // Cập nhật dữ liệu thường xuyên hơn (mỗi phút)
  setInterval(() => {
    // Gọi VATSIM worker để cập nhật controllers và pilots
    vatsimWorker.postMessage('update');
  }, 60 * 1000); // Mỗi phút
  
  // Cập nhật embed ngay lần đầu
  setTimeout(() => {
    updateControllerLeaderboardEmbed();
    updatePilotLeaderboardEmbed();
  }, 10000);
  
  console.log('Leaderboard updater scheduled: data every minute, embed every hour');
  
  // Clean up empty voice channels
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    
    channels.forEach(channel => {
      if (channel.type === ChannelType.GuildVoice && 
          channel.members.size === 0 && 
          channel.name.includes("'s Channel")) {
        channel.delete().catch(() => {});
        console.log(`Cleaned up empty voice channel: ${channel.name}`);
      }
    });
  } catch (err) {
    console.error('Error cleaning up voice channels:', err);
  }
});

// ===================== MEMBER ADD (AUTO ROLE & LOG) =====================
client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return; // Bỏ qua nếu người mới join là một con Bot khác

  // 1. Tự động cấp Role Pending (Thêm delay 2 giây để tránh lỗi kẹt API của Discord)
  if (member.guild.id === GUILD_ID && roles.pendingRoleId) {
    setTimeout(async () => {
      try {
        await member.roles.add(roles.pendingRoleId);
        
        // --- THÊM LOGIC LƯU DATA VÀ GỬI LỜI CHÀO ---
        pendingUsersData[member.id] = {
          joinDate: Date.now(),
          notified5Days: false,
          notified7DaysMinus1Hour: false
        };
        savePendingUsers();

        try {
          await member.send("Welcome to tk.chill server, hãy vào kênh <#1405214914662109294> để lấy role Member và trò chuyện cùng mọi người nhá. **Lưu ý nếu bạn không xin role 1 tuần kể từ ngày bạn vào server thì bot sẽ tự kick bạn ra**");
        } catch (dmErr) {
          console.log(`[Auto-Role] Không thể gửi DM cho ${member.user.tag} (họ chặn tin nhắn người lạ)`);
        }
        // ------------------------------------------

        console.log(`✅ [Auto-Role] Đã tự động cấp role Welcome/Pending cho người mới: ${member.user.tag}`);
      } catch (err) {
        console.error(`❌ [Auto-Role] Lỗi khi cấp role cho ${member.user.tag}:`, err.message);
      }
    }, 2000); // Trễ 2000ms (2 giây)
  }
  
  // 2. Gửi Log báo cáo
  const embed = createLogEmbed(
    '📥 Member Joined',
    `**User:** ${getUserIdentifier(member.user)}\n**ID:** ${member.user.id}\n**Account created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    0x2ecc71 // Màu xanh lá
  );
  await sendLog(embed);
});

// ===================== INTERACTIONS =====================
client.on('interactionCreate', async (interaction) => {
  const isChatCmd = typeof interaction.isChatInputCommand === 'function'
    ? interaction.isChatInputCommand()
    : (typeof interaction.isCommand === 'function' ? interaction.isCommand() : false);

  const isStringSelect = typeof interaction.isStringSelectMenu === 'function'
    ? interaction.isStringSelectMenu()
    : (typeof interaction.isSelectMenu === 'function' ? interaction.isSelectMenu() : false);

  if (!isChatCmd && !interaction.isButton?.() && !interaction.isModalSubmit?.() && !isStringSelect) return;
  if (isChatCmd) {
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
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Tên sản phẩm').setPlaceholder('Ex: Livery A321...').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel('Số lượng & Tình trạng').setPlaceholder('Ex: 1 / Mới').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Giá bán').setPlaceholder('Ex: 80.000 VNĐ').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Mô tả sản phẩm').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel('Liên hệ khác').setPlaceholder('Link FB, SĐT...').setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
          await interaction.showModal(sellModal);
          break;
        }
      }
    } else if (interaction.isButton()) {
        const customId = interaction.customId;
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
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Tên sản phẩm').setDefaultValue(parsedData.name).setStyle(TextInputStyle.Short).setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel('Số lượng & Tình trạng').setDefaultValue(parsedData.info).setStyle(TextInputStyle.Short).setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Giá bán').setDefaultValue(parsedData.price).setStyle(TextInputStyle.Short).setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Mô tả sản phẩm').setDefaultValue(parsedData.description).setStyle(TextInputStyle.Paragraph).setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel('Liên hệ').setDefaultValue(parsedData.contact).setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(editModal);
            return;
          }

          if (action === 'reject') {
            const saleId = parts[2];
            const rejectModal = new ModalBuilder().setCustomId(`market_reject_modal_${saleId}`).setTitle('Lý do từ chối sản phẩm');
            rejectModal.addComponents(
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Lý do từ chối').setPlaceholder('Ví dụ: Thiếu ảnh chi tiết, giá quá cao...').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(rejectModal);
            return;
          }

          if (action === 'approve') {
            const marketChannel = interaction.guild.channels.cache.get(MARKETPLACE_CHANNEL_ID);
            if (!marketChannel) return interaction.reply({ content: '❌ Không tìm thấy kênh Marketplace!', ephemeral: true });

            // Embed công khai
            const publicEmbed = EmbedBuilder.from(oldEmbed)
              .setFooter({ text: `Ngày đăng: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` });

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setLabel('Liên hệ người bán').setStyle(ButtonStyle.Link).setURL(`https://discord.com/users/${parsedData.sellerId}`).setEmoji('💬'),
              new ButtonBuilder().setCustomId(`market_soldout_${parsedData.sellerId}`).setLabel('Hết hàng / Đã bán').setStyle(ButtonStyle.Danger).setEmoji('✖️')
            );

            // Gửi bài chính
            await marketChannel.send({ content: '📢 **CÓ SẢN PHẨM MỚI!**', embeds: [publicEmbed], components: [row] });
            
            await interaction.message.edit({ content: `✅ **Đã duyệt** bởi ${interaction.user.mention}`, components: [], embeds: [] });
            await interaction.reply({ content: '✅ Đã đăng bài thành công ra kênh Marketplace!', ephemeral: true });
            return;
          }

          // Nút [Hết hàng / Đã bán] (Khu vực Public)
          if (action === 'soldout') {
            const sellerId = parts[2];
            const hasAdmin = interaction.member.roles.cache.some(r => r.name === 'Admin') || interaction.member.roles.cache.has(roles.adminRoleId);
            const isSeller = interaction.user.id === sellerId;

            if (!isSeller && !hasAdmin && interaction.user.id !== OWNER_ID) {
              return interaction.reply({ content: '❌ Chỉ người bán hoặc Admin mới được đóng bài!', ephemeral: true });
            }

            const soldEmbed = EmbedBuilder.from(oldEmbed)
              .setTitle(`${oldEmbed.title} [HẾT HÀNG]`)
              .setColor(0x95a5a6); // Dark Grey

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('disabled_sold').setLabel('Đã Hết Hàng').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );

            await interaction.message.edit({ embeds: [soldEmbed], components: [row] });
            await interaction.reply({ content: '✅ Đã đóng bài đăng bán thành công.', ephemeral: true });
            return;
          }
        }
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
            new ButtonBuilder().setCustomId(`market_edit_${saleId}`).setLabel('Sửa bài').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
            new ButtonBuilder().setCustomId(`market_approve_${saleId}`).setLabel('DUYỆT').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`market_reject_${saleId}`).setLabel('TỪ CHỐI').setStyle(ButtonStyle.Danger).setEmoji('❌')
          );

          const adminChannel = interaction.guild.channels.cache.get(ADMIN_CHANNEL_ID);
          if (adminChannel) {
            await adminChannel.send({ content: `📩 **ĐƠN BÁN MỚI** từ <@${interaction.user.id}>`, embeds: [embed], components: [row] });
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
            content: `❌ **Đã từ chối:** ${parsedData.name}\n👤 **Người bán:** <@${parsedData.sellerId}>\n📝 **Lý do:** ${reason}${dmStatus}`,
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
    } catch (_) {}
  }
});

// ===================== MESSAGE CREATE =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;

  if (bans.users[userId] && bans.users[userId].endTime > Date.now()) return;

  if (message.mentions.has(client.user) && message.channel.id !== AI_CHANNEL_ID) {
    await handleGeminiResponse(message, false);
  }

  if (message.channel.id === AI_CHANNEL_ID) {
    await handleGeminiResponse(message, true);
  }
  
  // Debug command for owner
  if (message.content === '!debug_pilot_leaderboard' && message.author.id === OWNER_ID) {
    const embed = new EmbedBuilder()
      .setTitle('Debug Pilot Leaderboard Data')
      .setDescription(`Dữ liệu từ file JSON:`)
      .setColor(0xFF0000);
    
    const pilotEntries = Object.entries(pilotLeaderboardData.pilots || {});
    
    if (pilotEntries.length === 0) {
      embed.addFields({
        name: 'Pilots',
        value: 'Không có dữ liệu',
        inline: false
      });
    } else {
      let fieldValue = '';
      pilotEntries.slice(0, 10).forEach(([id, data]) => {
        const hours = (data.seconds / 3600).toFixed(2);
        fieldValue += `${data.name} (${id}) - ${data.seconds}s (${hours}h) - ${data.flights || 1} chuyến\n`;
      });
      
      embed.addFields({
        name: `Pilots (${pilotEntries.length})`,
        value: fieldValue || 'Không có',
        inline: false
      });
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
        value: `${timeInfo.detailed.dayOfWeek}, ngày ${timeInfo.detailed.day} ${timeInfo.detailed.monthName} năm ${timeInfo.detailed.year}\n${timeInfo.detailed.hours
          .toString()
          .padStart(2, '0')}:${timeInfo.detailed.minutes.toString().padStart(2, '0')}:${timeInfo.detailed.seconds.toString().padStart(2, '0')}`,
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
      .setDescription(`**${monthName} năm ${currentYear}**\n\n🎉 *Xin chúc mừng những ATC có thời gian kiểm soát nhiều nhất trong tháng!* 🎉`)
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
          name: `${rank} ${atc.name} (${atc.cid})`,
          value: `⏱️ **Thời gian:** ${timeFormatted}\n📡 **Vị trí:** ${categories}\n✈️ **Callsign gần nhất:** ${atc.callsign || 'N/A'}`,
          inline: false
        });
      });
      
      // Thêm thông điệp chúc mừng
      const winnerNames = top5.map(a => a.name).join(', ');
      embed.addFields({
        name: '🎊 Chúc mừng!',
        value: `Xin chúc mừng **${winnerNames}** đã xuất sắc lọt vào top 5 ATC của tháng!\nCảm ơn các bạn đã đóng góp cho cộng đồng VCLvACC!`,
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
        content: `✅ Đã gửi thông báo chúc mừng top 5 ATC vào <#${channelId}>!`, 
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
      .setDescription(`**${monthName} năm ${currentYear}**\n\n🎉 *Xin chúc mừng những pilot có thời gian bay nhiều nhất trong khu vực VCL!* 🎉`)
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
          name: `${rank} ${pilot.name} (${pilot.cid})`,
          value: `⏱️ **Thời gian bay:** ${timeFormatted}\n✈️ **Số chuyến bay:** ${pilot.flights}\n🛩️ **Callsign gần nhất:** ${pilot.callsign || 'N/A'}`,
          inline: false
        });
      });
      
      // Thêm thông điệp chúc mừng
      const winnerNames = top5.map(p => p.name).join(', ');
      embed.addFields({
        name: '🎊 Chúc mừng!',
        value: `Xin chúc mừng **${winnerNames}** đã xuất sắc lọt vào top 5 pilot của tháng!\nChúc các bạn luôn có những chuyến bay an toàn và thú vị!`,
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
        content: `✅ Đã gửi thông báo chúc mừng top 5 pilot vào <#${channelId}>!`, 
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
    
    // Lưu trạng thái đã gửi
    if (sentAny) {
      awardSent = { lastMonth: currentMonth, lastYear: currentYear };
      fs.writeFileSync(AWARD_SENT_FILE, JSON.stringify(awardSent, null, 2));
      console.log(`[Monthly Award] Đã gửi award và lưu trạng thái cho tháng ${currentMonth}/${currentYear}`);
    }
    
  } catch (err) {
    console.error('Error in monthly award check:', err);
  }
}

/**
 * Reset trạng thái award (dành cho admin)
 */
function resetAwardStatus() {
  awardSent = { lastMonth: null, lastYear: null };
  fs.writeFileSync(AWARD_SENT_FILE, JSON.stringify(awardSent, null, 2));
  console.log('✅ Đã reset trạng thái award!');
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
      return interaction.editReply(
        `ℹ️ Không có tin nhắn phù hợp trong ${durationStr} gần nhất ở <#${channel.id}>.`
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
        await interaction.editReply('❌ Tóm tắt thất bại do lỗi nội bộ. Admin kiểm tra log giúp nhé.');
      } else {
        await interaction.reply({ content: '❌ Tóm tắt thất bại do lỗi nội bộ. Admin kiểm tra log giúp nhé.', ephemeral: true });
      }
    } catch (_) {}
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
      const attachment = new AttachmentBuilder(buffer, { name: `pilot_leaderboard_${pilotLeaderboardData.month}_${pilotLeaderboardData.year}.txt` });
      
      const embed = new EmbedBuilder()
        .setTitle('📊 Full Pilot Leaderboard')
        .setDescription(`Toàn bộ danh sách pilot trong khu vực VCL (VV/VD/VL)\nTháng: ${pilotLeaderboardData.month}/${pilotLeaderboardData.year}`)
        .setColor(0x1E90FF)
        .setFooter({ text: 'Tải file .txt để xem chi tiết' })
        .setTimestamp();
      
      await interaction.editReply({ 
        content: `✅ Đây là toàn bộ pilot leaderboard (${Object.keys(pilotLeaderboardData.pilots || {}).length} pilot)`,
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
        .setPlaceholder('Chọn role')
        .addOptions(filteredRoles.map((r) => ({ label: r.name, value: r.id })))
    );
    await interaction.reply({ content: 'Chọn role bạn muốn xin:', components: [row], ephemeral: true });
  } else {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('request_member').setLabel('Xin Role Member').setStyle(ButtonStyle.Primary)
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
        new TextInputBuilder().setCustomId('name').setLabel('Tên').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('intro').setLabel('Giới thiệu bản thân').setStyle(TextInputStyle.Paragraph).setRequired(true)
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
        new TextInputBuilder().setCustomId('name').setLabel('Tên').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('intro').setLabel('Giới thiệu bản thân').setStyle(TextInputStyle.Paragraph).setRequired(true)
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
          value: `<@${interaction.user.id}>`,
          inline: true
        })
        .setTimestamp();
        
      await interaction.update({ embeds: [newEmbed], components: [] });
    } catch (err) {
      console.error('Error updating embed:', err);
    }

    // 2. Xử lý logic TỪ CHỐI
    if (action === 'deny') {
      // Do đã update() ở trên, từ đây về sau phải dùng followUp()
      await interaction.followUp({ content: '❌ Đã từ chối yêu cầu cấp role.', ephemeral: true });
      try {
        const user = await client.users.fetch(request.userId);
        await user.send('❌ Yêu cầu xin role của bạn đã bị từ chối.');
      } catch (err) {
        console.error('Error notifying user (deny):', err);
      }
      return;
    }

    // 3. Xử lý logic ĐỒNG Ý
    try {
      const guild = await client.guilds.fetch(request.guildId);
      const member = await guild.members.fetch(request.userId);
      
      // Thêm role yêu cầu
      await member.roles.add(request.roleId);

      // Nếu xin role Member thì lột role Pending (Welcome) ra
      if (request.roleId === roles.basicMemberRoleId && roles.pendingRoleId) {
        await member.roles.remove(roles.pendingRoleId);

        if (pendingUsersData[request.userId]) {
            delete pendingUsersData[request.userId];
            savePendingUsers();
        }
      }

      await interaction.followUp({ content: '✅ Đã duyệt và cấp role thành công!', ephemeral: true });

      // Nhắn tin DM cho người dùng báo tin vui
      try {
        await member.send('🎉 Yêu cầu xin role của bạn đã được duyệt!');
      } catch (err) {
        console.error('Error sending DM to user (approve):', err);
      }
      
    } catch (err) {
      console.error('Error approving role:', err);
      // Nếu nhảy vào đây, 99% là do Bot bị lỗi phân cấp (Role bot thấp hơn Role cần cấp)
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
      new ButtonBuilder().setCustomId(`group_join_${eventId}`).setLabel('✈️ Tham gia').setStyle(ButtonStyle.Primary).setEmoji('✈️'),
      new ButtonBuilder().setCustomId(`group_canceljoin_${eventId}`).setLabel('❌ Hủy tham gia').setStyle(ButtonStyle.Secondary).setEmoji('❌')
    );

    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
    if (hasDev || hasAdmin || interaction.user.id === event.creator) {
      row.addComponents(new ButtonBuilder().setCustomId(`group_cancelevent_${eventId}`).setLabel('🚫 Hủy sự kiện').setStyle(ButtonStyle.Danger).setEmoji('🚫'));
    }

    const channel = client.channels.cache.get(GROUP_FLIGHT_CHANNEL_ID) || interaction.channel;
    const message = await channel.send({
      content: `🎉 **SỰ KIỆN GROUP FLIGHT MỚI!** <@&${roles.basicMemberRoleId}>`,
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
    const parts = customId.split('_');
    const action = parts[1]; // 'okay', 'orig' hoặc 'reject'
    const reqId = parts[2];

    const pendingData = pendingAnnouncements.get(reqId);
    if (!pendingData) {
      return interaction.reply({ content: '❌ Yêu cầu đã hết hạn hoặc bot vừa bị restart.', ephemeral: true });
    }

    if (action === 'reject') {
      pendingAnnouncements.delete(reqId);
      return interaction.update({ content: '❌ Đã hủy gửi thông báo.', embeds: [], components: [] });
    }

    // Chọn văn bản cuối cùng dựa theo nút user bấm
    const finalMessage = action === 'okay' ? pendingData.aiMessage : pendingData.rawMessage;
    
    // Xóa bộ nhớ tạm
    pendingAnnouncements.delete(reqId);

    // Nếu có hẹn giờ
    if (pendingData.targetTime) {
      // Đẩy vào mảng và lưu ra file JSON
      scheduledAnnouncements.push({
        id: reqId,
        channelId: pendingData.channelId,
        content: finalMessage,
        time: pendingData.targetTime,
        author: interaction.user.id
      });
      fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(scheduledAnnouncements, null, 2));

      await interaction.update({ 
        content: `✅ Đã lên lịch gửi thông báo vào <t:${Math.floor(pendingData.targetTime/1000)}:F>!\n**ID Lịch trình:** \`${reqId}\` (Dùng để sửa/hủy)`, 
        embeds: [], 
        components: [] 
      });
    } else {
      // Gửi ngay lập tức
      try {
        const targetChannel = await client.channels.fetch(pendingData.channelId);
        const sentMsg = await targetChannel.send({ content: finalMessage, allowedMentions: { parse: ['roles', 'users', 'everyone'] } });
        await interaction.update({ content: `✅ Đã gửi thông báo thành công!\n**ID Tin nhắn:** \`${sentMsg.id}\` (Dùng để sửa)`, embeds: [], components: [] });
      } catch (err) {
        await interaction.update({ content: `❌ Lỗi khi gửi thông báo: ${err.message}`, embeds: [], components: [] });
      }
    }
    return;
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
        } catch (_) {}

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
      new TextInputBuilder().setCustomId('dep').setLabel('Departure (ICAO)').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('arr').setLabel('Arrival (ICAO)').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('route').setLabel('Route').setStyle(TextInputStyle.Paragraph).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('time').setLabel('Giờ bắt đầu (UTC, YYYY-MM-DD HH:MM)').setStyle(TextInputStyle.Short).setRequired(true)
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
      resetAwardStatus();
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
    } catch (_) {}
  }
}

async function handleModal(interaction) {
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
      new ButtonBuilder().setCustomId(`confirm_event_${eventId}`).setLabel('🚀 Xác nhận và công bố').setStyle(ButtonStyle.Success).setEmoji('🚀')
    );

    await interaction.reply({
      content: `📋 **Xem trước sự kiện:**\n🛫 **Departure:** ${dep}\n🛬 **Arrival:** ${arr}\n🧭 **Route:** ${route}\n⏰ **Start Time (UTC):** ${formatDateTime(startTimeObj)}`,
      components: [row],
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === 'profile_modal') {
    const name = interaction.fields.getTextInputValue('name');
    const age = interaction.fields.getTextInputValue('age');
    const bio = interaction.fields.getTextInputValue('bio');
    profiles[interaction.user.id] = { name, age, bio };
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
    await interaction.reply({ content: '✅ Profile đã được lưu!', ephemeral: true });
    return;
  }

  // Trong handleModal, xử lý role_info_modal_
if (interaction.customId.startsWith('role_info_modal_')) {
  const roleId = interaction.customId.split('_')[3];
  const name = interaction.fields.getTextInputValue('name');
  const intro = interaction.fields.getTextInputValue('intro');
  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const requestId = Date.now().toString();
  pendingRequests.set(requestId, { userId: interaction.user.id, roleId, guildId: interaction.guild.id, name, intro, timestamp, messageId: null });

  try {
    const channel = await client.channels.fetch(ROLE_APPROVAL_CHANNEL_ID);
    const roleName = roleId === roles.basicMemberRoleId ? 'Member' : roles.otherRoles.find((r) => r.id === roleId)?.name || 'Unknown';

    const embed = new EmbedBuilder()
      .setTitle('Role Request')
      .setDescription(
        `User ${interaction.user.tag} (${interaction.user.id}) requests role ${roleName}.\n\n**Tên:** ${name}\n**Giới thiệu:** ${intro}\n**Thời gian:** ${timestamp}`
      );

    // Thêm ping DEV và Admin
    const mentionText = `<@&${roles.devRoleId}> <@&${roles.adminRoleId}>`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve_${requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`deny_${requestId}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
    );

    const sentMessage = await channel.send({
      content: mentionText,
      embeds: [embed],
      components: [row],
      allowedMentions: { roles: [roles.devRoleId, roles.adminRoleId] } // chỉ ping đúng các role đó
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
      content: `⏰ **SỰ KIỆN SẮP BẮT ĐẦU!** <@&${roles.basicMemberRoleId}>`,
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error('Error updating reminder message:', err);
  }

  for (const userId of event.participants) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(
        `⏰ **Group flight của bạn sẽ bắt đầu sau 15 phút!**\n\n🛫 **Departure:** ${event.dep}\n🛬 **Arrival:** ${event.arr}\n🧭 **Route:** ${event.route}\n\nSee you soon! ✈️`
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
      content: `🎯 **GROUP FLIGHT ĐANG DIỄN RA!** <@&${roles.basicMemberRoleId}>`,
      embeds: [embed],
      components: [],
      allowedMentions: { parse: [] },
    });

    for (const userId of event.participants) {
      try {
        const user = await client.users.fetch(userId);
        await user.send(
          `🎯 **Group flight của bạn đã bắt đầu!**\n\nHãy tham gia ngay!\n🛫 **Departure:** ${event.dep}\n🛬 **Arrival:** ${event.arr}\n🧭 **Route:** ${event.route}\n\nHappy flying! ✈️`
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
  const modal = new ModalBuilder().setCustomId('profile_modal').setTitle('Submit Profile');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel('Tên').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('age').setLabel('Tuổi').setStyle(TextInputStyle.Short).setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('bio').setLabel('Bio').setStyle(TextInputStyle.Paragraph).setRequired(false)
    )
  );
  await interaction.showModal(modal);
}

async function handleAnnouncement(interaction) {
  const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
  const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
  if (!hasDev && !hasAdmin) return interaction.reply({ content: '❌ Bạn không có quyền.', ephemeral: true });

  const channel = interaction.options.getChannel('channel');
  const rawMessage = interaction.options.getString('message');
  const timeStr = interaction.options.getString('time');

  let targetTime = null;
  if (timeStr) {
    targetTime = parseUTCDateTime(timeStr);
    if (isNaN(targetTime) || targetTime <= Date.now()) {
      return interaction.reply({ content: '❌ Giờ không hợp lệ hoặc đã qua. Định dạng đúng: YYYY-MM-DD HH:MM (UTC).', ephemeral: true });
    }
  }

  // Đặt trạng thái "Đang suy nghĩ" vì AI cần vài giây để viết lại văn
  await interaction.deferReply({ ephemeral: true });

  let aiMessage = '';
  try {
    const prompt = `Bạn là một trợ lý quản lý cộng đồng. Hãy viết lại đoạn thông báo sau bằng tiếng Việt sao cho thật chuyên nghiệp, lịch sự, rõ ràng và hấp dẫn để đăng lên kênh Discord. 
    Yêu cầu: Giữ nguyên các thông tin chính, link, thẻ ICAO, ngày giờ (nếu có). Trình bày ngắt dòng, gạch đầu dòng hợp lý.
    
    Nội dung gốc cần viết lại:
    ${rawMessage}`;

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.6 },
    });
    
    aiMessage = result.response.text().trim();
  } catch (err) {
    console.error("Lỗi khi Gemini viết lại thông báo:", err);
    // Nếu AI lỗi, fallback dùng luôn bản gốc
    aiMessage = rawMessage; 
  }

  const reqId = Date.now().toString();
  // Lưu tạm vào RAM chờ user bấm nút
  pendingAnnouncements.set(reqId, { 
    channelId: channel.id, 
    rawMessage: rawMessage, 
    aiMessage: aiMessage, 
    targetTime: targetTime 
  });

  const embed = new EmbedBuilder()
    .setTitle('✨ Gợi ý từ Gemini AI')
    .setDescription('Mình đã viết lại nội dung của bạn cho chuyên nghiệp hơn. Bạn muốn dùng bản nào để gửi đi?')
    .addFields(
      { name: '📝 Bản gốc của bạn', value: `\`\`\`\n${rawMessage}\n\`\`\`` },
      { name: '🤖 Bản do AI nâng cấp', value: `\`\`\`\n${aiMessage}\n\`\`\`` },
      { name: '⏰ Lịch trình', value: targetTime ? `<t:${Math.floor(targetTime/1000)}:F>` : 'Gửi ngay lập tức' }
    )
    .setColor(0x3498db);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ann_okay_${reqId}`).setLabel('✅ Gửi bản AI').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ann_orig_${reqId}`).setLabel('✅ Gửi bản gốc').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ann_reject_${reqId}`).setLabel('❌ Hủy gửi').setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ content: `**Lưu ID lịch trình nếu cần hủy:** \`${reqId}\``, embeds: [embed], components: [row] });

  await interaction.editReply({ embeds: [embed], components: [row] });
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
  try {
    const channel = await client.channels.fetch(VATSIM_CHANNEL_ID);
    // Quét 50 tin nhắn gần nhất trong kênh xem có tin nhắn cũ không
    const messages = await channel.messages.fetch({ limit: 50 });
    
    // Tự tìm tin nhắn do chính con Bot này gửi và có tiêu đề VATSIM
    const oldBotMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('VATSIM Online Update'));
    
    if (oldBotMsg) {
      // Nếu tìm thấy, lập tức lấy ID của nó để dùng, không cần đọc file JSON nữa
      vatsimMessageStore = { messageIds: [oldBotMsg.id], channelId: channel.id };
      console.log(`✅ [VATSIM] Đã tìm lại được tin nhắn cũ (ID: ${oldBotMsg.id}) bằng cách quét kênh!`);
      return;
    }
  } catch (err) {
    console.warn('⚠️ Lỗi khi quét tìm tin nhắn VATSIM cũ:', err.message);
  }

  // Nếu KHÔNG tìm thấy tin nhắn cũ nào trong kênh thì mới tạo tin nhắn mới
  try {
    const channel = await client.channels.fetch(VATSIM_CHANNEL_ID);
    const embed = new EmbedBuilder().setTitle('🌐 VATSIM Online Update').setDescription('Đang tải dữ liệu...').setTimestamp();
    const sent = await channel.send({ embeds: [embed] });
    
    vatsimMessageStore = { messageIds: [sent.id], channelId: channel.id };
    console.log('🆕 [VATSIM] Không thấy tin nhắn cũ, đã khởi tạo tin nhắn mới.');
  } catch (err) {
    console.error('❌ Không thể tạo tin nhắn VATSIM gốc:', err);
  }
}
// ===================== LOGGING: MEMBER JOIN/LEAVE =====================
client.on('guildMemberAdd', async (member) => {
  // Existing role assignment code remains...
  
  // Log member join
  const embed = createLogEmbed(
    '📥 Member Joined',
    `**User:** ${member.user.tag}\n**ID:** ${member.user.id}\n**Account created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    0x2ecc71 // Green
  );
  await sendLog(embed);
});

client.on('guildMemberRemove', async (member) => {
  const embed = createLogEmbed(
    '📤 Member Left',
    `**User:** ${getUserIdentifier(member.user)}\n**Joined server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n**Roles:** ${member.roles.cache.map(r => r.name).join(', ') || 'None'}`,
    0xe74c3c
  );
  await sendLog(embed);
});
// ===================== LOGGING: ROLE CHANGES =====================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (!oldMember || !newMember) return;

  // Chờ 1.5 giây để audit log được ghi
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    const fetchedLogs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 5 });
    // Tìm entry khớp với user và thời gian gần đây
    const roleLog = fetchedLogs.entries.find(entry =>
      entry.target.id === newMember.id &&
      Math.abs(entry.createdTimestamp - Date.now()) < 6000
    );

    if (!roleLog) return; // Không tìm thấy, bỏ qua

    const added = [];
    const removed = [];

    // Duyệt qua các changes trong audit log
    for (const change of roleLog.changes || []) {
      if (change.key === '$add') {
        // Thêm role
        if (change.new && Array.isArray(change.new)) {
          for (const item of change.new) {
            if (item.id && item.name) added.push(item);
          }
        }
      } else if (change.key === '$remove') {
        // Xóa role
        if (change.old && Array.isArray(change.old)) {
          for (const item of change.old) {
            if (item.id && item.name) removed.push(item);
          }
        }
      }
    }

    // Nếu không tìm thấy qua $add/$remove, thử cách khác: so sánh trực tiếp role IDs
    if (added.length === 0 && removed.length === 0) {
      // Fetch lại member để có dữ liệu mới nhất
      const freshOld = await newMember.guild.members.fetch(oldMember.id).catch(() => oldMember);
      const freshNew = await newMember.guild.members.fetch(newMember.id).catch(() => newMember);
      
      const oldRoleIds = new Set(freshOld.roles.cache.map(r => r.id));
      const newRoleIds = new Set(freshNew.roles.cache.map(r => r.id));
      
      for (const id of newRoleIds) {
        if (!oldRoleIds.has(id)) {
          const role = freshNew.guild.roles.cache.get(id);
          if (role) added.push({ id: role.id, name: role.name });
        }
      }
      for (const id of oldRoleIds) {
        if (!newRoleIds.has(id)) {
          const role = freshOld.guild.roles.cache.get(id);
          if (role) removed.push({ id: role.id, name: role.name });
        }
      }
    }

    if (added.length === 0 && removed.length === 0) return;

    let description = `**User:** ${getUserIdentifier(newMember.user)}\n`;
    if (added.length) {
      description += `\n**➕ Roles Added:**\n${added.map(r => `• ${r.name} (${r.id})`).join('\n')}`;
    }
    if (removed.length) {
      description += `\n\n**➖ Roles Removed:**\n${removed.map(r => `• ${r.name} (${r.id})`).join('\n')}`;
    }

    const embed = createLogEmbed('👥 Member Roles Updated', description, 0xf39c12);
    if (roleLog.executor) {
      embed.addFields({ name: '🛠️ Action by', value: getUserIdentifier(roleLog.executor), inline: false });
    }

    await sendLog(embed);
  } catch (err) {
    console.error('Error in guildMemberUpdate:', err);
  }
});
// ===================== LOGGING: MESSAGE DELETE =====================
client.on('messageDelete', async (message) => {
  try {
    if (message.partial) {
      try { await message.fetch(); } catch (e) {}
    }
    if (message.author?.bot) return;
    if (!message.guild) return;

    let content = message.content || '';
    if (content.length > 1000) content = content.slice(0, 1000) + '...';
    if (!content && message.attachments?.size > 0) content = '[Only attachments]';
    if (!content) content = '[Empty message]';

    const embed = createLogEmbed('🗑️ Message Deleted',
      `**Author:** ${message.author ? getUserIdentifier(message.author) : 'Unknown'}\n**Channel:** ${getChannelIdentifier(message.channel)}\n**Message ID:** ${message.id}\n\n**Content:**\n\`\`\`\n${content}\n\`\`\``,
      0xe67e22
    );

    if (message.attachments?.size > 0) {
      const attachments = [...message.attachments.values()].map(a => `[${a.name}](${a.url})`).join('\n');
      embed.addFields({ name: '📎 Attachments', value: attachments.substring(0, 1024), inline: false });
    }

    // Lấy audit log với timeout 15 giây
    try {
      const fetchedLogs = await message.guild.fetchAuditLogs({ type: 72, limit: 10 });
      const deleteLog = fetchedLogs.entries.find(entry =>
        entry.target.id === message.author?.id &&
        entry.extra?.channel?.id === message.channel.id &&
        Math.abs(entry.createdTimestamp - Date.now()) < 15000
      );
      if (deleteLog?.executor && deleteLog.executor.id !== client.user.id) {
        embed.addFields({ name: '🗑️ Deleted by', value: getUserIdentifier(deleteLog.executor), inline: false });
      } else {
        // Fallback: tìm bất kỳ entry nào trong channel đó (có thể target null)
        const anyLog = fetchedLogs.entries.find(entry =>
          entry.extra?.channel?.id === message.channel.id &&
          Math.abs(entry.createdTimestamp - Date.now()) < 15000
        );
        if (anyLog?.executor && anyLog.executor.id !== client.user.id) {
          embed.addFields({ name: '🗑️ Deleted by (approx)', value: getUserIdentifier(anyLog.executor), inline: false });
        }
      }
    } catch (auditErr) {
      // Không có quyền audit log
    }

    await sendLog(embed);
  } catch (err) {
    console.error('Error in messageDelete log:', err);
  }
});

// ===================== LOGGING: MESSAGE EDIT =====================
client.on('messageUpdate', async (oldMessage, newMessage) => {
  try {
    if (oldMessage.partial) await oldMessage.fetch().catch(() => {});
    if (newMessage.partial) await newMessage.fetch().catch(() => {});
    
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
  } catch (err) {}

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
  } catch (err) {}

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
    else if (thread.ownerId) embed.addFields({ name: '🛠️ Created by', value: `<@${thread.ownerId}>`, inline: false });
  } catch (err) {
    if (thread.ownerId) embed.addFields({ name: '🛠️ Created by', value: `<@${thread.ownerId}>`, inline: false });
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
  } catch (err) {}

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

// 3. Crawler chính
async function fetchATIS(icao) {
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `https://atis.guru/atis/${icao.toUpperCase()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      console.warn(`ATIS.guru fetch failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    let fullText = $('body').text().replace(/\s+/g, ' ');

    let arrival = null;
    let departure = null;
    let metar = null;

    const arrMatch = fullText.match(/Arrival ATIS\s*(.*?)(?=Departure ATIS|METAR|VATSIM|$)/i);
    if (arrMatch) {
      arrival = arrMatch[1].replace(/^\s*\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}\sUTC\s*/i, '').trim();
      fullText = fullText.replace(arrMatch[0], ''); 
    }

    const depMatch = fullText.match(/Departure ATIS\s*(.*?)(?=Arrival ATIS|METAR|VATSIM|$)/i);
    if (depMatch) {
      departure = depMatch[1].replace(/^\s*\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}\sUTC\s*/i, '').trim();
      fullText = fullText.replace(depMatch[0], '');
    }

    // Fix lỗi quét dính chữ TAF: Dừng ngay khi quét thấy chữ TAF đầu tiên
    const metarRegex = new RegExp(`\\b${icao}\\s+\\d{6}Z.*?(TAF|$)`, 'i');
    const metarMatch = fullText.match(metarRegex);
    
    if (metarMatch) {
      // Cắt bỏ chữ TAF (nếu lỡ dính vào) và sửa lại NOSIGTAF thành NOSIG
      metar = metarMatch[0].replace(/TAF$/i, '').trim();
      metar = metar.replace(/NOSIGTAF$/i, 'NOSIG');
    } else {
      // Nếu không có sẵn METAR -> Tự convert từ D-ATIS (nếu sân bay đó chỉ chạy text D-ATIS)
      const rawAtisToConvert = arrival || departure;
      if (rawAtisToConvert) {
        metar = convertAtisToMetar(rawAtisToConvert, icao.toUpperCase());
      }
    }

    return {
      arrival: arrival && arrival.length > 10 ? arrival : null,
      departure: departure && departure.length > 10 ? departure : null,
      metar: metar && metar.length > 10 ? metar : null
    };
    
  } catch (err) {
    console.error(`Error fetching ATIS from guru for ${icao}:`, err.message);
    return null;
  }
}

// ===================== COMMAND: METAR =====================
async function handleMetar(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply(); 
  
  try {
    // Chỉ sử dụng duy nhất data từ ATIS.guru
    const atisData = await fetchATIS(icao);
    
    if (!atisData) {
      return await interaction.editReply({ content: `❌ Không lấy được dữ liệu thời tiết cho sân bay ${icao}.` });
    }
    
    let replyContent = '';

    // Xử lý METAR
    if (atisData.metar) {
      replyContent += `🌤️ **METAR cho ${icao}:**\n\`\`\`${atisData.metar}\`\`\``;
    } else {
      replyContent += `🌤️ **METAR cho ${icao}:**\n\`\`\`❌ Không tìm thấy METAR.\`\`\``;
    }
    
    let hasAtis = false;

    // Xử lý Arrival ATIS (áp dụng bộ lọc xuống dòng)
    if (atisData.arrival) {
      const formattedArr = formatATISText(atisData.arrival);
      replyContent += `\n🛬 **Arrival ATIS (${icao}):**\n\`\`\`${formattedArr}\`\`\``;
      hasAtis = true;
    }
    
    if (!hasAtis) {
      replyContent += `\n⚠️ Hiện tại không có dữ liệu D-ATIS cho ${icao} (hoặc atis.guru đang cập nhật). Pilot vui lòng tự đọc METAR ở trên nhé!`;
    }
    
    await interaction.editReply({ content: replyContent });
    
  } catch (err) {
    console.error('METAR/ATIS error:', err);
    await interaction.editReply({ content: '❌ Đã có lỗi khi lấy dữ liệu METAR/ATIS. Bạn thử lại sau nhé!' });
  }
}

// ===================== ACTIVE RUNWAY CALCULATOR =====================
async function handleRunway(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  try {
    // Dùng lại hàm fetchATIS hiện có của bạn để lấy METAR mới nhất
    const atisData = await fetchATIS(icao);
    if (!atisData || !atisData.metar) {
      return await interaction.editReply({ content: `❌ Không lấy được dữ liệu METAR cho sân bay ${icao} để tính toán gió.` });
    }

    const metar = atisData.metar;
    
    // Tìm hướng gió và tốc độ gió trong METAR (VD: 25015G25KT, VRB02KT)
    const windMatch = metar.match(/(VRB|\d{3})(\d{2,3})(?:G\d{2,3})?KT/);
    if (!windMatch) {
      return await interaction.editReply({ content: `❌ Không tìm thấy thông số gió hợp lệ trong METAR của ${icao}.\n\`METAR: ${metar}\`` });
    }

    const windDirStr = windMatch[1];
    const windSpeed = parseInt(windMatch[2], 10);

    let embed = new EmbedBuilder()
      .setTitle(`🛫 Active Runway Indicator - ${icao}`)
      .setDescription(`Dựa trên METAR gần nhất:\n\`\`\`${metar}\`\`\``)
      .setColor(0x3498db)
      .setTimestamp();

    // Nếu gió đổi hướng liên tục (VRB) hoặc quá nhẹ (<3 KT)
    if (windDirStr === 'VRB' || windSpeed < 3) {
      embed.addFields({ name: '🌬️ Gió', value: 'Gió nhẹ hoặc đổi hướng liên tục (Calm/Variable).', inline: false });
      embed.addFields({ name: '✅ Đề xuất', value: 'Có thể sử dụng đường băng tùy ý hoặc theo cấu hình tiêu chuẩn của ATC/Sân bay.', inline: false });
      return await interaction.editReply({ embeds: [embed] });
    }

    const windDir = parseInt(windDirStr, 10);
    embed.addFields({ name: '🌬️ Gió hiện tại', value: `Hướng: **${windDir}°** | Tốc độ: **${windSpeed} KT**`, inline: false });

    // Database đường băng tĩnh (Bạn có thể thêm các sân bay khác tại đây)
    const airportRunways = {
      'VVTS': [{ id: '07', heading: 70 }, { id: '25', heading: 250 }],
      'VVNB': [{ id: '11', heading: 110 }, { id: '29', heading: 290 }],
      'VVDN': [{ id: '17', heading: 170 }, { id: '35', heading: 350 }],
      'VVCR': [{ id: '02', heading: 20 }, { id: '20', heading: 200 }],
      'VVPQ': [{ id: '10', heading: 100 }, { id: '28', heading: 280 }],
      'VVCI': [{ id: '04', heading: 40 }, { id: '22', heading: 220 }],
      'VRMM': [{ id: '06', heading: 60 }, { id: '36', heading: 360 }]
    };

    const runways = airportRunways[icao];
    
    if (!runways) {
      embed.addFields({ 
        name: '⚠️ Lưu ý', 
        value: `Sân bay **${icao}** chưa có dữ liệu đường băng trong hệ thống tính toán của bot. Tuy nhiên bạn có thể tự đối chiếu hướng gió **${windDir}°** với chart sân bay nhé.` 
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

      // Tính Component (Sử dụng lượng giác cơ bản)
      const angleRad = minDiff * (Math.PI / 180);
      const headwind = Math.abs(Math.round(Math.cos(angleRad) * windSpeed));
      const crosswind = Math.abs(Math.round(Math.sin(angleRad) * windSpeed));

      embed.addFields({
        name: '🎯 Đường băng thuận lợi nhất',
        value: `**Runway ${bestRunway.id}** (Lệch gió so với tâm đường băng: ${minDiff}°)`,
        inline: false
      });
      embed.addFields({
        name: '✈️ Phân tích thành phần gió',
        value: `Gió ngược (Headwind): **${headwind} KT**\nGió ngang (Crosswind): **${crosswind} KT**`,
        inline: false
      });
      embed.setFooter({ text: 'Lưu ý: Luôn tuân theo huấn lệnh của ATC (nếu có) do ATC có thể áp dụng quy trình ưu tiên đường băng (Preferential Runway).' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Runway calc error:', error);
    await interaction.editReply({ content: '❌ Có lỗi xảy ra khi tính toán đường băng.' });
  }
}

// ===================== TAF DECODER (CHECKWX API) =====================
async function handleTaf(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  await interaction.deferReply();

  if (!CHECKWX_API_KEY) {
    return interaction.editReply({ content: '❌ Thiếu cấu hình CHECKWX_API_KEY trong biến môi trường. Admin cần kiểm tra lại!' });
  }

  try {
    const fetch = (await import('node-fetch')).default;
    // Gọi API của CheckWX để lấy TAF đã được Decode sẵn
    const response = await fetch(`https://api.checkwx.com/taf/${icao}/decoded`, {
      headers: { 'X-API-Key': CHECKWX_API_KEY }
    });

    if (!response.ok) {
      return await interaction.editReply({ content: `❌ Lỗi khi lấy TAF từ server (Mã lỗi: ${response.status}).` });
    }

    const data = await response.json();

    if (!data || data.results === 0 || !data.data || data.data.length === 0) {
      return await interaction.editReply({ content: `❌ Không tìm thấy dữ liệu TAF cho sân bay **${icao}**.` });
    }

    const tafData = data.data[0];
    const embed = new EmbedBuilder()
      .setTitle(`🌦️ TAF Decoder - ${icao}`)
      .setDescription(`**Nguyên gốc (Raw TAF):**\n\`\`\`${tafData.raw_text}\`\`\``)
      .setColor(0xf39c12)
      .setTimestamp()
      .setFooter({ text: 'Powered by CheckWX API' });

    // Hiển thị các khối dự báo (Tối đa hiển thị 4 khối để tránh bị quá dài trên Discord)
    if (tafData.forecast && tafData.forecast.length > 0) {
      const MAX_FORECASTS = 4;
      
      tafData.forecast.slice(0, MAX_FORECASTS).forEach((fcst, index) => {
        // [FIXED] Sử dụng Optional Chaining (?.) để tránh crash bot khi API trả thiếu timestamp
        const fromTime = fcst.timestamp?.from || 'Không rõ';
        const toTime = fcst.timestamp?.to || 'Không rõ';
        let timeStr = `Từ **${fromTime}** đến **${toTime}**`;
        
        let details = [];

        // Hướng gió và tốc độ
        if (fcst.wind) {
          let windStr = `Gió: ${fcst.wind.degrees || 'VRB'}° ở ${fcst.wind.speed_kts || 0} KT`;
          if (fcst.wind.gust_kts) windStr += ` (Giật ${fcst.wind.gust_kts} KT)`;
          details.push(windStr);
        }
        
        // Tầm nhìn
        if (fcst.visibility?.meters) {
          details.push(`Tầm nhìn: ${fcst.visibility.meters}m`);
        }
        
        // Thời tiết hiện tại (Mưa, dông, sương mù...)
        if (fcst.conditions && fcst.conditions.length > 0) {
          details.push(`Thời tiết: ${fcst.conditions.map(c => c.text).join(', ')}`);
        }
        
        // Mây
        if (fcst.clouds && fcst.clouds.length > 0) {
          details.push(`Mây: ${fcst.clouds.map(c => `${c.text} ở ${c.base_feet_agl || 'không rõ'} ft`).join(', ')}`);
        }

        // Tên khối thay đổi (BECMG, TEMPO, FM, hoặc Gốc)
        let indicatorName = fcst.change?.indicator || 'Dự báo gốc';

        embed.addFields({
          name: `🕒 Giai đoạn ${index + 1} (${indicatorName})`,
          value: `${timeStr}\n${details.length > 0 ? details.join('\n') : '*Không có hiện tượng đặc biệt*'}`,
          inline: false
        });
      });

      if (tafData.forecast.length > MAX_FORECASTS) {
        embed.addFields({
          name: '...',
          value: `*Còn ${tafData.forecast.length - MAX_FORECASTS} giai đoạn thay đổi nữa không được hiển thị để tránh trôi chat.*`,
          inline: false
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('TAF fetch error:', error);
    await interaction.editReply({ content: '❌ Đã có lỗi xảy ra khi gọi CheckWX API để giải mã TAF.' });
  }
}

// ===================== REACTION ROLES =====================
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  // Kéo tin nhắn về nếu nó là dạng partial (chưa có trong cache)
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Không thể fetch message reaction:', error);
      return;
    }
  }

  // So sánh ID tin nhắn với ID đã lưu trong JSON
  if (reaction.emoji.name === '🤖' && reaction.message.id === reactionRoleData.atcNotiMsgId) {
    try {
      const member = await reaction.message.guild.members.fetch(user.id);
      if (member) {
        await member.roles.add(ATC_NOTI_ROLE_ID);
        console.log(`Đã cấp role BOT_Notification cho ${user.tag}`);
      }
    } catch (err) {
      console.error('Lỗi khi cấp role BOT_Notification:', err);
    }
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  // Kéo tin nhắn về nếu nó là dạng partial
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Không thể fetch message reaction:', error);
      return;
    }
  }

  // So sánh ID tin nhắn với ID đã lưu trong JSON
  if (reaction.emoji.name === '🤖' && reaction.message.id === reactionRoleData.atcNotiMsgId) {
    try {
      const member = await reaction.message.guild.members.fetch(user.id);
      if (member) {
        await member.roles.remove(ATC_NOTI_ROLE_ID);
        console.log(`Đã gỡ role ATC_Notification khỏi ${user.tag}`);
      }
    } catch (err) {
      console.error('Lỗi khi xóa role ATC_Notification:', err);
    }
  }
});

// ===================== VATSIM STATS & ID CARD FUNCTIONS =====================

/**
 * Helper: Lấy dữ liệu VATSIM Stats qua API (Kết hợp 2 API)
 */
async function fetchVatsimStatsById(cid) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    // 1. Lấy thông tin cơ bản (Rating, Ngày tham gia) từ public API
    const infoUrl = `https://api.vatsim.net/api/ratings/${cid}/`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) return null; // CID không tồn tại
    const infoData = await infoRes.json();

    // 2. Lấy thống kê giờ bay (Pilot hours, ATC hours) từ Stats API
    const statsUrl = `https://api.vatsim.net/v2/members/${cid}/stats`;
    const statsRes = await fetch(statsUrl);
    let pilotHours = 0;
    let atcHours = 0; 
    
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      pilotHours = statsData.pilot || 0; 
      atcHours = statsData.atc || 0;     
    }

    // 3. XỬ LÝ TÊN (Tránh hiển thị VATSIM MEMBER)
    let fullName = '';
    
    // Thử lấy từ API api/ratings trước
    if (infoData.name_first && infoData.name_last) {
        fullName = `${infoData.name_first} ${infoData.name_last}`.trim();
    }
    
    // Nếu trống (do privacy), thử "vớt" bằng API V2
    if (!fullName) {
        try {
            const v2Res = await fetch(`https://api.vatsim.net/v2/members/${cid}`);
            if (v2Res.ok) {
                const v2Data = await v2Res.json();
                if (v2Data.name) fullName = v2Data.name.trim();
            }
        } catch (e) {
            // Bỏ qua nếu lỗi
        }
    }

    // Fallback cuối cùng nếu người dùng bảo mật quá kỹ
    if (!fullName || fullName.toUpperCase() === 'VATSIM MEMBER') {
        fullName = 'Thành Viên Ẩn Danh'; // Hoặc 'Private User' tùy bạn thích
    }

    // Gộp dữ liệu trả về cho Bot xử lý
    return {
      id: infoData.id,
      name: fullName, // Trả về 1 chuỗi name chung cho gọn
      rating: infoData.rating,
      pilot_hours: pilotHours, 
      atc_hours: atcHours,       
      reg_date: infoData.reg_date
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
    return interaction.editReply(`❌ Không tìm thấy dữ liệu trên VATSIM cho CID **${cid}**. (Vui lòng kiểm tra lại ID hoặc API VATSIM đang lỗi)`);
  }

  // Tra cứu Rating nói
  // Chuẩn của VATSIM API
  const vatsimRatingsSpoken = {
    0: 'Susp', 1: 'OBS', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'C1', 
    6: 'C2', 7: 'C3', 8: 'I1', 9: 'I2', 10: 'I3', 11: 'SUP', 12: 'ADM'
  };
  const ratingStr = vatsimRatingsSpoken[stats.rating] || `R${stats.rating}`;

  // Khởi tạo các trường thông tin cơ bản
  const embedFields = [
    { name: '🎖️ ATC Rating', value: `**${ratingStr}**`, inline: true },
    { name: '✈️ Pilot Hours', value: `**${Math.round(stats.pilot_hours || 0)}h**`, inline: true }
  ];

  // Nếu rating lớn hơn 1 (nghĩa là có bằng ATC thật sự từ S1 trở lên) hoặc có giờ ATC thì hiển thị thêm cột ATC Hours
  if (stats.rating > 1 || stats.atc_hours > 0) {
    embedFields.push({ name: '📡 ATC Hours', value: `**${Math.round(stats.atc_hours || 0)}h**`, inline: true });
  }

  // Thêm ngày tham gia vào cuối
  embedFields.push({ name: '📅 Tham gia', value: `<t:${Math.floor(new Date(stats.reg_date).getTime() / 1000)}:R>`, inline: true });

  // Update lại chỗ này: Dùng stats.name thay vì stats.name_first / stats.name_last
  const embed = new EmbedBuilder()
    .setTitle(`📊 Thống kê VATSIM: ${stats.name} (${stats.id})`)
    .setColor(0x3498db)
    .addFields(embedFields)
    .setTimestamp();

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
      return await interaction.editReply({ content: `❌ Hiện tại không có sự kiện nào sắp diễn ra tại sân bay **${icao}**.` });
    }

    const embeds = [];
    // Cắt lấy 5 sự kiện gần nhất để tin nhắn không bị quá dài
    const topEvents = airportEvents.slice(0, 5); 

    // Tách mỗi sự kiện thành 1 Embed riêng biệt để chèn được ảnh lớn (banner)
    topEvents.forEach((ev, index) => {
      const startTime = new Date(ev.start_time);
      const endTime = new Date(ev.end_time);
      
      const embed = new EmbedBuilder()
        .setTitle(`📌 ${ev.name}`)
        .setColor(0x9b59b6)
        .addFields({
          name: '⏰ Thời gian',
          value: `**Bắt đầu:** <t:${Math.floor(startTime.getTime() / 1000)}:F>\n**Kết thúc:** <t:${Math.floor(endTime.getTime() / 1000)}:F>`,
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
          name: `📅 Các sự kiện VATSIM tại ${icao}`, 
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
        content: `❌ Hiện tại hệ thống chưa có gợi ý route cho chặng bay **${dep} ➔ ${arr}**.\nBạn có thể tự tra cứu thêm trên SimBrief hoặc Chart nhé!` 
      });
    }

    // ================= BẮT ĐẦU CHỈNH SỬA GIAO DIỆN =================
    const embed = new EmbedBuilder()
      .setColor(0x3B3F45) // Đổi màu sắc cho giống viền nền của hình ảnh (tùy chọn)
      .setAuthor({ name: `🛰️ Route Info - ${dep} > ${arr}` }) // Thay cho title để format đẹp như hình
      .addFields(
        { name: '🛫 Departure', value: dep, inline: true },
        { name: '🛬 Arrival', value: arr, inline: true }
      );

    // Xử lý chèn Route vào code block
    if (Array.isArray(routesList)) {
      routesList.forEach((rt, index) => {
        embed.addFields({
          name: `🗺️ Flight Route${routesList.length > 1 ? ` (Phương án ${index + 1})` : ''}`,
          value: `\`\`\`\n${rt}\n\`\`\``,
          inline: false
        });
      });
    } else {
      embed.addFields({
        name: '🗺️ Flight Route',
        value: `\`\`\`\n${routesList}\n\`\`\``,
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
        .setLabel('Import to SimBrief')
        .setStyle(ButtonStyle.Link)
        .setURL(simbriefUrl)
        .setEmoji('📝'),
      new ButtonBuilder()
        .setLabel('Import to VATSIM')
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

// ===================== COMMAND: EDIT & CANCEL ANNOUNCEMENT =====================
async function handleEditAnnoun(interaction) {
  const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
  const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
  if (!hasDev && !hasAdmin && interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: '❌ Bạn không có quyền.', ephemeral: true });
  }

  const id = interaction.options.getString('id');
  const newContent = interaction.options.getString('content');
  const channelOpt = interaction.options.getChannel('channel') || interaction.channel;

  await interaction.deferReply({ ephemeral: true });

  // 1. Tìm xem có nằm trong danh sách đang chờ gửi (hẹn giờ) không
  const scheduledIndex = scheduledAnnouncements.findIndex(a => a.id === id);
  if (scheduledIndex !== -1) {
    scheduledAnnouncements[scheduledIndex].content = newContent;
    fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(scheduledAnnouncements, null, 2));
    return interaction.editReply({ content: '✅ Đã cập nhật nội dung cho thông báo đã lên lịch!' });
  }

  // 2. Nếu không, cố gắng tìm và sửa tin nhắn đã gửi ở trong kênh
  try {
    const message = await channelOpt.messages.fetch(id);
    if (message) {
      await message.edit({ content: newContent });
      return interaction.editReply({ content: '✅ Đã chỉnh sửa tin nhắn thành công!' });
    }
  } catch (err) {
    return interaction.editReply({ content: `❌ Không tìm thấy tin nhắn với ID \`${id}\` trong kênh <#${channelOpt.id}>, hoặc nó không phải tin nhắn hẹn giờ. Nếu đây là tin nhắn đã gửi ở kênh khác, vui lòng chọn đúng mục "channel" trong lệnh.` });
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
    fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(scheduledAnnouncements, null, 2));
    return interaction.reply({ content: `✅ Đã hủy lịch trình gửi thông báo (ID: \`${id}\`)!`, ephemeral: true });
  } else {
    return interaction.reply({ content: `❌ Không tìm thấy lịch trình nào với ID: \`${id}\` (Có thể nó đã được gửi đi rồi)`, ephemeral: true });
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
    await interaction.editReply({ content: `❌ Đã xảy ra lỗi khi tạo bảng xếp hạng VATSEA: ${error.message}` });
  }
}

// ===================== LOGIN =====================
client.login(TOKEN);

// === WEB SERVER & PING CHÉO ===
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    // Mỗi khi Bot 2 ping vào đây, nó sẽ trả lời để báo "Tao còn sống"
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot 1 is alive!');
}).listen(port, () => {
    console.log(`HTTP server running on port ${port}`);
});

// Code đi Ping Bot 2
const BOT2_URL = process.env.BOT2_URL; // Link Render của Bot 2

if (BOT2_URL) {
    setInterval(async () => {
        try {
            const response = await fetch(BOT2_URL);
            console.log(`[Ping Chéo] Đã chọc Bot 2, Status: ${response.status}`);
        } catch (error) {
            console.error(`[Ping Chéo] Lỗi khi chọc Bot 2:`, error.message);
        }
    }, 14 * 60 * 1000); // 14 phút ping 1 lần (Render ngủ sau 15p)
} else {
    console.log("⚠️ Chưa cài BOT2_URL, tính năng Ping chéo đang tắt.");
}
