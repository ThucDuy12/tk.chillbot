const { google } = require('googleapis');
const path = require('path');

// ========== CONFIG ==========
// ========== CONFIG ==========
const CREDENTIALS_PATH = path.join(__dirname, 'gen-lang-client-0170849728-d9d0d8741c5f.json');
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID; // <-- Đây là Sheet cũ đang chạy

// THÊM 2 DÒNG NÀY ĐỂ TRỎ TỚI SHEET CHỨA CASH:
const CASH_SPREADSHEET_ID = '1O_rJz2r9BY5w-A_5ga-azAthZ2oOr2Ao7v6pLBmDcfQ'; 
const CASH_DATABASE_SHEET_NAME = 'tk.chill cash Database';

const CONTROLLER_SHEET_PREFIX = 'ATC_';
const PILOT_SHEET_PREFIX = 'PILOT_';
const PENDING_USERS_SHEET_NAME = 'PendingUsers'; // Tên sheet cho Pending Users
const SIMBRIEF_USERS_SHEET_NAME = 'SimbriefUsers';
const PROFILES_SHEET_NAME = 'Profiles';
const VATSIM_LINKS_SHEET_NAME = 'VatsimLinks'; // Sổ đỏ chống trộm CID

let sheetsClient = null;

// ========== KHỞI TẠO CLIENT ==========
async function initGoogleSheets() {
  if (sheetsClient) return sheetsClient;

  if (!SPREADSHEET_ID) {
    throw new Error('Missing GOOGLE_SHEET_ID in environment');
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    console.log('✅ Google Sheets client initialized');
    return sheetsClient;
  } catch (err) {
    console.error('❌ Failed to init Google Sheets:', err.message);
    throw err;
  }
}

// ========== TIỆN ÍCH ==========
function getSheetName(prefix, month, year) {
  return `${prefix}${year}_${month.toString().padStart(2, '0')}`;
}

async function sheetExists(sheetName) {
  const sheets = await initGoogleSheets();
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties',
    });
    return response.data.sheets.some(s => s.properties.title === sheetName);
  } catch (err) {
    console.error('Error checking sheet existence:', err);
    return false;
  }
}

// ========== TẠO SHEET CONTROLLER ==========
async function createControllerSheet(month, year) {
  const sheetName = getSheetName(CONTROLLER_SHEET_PREFIX, month, year);
  const exists = await sheetExists(sheetName);
  if (exists) return sheetName;

  const sheets = await initGoogleSheets();
  const headers = [
    'Category', 'CID', 'Name', 'Callsign', 'Seconds',
    'LastUpdate (timestamp)', 'LastUpdate (ISO)', 'Callsign History (JSON)'
  ];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:H1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`✅ Created controller sheet: ${sheetName}`);
    return sheetName;
  } catch (err) {
    console.error('Error creating controller sheet:', err);
    throw err;
  }
}

// ========== TẠO SHEET PILOT ==========
async function createPilotSheet(month, year) {
  const sheetName = getSheetName(PILOT_SHEET_PREFIX, month, year);
  const exists = await sheetExists(sheetName);
  if (exists) return sheetName;

  const sheets = await initGoogleSheets();
  const headers = [
    'CID', 'Name', 'Callsign', 'Seconds', 'Flights',
    'LastUpdate (timestamp)', 'LastUpdate (ISO)',
    'LastDeparture', 'LastArrival', 'LastAircraft'
  ];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:J1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`✅ Created pilot sheet: ${sheetName}`);
    return sheetName;
  } catch (err) {
    console.error('Error creating pilot sheet:', err);
    throw err;
  }
}

