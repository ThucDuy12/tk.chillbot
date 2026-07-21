const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Ép Puppeteer tải Chrome thẳng vào trong thư mục dự án thay vì thư mục tạm của Linux
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};