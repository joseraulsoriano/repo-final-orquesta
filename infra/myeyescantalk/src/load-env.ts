/**
 * Carga las variables de entorno una sola vez, como side-effect del import.
 * Importa ESTE módulo primero (antes que cualquier otro que lea process.env).
 * .env.local gana sobre .env (dotenv no sobreescribe vars ya definidas).
 */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