// ========== TẠO SHEET PENDING USERS ==========
async function createPendingUsersSheet() {
  const exists = await sheetExists(PENDING_USERS_SHEET_NAME);
  if (exists) return PENDING_USERS_SHEET_NAME;

  const sheets = await initGoogleSheets();
  const headers = ['UserId', 'JoinDate', 'Notified5Days', 'Notified7Days', 'Ngày Gia Nhập'];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: PENDING_USERS_SHEET_NAME } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PENDING_USERS_SHEET_NAME}!A1:D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`✅ Created sheet: ${PENDING_USERS_SHEET_NAME}`);
    return PENDING_USERS_SHEET_NAME;
  } catch (err) {
    console.error('Error creating PendingUsers sheet:', err);
    throw err;
  }
}

// ========== LƯU CONTROLLER ==========
async function saveControllerLeaderboard(month, year, stats) {
  const sheetName = getSheetName(CONTROLLER_SHEET_PREFIX, month, year);
  const sheets = await initGoogleSheets();

  const sheetExistsFlag = await sheetExists(sheetName);
  if (!sheetExistsFlag) {
    await createControllerSheet(month, year);
  }

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
  const sheetId = sheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteRange: {
            range: {
              sheetId,
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

  const rows = [];
  for (const [category, controllers] of Object.entries(stats)) {
    for (const [cid, data] of Object.entries(controllers)) {
      rows.push([
        category,
        cid,
        data.name || '',
        data.callsign || '',
        data.seconds || 0,
        data.lastUpdate || 0,
        data.lastUpdate ? new Date(data.lastUpdate).toISOString() : '',
        JSON.stringify({ callsignHistory: [data.callsign] }),
      ]);
    }
  }

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`✅ Saved ${rows.length} controller records to sheet ${sheetName}`);
}

// ========== LƯU PILOT ==========
async function savePilotLeaderboard(month, year, pilots) {
  const sheetName = getSheetName(PILOT_SHEET_PREFIX, month, year);
  const sheets = await initGoogleSheets();

  const sheetExistsFlag = await sheetExists(sheetName);
  if (!sheetExistsFlag) {
    await createPilotSheet(month, year);
  }

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
  const sheetId = sheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteRange: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 5000,
              startColumnIndex: 0,
              endColumnIndex: 10,
            },
            shiftDimension: 'ROWS',
          },
        },
      ],
    },
  });

  const rows = [];
  for (const [cid, data] of Object.entries(pilots)) {
    rows.push([
      cid,
      data.name || '',
      data.callsign || '',
      data.seconds || 0,
      data.flights || 1,
      data.lastUpdate || 0,
      data.lastUpdate ? new Date(data.lastUpdate).toISOString() : '',
      data.lastDeparture || '',
      data.lastArrival || '',
      data.lastAircraft || '',
    ]);
  }

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`✅ Saved ${rows.length} pilot records to sheet ${sheetName}`);
}

// ========== LƯU PENDING USERS ==========
async function savePendingUsersSheet(data) {
  const sheets = await initGoogleSheets();

  const sheetExistsFlag = await sheetExists(PENDING_USERS_SHEET_NAME);
  if (!sheetExistsFlag) {
    await createPendingUsersSheet();
  }

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === PENDING_USERS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet ${PENDING_USERS_SHEET_NAME} not found`);
  const sheetId = sheet.properties.sheetId;

  // Xóa dữ liệu cũ
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteRange: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 5000,
              startColumnIndex: 0,
              endColumnIndex: 5,
            },
            shiftDimension: 'ROWS',
          },
        },
      ],
    },
  });

  const rows = [];
  for (const [userId, info] of Object.entries(data)) {
    // Ép kiểu format ngày giờ Việt Nam
    const readableDate = new Date(info.joinDate || Date.now()).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    
    rows.push([
      userId,
      info.joinDate || 0,
      info.notified5Days ? 'true' : 'false',
      info.notified7Days ? 'true' : 'false',
      readableDate // In thêm cột thứ 5 ra Sheet
    ]);
  }

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PENDING_USERS_SHEET_NAME}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`✅ Saved ${rows.length} pending users to sheet ${PENDING_USERS_SHEET_NAME}`);
}

// ========== ĐỌC CONTROLLER TỪ SHEET ==========
async function loadControllerLeaderboard(month, year) {
  const sheetName = getSheetName(CONTROLLER_SHEET_PREFIX, month, year);
  const exists = await sheetExists(sheetName);
  if (!exists) {
    return { month, year, stats: { Center: {}, Approach: {}, Tower: {}, Ground: {}, Other: {} } };
  }

  const sheets = await initGoogleSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:H`,
  });
  const rows = response.data.values || [];
  const stats = { Center: {}, Approach: {}, Tower: {}, Ground: {}, Other: {} };

  for (const row of rows) {
    const [category, cid, name, callsign, secondsStr, lastUpdateStr] = row;
    if (!category || !cid) continue;
    const seconds = parseInt(secondsStr, 10) || 0;
    const lastUpdate = parseInt(lastUpdateStr, 10) || 0;
    if (!stats[category]) stats[category] = {};
    stats[category][cid] = {
      name: name || '',
      callsign: callsign || '',
      seconds,
      lastUpdate,
    };
  }
  return { month, year, stats };
}

