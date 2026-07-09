// =====================================
// CẬP NHẬT/TRỪ TIỀN TK.CHILL CASH LÊN SHEETS (ĐÃ BỌC THÉP ÉP SỐ)
// =====================================
async function updatePilotBalance(discordId, cashChange, usedCashChange = 0, earnedCashChange = 0) {
  const sheets = await initGoogleSheets();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CASH_SPREADSHEET_ID, 
      range: `${CASH_DATABASE_SHEET_NAME}!A2:T`,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) return { success: false, msg: 'Không tìm thấy database' };

    const parseNum = (val) => {
      let n = parseFloat(String(val).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    };

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][18] === String(discordId)) {
        const currentRowIndex = i + 2; 
        
        let currentCash = parseNum(rows[i][3]);
        let totalEarned = parseNum(rows[i][4]);
        let usedCash = parseNum(rows[i][5]);

        // ÉP KIỂU NGHIÊM NGẶT THÀNH SỐ (CHỐNG LỖI NỐI CHUỖI 1.3 TRIỆU TỶ)
        const cChange = parseNum(cashChange);
        const uChange = parseNum(usedCashChange);
        const eChange = parseNum(earnedCashChange);

        if (currentCash + cChange < 0) {
          return { success: false, msg: 'Không đủ số dư' };
        }

        // Tính toán an toàn
        currentCash += cChange;
        totalEarned += eChange;
        usedCash += uChange;

        await sheets.spreadsheets.values.update({
          spreadsheetId: CASH_SPREADSHEET_ID,
          range: `${CASH_DATABASE_SHEET_NAME}!D${currentRowIndex}:F${currentRowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[currentCash, totalEarned, usedCash]] },
        });

        return { success: true, currentCash };
      }
    }
    return { success: false, msg: 'Không tìm thấy hồ sơ' };
  } catch (error) {
    console.error('Lỗi khi update balance:', error);
    return { success: false, msg: 'Lỗi API Google Sheets' };
  }
}
