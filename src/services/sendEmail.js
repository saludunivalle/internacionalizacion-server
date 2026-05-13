const nodemailer = require('nodemailer');
require('dotenv').config();

let cachedTransporter;

function getTransporter() {
	if (cachedTransporter) {
		return cachedTransporter;
	}

	if (!process.env.EMAIL || !process.env.EMAIL_PASSWORD) {
		throw new Error('Faltan variables EMAIL y/o EMAIL_PASSWORD en el entorno.');
	}

	cachedTransporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: process.env.EMAIL,
			pass: process.env.EMAIL_PASSWORD,
		},
	});

	return cachedTransporter;
}

async function sendEmail({ to, subject, text, html }) {
	const transporter = getTransporter();

	return transporter.sendMail({
		from: process.env.EMAIL,
		to,
		subject,
		text,
		html,
	});
}

function buildSolicitudEmail({ solicitudId, userEmail, proceso, actividad, fechaHora }) {
	const safeSolicitudId = solicitudId ? `#${solicitudId}` : '';
	const subject = safeSolicitudId
		? `Solicitud ${safeSolicitudId} - Nueva solicitud registrada`
		: 'Nueva solicitud registrada';
	const safeUserEmail = userEmail || 'No informado';
	const safeProceso = proceso || 'No informado';
	const safeActividad = actividad || 'No informado';
	const safeFechaHora = fechaHora || 'No informada';
	const solicitudLabel = safeSolicitudId || 'No informada';

	const text = [
		`Solicitud: ${solicitudLabel}`,
		`El usuario ${safeUserEmail} creó una solicitud de una actividad.`,
		`Proceso: ${safeProceso}`,
		`Actividad: ${safeActividad}`,
		`Fecha y hora: ${safeFechaHora}`,
	].join('\n');

	const html = [
		`<p><strong>Solicitud:</strong> ${solicitudLabel}</p>`,
		`<p>El usuario <strong>${safeUserEmail}</strong> creó una solicitud de una actividad.</p>`,
		`<p><strong>Proceso:</strong> ${safeProceso}</p>`,
		`<p><strong>Actividad:</strong> ${safeActividad}</p>`,
		`<p><strong>Fecha y hora:</strong> ${safeFechaHora}</p>`,
	].join('');

	return { subject, text, html };
}

async function sendSolicitudNotification({ solicitudId, userEmail, proceso, actividad, fechaHora }) {
	const recipient = 'fsalud.siac@correounivalle.edu.co';
	const { subject, text, html } = buildSolicitudEmail({
		solicitudId,
		userEmail,
		proceso,
		actividad,
		fechaHora,
	});

	return sendEmail({ to: recipient, subject, text, html });
}

module.exports = {
	sendEmail,
	sendSolicitudNotification,
};