// ========== ĐỌC PILOT TỪ SHEET ==========
async function loadPilotLeaderboard(month, year) {
  const sheetName = getSheetName(PILOT_SHEET_PREFIX, month, year);
  const exists = await sheetExists(sheetName);
  if (!exists) {
    return { month, year, pilots: {} };
  }

  const sheets = await initGoogleSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:J`,
  });
  const rows = response.data.values || [];
  const pilots = {};

  for (const row of rows) {
    const [cid, name, callsign, secondsStr, flightsStr, lastUpdateStr, , lastDeparture, lastArrival, lastAircraft] = row;
    if (!cid) continue;
    pilots[cid] = {
      name: name || '',
      callsign: callsign || '',
      seconds: parseInt(secondsStr, 10) || 0,
      flights: parseInt(flightsStr, 10) || 1,
      lastUpdate: parseInt(lastUpdateStr, 10) || 0,
      lastDeparture: lastDeparture || '',
      lastArrival: lastArrival || '',
      lastAircraft: lastAircraft || '',
    };
  }
  return { month, year, pilots };
}

// ========== ĐỌC PENDING USERS TỪ SHEET ==========
async function loadPendingUsersSheet() {
  const exists = await sheetExists(PENDING_USERS_SHEET_NAME);
  if (!exists) {
    // Ép nó phải tạo sheet LUÔN VÀ NGAY nếu chưa có, thay vì bỏ qua
    console.log('⚠️ Sheet PendingUsers chưa tồn tại, đang tiến hành tạo mới...');
    await createPendingUsersSheet();
    return {};
  }

  const sheets = await initGoogleSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PENDING_USERS_SHEET_NAME}!A2:D`,
  });
  
  const rows = response.data.values || [];
  const data = {};

  for (const row of rows) {
    const [userId, joinDateStr, notified5DaysStr, notified7DaysStr] = row;
    if (!userId) continue;
    
    data[userId] = {
      joinDate: parseInt(joinDateStr, 10) || 0,
      notified5Days: notified5DaysStr === 'true',
      notified7Days: notified7DaysStr === 'true'
    };
  }
  return data;
}

// ========== TẠO SHEET SIMBRIEF USERS ==========
async function createSimbriefUsersSheet() {
  const exists = await sheetExists(SIMBRIEF_USERS_SHEET_NAME);
  if (exists) return SIMBRIEF_USERS_SHEET_NAME;

  const sheets = await initGoogleSheets();
  const headers = ['DiscordId', 'SimbriefUsername'];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SIMBRIEF_USERS_SHEET_NAME } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SIMBRIEF_USERS_SHEET_NAME}!A1:B1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`✅ Created sheet: ${SIMBRIEF_USERS_SHEET_NAME}`);
    return SIMBRIEF_USERS_SHEET_NAME;
  } catch (err) {
    console.error('Error creating SimbriefUsers sheet:', err);
    throw err;
  }
}

