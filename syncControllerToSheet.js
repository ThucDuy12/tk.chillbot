// syncControllerToSheet.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initGoogleSheets, saveControllerLeaderboard, loadControllerLeaderboard } = require('./googleSheets');

// Đường dẫn file JSON chứa dữ liệu controller
const CONTROLLER_JSON_FILE = path.join(__dirname, 'leaderboard.json'); // hoặc tên file bạn lưu

async function syncControllerData() {
  try {
    console.log('🔄 Bắt đầu đồng bộ controller (ATC) data lên Google Sheets...');

    // 1. Khởi tạo Google Sheets client
    await initGoogleSheets();
    console.log('✅ Google Sheets client ready');

    // 2. Đọc dữ liệu từ file JSON
    if (!fs.existsSync(CONTROLLER_JSON_FILE)) {
      console.error(`❌ Không tìm thấy file ${CONTROLLER_JSON_FILE}`);
      return;
    }
    const rawData = fs.readFileSync(CONTROLLER_JSON_FILE, 'utf8');
    const controllerData = JSON.parse(rawData);

    // Kiểm tra cấu trúc
    if (!controllerData.month || !controllerData.year || !controllerData.stats) {
      console.error('❌ Dữ liệu JSON không đúng cấu trúc (thiếu month, year hoặc stats)');
      return;
    }

    const { month, year, stats } = controllerData;
    console.log(`📅 Tháng: ${month}/${year}`);
    
    // Tính tổng số controller
    let totalControllers = 0;
    for (const cat in stats) {
      totalControllers += Object.keys(stats[cat] || {}).length;
    }
    console.log(`🎮 Số controller cần đồng bộ: ${totalControllers}`);

    // 3. Lưu lên Google Sheets (hàm save sẽ tự động tạo sheet nếu chưa có)
    await saveControllerLeaderboard(month, year, stats);
    console.log(`✅ Đã lưu controller lên sheet ATC_${year}_${month.toString().padStart(2, '0')}`);

    // 4. (Tuỳ chọn) Đọc lại để kiểm tra
    const reloaded = await loadControllerLeaderboard(month, year);
    let reloadedCount = 0;
    for (const cat in reloaded.stats) {
      reloadedCount += Object.keys(reloaded.stats[cat] || {}).length;
    }
    console.log(`📖 Xác nhận đọc lại: ${reloadedCount} controller`);

    console.log('🎉 Đồng bộ controller hoàn tất!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình đồng bộ:', err);
  }
}

// Chạy script
syncControllerData();