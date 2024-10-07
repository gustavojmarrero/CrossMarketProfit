const SellingPartner = require('amazon-sp-api');
require("dotenv").config();

const spClient = new SellingPartner({
    region: 'na', 
    refresh_token: process.env.AMAZON_REFRESH_TOKEN 
});


module.exports = spClient;