// ========== LƯU DỮ LIỆU SIMBRIEF USERS ==========
async function saveSimbriefUsersSheet(data) {
  const sheets = await initGoogleSheets();

  const sheetExistsFlag = await sheetExists(SIMBRIEF_USERS_SHEET_NAME);
  if (!sheetExistsFlag) {
    await createSimbriefUsersSheet();
  }

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === SIMBRIEF_USERS_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet ${SIMBRIEF_USERS_SHEET_NAME} not found`);
  const sheetId = sheet.properties.sheetId;

  // Xóa dữ liệu cũ
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteRange: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 5000,
              startColumnIndex: 0,
              endColumnIndex: 2,
            },
            shiftDimension: 'ROWS',
          },
        },
      ],
    },
  });

  const rows = [];
  for (const [discordId, username] of Object.entries(data)) {
    rows.push([discordId, username]);
  }

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SIMBRIEF_USERS_SHEET_NAME}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`✅ Saved ${rows.length} Simbrief users to sheet ${SIMBRIEF_USERS_SHEET_NAME}`);
}

// ========== ĐỌC DỮ LIỆU SIMBRIEF USERS ==========
async function loadSimbriefUsersSheet() {
  const exists = await sheetExists(SIMBRIEF_USERS_SHEET_NAME);
  if (!exists) {
    console.log('⚠️ Sheet SimbriefUsers chưa tồn tại, đang tiến hành tạo mới...');
    await createSimbriefUsersSheet();
    return {};
  }

  const sheets = await initGoogleSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SIMBRIEF_USERS_SHEET_NAME}!A2:B`,
  });
  
  const rows = response.data.values || [];
  const data = {};

  for (const row of rows) {
    const [discordId, username] = row;
    if (discordId && username) {
      data[discordId] = username;
    }
  }
  return data;
}

// ========== TẠO SHEET PROFILES ==========
async function createProfilesSheet() {
  const exists = await sheetExists(PROFILES_SHEET_NAME);
  if (exists) return PROFILES_SHEET_NAME;

  const sheets = await initGoogleSheets();
  const headers = ['DiscordId', 'Name', 'Age', 'Bio'];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: PROFILES_SHEET_NAME } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PROFILES_SHEET_NAME}!A1:D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`✅ Created sheet: ${PROFILES_SHEET_NAME}`);
    return PROFILES_SHEET_NAME;
  } catch (err) {
    console.error('Error creating Profiles sheet:', err);
    throw err;
  }
}

// ========== LƯU DỮ LIỆU PROFILES ==========
async function saveProfilesSheet(data) {
  const sheets = await initGoogleSheets();

  const sheetExistsFlag = await sheetExists(PROFILES_SHEET_NAME);
  if (!sheetExistsFlag) {
    await createProfilesSheet();
  }

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === PROFILES_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet ${PROFILES_SHEET_NAME} not found`);
  const sheetId = sheet.properties.sheetId;

  // Xóa dữ liệu cũ
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteRange: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 5000,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            shiftDimension: 'ROWS',
          },
        },
      ],
    },
  });

  const rows = [];
  for (const [discordId, info] of Object.entries(data)) {
    rows.push([discordId, info.name || '', info.age || '', info.bio || '']);
  }

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PROFILES_SHEET_NAME}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`✅ Saved ${rows.length} profiles to sheet ${PROFILES_SHEET_NAME}`);
}

// ========== ĐỌC DỮ LIỆU PROFILES ==========
async function loadProfilesSheet() {
  const exists = await sheetExists(PROFILES_SHEET_NAME);
  if (!exists) {
    console.log('⚠️ Sheet Profiles chưa tồn tại, đang tiến hành tạo mới...');
    await createProfilesSheet();
    return {};
  }

  const sheets = await initGoogleSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PROFILES_SHEET_NAME}!A2:D`,
  });
  
  const rows = response.data.values || [];
  const data = {};

  for (const row of rows) {
    const [discordId, name, age, bio] = row;
    if (discordId) {
      data[discordId] = { name, age, bio };
    }
  }
  return data;
}

