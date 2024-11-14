// ./controllers/catalogController.js
const Bluebird = require("bluebird");
const moment = require("moment");
const {
  readSheet,
  updateSheet,
  clearSheet,
} = require("../config/googleSheetsConfig");
const { meliRequest } = require("../config/meliConfig");
const {
  getAsinPrice,
  getAsinDetails,
} = require("../services/amazonService");
const {
  findProductsFromKeepa,
  getTokenLeft,
} = require("../services/keepaService");
const AsinCatalogMapping = require("../models/asinCatalogMapping");
const { delay } = require("../utils");
const axios = require('axios');

class AsinCatalogProcessor {
  constructor() {
    this.categoryFeeCache = {};
  }

  async addNewAsins() {
    try {
      const tokenLeft = getTokenLeft();
      if (tokenLeft < 1500) {
        console.log("No hay suficientes tokens para agregar nuevos ASINs");
        return;
      }

      const categories = [
        "13848848011", // Automotriz y Motocicletas
        "9482650011", // Bebé
        "11260452011", // Belleza
        "9482660011", // Deportes y Aire Libre
        "9482670011", // Herramientas y Mejoras del Hogar
        "9482593011", // Hogar y Cocina
        "11076223011", // Industria Empresas y Ciencia
        "13848858011", // Instrumentos Musicales
        "16215357011", // Jardín
        "11260442011", // Juguetes y Juegos
        "9673844011", // Oficina y Papelería
        "11782336011", // Productos para animales
        "13848838011", // Ropa, Zapatos y Accesorios
        "9482610011", // Salud y Cuidado Personal
      ];

      // Obtener todos los ASINs de las categorías en paralelo
      const asinsArrays = await Promise.all(
        categories.map((category) => findProductsFromKeepa(category))
      );
      const allAsins = asinsArrays.flat();

      console.log(`Se encontraron ${allAsins.length} ASINs en Keepa.`);

      // Obtener los ASINs existentes y usar un Set para eficiencia
      const existingAsinsArray = await AsinCatalogMapping.find().distinct("asin");
      const existingAsins = new Set(existingAsinsArray);

      // Filtrar los nuevos ASINs que no están en la base de datos
      const newAsins = allAsins.filter((asin) => !existingAsins.has(asin));
      console.log(`Se encontraron ${newAsins.length} ASINs nuevos.`);

      if (newAsins.length > 0) {
        // Convertir cada ASIN en un objeto según el esquema de AsinCatalogMapping
        const newAsinsObjects = newAsins.map((asin) => ({ asin }));

        await AsinCatalogMapping.insertMany(newAsinsObjects);
        console.log(
          `Se agregaron ${newAsins.length} nuevos ASINs a la base de datos.`
        );
      } else {
        console.log("No hay nuevos ASINs para agregar.");
      }
    } catch (error) {
      console.error("Error en addNewAsins:", error);
    }
  }

  async addNewAsinsFromSheet() {
    try {
      const spreadsheetId = "1F8v5JpQ-pXJ7-XyHcbHpI0whCtMo3sJSLbc95ebRoKA";
      const range = "NewAsins!A2:A";

      // Leer los ASINs de la hoja de cálculo
      const asinsFromSheet = await readSheet(spreadsheetId, range);
      
      if (!asinsFromSheet || asinsFromSheet.length === 0) {
        console.log("No se encontraron ASINs en la hoja de cálculo.");
        return;
      }

      // Aplanar el array y filtrar valores vacíos
      const allAsins = asinsFromSheet.flat().filter(asin => asin);

      console.log(`Se encontraron ${allAsins.length} ASINs en la hoja de cálculo.`);

      // Obtener los ASINs existentes y usar un Set para eficiencia
      const existingAsinsArray = await AsinCatalogMapping.find().distinct("asin");
      const existingAsins = new Set(existingAsinsArray);

      // Filtrar los nuevos ASINs que no están en la base de datos
      const newAsins = allAsins.filter((asin) => !existingAsins.has(asin));
      console.log(`Se encontraron ${newAsins.length} ASINs nuevos.`);

      if (newAsins.length > 0) {
        // Convertir cada ASIN en un objeto según el esquema de AsinCatalogMapping
        const newAsinsObjects = newAsins.map((asin) => ({ asin }));

        await AsinCatalogMapping.insertMany(newAsinsObjects);
        console.log(
          `Se agregaron ${newAsins.length} nuevos ASINs a la base de datos.`
        );

        // Limpiar los ASINs agregados de la hoja de cálculo
        await clearSheet(spreadsheetId, range);
        console.log("Se limpiaron los ASINs agregados de la hoja de cálculo.");
      } else {
        console.log("No hay nuevos ASINs para agregar.");
      }
    } catch (error) {
      console.error("Error en addNewAsinsFromSheet:", error);
    }
  }

