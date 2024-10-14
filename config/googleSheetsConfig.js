// ./config/googleSheetsConfig.js
const { google } = require('googleapis');
require('dotenv').config();

const authenticate = async () => {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
  });
  return auth;
};

const sheets = async () => {
  const auth = await authenticate();
  return google.sheets({ version: 'v4', auth });
};

const readSheet = async (spreadsheetId, range) => {    
  const gsheets = await sheets();
  const result = await gsheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  return result.data.values;
};

const updateSheet = async (spreadsheetId, range, values) => {
  const gsheets = await sheets();
  const result = await gsheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });
  return result.data;
};

const clearSheet = async (spreadsheetId, range) => {
  try {
    const gsheets = await sheets();
    const result = await gsheets.spreadsheets.values.clear({
      spreadsheetId,
      range
    });
    return result.data;
  } catch (error) {
    console.error('Error al borrar los valores:', error);
    throw error;
  }
};


module.exports = {
  readSheet,
  updateSheet,
  clearSheet,
};