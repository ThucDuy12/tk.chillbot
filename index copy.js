require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const { Worker } = require('worker_threads');
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
const GUILD_ID = process.env.GUILD_ID || '1365693391668777051';
const OWNER_ID = process.env.OWNER_ID;
const CHECKWX_API_KEY = process.env.CHECKWX_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Thêm biến môi trường cho tính năng sell
const SELL_ADMIN_CHANNEL_ID = process.env.SELL_ADMIN_CHANNEL_ID || '1440000000000000003';
const SELL_PUBLIC_CHANNEL_ID = process.env.SELL_PUBLIC_CHANNEL_ID || '1440000000000000004';

// Summarize caps
const SUMMARY_MAX_MESSAGES = parseInt(process.env.SUMMARY_MAX_MESSAGES || '600', 10);
const SUMMARY_MAX_TRANSCRIPT_CHARS = parseInt(process.env.SUMMARY_MAX_TRANSCRIPT_CHARS || '60000', 10);

// Chat caps
const GEMINI_MAX_HISTORY_ITEMS = parseInt(process.env.GEMINI_MAX_HISTORY_ITEMS || '20', 10);
const GEMINI_MAX_USER_TEXT_CHARS = parseInt(process.env.GEMINI_MAX_USER_TEXT_CHARS || '1800', 10);

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
if (!SELL_ADMIN_CHANNEL_ID) {
  console.error('Missing SELL_ADMIN_CHANNEL_ID in environment.');
}
if (!SELL_PUBLIC_CHANNEL_ID) {
  console.error('Missing SELL_PUBLIC_CHANNEL_ID in environment.');
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

// ===================== FILES =====================
const ROLES_FILE = path.join(__dirname, 'roles.json');
const BANS_FILE = path.join(__dirname, 'bans.json');
const VATSIM_MSG_FILE = path.join(__dirname, 'vatsim_message.json');
const PROFILES_FILE = path.join(__dirname, 'profiles.json');
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
const LEADERBOARD_MSG_FILE = path.join(__dirname, 'leaderboard_message.json');
const PILOT_LEADERBOARD_FILE = path.join(__dirname, 'pilot_leaderboard.json');
const PILOT_LEADERBOARD_MSG_FILE = path.join(__dirname, 'pilot_leaderboard_message.json');
// Thêm file cho tính năng sell
const SELL_ORDERS_FILE = path.join(__dirname, 'sell_orders.json');

// ===================== DATA =====================
let roles = {
  basicMemberRoleId: '1375110178868826142',
  verifiedMemberRoleId: '1430517630116036669',
  devRoleId: '1366433221687906304',
  adminRoleId: '1365960976016347136',
  banRoleId: '1408787259322273913',
  pendingRoleId: '1420491131980091484',
  eventParticipantRoleId: '1460437588048478269', // Thêm role cho event participants
  otherRoles: [
    { name: 'MSFS 2020/2024', id: '1365961239770959872' },
    { name: 'FSX/P3D', id: '1365961302887108669' },
    { name: 'X-Plane 11/12', id: '1365961407551766538' },
    { name: 'Pending', id: '1420491131980091484' },
  ],
};

if (fs.existsSync(ROLES_FILE)) roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));

let bans = fs.existsSync(BANS_FILE) ? JSON.parse(fs.readFileSync(BANS_FILE, 'utf8')) : { users: {} };
let vatsimMessageStore = fs.existsSync(VATSIM_MSG_FILE) ? JSON.parse(fs.readFileSync(VATSIM_MSG_FILE, 'utf8')) : {};
let profiles = fs.existsSync(PROFILES_FILE) ? JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')) : {};
let leaderboardData = fs.existsSync(LEADERBOARD_FILE) ? JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8')) : {};
let leaderboardMessageStore = fs.existsSync(LEADERBOARD_MSG_FILE) ? JSON.parse(fs.readFileSync(LEADERBOARD_MSG_FILE, 'utf8')) : {};
let pilotLeaderboardData = fs.existsSync(PILOT_LEADERBOARD_FILE) ? JSON.parse(fs.readFileSync(PILOT_LEADERBOARD_FILE, 'utf8')) : {};
let pilotLeaderboardMessageStore = fs.existsSync(PILOT_LEADERBOARD_MSG_FILE) ? JSON.parse(fs.readFileSync(PILOT_LEADERBOARD_MSG_FILE, 'utf8')) : {};

// Thêm dữ liệu cho tính năng sell
let sellOrders = fs.existsSync(SELL_ORDERS_FILE) ? JSON.parse(fs.readFileSync(SELL_ORDERS_FILE, 'utf8')) : {};

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
let lastLeaderboardUpdate = Date.now();

// Store online pilots for leaderboard tracking
let onlinePilots = new Map();
let lastPilotLeaderboardUpdate = Date.now();

// Store user event participation (userId -> eventIds)
const userEventParticipation = new Map();

// Thêm Map cho tính năng sell
const sellingSessions = new Map(); // Lưu session đang bán hàng của user
const sellImageMessages = new Map(); // Lưu message ID của ảnh đã gửi để xóa sau

// ===================== VATSIM Worker =====================
const vatsimWorker = new Worker(path.join(__dirname, 'vatsimWorker.js'));