  async addAsinDetails() {
    try {
      await this.processMappingsInBatch(
        { title: null },
        this.processAsinDetails.bind(this)
      );
      console.log("Actualización de detalles de ASIN completada.");
    } catch (error) {
      console.error("Error en addAsinDetails:", error);
    }
  }

  async processAsinDetails(mapping) {
    try {
      const { uniqueIdentifiers, title, image } = await getAsinDetails(
        mapping.asin
      );

      if (uniqueIdentifiers.length > 0 || title !== "Sin título" || image) {
        console.log(`ASIN: ${mapping.asin}`);
        if (uniqueIdentifiers.length > 0) {
          console.log(`Identificadores: ${uniqueIdentifiers.join(", ")}`);
        }
        if (title !== "Sin título") {
          console.log(`Título: ${title}`);
        }
        if (image) {
          console.log(`Imagen: ${image}`);
        }
        return {
          updateOne: {
            filter: { _id: mapping._id },
            update: {
              $set: {
                identifiers: uniqueIdentifiers,
                title,
                image,
              },
            },
          },
        };
      } else {
        console.log(
          `No se encontraron detalles para el ASIN ${mapping.asin}.`
        );
        return null;
      }
    } catch (error) {
      console.error(`Error procesando ASIN ${mapping.asin}:`, error);
      return null;
    }
  }

  async addCatalogIds() {
    const thirtyDaysAgo = moment().subtract(30, "days").toDate();
    const queryFilter = {
      identifiers: { $exists: true, $not: { $size: 0 } },
      mlCatalogId: null,
      $or: [
        { mlCatalogIdUpdatedAt: { $exists: false } },
        { mlCatalogIdUpdatedAt: { $lte: thirtyDaysAgo } },
        { mlCatalogIdUpdatedAt: null },
      ],
    };

    await this.processMappingsInBatch(
      queryFilter,
      this.processCatalogIdUpdate.bind(this),
      200
    );
    console.log("Agregación de mlCatalogId completada.");
  }

  async processCatalogIdUpdate(mapping) {
    for (const identifier of mapping.identifiers) {
      try {
        const searchResponse = await meliRequest(
          `products/search?status=active&site_id=MLM&product_identifier=${identifier}`
        );

        if (searchResponse.success && searchResponse.data.results.length > 0) {
          const catalogId = searchResponse.data.results[0].id;
          console.log(
            `Se encontró mlCatalogId ${catalogId} para el identificador ${identifier}`
          );

          return this.createUpdateOperation(mapping._id, {
            mlCatalogId: catalogId,
            catalogIdentifier: identifier,
            mlCatalogIdUpdatedAt: new Date(),
          });
        } else {
          console.log(
            `No se encontró mlCatalogId para el identificador ${identifier}`
          );
        }
      } catch (error) {
        console.error(`Error buscando el identificador ${identifier}:`, error);
      }
    }

    console.log(
      `No se encontró mlCatalogId para los identificadores del ASIN: ${mapping.asin}`
    );
    return this.createUpdateOperation(mapping._id, {
      mlCatalogId: null,
      mlCatalogIdUpdatedAt: new Date(),
    });
  }

  createUpdateOperation(id, updateFields) {
    return {
      updateOne: {
        filter: { _id: id },
        update: { $set: updateFields },
      },
    };
  }

