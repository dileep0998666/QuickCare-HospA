const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'hospitalInfo.json');

function setInfo(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getInfo() {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath));
  }
  return {};
}

module.exports = { setInfo, getInfo };
