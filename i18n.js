const fs = require('fs');
const path = require('path');

const vi = require('./locales/vi.json');
const en = require('./locales/en.json');

const locales = { vi, en };

function t(context, key, variables = {}) {
    // 1. ĐẶT TIẾNG ANH (en) LÀM MẶC ĐỊNH
    let locale = 'en'; 
    
    // 2. ƯU TIÊN LẤY NGÔN NGỮ NGƯỜI DÙNG ĐÃ SET (Được gắn vào interaction từ Bước 3)
    if (context && context.userLang) {
        locale = context.userLang;
    }

    // Lấy câu chữ, nếu bên tiếng Anh chưa dịch kịp thì rớt xuống tiếng Việt
    let text = locales[locale]?.[key] || locales['vi']?.[key] || key;

    for (const [k, v] of Object.entries(variables)) {
        text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    }

    return text;
}

module.exports = { t };