  async updateCatalogPrices() {
    const twentyFourHoursAgo = moment().subtract(24, "hours").toDate();
    const fiveDaysAgo = moment().subtract(5, "days").toDate();
    const twentyDaysAgo = moment().subtract(20, "days").toDate();

    const queryFilter = {
      mlCatalogId: { $nin: [null, "no_catalog"] },
      isMatchCorrect: { $ne: false },
      $or: [
        {tracking:true},
        { firstListingPriceUpdatedAt: { $exists: false } },
        { firstListingPriceUpdatedAt: null },
        {
          $and: [
            { firstListingPrice: 0 },
            {
              priceHistory: {
                $elemMatch: {
                  price: 0,
                  date: { $gte: twentyDaysAgo },
                },
              },
            },
            { firstListingPriceUpdatedAt: { $lte: fiveDaysAgo } },
          ],
        },
        {
          $and: [
            { firstListingPrice: 0 },
            {
              priceHistory: {
                $elemMatch: {
                  price: { $gt: 0 },
                  date: { $gte: twentyDaysAgo },
                },
              },
            },
            { firstListingPriceUpdatedAt: { $lte: twentyFourHoursAgo } },
          ],
        },
        {
          $and: [
            { firstListingPrice: 0 },
            { itemIds: { $size: 0 } },
            { firstListingPriceUpdatedAt: { $lte: fiveDaysAgo } },
          ],
        },
        {
          $and: [
            { firstListingPrice: { $gt: 0 } },
            { firstListingPriceUpdatedAt: { $lte: twentyFourHoursAgo } },
          ],
        },
      ],
    };

    await this.processMappingsInBatch(
      queryFilter,
      this.processCatalogPriceUpdate.bind(this)
    );
    console.log("Actualización de precios de catálogo completada.");
  }

  async processCatalogPriceUpdate(mapping) {
    const itemsResponse = await meliRequest(
      `/products/${mapping.mlCatalogId}/items`
    );
    const now = new Date();
    if (itemsResponse.success && itemsResponse.data.results.length > 0) {
      const firstListingPrice = itemsResponse.data.results[0].price;
      const itemIds = new Set([
        ...(mapping.itemIds || []),
        ...itemsResponse.data.results.map((item) => item.item_id),
      ]);
      const priceHistory = [
        ...(mapping.priceHistory || []),
        { price: firstListingPrice, date: now },
      ];
      const averagePriceLast30Days = this.calculateAveragePrice(
        priceHistory,
        30,
        now
      );
      const averagePriceLast90Days = this.calculateAveragePrice(
        priceHistory,
        90,
        now
      );
      const averagePriceLast180Days = this.calculateAveragePrice(
        priceHistory,
        180,
        now
      );

      console.log(
        `Precio y IDs de listado actualizados para mlCatalogId ${mapping.mlCatalogId}.`
      );
      return {
        updateOne: {
          filter: { _id: mapping._id },
          update: {
            $set: {
              firstListingPrice,
              itemIds: Array.from(itemIds),
              averagePriceLast30Days,
              averagePriceLast90Days,
              averagePriceLast180Days,
              firstListingPriceUpdatedAt: now,
            },
            $push: { priceHistory: { price: firstListingPrice, date: now } },
          },
        },
      };
    } else {
      console.log(
        `No se encontraron listados activos para el mlCatalogId ${mapping.mlCatalogId}.`
      );
      return {
        updateOne: {
          filter: { _id: mapping._id },
          update: {
            $set: {
              firstListingPrice: 0,
              firstListingPriceUpdatedAt: now,
            },
            $push: { priceHistory: { price: 0, date: now } },
          },
        },
      };
    }
  }

  calculateAveragePrice(priceHistory, days, now) {
    const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const relevantPrices = priceHistory.filter(
      (entry) => entry.date >= pastDate
    );
    const averagePrice =
      relevantPrices.reduce((acc, entry) => acc + entry.price, 0) /
      relevantPrices.length;
    return averagePrice || 0;
  }

