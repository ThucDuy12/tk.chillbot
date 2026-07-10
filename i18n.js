const fs = require('fs');
const path = require('path');

const vi = require('./locales/vi.json');
const en = require('./locales/en.json');

const locales = { vi, en };

function t(context, key, variables = {}) {
    let locale = 'en'; 
    if (context && context.userLang) {
        locale = context.userLang;
    }

    let text = locales[locale]?.[key] || locales['vi']?.[key] || key;

    // 🔴 BỘ LỌC ÉP KHUÔN: Sửa dứt điểm lỗi lòi chữ \n trên Discord
    if (typeof text === 'string') {
        text = text.replace(/\\n/g, '\n').replace(/\\`/g, '`');
    }

    for (const [k, v] of Object.entries(variables)) {
        text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    }

    return text;
}

module.exports = { t };
