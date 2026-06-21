const { withInfoPlist } = require("expo/config-plugins");

/**
 * Developer Mode (DAT): Meta exige que el bloque MWDAT del Info.plist NO lleve
 * credenciales (MetaAppID / TeamID / ClientToken). Si están presentes, la Meta AI
 * app intenta la validación de PRODUCCIÓN (app attestation / Universal Link) y
 * falla con "Error interno / No se pudo completar la operación".
 *
 * Este plugin corre DESPUÉS de expo-meta-wearables-dat y borra esas tres llaves,
 * dejando solo `AppLinkURLScheme` (necesario para que el deeplink regrese a la app).
 *
 * Para PRODUCCIÓN (Developer Mode OFF + app registrada con Universal Link),
 * quita este plugin de app.config.ts para volver a incluir las credenciales.
 */
module.exports = function withDevModeMwdat(config) {
  return withInfoPlist(config, (cfg) => {
    const mwdat = cfg.modResults.MWDAT;
    if (mwdat && typeof mwdat === "object") {
      delete mwdat.MetaAppID;
      delete mwdat.TeamID;
      delete mwdat.ClientToken;
    }
    return cfg;
  });
};