  async addCategoryId() {
    await this.processMappingsInBatch(
      {
        itemIds: { $exists: true, $not: { $size: 0 } },
        mlCategoryId: null,
      },
      this.processCategoryIdUpdate.bind(this)
    );
    console.log("Actualización de categorías completada.");
  }

  async processCategoryIdUpdate(mapping) {
    const itemId = mapping.itemIds[0];
    const itemResponse = await meliRequest(
      `items/${itemId}?attributes=category_id`
    );
    if (itemResponse.success && itemResponse.data.category_id) {
      console.log(
        `Categoría encontrada para el item ${itemId}: ${itemResponse.data.category_id}`
      );
      return {
        updateOne: {
          filter: { _id: mapping._id },
          update: { $set: { mlCategoryId: itemResponse.data.category_id } },
        },
      };
    } else {
      console.log(
        `No se encontró categoría para el item ${itemId} en el CatalogID ${mapping.mlCatalogId}.`
      );
      return null;
    }
  }

  async addFee() {
    await this.processMappingsInBatch(
      {
        mlCategoryId: { $exists: true, $ne: null },
        $or: [{ mlSaleCommission: null }, { mlSaleCommission: 0 }],
      },
      this.processFeeUpdate.bind(this)
    );
    console.log("Actualización de comisiones completada.");
  }

  async processFeeUpdate(mapping) {
    const categoryId = mapping.mlCategoryId;

    // Verifica si ya tenemos la comisión almacenada en la caché
    if (this.categoryFeeCache[categoryId] !== undefined) {
      console.log(
        `Usando la comisión en caché para CatalogID ${mapping.mlCatalogId} con comisión ${this.categoryFeeCache[categoryId]}`
      );
      return {
        updateOne: {
          filter: { _id: mapping._id },
          update: {
            $set: { mlSaleCommission: this.categoryFeeCache[categoryId] },
          },
        },
      };
    }

    // Si no está en la caché, consulta la API de Mercado Libre
    const feeResponse = await meliRequest(
      `/sites/MLM/listing_prices?price=499&listing_type_id=gold_special&category_id=${categoryId}&attributes=sale_fee_details`
    );

    if (feeResponse.success && feeResponse.data.sale_fee_details) {
      const percentageFee =
        feeResponse.data.sale_fee_details.percentage_fee / 100;

      // Almacena la comisión en la caché
      this.categoryFeeCache[categoryId] = percentageFee;

      console.log(
        `Actualización programada para CatalogID ${mapping.mlCatalogId} con comisión ${percentageFee}`
      );
      return {
        updateOne: {
          filter: { _id: mapping._id },
          update: { $set: { mlSaleCommission: percentageFee } },
        },
      };
    } else {
      console.log(
        `No se pudo obtener la comisión para el mlCatalogId ${mapping.mlCatalogId}.`
      );
      return null;
    }
  }

  async updateShippingCostsDaily() {
    await this.processMappingsInBatch(
      {
        mlCatalogId: { $nin: [null, "no_catalog"] },
        isMatchCorrect: { $ne: false },
        $or: [{ mlShippingCost: null }, { mlShippingCost: 0 }],
      },
      this.processShippingCostUpdate.bind(this)
    );
    console.log("Actualización diaria de costos de envío completada.");
  }

  async updateShippingCostsMonthly() {
    const monthAgo = moment().subtract(1, "months").toDate();
    await this.processMappingsInBatch(
      {
        mlCatalogId: { $nin: [null, "no_catalog"] },
        itemIds: { $ne: null, $not: { $size: 0 } },
        isMatchCorrect: { $ne: false },
        $or: [
          { mlShippingCostsUpdatedAt: { $exists: false } },
          { mlShippingCostsUpdatedAt: { $lte: monthAgo } },
          { mlShippingCostsUpdatedAt: null },
        ],
      },
      this.processShippingCostUpdate.bind(this)
    );
    console.log("Actualización mensual de costos de envío completada.");
  }

