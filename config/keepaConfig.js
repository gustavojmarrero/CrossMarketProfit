// ./config/keepaConfig.js
const axios = require("axios").default;
require("dotenv").config();

const keepaClient = axios.create({
    baseURL: 'https://api.keepa.com/',
    timeout: 10000 // puedes configurar un tiempo límite si lo deseas
});

const keepaApiKey = process.env.KEEPA_API_KEY;

// Función unificada para realizar llamadas a la API de Keepa
const callKeepaAPI = async (endpoint, params = {}) => {
    try {
        const response = await keepaClient.get(endpoint, {
            params: { ...params, key: keepaApiKey } // Agregar la API key a los parámetros
        });
        return response.data;
    } catch (error) {
        console.error(`Error al realizar la consulta a la API de Keepa en ${endpoint}:`, error);
        throw error; // Lanzar error para manejo externo si es necesario
    }
};



module.exports = {
    callKeepaAPI
};
