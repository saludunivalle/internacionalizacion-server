const { google } = require('googleapis');
const { sheetRanges } = require('../config/sheetRanges');
const { jwtClient, ensureGoogleJwtAuth } = require('../config/google');
require('dotenv').config();

function sheetValuesToObject(values = []) {
  if (!values.length) {
    return [];
  }

  const [headers, ...rows] = values;
  if (!headers || !headers.length) {
    return [];
  }

  return rows.map((row) => {
    return headers.reduce((rowObject, header, index) => {
      rowObject[header] = row[index] ?? '';
      return rowObject;
    }, {});
  });
}

async function getSheetsClient() {
  await ensureGoogleJwtAuth();
  return google.sheets({ version: 'v4', auth: jwtClient });
}

function buildRange(sheetName, range) {
  if (range.includes('!')) {
    return range;
  }

  return `${sheetName}!${range}`;
}

const SHEET_COLUMNS = {
  USUARIOS: {
    id: 0,
    correo: 1,
    nombres: 2,
    apellidos: 3,
    rol: 4,
  },
  REGISTROS: {
    id: 0,
    timestamp: 1,
    id_usuario: 2,
    id_etapa: 3,
    observacion: 4,
    aprobado: 5,
    url: 6,
  },
  SOLICITUDES: {
    id: 0,
    id_usuario: 1,
    etapa_actual: 2,
    fecha: 3,
  },
  CONVENIOS_ETAPAS: {
    id: 0,
    nombre: 1,
    actor: 2,
    tiempo_max: 3,
    orden: 4,
  },
};