  async processShippingCostUpdate(mapping) {
    let shippingCost = 91; // Costo predeterminado

    if (mapping.itemIds && mapping.itemIds.length > 0) {
      for (const itemId of mapping.itemIds) {
        try {
          const shippingOptionsResponse = await meliRequest(
            `/items/${itemId}/shipping_options?zip_code=77533`
          );

          if (
            shippingOptionsResponse.success &&
            shippingOptionsResponse.data.options &&
            shippingOptionsResponse.data.options.length > 0
          ) {
            const standardShippingOption =
              shippingOptionsResponse.data.options.find(
                (option) =>
                  option.name.includes("Estándar") && option.base_cost > 0
              );
            shippingCost = standardShippingOption
              ? standardShippingOption.list_cost
              : 91;
            break;
          } else {
            console.error(
              `Error obteniendo opciones de envío para el item ${itemId}: ${shippingOptionsResponse.error}`
            );
          }
        } catch (error) {
          if (error.status === 400 && error.error === "bad_request") {
            console.warn(`El ItemId ${itemId} no tiene opciones de envío.`);
          } else {
            console.error(
              `Error en la llamada a la API para el item ${itemId}: ${error.message}`
            );
          }
        }
      }
    }

    console.log(
      `Actualización programada para CatalogID ${mapping.mlCatalogId} con costo de envío ${shippingCost}`
    );
    return {
      updateOne: {
        filter: { _id: mapping._id },
        update: {
          $set: {
            mlShippingCost: shippingCost,
            mlShippingCostsUpdatedAt: new Date(),
          },
        },
      },
    };
  }

  async updateTotalVisitsLast30Days() {
    const eightDaysAgo = moment().subtract(8, "days").toDate();

    await this.processMappingsInBatch(
      {
        itemIds: { $ne: null, $not: { $size: 0 } },
        isMatchCorrect: { $ne: false },
        $or: [
          { totalVisitsLast30DaysUpdatedAt: { $lte: eightDaysAgo } },
          { totalVisitsLast30DaysUpdatedAt: { $exists: false } },
          { totalVisitsLast30DaysUpdatedAt: null },
        ],
      },
      this.processTotalVisitsUpdate.bind(this)
    );

    console.log(
      "Actualización de visitas totales de los últimos 30 días completada."
    );
  }

  async processTotalVisitsUpdate(mapping) {
    let totalVisits = 0;
    console.log(
      `Actualizando visitas totales de los últimos 30 días para catalogo Id ${mapping.mlCatalogId}...`
    );
    for (const itemId of mapping.itemIds) {
      await delay(500);
      const visitsResponse = await meliRequest(
        `/items/${itemId}/visits/time_window?last=30&unit=day`
      );
      if (visitsResponse.success) {
        totalVisits += visitsResponse.data.total_visits;
      } else {
        console.error(
          `Error obteniendo visitas para el item ${itemId}: ${visitsResponse.error}`
        );
      }
    }

    console.log(
      `Visitas actualizadas para mlCatalogId ${mapping.mlCatalogId}: ${totalVisits}`
    );
    return {
      updateOne: {
        filter: { _id: mapping._id },
        update: {
          $set: {
            totalVisitsLast30Days: totalVisits,
            totalVisitsLast30DaysUpdatedAt: new Date(),
          },
        },
      },
    };
  }

  async updateAmazonPrice() {
    const twentyFourHoursAgo = moment().subtract(24, "hours").toDate();
    await this.processMappingsInBatch(
      {
        mlCatalogId: { $nin: [null, "no_catalog"] },
        asin: { $ne: null },
        totalVisitsLast30Days: { $gte: 600 },
        isMatchCorrect: { $ne: false },
        $or: [
          { tracking: false },
          { tracking: { $exists: false } }
        ],
        $or: [
          { amazonPriceUpdatedAt: { $lte: twentyFourHoursAgo } },
          { amazonPriceUpdatedAt: null },
          { amazonPriceUpdatedAt: { $exists: false } },
        ],
      },
      this.processAmazonPriceUpdate.bind(this)
    );
    console.log("Actualización de precios de Amazon completada.");
  }
  async updateAmazonPriceTracked() {
    await this.processMappingsInBatch(
      {
        tracking: true,
      },
      this.processAmazonPriceUpdate.bind(this)
    );
    console.log("Actualización de precios de Amazon completada para ASINs con tracking.");
  }