// ========== TẠO SHEET VATSIM LINKS ==========
async function createVatsimLinksSheet() {
  const exists = await sheetExists(VATSIM_LINKS_SHEET_NAME);
  if (exists) return VATSIM_LINKS_SHEET_NAME;

  const sheets = await initGoogleSheets();
  const headers = ['DiscordId', 'CID'];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: VATSIM_LINKS_SHEET_NAME } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VATSIM_LINKS_SHEET_NAME}!A1:B1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`✅ Created sheet: ${VATSIM_LINKS_SHEET_NAME}`);
    return VATSIM_LINKS_SHEET_NAME;
  } catch (err) {
    console.error('Error creating VatsimLinks sheet:', err);
    throw err;
  }
}

// ========== ĐỌC DỮ LIỆU VATSIM LINKS ==========
async function loadVatsimLinksSheet() {
  const exists = await sheetExists(VATSIM_LINKS_SHEET_NAME);
  if (!exists) {
    await createVatsimLinksSheet();
    return {};
  }

  const sheets = await initGoogleSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${VATSIM_LINKS_SHEET_NAME}!A2:B`,
  });
  
  const rows = response.data.values || [];
  const data = {};

  for (const row of rows) {
    const [discordId, cid] = row;
    if (discordId && cid) {
      data[discordId] = parseInt(cid);
    }
  }
  return data;
}

// ========== TẠO SHEET VATSIM LINKS ==========
async function createVatsimLinksSheet() {
  const exists = await sheetExists(VATSIM_LINKS_SHEET_NAME);
  if (exists) return VATSIM_LINKS_SHEET_NAME;

  const sheets = await initGoogleSheets();
  const headers = ['DiscordId', 'DiscordUsername', 'CID', 'ImageUrl']; // ĐÃ THÊM CỘT

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: VATSIM_LINKS_SHEET_NAME } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VATSIM_LINKS_SHEET_NAME}!A1:D1`, // MỞ RỘNG TỪ B SANG D
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`✅ Created sheet: ${VATSIM_LINKS_SHEET_NAME}`);
    return VATSIM_LINKS_SHEET_NAME;
  } catch (err) {
    console.error('Error creating VatsimLinks sheet:', err);
    throw err;
  }
}