vatsimWorker.on('message', async (data) => {
  if (data.error) return console.error('VATSIM worker error:', data.error);
  try {
    // Update VATSIM embed
    const embed = new EmbedBuilder().setTitle('VATSIM Online Update').setTimestamp();
    const controllers = data.controllers || [];
    const pilots = data.pilots || [];
    const maxItems = 20;
    const ctrlText = controllers.length
      ? controllers.slice(0, maxItems).map((c) => `${c.callsign} (${c.name || 'unknown'})`).join('\n')
      : 'None';
    const pilotsText = pilots.length
      ? pilots
          .slice(0, maxItems)
          .map((p) => `${p.callsign} ${p.flight_plan ? `${p.flight_plan.departure}->${p.flight_plan.arrival}` : ''}`)
          .join('\n')
      : 'None';

    embed.addFields(
      { name: `ATC Online (${controllers.length})`, value: ctrlText, inline: false },
      { name: `Pilots (${pilots.length})`, value: pilotsText, inline: false }
    );

    // Edit stored message if exists
    if (vatsimMessageStore.messageId && vatsimMessageStore.channelId) {
      try {
        const channel = await client.channels.fetch(vatsimMessageStore.channelId);
        const msg = await channel.messages.fetch(vatsimMessageStore.messageId);
        if (msg) {
          await msg.edit({ embeds: [embed] });
        }
      } catch (err) {
        console.warn('Could not fetch/edit stored VATSIM message:', err.message || err);
      }
    }

    // Track VVTS, VVHM, VCL_CTR, VVTS_F_APP controllers for leaderboard
    trackControllers(controllers);
   
    // Track pilots in VCL region for leaderboard
    trackPilots(pilots);
   
  } catch (err) {
    console.error('Error processing VATSIM data:', err);
  }
});

vatsimWorker.on('error', (err) => console.error('VATSIM worker thread error:', err));

// ===================== SELL FUNCTIONS =====================

// Hàm lưu dữ liệu sell orders
function saveSellOrders() {
  try {
    fs.writeFileSync(SELL_ORDERS_FILE, JSON.stringify(sellOrders, null, 2));
    console.log('Sell orders saved successfully');
  } catch (err) {
    console.error('Error saving sell orders:', err);
  }
}