  async processAmazonPriceUpdate(mapping) {
    const asin = mapping.asin;
    const priceResponse = await getAsinPrice(asin);

    let updateFields = {};
    const now = new Date();
    if (
      priceResponse &&
      (priceResponse.Offers || priceResponse.Summary?.BuyBoxPrices)
    ) {
      const filteredBuyBoxPrices =
        priceResponse.Summary?.BuyBoxPrices?.filter((price) =>
          ["A2RIC6EIHFYJ8E", "AVDBXBAVVSXLQ"].includes(price?.sellerId)
        );

      const buyBoxPriceObj = filteredBuyBoxPrices?.reduce(
        (minOffer, price) => {
          let offerPrice = price?.ListingPrice?.Amount || 0;

          if (
            offerPrice > 0 &&
            (!minOffer || offerPrice < minOffer.ListingPrice.Amount)
          ) {
            return price;
          }

          return minOffer;
        },
        null
      );

      const buyBoxPrice = buyBoxPriceObj?.ListingPrice?.Amount;

      const allOffers = [...(priceResponse.Offers || [])];

      if (buyBoxPrice) {
        allOffers.push({
          ListingPrice: { Amount: buyBoxPrice },
          SellerId: buyBoxPriceObj.sellerId,
        });
      }

      const filteredOffers = allOffers.filter((offer) =>
        ["A2RIC6EIHFYJ8E", "AVDBXBAVVSXLQ"].includes(offer.SellerId)
      );

      let amazonOffer = filteredOffers.reduce((minOffer, offer) => {
        let offerPrice = 0;
        if (offer.ListingPrice && offer.ListingPrice.Amount > 0) {
          offerPrice = offer.ListingPrice.Amount;
        } else if (
          offer.quantityDiscountPrices &&
          offer.quantityDiscountPrices.length > 0
        ) {
          offerPrice = offer.quantityDiscountPrices[0].price.Amount;
        }

        if (offerPrice > 0 && (!minOffer || offerPrice < minOffer.price)) {
          return { offer, price: offerPrice };
        }

        return minOffer;
      }, null);

      if (amazonOffer) {
        const amazonPrice = amazonOffer.price;
        console.log(`Precio de Amazon para ASIN ${asin} es ${amazonPrice}`);
        updateFields.amazonPrice = amazonPrice;
        updateFields.amazonPriceUpdatedAt = now;

        if (amazonPrice <= 0) {
          updateFields.estimatedProfit = 0;
        }
      } else {
        console.log(
          `No se encontró oferta de Amazon válida para el ASIN ${asin}. Se guardará el precio como 0.`
        );
        updateFields = {
          amazonPrice: 0,
          estimatedProfit: 0,
          amazonPriceUpdatedAt: now,
        };
      }
    } else {
      console.log(
        `No se obtuvieron ofertas para el ASIN ${asin}. Se guardará el precio como 0.`
      );
      updateFields = {
        amazonPrice: 0,
        estimatedProfit: 0,
        amazonPriceUpdatedAt: now,
      };
    }

    return {
      updateOne: {
        filter: { _id: mapping._id },
        update: { $set: updateFields },
      },
    };
  }

  async calculateProfit() {
    await this.processMappingsInBatch(
      {
        mlCatalogId: { $nin: [null, "no_catalog"] },
        isMatchCorrect: { $ne: false },
        amazonPrice: { $gt: 0 },
      },
      this.processProfitCalculation.bind(this)
    );

    console.log("Actualización de ganancias estimadas completada.");
  }
  async calculateTrackingProfit() {
    await this.processMappingsInBatch(
      {
      tracking:true
      },
      this.processProfitCalculation.bind(this)
    );

    console.log("Actualización de ganancias estimadas completada.");
  }
  async processProfitCalculation(mapping) {
    let estimatedProfit;

    if (mapping.amazonPrice === 0) {
      estimatedProfit = 0;
    } else if (mapping.firstListingPrice === 0) {
      estimatedProfit = 200;
    } else {
      estimatedProfit =
        mapping.firstListingPrice -
        mapping.amazonPrice -
        (mapping.mlShippingCost || 91) -
        mapping.firstListingPrice * (mapping.mlSaleCommission || 0.15);
    }

    console.log(
      `Estimación de ganancia para ASIN ${mapping.asin}: ${estimatedProfit}`
    );
    return {
      updateOne: {
        filter: { _id: mapping._id },
        update: { $set: { estimatedProfit } },
      },
    };
  }

