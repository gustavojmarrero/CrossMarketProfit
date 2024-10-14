// ./controllers/arbitrageController.js
const asinCatalogProcessor = require("./catalogController");

const arbitrageAmazonMeli = async () => {
  try {
    console.log('Iniciando proceso de arbitraje Amazon-MercadoLibre...');

    console.log('Agregando nuevos ASINs...');
    await asinCatalogProcessor.addNewAsins();

    console.log('Agregando detalles de cada ASIN nuevo...');
    await asinCatalogProcessor.addAsinDetails();

    console.log('Agregando los CatalogId de los nuevos productos...');
    await asinCatalogProcessor.addCatalogIds();

    console.log('Actualizando los precios de referencia de los productos en el catálogo de MercadoLibre...');
    await asinCatalogProcessor.updateCatalogPrices();

    console.log('Agregando los CategoryId de los productos...');
    await asinCatalogProcessor.addCategoryId();

    console.log('Actualizando las comisiones de MercadoLibre para los nuevos productos...');
    await asinCatalogProcessor.addFee();

    console.log('Actualizando los costos de envíos de MercadoLibre para los nuevos productos...');
    await asinCatalogProcessor.updateShippingCostsDaily();

    console.log('Actualizando el total de visitas de los productos en los últimos 30 días...');
    await asinCatalogProcessor.updateTotalVisitsLast30Days();

    console.log('Actualizando los precios de Amazon para todos los productos con CatalogId...');
    await asinCatalogProcessor.updateAmazonPrice();

    console.log("Actualizando los precios de Amazon para todos los productos del tracking")
    await asinCatalogProcessor.updateAmazonPriceTracked();
    
    console.log('Calculando la ganancia potencial de los productos...');
    await asinCatalogProcessor.calculateProfit();

    console.log('Subiendo los datos al Google Sheet...');
    await asinCatalogProcessor.uploadDataToSheet();

    console.log('Proceso de arbitraje finalizado.');
    process.exit(0); // Terminar el proceso de arbitraje cuando se hayan realizado todas las operaciones

  } catch (error) {
    console.error('Error en el proceso de arbitraje:', error);
    process.exit(1); // Terminar el proceso de arbitraje si hay un error
  }
};

arbitrageAmazonMeli();