// Hàm tạo order ID
function generateOrderId() {
  return `SELL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Hàm xử lý lệnh /sell
async function handleSellCommand(interaction) {
  try {
    // Tạo modal cho thông tin sản phẩm
    const modal = new ModalBuilder()
      .setCustomId('sell_modal')
      .setTitle('Đăng bán sản phẩm');
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('product_name')
          .setLabel('Tên sản phẩm')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('product_description')
          .setLabel('Mô tả sản phẩm')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('seller_name')
          .setLabel('Tên người bán')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('seller_phone')
          .setLabel('Số điện thoại')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(15)
          .setPlaceholder('VD: 0912345678')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('product_price')
          .setLabel('Giá sản phẩm')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setPlaceholder('VD: 1.000.000 VND hoặc Thương lượng')
      )
    );
    
    await interaction.showModal(modal);
    
  } catch (err) {
    console.error('Error handling sell command:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi tạo form đăng bán. Vui lòng thử lại sau.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý modal submit cho sell
async function handleSellModalSubmit(interaction) {
  try {
    const productName = interaction.fields.getTextInputValue('product_name');
    const productDescription = interaction.fields.getTextInputValue('product_description');
    const sellerName = interaction.fields.getTextInputValue('seller_name');
    const sellerPhone = interaction.fields.getTextInputValue('seller_phone');
    const productPrice = interaction.fields.getTextInputValue('product_price');
    
    // Tạo session bán hàng
    const orderId = generateOrderId();
    sellingSessions.set(interaction.user.id, {
      orderId,
      productName,
      productDescription,
      sellerName,
      sellerPhone,
      productPrice,
      images: [],
      createdAt: Date.now(),
      channelId: interaction.channelId
    });
    
    // Gửi hướng dẫn upload ảnh
    const embed = new EmbedBuilder()
      .setTitle('📸 Upload Ảnh Sản Phẩm')
      .setDescription('Vui lòng gửi hình ảnh sản phẩm của bạn trong tin nhắn này.\n\n**Lưu ý:**')
      .addFields(
        { name: '📌 Hướng dẫn', value: '• Gửi từng ảnh hoặc nhiều ảnh cùng lúc\n• Có thể gửi tối đa 10 ảnh\n• Sau khi gửi xong, nhấn nút **"Đã gửi xong ảnh"**' },
        { name: '⚠️ Lưu ý', value: 'Các ảnh bạn gửi sẽ tự động bị xóa sau khi hoàn tất để giữ gìn sự sạch sẽ cho kênh chat.' }
      )
      .setColor(0x00AE86)
      .setFooter({ text: 'Bạn có 5 phút để hoàn thành việc upload ảnh' })
      .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sell_done_images_${orderId}`)
        .setLabel('✅ Đã gửi xong ảnh')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sell_cancel_${orderId}`)
        .setLabel('❌ Hủy đăng bán')
        .setStyle(ButtonStyle.Danger)
    );
    
    await interaction.reply({ 
      embeds: [embed], 
      components: [row],
      ephemeral: true 
    });
    
    // Đặt timeout cho session (5 phút)
    setTimeout(() => {
      if (sellingSessions.has(interaction.user.id)) {
        sellingSessions.delete(interaction.user.id);
        interaction.followUp({ 
          content: '⏰ Phiên đăng bán của bạn đã hết hạn (5 phút). Vui lòng thực hiện lại lệnh `/sell`.', 
          ephemeral: true 
        });
      }
    }, 5 * 60 * 1000);
    
  } catch (err) {
    console.error('Error handling sell modal submit:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi xử lý thông tin sản phẩm.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý khi user gửi ảnh
async function handleSellImageUpload(message) {
  try {
    if (!sellingSessions.has(message.author.id)) return;
    
    const session = sellingSessions.get(message.author.id);
    
    // Kiểm tra xem có phải kênh đang thực hiện sell không
    if (session.channelId !== message.channelId) return;
    
    // Kiểm tra xem tin nhắn có chứa ảnh không
    if (message.attachments.size === 0) return;
    
    // Lưu message ID để xóa sau
    if (!sellImageMessages.has(session.orderId)) {
      sellImageMessages.set(session.orderId, []);
    }
    sellImageMessages.get(session.orderId).push(message.id);
    
    // Lấy URL của các ảnh
    const attachments = Array.from(message.attachments.values());
    const imageUrls = attachments
      .filter(att => att.contentType && att.contentType.startsWith('image/'))
      .map(att => att.url);
    
    if (imageUrls.length === 0) return;
    
    // Thêm ảnh vào session (giới hạn 10 ảnh)
    const remainingSlots = 10 - session.images.length;
    if (remainingSlots > 0) {
      session.images.push(...imageUrls.slice(0, remainingSlots));
      sellingSessions.set(message.author.id, session);
      
      // Gửi xác nhận đã nhận ảnh
      await message.react('✅').catch(() => {});
      
      // Gửi thông báo số ảnh đã upload
      if (session.images.length >= 10) {
        const warning = await message.reply({
          content: `📸 Đã upload ${session.images.length}/10 ảnh. Đã đạt giới hạn tối đa!`,
          ephemeral: false
        });
        setTimeout(() => warning.delete().catch(() => {}), 3000);
      } else {
        const info = await message.reply({
          content: `📸 Đã nhận ${attachments.length} ảnh. Tổng cộng: ${session.images.length}/10 ảnh`,
          ephemeral: false
        });
        setTimeout(() => info.delete().catch(() => {}), 3000);
      }
    }
    
    // Xóa tin nhắn ảnh sau 2 giây để giữ sạch kênh chat
    setTimeout(async () => {
      try {
        await message.delete();
      } catch (err) {
        console.log('Không thể xóa tin nhắn ảnh:', err.message);
      }
    }, 2000);
    
  } catch (err) {
    console.error('Error handling sell image upload:', err);
  }
}

// Hàm xử lý khi user hoàn thành upload ảnh
async function handleSellDoneImages(interaction) {
  try {
    const orderId = interaction.customId.split('_')[3];
    const userId = interaction.user.id;
    
    if (!sellingSessions.has(userId)) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy phiên đăng bán của bạn. Vui lòng thực hiện lại lệnh `/sell`.', 
        ephemeral: true 
      });
    }
    
    const session = sellingSessions.get(userId);
    if (session.orderId !== orderId) {
      return await interaction.reply({ 
        content: '❌ Order ID không khớp. Vui lòng thực hiện lại.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra xem có ảnh nào không
    if (session.images.length === 0) {
      return await interaction.update({ 
        content: '⚠️ Bạn chưa upload ảnh nào cho sản phẩm. Vui lòng upload ít nhất 1 ảnh.', 
        components: [],
        embeds: []
      });
    }
    
    // Lưu order vào database
    sellOrders[orderId] = {
      ...session,
      userId,
      status: 'pending', // pending, approved, rejected
      adminMessageId: null,
      publicMessageId: null,
      interestedUsers: [],
      phoneSharedWith: []
    };
    
    saveSellOrders();
    
    // Gửi order đến kênh admin để duyệt
    await sendOrderToAdmin(orderId, session);
    
    // Xóa session
    sellingSessions.delete(userId);
    
    // Xóa các tin nhắn ảnh đã gửi
    if (sellImageMessages.has(orderId)) {
      const messageIds = sellImageMessages.get(orderId);
      const channel = await client.channels.fetch(session.channelId);
      
      for (const messageId of messageIds) {
        try {
          const msg = await channel.messages.fetch(messageId);
          await msg.delete();
        } catch (err) {
          // Bỏ qua nếu không xóa được
        }
      }
      sellImageMessages.delete(orderId);
    }
    
    await interaction.update({ 
      content: '✅ Đơn đăng bán của bạn đã được gửi đến quản trị viên để xét duyệt. Bạn sẽ được thông báo khi đơn được duyệt.',
      components: [],
      embeds: []
    });
    
  } catch (err) {
    console.error('Error handling sell done images:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi xử lý đơn đăng bán.', 
      ephemeral: true 
    });
  }
}

// Hàm gửi order đến kênh admin
async function sendOrderToAdmin(orderId, orderData) {
  try {
    const adminChannel = await client.channels.fetch(SELL_ADMIN_CHANNEL_ID);
    if (!adminChannel) {
      console.error('Admin channel not found');
      return;
    }
    
    const date = new Date(orderData.createdAt);
    const formattedDate = date.toLocaleString('vi-VN', { 
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Tạo embed cho admin
    const embed = new EmbedBuilder()
      .setTitle('🛒 ĐƠN ĐĂNG BÁN MỚI - CHỜ DUYỆT')
      .setColor(0xFFA500)
      .addFields(
        { name: '📦 Tên sản phẩm', value: orderData.productName, inline: false },
        { name: '📝 Mô tả', value: orderData.productDescription.length > 500 ? orderData.productDescription.substring(0, 500) + '...' : orderData.productDescription, inline: false },
        { name: '💰 Giá', value: orderData.productPrice, inline: true },
        { name: '👤 Người bán', value: orderData.sellerName, inline: true },
        { name: '📞 SĐT (Bảo mật)', value: '`[Đã được bảo mật]`', inline: true },
        { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
        { name: '👤 User', value: `<@${orderData.userId}>`, inline: true },
        { name: '📅 Ngày đăng', value: formattedDate, inline: true },
        { name: '📸 Số ảnh', value: `${orderData.images.length} ảnh`, inline: true }
      )
      .setFooter({ text: `User ID: ${orderData.userId}` })
      .setTimestamp();
    
    // Thêm ảnh đầu tiên làm thumbnail nếu có
    if (orderData.images.length > 0) {
      embed.setThumbnail(orderData.images[0]);
    }
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sell_admin_approve_${orderId}`)
        .setLabel('✅ Duyệt đơn')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sell_admin_reject_${orderId}`)
        .setLabel('❌ Từ chối')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`sell_admin_view_images_${orderId}`)
        .setLabel('🖼️ Xem ảnh')
        .setStyle(ButtonStyle.Primary)
    );
    
    const message = await adminChannel.send({ 
      embeds: [embed], 
      components: [row] 
    });
    
    // Lưu message ID vào order
    sellOrders[orderId].adminMessageId = message.id;
    saveSellOrders();
    
    console.log(`Order ${orderId} sent to admin channel`);
    
  } catch (err) {
    console.error('Error sending order to admin:', err);
  }
}

// Hàm xử lý khi admin duyệt đơn
async function handleSellAdminApprove(interaction) {
  try {
    const orderId = interaction.customId.split('_')[3];
    
    if (!sellOrders[orderId]) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy đơn đăng bán này.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra quyền admin
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
    const isOwner = interaction.user.id === OWNER_ID;
    
    if (!hasDev && !hasAdmin && !isOwner) {
      return await interaction.reply({ 
        content: '❌ Bạn không có quyền duyệt đơn đăng bán.', 
        ephemeral: true 
      });
    }
    
    // Cập nhật trạng thái
    sellOrders[orderId].status = 'approved';
    sellOrders[orderId].approvedBy = interaction.user.id;
    sellOrders[orderId].approvedAt = Date.now();
    saveSellOrders();
    
    // Gửi thông báo đến người bán
    try {
      const user = await client.users.fetch(sellOrders[orderId].userId);
      await user.send(`🎉 Đơn đăng bán **"${sellOrders[orderId].productName}"** của bạn đã được duyệt và đăng lên kênh bán hàng!`);
    } catch (err) {
      console.log('Không thể gửi DM cho người bán:', err.message);
    }
    
    // Đăng lên kênh public
    await postOrderToPublic(orderId);
    
    // Cập nhật message admin
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x00FF00)
      .setTitle('✅ ĐÃ DUYỆT - ĐƠN ĐĂNG BÁN')
      .addFields(
        { name: '👤 Đã duyệt bởi', value: `<@${interaction.user.id}>`, inline: true },
        { name: '⏰ Thời gian duyệt', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
      );
    
    await interaction.message.edit({ 
      embeds: [embed], 
      components: [] 
    });
    
    await interaction.reply({ 
      content: `✅ Đã duyệt đơn đăng bán ${orderId} và đăng lên kênh public.`, 
      ephemeral: true 
    });
    
  } catch (err) {
    console.error('Error handling sell admin approve:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi duyệt đơn.', 
      ephemeral: true 
    });
  }
}

// Hàm đăng order lên kênh public
async function postOrderToPublic(orderId) {
  try {
    const order = sellOrders[orderId];
    const publicChannel = await client.channels.fetch(SELL_PUBLIC_CHANNEL_ID);
    
    if (!publicChannel) {
      console.error('Public channel not found');
      return;
    }
    
    const date = new Date(order.createdAt);
    const formattedDate = date.toLocaleString('vi-VN', { 
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Tạo embed cho public
    const embed = new EmbedBuilder()
      .setTitle(`🛒 ${order.productName}`)
      .setColor(0x00AE86)
      .addFields(
        { name: '📝 Mô tả', value: order.productDescription.length > 800 ? order.productDescription.substring(0, 800) + '...' : order.productDescription, inline: false },
        { name: '💰 Giá', value: order.productPrice, inline: true },
        { name: '👤 Người bán', value: order.sellerName, inline: true },
        { name: '📞 Số điện thoại', value: '`[Nhấn "Quan tâm" để liên hệ]`\n*Số điện thoại được bảo mật, chỉ chia sẻ khi người bán đồng ý*', inline: false },
        { name: '📅 Ngày đăng', value: formattedDate, inline: true },
        { name: '🖼️ Hình ảnh', value: `${order.images.length} ảnh`, inline: true }
      )
      .setFooter({ text: `Mã đơn: ${orderId}` })
      .setTimestamp();
    
    // Thêm ảnh đầu tiên
    if (order.images.length > 0) {
      embed.setImage(order.images[0]);
    }
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sell_public_interest_${orderId}`)
        .setLabel('🤝 Quan tâm')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🤝'),
      new ButtonBuilder()
        .setCustomId(`sell_public_view_images_${orderId}`)
        .setLabel(`🖼️ Xem ảnh (${order.images.length})`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🖼️')
    );
    
    const message = await publicChannel.send({ 
      embeds: [embed], 
      components: [row] 
    });
    
    // Lưu message ID vào order
    sellOrders[orderId].publicMessageId = message.id;
    saveSellOrders();
    
    console.log(`Order ${orderId} posted to public channel`);
    
  } catch (err) {
    console.error('Error posting order to public:', err);
  }
}

