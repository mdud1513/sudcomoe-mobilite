// Redimensionne et compresse une image côté navigateur avant envoi, pour rester
// largement sous la limite serveur (~300 Ko) sans dépendre d'un service externe.
export function redimensionnerImage(fichier, tailleMax = 480, qualite = 0.75) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > tailleMax) {
          height = Math.round((height * tailleMax) / width);
          width = tailleMax;
        } else if (height > tailleMax) {
          width = Math.round((width * tailleMax) / height);
          height = tailleMax;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", qualite));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    lecteur.onerror = reject;
    lecteur.readAsDataURL(fichier);
  });
}
