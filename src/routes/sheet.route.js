const express = require('express');
const {
	getAllSheetsData,
	getMySolicitudes,
	updateRegistroAprobado,
	updateRegistroObservacion,
	updateRegistroUrl,
	updateSolicitudEtapa,
	updateSheetData,
	appendSheetRow,
} = require('../controllers/sheetsController');

const router = express.Router();

router.get('/', getAllSheetsData);
router.get('/solicitudes/mias', getMySolicitudes);
router.patch('/registros/:idSolicitud/etapas/:idEtapa/aprobado', updateRegistroAprobado);
router.patch('/registros/:idSolicitud/etapas/:idEtapa/observacion', updateRegistroObservacion);
router.patch('/registros/:idSolicitud/etapas/:idEtapa/url', updateRegistroUrl);
router.patch('/solicitudes/:idSolicitud/etapa', updateSolicitudEtapa);
router.put('/:sheetName', updateSheetData);
router.post('/:sheetName/rows', appendSheetRow);

module.exports = router;
