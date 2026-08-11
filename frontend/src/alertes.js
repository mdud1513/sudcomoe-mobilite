// Génère un bip audible sans dépendre d'un fichier son externe.
export function jouerBip() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const jouerNote = (freq, debut, duree) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + debut);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + debut + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + debut + duree);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + debut);
      osc.stop(ctx.currentTime + debut + duree);
    };
    jouerNote(880, 0, 0.15);
    jouerNote(1100, 0.18, 0.18);
  } catch {
    /* l'audio peut être bloqué avant toute interaction utilisateur — sans gravité */
  }
}

export async function demanderPermissionNotification() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export function notifierNouvelleCourse(course) {
  jouerBip();
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("Nouvelle demande de course", {
        body: `${course.zoneDepart} → ${course.zoneArrivee} · ${course.montant} FCFA`,
        tag: course.id,
      });
    } catch {
      /* certains navigateurs mobiles restreignent les notifications hors app installée */
    }
  }
}
