// syncPilotToSheet.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initGoogleSheets, savePilotLeaderboard, loadPilotLeaderboard } = require('./googleSheets');

// Đường dẫn file JSON chứa dữ liệu pilot
const PILOT_JSON_FILE = path.join(__dirname, 'pilot_leaderboard.json');

async function syncPilotData() {
  try {
    console.log('🔄 Bắt đầu đồng bộ pilot data lên Google Sheets...');

    // 1. Khởi tạo Google Sheets client
    await initGoogleSheets();
    console.log('✅ Google Sheets client ready');

    // 2. Đọc dữ liệu từ file JSON
    if (!fs.existsSync(PILOT_JSON_FILE)) {
      console.error(`❌ Không tìm thấy file ${PILOT_JSON_FILE}`);
      return;
    }
    const rawData = fs.readFileSync(PILOT_JSON_FILE, 'utf8');
    const pilotData = JSON.parse(rawData);

    // Kiểm tra cấu trúc
    if (!pilotData.month || !pilotData.year || !pilotData.pilots) {
      console.error('❌ Dữ liệu JSON không đúng cấu trúc (thiếu month, year hoặc pilots)');
      return;
    }

    const { month, year, pilots } = pilotData;
    console.log(`📅 Tháng: ${month}/${year}`);
    console.log(`✈️ Số pilot cần đồng bộ: ${Object.keys(pilots).length}`);

    // 3. Lưu lên Google Sheets (hàm save sẽ tự động tạo sheet nếu chưa có)
    await savePilotLeaderboard(month, year, pilots);
    console.log(`✅ Đã lưu ${Object.keys(pilots).length} pilot lên sheet PILOT_${year}_${month.toString().padStart(2, '0')}`);

    // 4. (Tuỳ chọn) Đọc lại để kiểm tra
    const reloaded = await loadPilotLeaderboard(month, year);
    console.log(`📖 Xác nhận đọc lại: ${Object.keys(reloaded.pilots).length} pilot`);

    console.log('🎉 Đồng bộ hoàn tất!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình đồng bộ:', err);
  }
}

// Chạy script
syncPilotData();