function columnIndexToLetter(index) {
  let result = '';
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

async function getSheetRows(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!${sheetRanges[sheetName]}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}

function findRowNumber(rows, predicate) {
  const dataRows = rows.slice(1);
  const index = dataRows.findIndex(predicate);

  return index === -1 ? -1 : index + 2;
}

const getAllSheetsData = async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.spreadsheet;

    const dataPromises = Object.entries(sheetRanges).map(async ([sheetName, range]) => {
      const fullRange = `${sheetName}!${range}`;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullRange,
      });
      return { [sheetName]: response.data.values };
    });

    const allDataArray = await Promise.all(dataPromises);
    const allData = Object.assign({}, ...allDataArray);
    const allDataWithObjects = {};

    for (const [sheetName, values] of Object.entries(allData)) {
      allDataWithObjects[sheetName] = sheetValuesToObject(values);
    }

    return res.status(200).json({ status: true, data: allDataWithObjects });
  } catch (error) {
    console.error('Error obteniendo datos de todas las hojas:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

const getMySolicitudes = async (req, res) => {
  try {
    const userEmail = (req.user?.email || '').toLowerCase();
    if (!userEmail) {
      return res.status(401).json({ status: false, message: 'Usuario no autenticado.' });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.spreadsheet;
    const range = `SOLICITUDES!${sheetRanges.SOLICITUDES}`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];
    if (!rows.length) {
      return res.status(200).json({ status: true, data: [] });
    }

    const [headers, ...dataRows] = rows;
    const lowerHeaders = headers.map((header) => String(header).toLowerCase());
    const candidateColumns = ['email', 'correo', 'correo_usuario', 'usuario_email'];
    const emailIndex = lowerHeaders.findIndex((header) => candidateColumns.includes(header));

    if (emailIndex === -1) {
      return res.status(400).json({
        status: false,
        message: 'La hoja SOLICITUDES no tiene una columna de email/correo.',
      });
    }

    const filteredRows = dataRows.filter((row) => {
      return String(row[emailIndex] || '').toLowerCase() === userEmail;
    });

    const values = [headers, ...filteredRows];
    return res.status(200).json({ status: true, data: sheetValuesToObject(values) });
  } catch (error) {
    console.error('Error obteniendo solicitudes del usuario:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

const updateSheetData = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { range, values, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!sheetRanges[sheetName]) {
      return res.status(400).json({
        status: false,
        message: `Hoja invalida. Opciones: ${Object.keys(sheetRanges).join(', ')}`,
      });
    }

    if (!range || typeof range !== 'string') {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar range en el body, por ejemplo A2:C2.',
      });
    }

    if (!Array.isArray(values) || !values.every(Array.isArray)) {
      return res.status(400).json({
        status: false,
        message: 'values debe ser una matriz bidimensional. Ej: [["dato1", "dato2"]].',
      });
    }

    const sheets = await getSheetsClient();
    const fullRange = buildRange(sheetName, range);

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: fullRange,
      valueInputOption,
      requestBody: { values },
    });

    return res.status(200).json({
      status: true,
      message: 'Datos actualizados correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error actualizando datos en la hoja:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

const appendSheetRow = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { values, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!sheetRanges[sheetName]) {
      return res.status(400).json({
        status: false,
        message: `Hoja invalida. Opciones: ${Object.keys(sheetRanges).join(', ')}`,
      });
    }

    if (!Array.isArray(values)) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar values como arreglo.',
      });
    }

    const normalizedValues = Array.isArray(values[0]) ? values : [values];

    if (Number.isInteger(req.body.userEmailColumnIndex) && req.user?.email) {
      const emailColumnIndex = req.body.userEmailColumnIndex;
      normalizedValues.forEach((row) => {
        row[emailColumnIndex] = req.user.email;
      });
    }

    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption,
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: normalizedValues },
    });

    return res.status(201).json({
      status: true,
      message: 'Fila agregada correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error agregando fila en la hoja:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};


const updateRegistroAprobado = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = 'REGISTROS';
    const { idSolicitud, idEtapa } = req.params;
    const { aprobado, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!idSolicitud || !idEtapa) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar idSolicitud e idEtapa en la ruta.',
      });
    }

    if (aprobado === undefined) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar aprobado en el body.',
      });
    }

    const sheets = await getSheetsClient();
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);

    if (!rows.length) {
      return res.status(404).json({
        status: false,
        message: 'La hoja REGISTROS no tiene datos.',
      });
    }

    const rowNumber = findRowNumber(rows, (row) => {
      return String(row[SHEET_COLUMNS.REGISTROS.id] || '') === String(idSolicitud) &&
        String(row[SHEET_COLUMNS.REGISTROS.id_etapa] || '') === String(idEtapa);
    });

    if (rowNumber === -1) {
      return res.status(404).json({
        status: false,
        message: 'No se encontro el registro con idSolicitud y idEtapa.',
      });
    }

    const columnLetter = columnIndexToLetter(SHEET_COLUMNS.REGISTROS.aprobado);
    const range = `${sheetName}!${columnLetter}${rowNumber}`;

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values: [[aprobado]] },
    });

    return res.status(200).json({
      status: true,
      message: 'Registro actualizado correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error actualizando aprobado en REGISTROS:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

const updateRegistroObservacion = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = 'REGISTROS';
    const { idSolicitud, idEtapa } = req.params;
    const { observacion, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!idSolicitud || !idEtapa) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar idSolicitud e idEtapa en la ruta.',
      });
    }

    if (observacion === undefined) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar observacion en el body.',
      });
    }

    const sheets = await getSheetsClient();
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);

    if (!rows.length) {
      return res.status(404).json({
        status: false,
        message: 'La hoja REGISTROS no tiene datos.',
      });
    }

    const rowNumber = findRowNumber(rows, (row) => {
      return String(row[SHEET_COLUMNS.REGISTROS.id] || '') === String(idSolicitud) &&
        String(row[SHEET_COLUMNS.REGISTROS.id_etapa] || '') === String(idEtapa);
    });

    if (rowNumber === -1) {
      return res.status(404).json({
        status: false,
        message: 'No se encontro el registro con idSolicitud y idEtapa.',
      });
    }

    const columnLetter = columnIndexToLetter(SHEET_COLUMNS.REGISTROS.observacion);
    const range = `${sheetName}!${columnLetter}${rowNumber}`;

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values: [[observacion]] },
    });

    return res.status(200).json({
      status: true,
      message: 'Observacion actualizada correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error actualizando observacion en REGISTROS:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

const updateRegistroUrl = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = 'REGISTROS';
    const { idSolicitud, idEtapa } = req.params;
    const { url, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!idSolicitud || !idEtapa) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar idSolicitud e idEtapa en la ruta.',
      });
    }

    if (url === undefined) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar url en el body.',
      });
    }

    const sheets = await getSheetsClient();
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);

    if (!rows.length) {
      return res.status(404).json({
        status: false,
        message: 'La hoja REGISTROS no tiene datos.',
      });
    }

    const rowNumber = findRowNumber(rows, (row) => {
      return String(row[SHEET_COLUMNS.REGISTROS.id] || '') === String(idSolicitud) &&
        String(row[SHEET_COLUMNS.REGISTROS.id_etapa] || '') === String(idEtapa);
    });

    if (rowNumber === -1) {
      return res.status(404).json({
        status: false,
        message: 'No se encontro el registro con idSolicitud y idEtapa.',
      });
    }

    const columnLetter = columnIndexToLetter(SHEET_COLUMNS.REGISTROS.url);
    const range = `${sheetName}!${columnLetter}${rowNumber}`;

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values: [[url]] },
    });

    return res.status(200).json({
      status: true,
      message: 'URL actualizada correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error actualizando url en REGISTROS:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

const updateSolicitudEtapa = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = 'SOLICITUDES';
    const { idSolicitud } = req.params;
    const { etapa_actual, fecha, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!idSolicitud) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar idSolicitud en la ruta.',
      });
    }

    if (etapa_actual === undefined && !fecha) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar etapa_actual y/o fecha en el body.',
      });
    }

    const sheets = await getSheetsClient();
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);

    if (!rows.length) {
      return res.status(404).json({
        status: false,
        message: 'La hoja SOLICITUDES no tiene datos.',
      });
    }

    const rowNumber = findRowNumber(rows, (row) => {
      return String(row[SHEET_COLUMNS.SOLICITUDES.id] || '') === String(idSolicitud);
    });

    if (rowNumber === -1) {
      return res.status(404).json({
        status: false,
        message: 'No se encontro la solicitud con el id enviado.',
      });
    }

    const updates = [];

    if (etapa_actual !== undefined) {
      const columnLetter = columnIndexToLetter(SHEET_COLUMNS.SOLICITUDES.etapa_actual);
      updates.push({
        range: `${sheetName}!${columnLetter}${rowNumber}`,
        values: [[etapa_actual]],
      });
    }

    if (fecha) {
      const columnLetter = columnIndexToLetter(SHEET_COLUMNS.SOLICITUDES.fecha);
      updates.push({
        range: `${sheetName}!${columnLetter}${rowNumber}`,
        values: [[fecha]],
      });
    }

    if (updates.length === 1) {
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updates[0].range,
        valueInputOption,
        requestBody: { values: updates[0].values },
      });

      return res.status(200).json({
        status: true,
        message: 'Solicitud actualizada correctamente.',
        data: response.data,
      });
    }

    const response = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption,
        data: updates,
      },
    });

    return res.status(200).json({
      status: true,
      message: 'Solicitud actualizada correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error actualizando SOLICITUDES:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

module.exports = {
  getAllSheetsData,
  getMySolicitudes,
  updateRegistroAprobado,
  updateRegistroObservacion,
  updateRegistroUrl,
  updateSolicitudEtapa,
  updateSheetData,
  appendSheetRow,
};

