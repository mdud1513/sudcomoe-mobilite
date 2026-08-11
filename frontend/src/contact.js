// Formate un numéro local (ex. "07 00 00 00 00") en format international pour tel: et wa.me
export function versNumeroInternational(telephone) {
  const chiffres = (telephone || "").replace(/\D/g, "");
  if (!chiffres) return "";
  if (chiffres.startsWith("225")) return chiffres;
  return `225${chiffres.replace(/^0/, "")}`;
}

export function lienAppel(telephone) {
  return `tel:+${versNumeroInternational(telephone)}`;
}

export function lienWhatsApp(telephone, message = "") {
  const numero = versNumeroInternational(telephone);
  const texte = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${numero}${texte}`;
}