  async uploadDataToSheet() {
    const spreadsheetId = "1F8v5JpQ-pXJ7-XyHcbHpI0whCtMo3sJSLbc95ebRoKA";
    const range = "Keepa";

    const mappings = await AsinCatalogMapping.find({
      mlCatalogId: { $nin: [null, "no_catalog"] },
      isMatchCorrect: { $ne: false },
      amazonPrice: { $gt: 0 },
      estimatedProfit: { $gt: 70 },
      totalVisitsLast30Days: { $gte: 600 },
      $or: [
        { tracking: false },
        { tracking: { $exists: false } }
      ]
    }).sort({ estimatedProfit: -1 });

    const values = mappings.map((mapping) => [
      `=HYPERLINK("https://www.amazon.com.mx/dp/${mapping.asin}?th=1&psc=1", "${mapping.asin}")`,
      mapping.mlCatalogId
        ? `=HYPERLINK("https://www.mercadolibre.com.mx/p/${mapping.mlCatalogId}/s", "${mapping.mlCatalogId}")`
        : "",
      mapping.image ? `=IMAGE("${mapping.image}")` : "",
      mapping.title,
      mapping.amazonPrice,
      mapping.firstListingPrice,
      mapping.averagePriceLast30Days,
      mapping.averagePriceLast90Days,
      mapping.averagePriceLast180Days,
      mapping.totalVisitsLast30Days,
      mapping.mlSaleCommission,
      mapping.mlShippingCost,
      mapping.estimatedProfit,
      mapping.priceHistory.length,
    ]);
    console.log(values)
    await clearSheet(spreadsheetId, `${range}!A2:N`);
    await updateSheet(spreadsheetId, `${range}!A2:N`, values);

    console.log("Datos subidos correctamente a Google Sheets.");
  }

  async updateNoCatalogToNull() {
    try {
      const result = await AsinCatalogMapping.updateMany(
        { mlCatalogId: "no_catalog" },
        { $set: { mlCatalogId: null } }
      );
      console.log(`${result.nModified} documentos actualizados.`);
    } catch (error) {
      console.error("Error actualizando documentos:", error);
    }
  }

  async addIsMatchCorrectField() {
    try {
      const result = await AsinCatalogMapping.updateMany(
        { isMatchCorrect: { $exists: false } },
        { $set: { isMatchCorrect: true } }
      );
      console.log(`Documentos actualizados: ${result.modifiedCount}`);
    } catch (error) {
      console.error("Error al actualizar documentos:", error);
    }
  }

  async updateIsMatchCorrectFromSheet() {
    const spreadsheetId = "1F8v5JpQ-pXJ7-XyHcbHpI0whCtMo3sJSLbc95ebRoKA";
    const sheetName = "MatcheoIncorrecto";
    const range = "A2:A";

    try {
      const asins = await readSheet(spreadsheetId, `${sheetName}!${range}`);

      if (!asins || asins.length === 0) {
        console.log("No se encontraron ASINs para actualizar.");
        return;
      }

      const asinList = asins.flat().filter((asin) => asin);

      console.log(`Se encontraron ${asinList.length} ASINs para actualizar.`);

      const updateResult = await AsinCatalogMapping.updateMany(
        { asin: { $in: asinList } },
        { $set: { isMatchCorrect: false } }
      );

      console.log(`Documentos actualizados: ${updateResult.modifiedCount}`);

      await clearSheet(spreadsheetId, `${sheetName}!${range}`);
      console.log("Valores borrados de la hoja de cálculo.");
    } catch (error) {
      console.error("Error en updateIsMatchCorrectFromSheet:", error);
    }
  }

