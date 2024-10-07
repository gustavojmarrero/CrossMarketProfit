// ./services/keepaService.js
const { callKeepaAPI } = require('../config/keepaConfig');



//Busqueda de productos vendidos por amazon en la categoria de belleza
const findProductsFromKeepa = async (category) => {
  const productSearchParams = {
    domain: 11,
    selection: JSON.stringify({
      current_AMAZON_gte: 15000,
      current_AMAZON_lte: 400000,
      rootCategory: category,
     sort: [["current_SALES", "asc"]], // Ordenar por ventas actuales
    // sort: [[ "deltaPercent30_AMAZON", "desc"]], // Ordenar por variación de precio en los últimos 30 días
    // sort: [[ "deltaPercent90_AMAZON", "desc"]], // Ordenar por variación de precio en los últimos 30 días
    //  sort: [[ "current_AMAZON", "asc"]], // Ordenar precio actual de menor a mayor
    //  sort: [[ "current_AMAZON", "desc"]], // Ordenar precio actual de mayor a menor
      productType: [0, 1, 2],
      page: 0,
      perPage: 10000
    }),
  };

  const data = await callKeepaAPI("/query", productSearchParams);
  console.log(JSON.stringify(data.asinList, null, 2));
  return data.asinList;
};


const getTokenLeft = async () => {
  try {
      const endpoint = '/token';
      const response = await callKeepaAPI(endpoint);
      return response.tokensLeft; // Retorna directamente los datos de la respuesta
  } catch (error) {
      console.error('Error al obtener los tokens restantes:', error);
      throw error;
  }
}


  //getSellerId("A2RIC6EIHFYJ8E")
module.exports = {
    findProductsFromKeepa,
    getTokenLeft
}