// Hàm xử lý khi admin từ chối đơn
async function handleSellAdminReject(interaction) {
  try {
    const orderId = interaction.customId.split('_')[3];
    
    if (!sellOrders[orderId]) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy đơn đăng bán này.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra quyền admin
    const hasDev = interaction.member.roles.cache.has(roles.devRoleId);
    const hasAdmin = interaction.member.roles.cache.has(roles.adminRoleId);
    const isOwner = interaction.user.id === OWNER_ID;
    
    if (!hasDev && !hasAdmin && !isOwner) {
      return await interaction.reply({ 
        content: '❌ Bạn không có quyền từ chối đơn đăng bán.', 
        ephemeral: true 
      });
    }
    
    // Hiển thị modal để nhập lý do từ chối
    const modal = new ModalBuilder()
      .setCustomId(`sell_reject_modal_${orderId}`)
      .setTitle('Lý do từ chối đơn');
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reject_reason')
          .setLabel('Lý do từ chối')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setPlaceholder('Vui lòng nhập lý do từ chối đơn đăng bán...')
      )
    );
    
    await interaction.showModal(modal);
    
  } catch (err) {
    console.error('Error handling sell admin reject:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi xử lý từ chối đơn.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý modal từ chối
async function handleSellRejectModal(interaction) {
  try {
    const orderId = interaction.customId.split('_')[3];
    const rejectReason = interaction.fields.getTextInputValue('reject_reason');
    
    // Cập nhật trạng thái
    sellOrders[orderId].status = 'rejected';
    sellOrders[orderId].rejectedBy = interaction.user.id;
    sellOrders[orderId].rejectedAt = Date.now();
    sellOrders[orderId].rejectReason = rejectReason;
    saveSellOrders();
    
    // Gửi thông báo đến người bán
    try {
      const user = await client.users.fetch(sellOrders[orderId].userId);
      await user.send(`❌ Đơn đăng bán **"${sellOrders[orderId].productName}"** của bạn đã bị từ chối.\n\n**Lý do:** ${rejectReason}\n\nVui lòng chỉnh sửa và đăng lại nếu cần.`);
    } catch (err) {
      console.log('Không thể gửi DM cho người bán:', err.message);
    }
    
    // Cập nhật message admin
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xFF0000)
      .setTitle('❌ ĐÃ TỪ CHỐI - ĐƠN ĐĂNG BÁN')
      .addFields(
        { name: '👤 Đã từ chối bởi', value: `<@${interaction.user.id}>`, inline: true },
        { name: '⏰ Thời gian', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
        { name: '📝 Lý do', value: rejectReason, inline: false }
      );
    
    await interaction.message.edit({ 
      embeds: [embed], 
      components: [] 
    });
    
    await interaction.reply({ 
      content: `✅ Đã từ chối đơn đăng bán ${orderId} và thông báo cho người bán.`, 
      ephemeral: true 
    });
    
  } catch (err) {
    console.error('Error handling sell reject modal:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi xử lý từ chối đơn.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý khi user bấm "Quan tâm" trên kênh public
async function handleSellPublicInterest(interaction) {
  try {
    const orderId = interaction.customId.split('_')[3];
    
    if (!sellOrders[orderId]) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy đơn đăng bán này.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra xem user có phải là người bán không
    if (sellOrders[orderId].userId === interaction.user.id) {
      return await interaction.reply({ 
        content: '❌ Bạn không thể quan tâm sản phẩm của chính mình.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra xem user đã quan tâm chưa
    if (sellOrders[orderId].interestedUsers.includes(interaction.user.id)) {
      return await interaction.reply({ 
        content: '❌ Bạn đã quan tâm sản phẩm này rồi.', 
        ephemeral: true 
      });
    }
    
    // Thêm user vào danh sách quan tâm
    sellOrders[orderId].interestedUsers.push(interaction.user.id);
    saveSellOrders();
    
    // Gửi DM cho người bán để hỏi có chia sẻ số điện thoại không
    try {
      const seller = await client.users.fetch(sellOrders[orderId].userId);
      
      const embed = new EmbedBuilder()
        .setTitle('🤝 Có người quan tâm sản phẩm của bạn!')
        .setColor(0x00AE86)
        .addFields(
          { name: '📦 Sản phẩm', value: sellOrders[orderId].productName, inline: false },
          { name: '👤 Người quan tâm', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📅 Thời gian', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
        )
        .setDescription(`Bạn có muốn chia sẻ số điện thoại **${sellOrders[orderId].sellerPhone}** với người này không?`)
        .setFooter({ text: 'Số điện thoại sẽ được gửi riêng qua DM nếu bạn đồng ý' })
        .setTimestamp();
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sell_share_phone_yes_${orderId}_${interaction.user.id}`)
          .setLabel('✅ Có, chia sẻ số điện thoại')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`sell_share_phone_no_${orderId}_${interaction.user.id}`)
          .setLabel('❌ Không, không chia sẻ')
          .setStyle(ButtonStyle.Danger)
      );
      
      await seller.send({ 
        embeds: [embed], 
        components: [row] 
      });
      
    } catch (err) {
      console.log('Không thể gửi DM cho người bán:', err.message);
    }
    
    await interaction.reply({ 
      content: '✅ Bạn đã quan tâm sản phẩm này! Người bán sẽ được thông báo. Nếu họ đồng ý, số điện thoại sẽ được gửi đến bạn qua DM.',
      ephemeral: true 
    });
    
  } catch (err) {
    console.error('Error handling sell public interest:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi xử lý quan tâm sản phẩm.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý khi người bán đồng ý chia sẻ số điện thoại
async function handleSellSharePhoneYes(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const orderId = parts[4];
    const interestedUserId = parts[5];
    
    if (!sellOrders[orderId]) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy đơn đăng bán này.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra xem có phải người bán không
    if (sellOrders[orderId].userId !== interaction.user.id) {
      return await interaction.reply({ 
        content: '❌ Bạn không phải người bán của sản phẩm này.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra xem đã chia sẻ số điện thoại với user này chưa
    if (sellOrders[orderId].phoneSharedWith.includes(interestedUserId)) {
      return await interaction.reply({ 
        content: '❌ Bạn đã chia sẻ số điện thoại với người này rồi.', 
        ephemeral: true 
      });
    }
    
    // Thêm vào danh sách đã chia sẻ
    sellOrders[orderId].phoneSharedWith.push(interestedUserId);
    saveSellOrders();
    
    // Gửi số điện thoại cho người quan tâm
    try {
      const interestedUser = await client.users.fetch(interestedUserId);
      
      const embed = new EmbedBuilder()
        .setTitle('📞 Số điện thoại người bán')
        .setColor(0x00AE86)
        .addFields(
          { name: '📦 Sản phẩm', value: sellOrders[orderId].productName, inline: false },
          { name: '👤 Người bán', value: sellOrders[orderId].sellerName, inline: true },
          { name: '📞 Số điện thoại', value: `**${sellOrders[orderId].sellerPhone}**`, inline: false },
          { name: '💰 Giá', value: sellOrders[orderId].productPrice, inline: true },
          { name: '⚠️ Lưu ý', value: 'Số điện thoại được chia sẻ với sự đồng ý của người bán. Vui lòng liên hệ một cách lịch sự và tôn trọng.', inline: false }
        )
        .setFooter({ text: 'Mua bán an toàn, cảm ơn bạn!' })
        .setTimestamp();
      
      await interestedUser.send({ embeds: [embed] });
      
    } catch (err) {
      console.log('Không thể gửi DM cho người quan tâm:', err.message);
    }
    
    await interaction.update({ 
      content: '✅ Bạn đã chia sẻ số điện thoại với người quan tâm. Số điện thoại đã được gửi riêng đến họ qua DM.',
      components: [],
      embeds: []
    });
    
  } catch (err) {
    console.error('Error handling sell share phone yes:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi chia sẻ số điện thoại.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý khi người bán từ chối chia sẻ số điện thoại
async function handleSellSharePhoneNo(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const orderId = parts[4];
    const interestedUserId = parts[5];
    
    if (!sellOrders[orderId]) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy đơn đăng bán này.', 
        ephemeral: true 
      });
    }
    
    // Kiểm tra xem có phải người bán không
    if (sellOrders[orderId].userId !== interaction.user.id) {
      return await interaction.reply({ 
        content: '❌ Bạn không phải người bán của sản phẩm này.', 
        ephemeral: true 
      });
    }
    
    // Gửi thông báo cho người quan tâm
    try {
      const interestedUser = await client.users.fetch(interestedUserId);
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Người bán từ chối chia sẻ số điện thoại')
        .setColor(0xFF0000)
        .addFields(
          { name: '📦 Sản phẩm', value: sellOrders[orderId].productName, inline: false },
          { name: '👤 Người bán', value: sellOrders[orderId].sellerName, inline: true },
          { name: '📝 Lý do', value: 'Người bán hiện không muốn chia sẻ số điện thoại. Vui lòng liên hệ qua Discord nếu có thể.', inline: false }
        )
        .setFooter({ text: 'Bạn vẫn có thể nhắn tin trực tiếp cho người bán qua Discord' })
        .setTimestamp();
      
      await interestedUser.send({ embeds: [embed] });
      
    } catch (err) {
      console.log('Không thể gửi DM cho người quan tâm:', err.message);
    }
    
    await interaction.update({ 
      content: '✅ Bạn đã từ chối chia sẻ số điện thoại. Người quan tâm đã được thông báo.',
      components: [],
      embeds: []
    });
    
  } catch (err) {
    console.error('Error handling sell share phone no:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi xử lý từ chối chia sẻ.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý khi xem ảnh sản phẩm
async function handleSellViewImages(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const orderId = parts[4];
    
    if (!sellOrders[orderId]) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy đơn đăng bán này.', 
        ephemeral: true 
      });
    }
    
    const order = sellOrders[orderId];
    
    if (order.images.length === 0) {
      return await interaction.reply({ 
        content: '❌ Sản phẩm này không có ảnh.', 
        ephemeral: true 
      });
    }
    
    // Tạo embed hiển thị ảnh
    const embed = new EmbedBuilder()
      .setTitle(`🖼️ Hình ảnh sản phẩm: ${order.productName}`)
      .setColor(0x00AE86)
      .setDescription(`**Tổng cộng:** ${order.images.length} ảnh`)
      .setFooter({ text: `Mã đơn: ${orderId}` })
      .setTimestamp();
    
    // Thêm ảnh đầu tiên
    embed.setImage(order.images[0]);
    
    // Tạo các nút chuyển ảnh nếu có nhiều hơn 1 ảnh
    const components = [];
    if (order.images.length > 1) {
      const row = new ActionRowBuilder();
      
      if (order.images.length > 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`sell_image_prev_${orderId}_0`)
            .setLabel('⬅️ Trước')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`sell_image_next_${orderId}_0`)
            .setLabel('Tiếp ➡️')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      
      components.push(row);
    }
    
    await interaction.reply({ 
      embeds: [embed], 
      components: components,
      ephemeral: true 
    });
    
  } catch (err) {
    console.error('Error handling sell view images:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi xem ảnh.', 
      ephemeral: true 
    });
  }
}

// Hàm xử lý khi hủy đăng bán
async function handleSellCancel(interaction) {
  try {
    const orderId = interaction.customId.split('_')[2];
    const userId = interaction.user.id;
    
    if (!sellingSessions.has(userId)) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy phiên đăng bán của bạn.', 
        ephemeral: true 
      });
    }
    
    const session = sellingSessions.get(userId);
    
    // Xóa session
    sellingSessions.delete(userId);
    
    // Xóa các tin nhắn ảnh đã gửi
    if (sellImageMessages.has(orderId)) {
      const messageIds = sellImageMessages.get(orderId);
      const channel = await client.channels.fetch(session.channelId);
      
      for (const messageId of messageIds) {
        try {
          const msg = await channel.messages.fetch(messageId);
          await msg.delete();
        } catch (err) {
          // Bỏ qua nếu không xóa được
        }
      }
      sellImageMessages.delete(orderId);
    }
    
    await interaction.update({ 
      content: '❌ Đã hủy đăng bán sản phẩm. Tất cả ảnh đã gửi đã được xóa.',
      components: [],
      embeds: []
    });
    
  } catch (err) {
    console.error('Error handling sell cancel:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi hủy đăng bán.', 
      ephemeral: true 
    });
  }
}

// ===================== EVENT ROLE MANAGEMENT =====================
async function ensureEventRoleExists() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    
    if (!roles.eventParticipantRoleId) {
      // Tạo role mới cho event participants
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
      return role.id;
    }
    
    // Kiểm tra role có tồn tại không
    const role = await guild.roles.fetch(roles.eventParticipantRoleId);
    if (!role) {
      // Role không tồn tại, tạo mới
      const newRole = await guild.roles.create({
        name: '🎟️ Event Participant',
        color: 0x0099ff,
        reason: 'Role cho người tham gia sự kiện',
        permissions: [],
        mentionable: true
      });
      
      roles.eventParticipantRoleId = newRole.id;
      fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
      console.log(`Recreated event participant role: ${newRole.name} (${newRole.id})`);
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
function trackControllers(controllers) {
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
  updateControllerLeaderboardForOnlineControllers(currentControllers, now);
  
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

function updateControllerLeaderboardForOnlineControllers(currentControllers, currentTime) {
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
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardData, null, 2));
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
function trackPilots(pilots) {
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
  updatePilotLeaderboard(currentPilots, now);
  
  // Update current tracking
  onlinePilots = currentPilots;
}

function updatePilotLeaderboard(currentPilots, currentTime) {
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
    fs.writeFileSync(PILOT_LEADERBOARD_FILE, JSON.stringify(pilotLeaderboardData, null, 2));
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
    txtContent += 'Rank | CID       | Name                     | Flight Time | Flights | Last Aircraft\n';
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
  const s = String(text ?? '');
  if (s.length <= maxLength) return [s];

  const chunks = [];
  let current = '';

  const paragraphs = s.split('\n\n');
  for (const p of paragraphs) {
    if (current.length + p.length + 2 <= maxLength) {
      current += (current ? '\n\n' : '') + p;
    } else {
      if (current) chunks.push(current);
      current = '';

      if (p.length > maxLength) {
        const sentences = p.split('. ');
        for (const sent of sentences) {
          if (current.length + sent.length + 2 <= maxLength) {
            current += (current ? '. ' : '') + sent;
          } else {
            if (current) chunks.push(current);
            current = sent;
          }
        }
      } else {
        current = p;
      }
    }
  }

  if (current) chunks.push(current);
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
      generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
    });

    const result = await chat.sendMessage(sanitizedUserText);

    const resp = result?.response;
    let text = '';
    if (resp && typeof resp.text === 'function') {
      text = await resp.text();
    } else if (typeof resp === 'string') {
      text = resp;
    } else if (resp?.candidates?.[0]?.content?.parts?.[0]?.text) {
      text = String(resp.candidates[0].content.parts[0].text);
    } else {
      text = JSON.stringify(resp || result || {}).slice(0, 1500);
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

  try {
    let text = message.content || '';
    if (message.attachments?.size) {
      const urls = [...message.attachments.values()].slice(0, 3).map((a) => a.url);
      text += `\n\nAttachments:\n${urls.join('\n')}`;
      if (message.attachments.size > 3) text += `\n(+${message.attachments.size - 3} more)`;
    }

    const responseText = await geminiChatReply(userId, text, allowSwear);

    const chunks = splitMessage(responseText, 1900);

    let sentAny = false;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = String(chunks[i] || '').trim();
      if (!chunk) continue;

      await safeSend(message, chunk);
      sentAny = true;
      await new Promise((r) => setTimeout(r, 350));
    }

    if (!sentAny) {
      await safeSend(message, '❌ AI trả về nội dung rỗng. Bạn thử lại câu khác nhé.');
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
      await safeSend(message, userMsg);
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

    if (newState.channelId === TRIGGER_VOICE_CHANNEL_ID) {
      const guild = newState.guild;
      const triggerChannel = newState.channel;
      
      if (!triggerChannel) return;

      const newVoiceChannel = await guild.channels.create({
        name: `${member.displayName}'s Channel`,
        type: ChannelType.GuildVoice,
        parent: triggerChannel.parentId,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.MoveMembers
            ],
          },
          {
            id: guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
          },
        ],
      });

      await member.voice.setChannel(newVoiceChannel);
      
      createdVoiceChannels.add(newVoiceChannel.id);
      
      console.log(`Created voice channel ${newVoiceChannel.name} for ${member.displayName}`);
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
// ===================== READY EVENT =====================
client.once('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  
  // Đảm bảo role event tồn tại
  await ensureEventRoleExists();
  
  // Register slash commands - THÊM LỆNH /sell
  const commands = [
    new SlashCommandBuilder().setName('give_role').setDescription('Xin role'),
    new SlashCommandBuilder().setName('group_flight').setDescription('Tạo group flight'),
    new SlashCommandBuilder()
      .setName('send_announcements')
      .setDescription('Gửi thông báo')
      .addChannelOption((option) => option.setName('channel').setDescription('Kênh gửi').setRequired(true))
      .addStringOption((option) => option.setName('message').setDescription('Nội dung').setRequired(true)),
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
    // THÊM LỆNH /sell
    new SlashCommandBuilder()
      .setName('sell')
      .setDescription('Đăng bán sản phẩm')
  ];

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

  // ensure messages exist for editing
  await ensureVatsimMessageExists();
  await ensureLeaderboardMessagesExist();

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

// ===================== MESSAGE CREATE EVENT - THÊM XỬ LÝ ẢNH BÁN HÀNG =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const userId = message.author.id;
  if (bans.users[userId] && bans.users[userId].endTime > Date.now()) return;
  
  // Xử lý ảnh upload cho sell
  if (sellingSessions.has(userId)) {
    await handleSellImageUpload(message);
    return; // Không xử lý tiếp nếu là ảnh cho sell
  }
  
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

// ===================== INTERACTION CREATE EVENT - THÊM XỬ LÝ SELL =====================
client.on('interactionCreate', async (interaction) => {
  const isChatCmd = typeof interaction.isChatInputCommand === 'function'
    ? interaction.isChatInputCommand()
    : (typeof interaction.isCommand === 'function' ? interaction.isCommand() : false);
  const isStringSelect = typeof interaction.isStringSelectMenu === 'function'
    ? interaction.isStringSelectMenu()
    : (typeof interaction.isSelectMenu === 'function' ? interaction.isSelectMenu() : false);
  
  if (!isChatCmd && !interaction.isButton?.() && !interaction.isModalSubmit?.() && !isStringSelect) return;
  
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
        // THÊM XỬ LÝ LỆNH /sell
        case 'sell':
          await handleSellCommand(interaction);
          break;
      }
    } else if (interaction.isButton()) {
      // Xử lý các button của sell
      const customId = interaction.customId;
      
      if (customId.startsWith('sell_done_images_')) {
        await handleSellDoneImages(interaction);
      } else if (customId.startsWith('sell_cancel_')) {
        await handleSellCancel(interaction);
      } else if (customId.startsWith('sell_admin_approve_')) {
        await handleSellAdminApprove(interaction);
      } else if (customId.startsWith('sell_admin_reject_')) {
        await handleSellAdminReject(interaction);
      } else if (customId.startsWith('sell_public_interest_')) {
        await handleSellPublicInterest(interaction);
      } else if (customId.startsWith('sell_share_phone_yes_')) {
        await handleSellSharePhoneYes(interaction);
      } else if (customId.startsWith('sell_share_phone_no_')) {
        await handleSellSharePhoneNo(interaction);
      } else if (customId.startsWith('sell_admin_view_images_') || customId.startsWith('sell_public_view_images_')) {
        await handleSellViewImages(interaction);
      } else if (customId.startsWith('sell_image_')) {
        // Xử lý chuyển ảnh (nếu cần implement)
        await handleSellImageNavigation(interaction);
      } else {
        // Xử lý các button khác
        await handleButton(interaction);
      }
    } else if (interaction.isModalSubmit()) {
      // Xử lý modal của sell
      if (interaction.customId === 'sell_modal') {
        await handleSellModalSubmit(interaction);
      } else if (interaction.customId.startsWith('sell_reject_modal_')) {
        await handleSellRejectModal(interaction);
      } else {
        await handleModal(interaction);
      }
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

// Hàm xử lý chuyển ảnh (nếu cần)
async function handleSellImageNavigation(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const action = parts[2]; // prev hoặc next
    const orderId = parts[3];
    const currentIndex = parseInt(parts[4]);
    
    if (!sellOrders[orderId]) {
      return await interaction.reply({ 
        content: '❌ Không tìm thấy đơn đăng bán này.', 
        ephemeral: true 
      });
    }
    
    const order = sellOrders[orderId];
    let newIndex = currentIndex;
    
    if (action === 'prev') {
      newIndex = Math.max(0, currentIndex - 1);
    } else if (action === 'next') {
      newIndex = Math.min(order.images.length - 1, currentIndex + 1);
    }
    
    // Cập nhật embed với ảnh mới
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setImage(order.images[newIndex])
      .setFooter({ text: `Ảnh ${newIndex + 1}/${order.images.length} • Mã đơn: ${orderId}` });
    
    // Cập nhật các nút
    const row = new ActionRowBuilder();
    
    const prevButton = new ButtonBuilder()
      .setCustomId(`sell_image_prev_${orderId}_${newIndex}`)
      .setLabel('⬅️ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(newIndex === 0);
    
    const nextButton = new ButtonBuilder()
      .setCustomId(`sell_image_next_${orderId}_${newIndex}`)
      .setLabel('Tiếp ➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(newIndex === order.images.length - 1);
    
    row.addComponents(prevButton, nextButton);
    
    await interaction.update({ 
      embeds: [embed], 
      components: [row]
    });
    
  } catch (err) {
    console.error('Error handling sell image navigation:', err);
    await interaction.reply({ 
      content: '❌ Đã có lỗi xảy ra khi chuyển ảnh.', 
      ephemeral: true 
    });
  }
}

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
    
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardData, null, 2));
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
    pilotLeaderboardData = {
      month: now.getUTCMonth() + 1,
      year: now.getUTCFullYear(),
      pilots: {}
    };
    
    fs.writeFileSync(PILOT_LEADERBOARD_FILE, JSON.stringify(pilotLeaderboardData, null, 2));
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
      return interaction.reply({ content: 'Bạn không có quyền duyệt request này.', ephemeral: true });
    }

    const action = customId.split('_')[0];
    const requestId = customId.split('_')[1];
    const request = pendingRequests.get(requestId);
    if (!request) return interaction.reply({ content: 'Invalid or expired request.', ephemeral: true });

    pendingRequests.delete(requestId);
    await interaction.message.edit({ components: [] });

    if (action === 'deny') {
      await interaction.reply({ content: 'Request denied.', ephemeral: true });
      try {
        const user = await client.users.fetch(request.userId);
        await user.send('Your role request has been denied.');
      } catch (err) {
        console.error('Error notifying user:', err);
      }
      return;
    }

    try {
      const guild = await client.guilds.fetch(request.guildId);
      const member = await guild.members.fetch(request.userId);
      await member.roles.add(request.roleId);

      if (request.roleId === roles.basicMemberRoleId && roles.pendingRoleId) {
        await member.roles.remove(roles.pendingRoleId);
      }

      await interaction.reply({ content: 'Request approved.', ephemeral: true });
      await member.send('Your role request has been approved!');
    } catch (err) {
      console.error('Error approving role:', err);
      await interaction.reply({ content: 'Error approving request.', ephemeral: true });
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_${requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deny_${requestId}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
      );

      const sentMessage = await channel.send({ embeds: [embed], components: [row] });
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

async function handleMetar(interaction) {
  const icao = interaction.options.getString('icao').toUpperCase();
  try {
    const nodeFetch = await import('node-fetch');
    const fetch = nodeFetch.default;

    const response = await fetch(`https://api.checkwx.com/metar/${icao}`, {
      headers: { 'X-API-Key': CHECKWX_API_KEY },
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    if (data.results === 0) {
      return interaction.reply({ content: `❌ Không tìm thấy METAR cho sân bay ${icao}.`, ephemeral: true });
    }

    const metar = data.data[0];
    await interaction.reply({ content: `🌤️ METAR cho ${icao}:\n\`\`\`${metar}\`\`\``, ephemeral: false });
  } catch (err) {
    console.error('METAR API error:', err);
    await interaction.reply({ content: '❌ Đã có lỗi khi lấy METAR.', ephemeral: true });
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
  const messageContent = interaction.options.getString('message');
  await channel.send({ content: messageContent, allowedMentions: { parse: [] } });
  await interaction.reply({ content: '✅ Đã gửi thông báo!', ephemeral: true });
}

async function ensureVatsimMessageExists() {
  try {
    if (vatsimMessageStore.messageId && vatsimMessageStore.channelId) {
      const channel = await client.channels.fetch(vatsimMessageStore.channelId);
      if (!channel) throw new Error('channel not found');
      const msg = await channel.messages.fetch(vatsimMessageStore.messageId);
      if (!msg) throw new Error('message not found');
      console.log('Found existing VATSIM message to edit.');
      return;
    }
  } catch (err) {
    console.warn('Stored VATSIM message invalid -> will create new:', err.message || err);
  }

  try {
    const channel = await client.channels.fetch(VATSIM_CHANNEL_ID);
    const embed = new EmbedBuilder().setTitle('VATSIM Online Update').setDescription('Đang tải...').setTimestamp();
    const sent = await channel.send({ embeds: [embed] });
    vatsimMessageStore = { messageId: sent.id, channelId: channel.id };
    fs.writeFileSync(VATSIM_MSG_FILE, JSON.stringify(vatsimMessageStore, null, 2));
    console.log('Created initial VATSIM message and saved its id.');
  } catch (err) {
    console.error('Cannot create initial VATSIM message:', err);
  }
}

// ===================== LOGIN =====================
client.login(TOKEN);

// ===================== HTTP server for Render =====================
const port = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    console.log(`Received request on ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive!');
  })
  .listen(port, () => {
    console.log(`HTTP server running on port ${port}`);
  });