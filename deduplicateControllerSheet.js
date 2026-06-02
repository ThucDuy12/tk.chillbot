// deduplicateControllerSheet.js
require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'gen-lang-client-0170849728-d9d0d8741c5f.json');
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'ATC_2026_05'; // Bạn có thể sửa thành tên sheet hiện tại (VD: ATC_2026_05)

if (!SPREADSHEET_ID) {
  console.error('Missing GOOGLE_SHEET_ID in .env');
  process.exit(1);
}

async function deduplicateControllerSheet() {
  try {
    // Khởi tạo auth
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    // 1. Đọc toàn bộ dữ liệu từ sheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:H`,
    });
    const rows = res.data.values || [];
    if (rows.length === 0) {
      console.log('Không có dữ liệu cần xử lý.');
      return;
    }

    console.log(`Đọc được ${rows.length} dòng dữ liệu.`);

    // 2. Xử lý: Gom nhóm theo Category + CID, giữ bản ghi có lastUpdate lớn nhất
    const uniqueMap = new Map(); // key = `${category}|${cid}`

    for (const row of rows) {
      // Cấu trúc row: [Category, CID, Name, Callsign, Seconds, LastUpdate(timestamp), LastUpdate(ISO), CallsignHistory]
      const [category, cid, name, callsign, secondsStr, lastUpdateStr, lastUpdateISO, history] = row;
      if (!category || !cid) continue;

      const key = `${category}|${cid}`;
      const lastUpdate = parseInt(lastUpdateStr, 10) || 0;
      const seconds = parseInt(secondsStr, 10) || 0;

      if (!uniqueMap.has(key) || uniqueMap.get(key).lastUpdate < lastUpdate) {
        uniqueMap.set(key, {
          category,
          cid,
          name: name || '',
          callsign: callsign || '',
          seconds,
          lastUpdate,
          lastUpdateISO: lastUpdateISO || '',
          history: history || '{}',
        });
      }
    }

    const uniqueRows = Array.from(uniqueMap.values());
    console.log(`Sau khi xóa duplicate: ${uniqueRows.length} dòng duy nhất.`);

    // 3. Lấy sheetId để xóa vùng dữ liệu
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties',
    });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME);
    if (!sheet) throw new Error(`Sheet ${SHEET_NAME} not found`);
    const sheetId = sheet.properties.sheetId;

    // 4. Xóa toàn bộ dữ liệu cũ (từ dòng 2 trở đi)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteRange: {
              range: {
                sheetId: sheetId,
                startRowIndex: 1,
                endRowIndex: 5000,
                startColumnIndex: 0,
                endColumnIndex: 8,
              },
              shiftDimension: 'ROWS',
            },
          },
        ],
      },
    });

    // 5. Ghi lại dữ liệu đã được deduplicate
    if (uniqueRows.length > 0) {
      const valuesToWrite = uniqueRows.map(r => [
        r.category,
        r.cid,
        r.name,
        r.callsign,
        r.seconds,
        r.lastUpdate,
        r.lastUpdateISO,
        r.history,
      ]);

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: valuesToWrite },
      });
    }

    console.log('✅ Đã xóa duplicate thành công!');
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  }
}

deduplicateControllerSheet();