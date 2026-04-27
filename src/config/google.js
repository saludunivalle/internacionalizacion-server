const { google } = require('googleapis');
require('dotenv').config();

const GOOGLE_SHEETS_SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];

function getServiceAccountCredentials() {
	if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
		return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
	}
	if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
		return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
	}

	return {
		client_email:
			process.env.GOOGLE_CLIENT_EMAIL ||
			process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
			process.env.client_email,
		private_key: process.env.GOOGLE_PRIVATE_KEY || process.env.private_key,
		project_id: process.env.GOOGLE_PROJECT_ID || process.env.project_id,
	};
}

function normalizePrivateKey(rawKey) {
	if (!rawKey) {
		return '';
	}

	return String(rawKey)
		.replace(/^['"]|['"]$/g, '')
		.replace(/\\n/g, '\n')
		.trim();
}

const credentials = getServiceAccountCredentials();
const clientEmail = credentials.client_email;
const privateKey = normalizePrivateKey(credentials.private_key);

if (!clientEmail || !privateKey) {
	throw new Error(
		'Faltan variables de entorno para la cuenta de servicio de Google (client_email/private_key).'
	);
}

const jwtClient = new google.auth.JWT({
	email: clientEmail,
	key: privateKey,
	scopes: GOOGLE_SHEETS_SCOPE,
});

let authPromise;

async function ensureGoogleJwtAuth() {
	if (!authPromise) {
		authPromise = jwtClient.authorize();
	}

	try {
		const tokens = await authPromise;
		if (tokens?.access_token) {
			jwtClient.setCredentials({ access_token: tokens.access_token });
		}
		return tokens;
	} catch (error) {
		authPromise = undefined;
		throw error;
	}
}

module.exports = {
	jwtClient,
	ensureGoogleJwtAuth,
};
