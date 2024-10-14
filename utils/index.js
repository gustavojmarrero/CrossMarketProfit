// ./utils/index.js
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

const isValidUPC = (upc) =>{
    if (typeof upc !== 'string') {
        console.log('El UPC debe ser una cadena de texto.');
        return false;
    }
    // Para UPC-A (12 dígitos) o EAN-13 (13 dígitos)
    if (upc.length !== 12 && upc.length !== 13) {
        console.log('El UPC debe tener 12 o 13 dígitos.');
        return false;
    }
    return true;
}

const chunkArray = (arr, chunkSize) => {
    let result = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        result.push(arr.slice(i, i + chunkSize));
    }
    return result;
};

const formatNumber =(n)=> {
    // format number 1000000 to 1,234,567
    return n.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  const formatCurrency = (input, currency, blur)=>{
    // appends $ to value, validates decimal side
    // and puts cursor back in right position.
    // get input value
    var input_val = input.value;
    // don't validate empty input
    if (input_val === "") {
      return;
    }

    // original length
    var original_len = input_val.length;

    // initial caret position
    var caret_pos = input.selectionStart;

    // check for decimal
    if (input_val.indexOf(".") >= 0) {
      // get position of first decimal
      // this prevents multiple decimals from
      // being entered
      var decimal_pos = input_val.indexOf(".");

      // split number by decimal point
      var left_side = input_val.substring(0, decimal_pos);
      var right_side = input_val.substring(decimal_pos);

      // add commas to left side of number
      left_side = formatNumber(left_side);

      // validate right side
      right_side = formatNumber(right_side);

      // On blur make sure 2 numbers after decimal
      if (blur === "blur") {
        right_side += "00";
      }

      // Limit decimal to only 2 digits
      right_side = right_side.substring(0, 2);

      // join number by .
      input_val = currency + left_side + "." + right_side;
    } else {
      // no decimal entered
      // add commas to number
      // remove all non-digits
      input_val = formatNumber(input_val);
      input_val = currency + input_val;

      // final formatting
      if (blur === "blur") {
        input_val += ".00";
      }
    }

    // send updated string to input
    input.value = input_val;

    // put caret back in the right position
    var updated_len = input_val.length;
    caret_pos = updated_len - original_len + caret_pos;
    input.setSelectionRange(caret_pos, caret_pos);
  }
  const retryOnFail = async (
    func,
    maxRetries = 5,
    initialDelay = 20000
  ) => {
    let delay = initialDelay;
  
    for (let i = 0; i < maxRetries; i++) {
      console.log(`Retrying ${i + 1} of ${maxRetries}...`);
      const result = await func();
  
      if (result.success) {
        return result;
      } else if (result.error === 'Too many requests' || result.error === 'too_many_requests') {
        console.log('Received 429 Too Many Requests, waiting before retrying...');
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2; // Incrementa el retraso exponencialmente
      } else {
        console.error(`Error in retryOnFail: ${result.error}`);
        if (i === maxRetries - 1) throw new Error(result.error);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  };
  const roundToTwoDecimal = (num) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  };

// Ruta del archivo JSON
const counterFilePath = path.join(__dirname, '../data/callCounter.json');

// Leer el archivo JSON con manejo de archivo vacío
const readCallCounter = () => {
  try {
    const data = fs.readFileSync(counterFilePath, 'utf-8');
    
    // Si el archivo está vacío, retorna un array vacío
    if (!data || data.trim() === '') {
      console.log("Archivo JSON vacío, inicializando...");
      return [];
    }

    return JSON.parse(data); // Intenta parsear el contenido del archivo
  } catch (error) {
    console.error('Error al leer el contador de llamadas o archivo malformado:', error);
    return []; // Retorna un array vacío si el archivo no existe o está malformado
  }
};

// Escribir el archivo JSON
const writeCallCounter = (counterData) => {
  try {
    fs.writeFileSync(counterFilePath, JSON.stringify(counterData, null, 2));
  } catch (error) {
    console.error('Error al escribir el contador de llamadas:', error);
  }
};

// Actualizar el contador
const updateCallCounter = () => {
  const currentDate = moment().format('YYYY-MM-DD');
  let counterData = readCallCounter();
  
  // Verifica si ya hay un registro para el día actual
  const todayEntry = counterData.find(entry => entry.day === currentDate);
  
  if (todayEntry) {
    // Incrementa el contador si ya existe una entrada para hoy
    todayEntry.count += 1;
  } else {
    // Crea una nueva entrada para hoy si no existe
    counterData.push({
      day: currentDate,
      count: 1
    });
  }

  // Escribe los datos actualizados en el archivo JSON
  writeCallCounter(counterData);
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
module.exports = {
    isValidUPC,
    chunkArray,
    formatCurrency,
    retryOnFail,
    roundToTwoDecimal,
    updateCallCounter,
    delay
};