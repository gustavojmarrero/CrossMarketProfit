// ./services/amazonService.js

const spClient = require("../config/amazonConfig");

const getAsinPrice = async (asin) => {
// Pendiente incluir promociones
// Planea y Ahorra
// Súper 5% extra
// Súper ahorra 5%

  try {
    const params = {
      endpoint: "productPricing",
      operation: "getItemOffers",
      query: {
        MarketplaceId: "A1AM78C64UM0Y8",
        ItemCondition: "New",
        CustomerType: "Business",
      },
      path: {
        Asin: asin,
      },
    };

    const results = await spClient.callAPI(params);
   // console.log(JSON.stringify(results, null, 2));
    return results;
  } catch (error) {
    console.log(error);
  }
};

const getAsinDetails = async (asin) => {
  try {
    const params = {
      method: "GET",
      api_path: "/catalog/2022-04-01/items",
      query: {
        marketplaceIds: "A1AM78C64UM0Y8",
        includedData: ["identifiers", "attributes", "images"],
        identifiersType: ["ASIN"],
        identifiers: [asin],
      },
    };

    const results = await spClient.callAPI(params);
    // console.log(JSON.stringify(results, null, 2));
    if (results.numberOfResults > 0 && results.items.length > 0) {
      const item = results.items[0];

      // Extract unique identifiers
      const identifiers = item.identifiers.flatMap((marketplace) =>
        marketplace.identifiers
          .filter((identifier) =>
            ["GTIN", "EAN", "UPC"].includes(identifier.identifierType)
          )
          .map((identifier) => identifier.identifier)
      );
      const uniqueIdentifiers = [...new Set(identifiers)];

      // Get title
      const title =
        item.attributes?.item_name?.find(
          (name) => name.language_tag === "es_MX"
        )?.value || "Sin título";

      // Get image
      const image = item.images?.[0]?.images?.[0]?.link || null;
      //  console.log(JSON.stringify({ uniqueIdentifiers, title, image }, null, 2));
      return { uniqueIdentifiers, title, image };
    } else {
      console.log("No se encontraron detalles para el ASIN proporcionado.");
      return { uniqueIdentifiers: [], title: "Sin título", image: null };
    }
  } catch (error) {
    console.error("Error al obtener los detalles por ASIN:", error);
    return { uniqueIdentifiers: [], title: "Sin título", image: null };
  }
};






module.exports = {
  getAsinPrice,
  getAsinDetails,
};
