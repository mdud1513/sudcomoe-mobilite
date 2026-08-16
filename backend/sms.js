// Ce module envoie de vrais SMS une fois un fournisseur configuré via les variables d'environnement.
// Tant que SMS_PROVIDER n'est pas défini, les messages sont simplement journalisés (utile pour tester
// tout le circuit OTP sans dépenser un centime, et pour le développement local).
//
// Pour brancher un vrai fournisseur en Côte d'Ivoire :
//  - Orange SMS API (developer.orange.com/apis/sms-ci) — payable en crédit/Orange Money de la SIM
//  - SMS Partner (smspartner.africa) — offre des crédits gratuits pour démarrer
// Une fois un compte créé, définissez SMS_PROVIDER + les identifiants associés sur Render, et complétez
// la fonction envoyerViaFournisseur() ci-dessous avec l'appel HTTP réel du fournisseur choisi.

export async function envoyerSMS(telephone, message) {
  const fournisseur = process.env.SMS_PROVIDER;
  if (!fournisseur) {
    console.warn(`[SMS] Aucun fournisseur configuré (SMS_PROVIDER absent) — message NON envoyé.`);
    console.warn(`[SMS] Aurait été envoyé à ${telephone} : "${message}"`);
    return { envoye: false, raison: "aucun_fournisseur" };
  }
  try {
    return await envoyerViaFournisseur(fournisseur, telephone, message);
  } catch (err) {
    console.error(`[SMS] Échec d'envoi vers ${telephone} via ${fournisseur} :`, err.message);
    return { envoye: false, raison: "erreur_envoi" };
  }
}

async function envoyerViaFournisseur(fournisseur, telephone, message) {
  // TODO : implémenter l'appel réel une fois le fournisseur choisi et les identifiants obtenus.
  throw new Error(`Fournisseur SMS "${fournisseur}" non implémenté.`);
}