  // Método general para procesar mappings en lotes
  async processMappingsInBatch(queryFilter, processFunction, batchSize = 200) {
    console.log(JSON.stringify(queryFilter));
    let lastId = null;
    let proceed = true;

    while (proceed) {
      const query = AsinCatalogMapping.find(queryFilter)
        .sort({ _id: 1 })
        .limit(batchSize)
        .lean();

      if (lastId) {
        query.where("_id").gt(lastId);
      }

      const mappings = await query.exec();

      if (mappings.length === 0) {
        proceed = false;
        break;
      }

      const bulkOps = (
        await Bluebird.map(mappings, processFunction, { concurrency: 5 })
      ).filter((op) => op != null);

      if (bulkOps.length > 0) {
        console.log(
          `Ejecutando operaciones en lote para ${bulkOps.length} mappings.`
        );
        await AsinCatalogMapping.bulkWrite(bulkOps);
      }

      lastId = mappings[mappings.length - 1]._id;
      proceed = mappings.length === batchSize;
    }
  }

  async updateTrackingFromSheet() {
    try {
      const spreadsheetId = "1PKFCSNVsRR8wM6mOeckoJUYGqKrZ9oWrbvSf_7FHLD8";
      const range = "Lista!D2:D";

      // Leer los ASINs de la hoja de cálculo
      const asinsFromSheet = await readSheet(spreadsheetId, range);
      
      // Aplanar el array y filtrar valores vacíos
      const asinsToTrack = asinsFromSheet ? asinsFromSheet.flat().filter(asin => asin) : [];

      console.log(`Se encontraron ${asinsToTrack.length} ASINs en la hoja de cálculo.`);

      // Obtener todos los ASINs con su estado de tracking actual
      const currentTracking = await AsinCatalogMapping.find({}, { asin: 1, tracking: 1 }).lean();
      
      const currentTrackingMap = new Map(currentTracking.map(item => [item.asin, item.tracking]));

      const asinsToUpdate = [];
      const asinsToUntrack = [];

      asinsToTrack.forEach(asin => {
        if (!currentTrackingMap.has(asin) || currentTrackingMap.get(asin) !== true) {
          asinsToUpdate.push(asin);
        }
      });

      currentTrackingMap.forEach((tracking, asin) => {
        if (tracking === true && !asinsToTrack.includes(asin)) {
          asinsToUntrack.push(asin);
        }
      });

      // Actualizar a true los ASINs que lo necesitan
      if (asinsToUpdate.length > 0) {
        const updateResultTrue = await AsinCatalogMapping.updateMany(
          { asin: { $in: asinsToUpdate } },
          { $set: { tracking: true } }
        );
        console.log(`Se actualizaron ${updateResultTrue.modifiedCount} documentos a tracking true.`);
      }

      // Actualizar a false los ASINs que ya no están en la lista
      if (asinsToUntrack.length > 0) {
        const updateResultFalse = await AsinCatalogMapping.updateMany(
          { asin: { $in: asinsToUntrack } },
          { $set: { tracking: false } }
        );
        console.log(`Se actualizaron ${updateResultFalse.modifiedCount} documentos a tracking false.`);
      }

      console.log(`Total de ASINs procesados: ${asinsToUpdate.length + asinsToUntrack.length}`);

    } catch (error) {
      console.error("Error en updateTrackingFromSheet:", error);
    }
  }

  async triggerGoogleScriptUpdate() {
    const url = 'https://script.google.com/macros/s/AKfycbwE-weaNxzB8oKFDHoXAUEY-rEhAofpD400eGixM33lid2RgkU9EJcb9VON5d1CGMBv/exec';

    try {
      const response = await axios.post(url);
      console.log('Google Script update triggered successfully');
      console.log('Response:', response.data);
    } catch (error) {
      console.error('Error triggering Google Script update:', error.message);
    }
  }
}

module.exports = new AsinCatalogProcessor();