// ========== ĐỌC DỮ LIỆU VATSIM LINKS ==========
async function loadVatsimLinksSheet() {
  const exists = await sheetExists(VATSIM_LINKS_SHEET_NAME);
  if (!exists) {
    await createVatsimLinksSheet();
    return {};
  }

  const sheets = await initGoogleSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${VATSIM_LINKS_SHEET_NAME}!A2:D`, // ĐỌC ĐẾN CỘT D
  });
  
  const rows = response.data.values || [];
  const data = {};

  for (const row of rows) {
    const [discordId, username, cid, imageUrl] = row;
    if (discordId && cid) {
      data[discordId] = {
        cid: parseInt(cid),
        username: username || '',
        imageUrl: imageUrl || ''
      };
    }
  }
  return data;
}

// ========== LƯU DỮ LIỆU VATSIM LINKS ==========
async function saveVatsimLinksSheet(data) {
  const sheets = await initGoogleSheets();
  if (!(await sheetExists(VATSIM_LINKS_SHEET_NAME))) await createVatsimLinksSheet();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' });
  const sheetId = spreadsheet.data.sheets.find(s => s.properties.title === VATSIM_LINKS_SHEET_NAME).properties.sheetId;
  
  // Xóa dữ liệu cũ
  await sheets.spreadsheets.batchUpdate({ 
      spreadsheetId: SPREADSHEET_ID, 
      requestBody: { 
          requests: [{ deleteRange: { range: { sheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 4 }, shiftDimension: 'ROWS' } }] 
      } 
  });
  
  const rows = [];
  for (const [discordId, info] of Object.entries(data)) {
    if (typeof info === 'number') { 
        rows.push([discordId, '', info, '']); 
    } else { 
        rows.push([discordId, info.username || '', info.cid || '', info.imageUrl || '']); 
    }
  }
  
  if (rows.length > 0) {
      await sheets.spreadsheets.values.update({ 
          spreadsheetId: SPREADSHEET_ID, 
          range: `${VATSIM_LINKS_SHEET_NAME}!A2`, 
          valueInputOption: 'USER_ENTERED', // <--- CHÌA KHÓA NẰM Ở ĐÂY NÈ SẾP!
          requestBody: { values: rows } 
      });
  }
}

// =====================================
// ĐỌC THÔNG TIN TÀI KHOẢN TK.CHILL CASH (TỪ SHEET KHÁC)
// =====================================
async function getPilotBalance(discordId) {
  const sheets = await initGoogleSheets();
  try {
    // Gọi thẳng vào cái CASH_SPREADSHEET_ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CASH_SPREADSHEET_ID, 
      range: `${CASH_DATABASE_SHEET_NAME}!A2:T`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return null;

    // Quét từng dòng tìm Discord ID (nằm ở cột S - index 18)
    for (const row of rows) {
      if (row[18] === String(discordId)) {
        return {
          uid: row[0] || 'N/A',
          username: row[2] || 'N/A',
          currentCash: row[3] || 0,
          totalEarned: row[4] || 0,
          usedCash: row[5] || 0,
          completedFlights: row[7] || 0,
          totalDistance: row[8] || 0,
          totalHours: row[9] || 0
        };
      }
    }
    return null; // Không tìm thấy user
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu balance từ Sheet 2:', error);
    throw error;
  }
}

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


// =====================================
// TỰ ĐỘNG ĐĂNG KÝ USER MỚI (TẶNG 200 CASH KHỞI NGHIỆP)
// =====================================
async function registerPilot(discordId, discordName) {
  const sheets = await initGoogleSheets();
  try {
    // Tạo một mảng gồm 20 cột rỗng (Từ cột A đến cột T)
    const newRow = new Array(20).fill(''); 
    
    newRow[3] = 2000; // Cột D: Current Cash (Vốn khởi nghiệp)
    newRow[4] = 2000; // Cột E: Total Earned
    newRow[5] = 0;   // Cột F: Used Cash
    newRow[18] = String(discordId);   // Cột S: Discord ID
    newRow[19] = String(discordName); // Cột T: Discord Name

    // Ghi nối tiếp (append) vào hàng trống cuối cùng của Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: CASH_SPREADSHEET_ID,
      range: `${CASH_DATABASE_SHEET_NAME}!A:T`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [newRow] }
    });

    // Trả về dữ liệu gốc để bot dùng luôn cho lệnh hiện tại mà không cần fetch lại
    return {
      uid: 'NEW',
      username: discordName,
      currentCash: 2000,
      totalEarned: 2000,
      usedCash: 0,
      completedFlights: 0,
      totalDistance: 0,
      totalHours: 0
    };
  } catch (error) {
    console.error('Lỗi khi đăng ký user mới:', error);
    return null;
  }
}

// ========== EXPORTS ==========
module.exports = {
  initGoogleSheets,
  saveControllerLeaderboard,
  savePilotLeaderboard,
  loadControllerLeaderboard,
  loadPilotLeaderboard,
  createControllerSheet,
  createPilotSheet,
  sheetExists,
  loadPendingUsersSheet, 
  savePendingUsersSheet,  
  loadSimbriefUsersSheet,
  saveSimbriefUsersSheet,
  loadProfilesSheet,   
  saveProfilesSheet,
  loadVatsimLinksSheet,
  saveVatsimLinksSheet,
  getPilotBalance,
  updatePilotBalance,
  registerPilot
};
