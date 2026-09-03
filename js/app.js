import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const GOOGLE_MAPS_API_KEY = "AIzaSyDBiXqRM3nZFu702ejO1M1qHv0HN4sTpo4";
const LOCALHOST_APPCHECK_DEBUG_TOKEN = "";
const tokenDebugLocal =
  LOCALHOST_APPCHECK_DEBUG_TOKEN ||
  window.localStorage.getItem("firebaseAppCheckDebugToken") ||
  "";
const firebaseConfig = {
  apiKey: "AIzaSyBaBMM59IHHEFGcTmcOcTAsmgonScH0F_8",
  authDomain: "pitesti-netcafes.firebaseapp.com",
  projectId: "pitesti-netcafes",
  storageBucket: "pitesti-netcafes.firebasestorage.app",
  messagingSenderId: "247244935409",
  appId: "1:247244935409:web:3780639bb9f9c5cc1b1950",
  measurementId: "G-ZK82WVM033",
};

// Inițializarea ta normală App Check...

const app = initializeApp(firebaseConfig);

// 1. Verificăm dacă suntem pe localhost
const isLocalhost = Boolean(
  window.location.protocol === "file:" ||
    window.location.hostname === "" ||
  window.location.hostname === "localhost" ||
    window.location.hostname === "[::1]" ||
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
);

if (tokenDebugLocal.trim().length > 0) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = tokenDebugLocal;
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = tokenDebugLocal;
  window.FIREBASE_APPCHECK_DEBUG_TOKEN = tokenDebugLocal;
  console.info("Firebase App Check debug token activ.");
}

const deleteLocalActiv = isLocalhost || tokenDebugLocal.trim().length > 0;

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(
    "6LeSQaItAAAAAAFmW7msBBy-zAbV3a-T5FENfRif"
  ),
  isTokenAutoRefreshEnabled: true,
});
const tokenAppCheck = getToken(appCheck).catch((err) => {
  console.error("Tokenul Firebase App Check nu a putut fi obținut:", err);
  throw new Error(
    "Validarea App Check pentru upload a eșuat. Verifică debug token-ul de localhost în Firebase Console."
  );
});

async function verificaAppCheckPentruUpload() {
  try {
    const appCheckToken = await getToken(appCheck, true);
    if (!appCheckToken?.token) {
      throw new Error("Firebase App Check nu a returnat niciun token.");
    }

    console.info("Firebase App Check token obținut pentru upload.", {
      local: isLocalhost,
      tokenPreview: `${appCheckToken.token.slice(0, 12)}...`,
    });
  } catch (err) {
    console.error("Firebase App Check upload check a eșuat:", err);
    throw new Error(
      `Validarea App Check pentru upload a eșuat înainte de Storage: ${err.message}`,
    );
  }
}

const db = getFirestore(app);
const storage = getStorage(app);

// Global Pop-Up & Fallback references
let overlayActiv = null;
const locatiiInitiale = [];

// 4. Încărcare Unică Google Maps SDK
window.initMapCallback = function () {
  window.dispatchEvent(new Event("GoogleMapsGata"));
};

if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMapCallback&loading=async`;
  script.defer = true;
  document.head.appendChild(script);
}

// 5. Logică Harta, Pop-up Custom & Firestore Listeners
window.addEventListener("GoogleMapsGata", () => {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  const map = new google.maps.Map(mapElement, {
    center: { lat: 44.8759, lng: 24.8452 },
    zoom: 14,
    styles: [
      { elementType: "geometry", stylers: [{ color: "#1b1b1b" }] },
      { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#00ff66" }] },
      { elementType: "labels.text.stroke", stylers: [{ visibility: "off" }] },
      {
        featureType: "road",
        elementType: "geometry.fill",
        stylers: [{ color: "#2a2a2a" }],
      },
      {
        featureType: "water",
        elementType: "geometry.fill",
        stylers: [{ color: "#050505" }],
      },
    ],
  });

  const listaContainer = document.getElementById("lista-locatii");
  let markereActive = [];

  async function stergeLocatie(loc) {
    if (!deleteLocalActiv) {
      alert("Ștergerea este disponibilă doar local, cu debug token configurat.");
      return;
    }

    if (tokenDebugLocal.trim().length === 0) {
      const tokenNou = prompt("Introdu Firebase App Check debug token pentru ștergere:");
      if (!tokenNou) return;

      window.localStorage.setItem("firebaseAppCheckDebugToken", tokenNou.trim());
      alert("Token salvat local. Pagina se reîncarcă, apoi poți apăsa din nou pe X.");
      window.location.reload();
      return;
    }

    const confirma = confirm(`Ștergi definitiv "${loc.nume || "această locație"}"?`);
    if (!confirma) return;

    try {
      await tokenAppCheck;

      if (loc.imagine) {
        try {
          await deleteObject(ref(storage, loc.imagine));
        } catch (err) {
          console.warn("Poza nu a putut fi ștearsă din Storage:", err);
        }
      }

      await deleteDoc(doc(db, "locatii", loc.id));
    } catch (err) {
      alert("Eroare la ștergere: " + err.message);
    }
  }

  function adaugaPunctPeEcran(loc) {
    // 1. Validare obiect și coordonate
    if (
      !loc ||
      !loc.Coordonate ||
      loc.Coordonate.lat === undefined ||
      loc.Coordonate.lng === undefined
    ) {
      console.warn("Obiect ignorat (coordonate invalide sau lipsă):", loc);
      return;
    }

    const lat = parseFloat(loc.Coordonate.lat);
    const lng = parseFloat(loc.Coordonate.lng);

    if (isNaN(lat) || isNaN(lng)) {
      console.warn("Coordonate invalide (NaN):", loc.Coordonate);
      return;
    }

    const pozitieValidata = { lat, lng };

    // 2. Extragere și securizare câmpuri text
    const numeText = String(loc.nume || "Sală necunoscută");
    const zonaText = String(loc.zona || "-");
    const descriereText = String(loc.descriere || "-");

    const marker = new google.maps.Marker({
      position: pozitieValidata,
      map: map,
      title: numeText,
    });
    markereActive.push(marker);

    function deschideFereastraCustom() {
      if (overlayActiv) overlayActiv.setMap(null);

      overlayActiv = new google.maps.OverlayView();

      overlayActiv.onAdd = function () {
        const div = document.createElement("div");
        div.id = "custom-mirc-popup";
        div.className = "mirc-popup-window";
        div.style.display = "block";

        const htmlImagine = loc.imagine
          ? `<div class="mirc-popup-line" style="margin-top:8px; text-align:center;"><img src="${loc.imagine}" style="width:100%; max-height:150px; object-fit:cover; border:1px solid #555;" alt="Foto sala"></div>`
          : "";

        div.innerHTML = `
        <div class="mirc-popup-title">
          <span>[Status: ${numeText}]</span>
          <button class="mirc-popup-close" id="popup-close-btn">X</button>
        </div>
        <div class="mirc-popup-body">
          <div class="mirc-popup-line"><span style="color:#00ff00;">[Zona]:</span> <span style="color:#00ffff;">${zonaText}</span></div>
          <div class="mirc-popup-line" style="margin-top:6px;"><span style="color:#ffff00;">[Info]:</span> ${descriereText}</div>
          ${htmlImagine}
        </div>
      `;

        this.div = div;

        const panouri = this.getPanes();
        panouri.floatPane.appendChild(div);

        div.querySelector("#popup-close-btn").addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (overlayActiv) {
            overlayActiv.setMap(null);
            overlayActiv = null;
          }
        });

        div.addEventListener("click", (e) => {
          e.stopPropagation();
        });
      };

      overlayActiv.draw = function () {
        if (!this.div) return;
        const proiectie = this.getProjection();
        if (!proiectie) return;

        const pozitiePixeli = proiectie.fromLatLngToDivPixel(
          new google.maps.LatLng(pozitieValidata)
        );
        const inaltimeFereastra = this.div.offsetHeight;
        const offsetVertical = pozitiePixeli.y - inaltimeFereastra - 42;

        this.div.style.left = pozitiePixeli.x + "px";
        this.div.style.top = offsetVertical + "px";
      };

      overlayActiv.onRemove = function () {
        if (this.div) {
          this.div.parentNode.removeChild(this.div);
          this.div = null;
        }
      };

      overlayActiv.setMap(map);
    }

    marker.addListener("click", deschideFereastraCustom);

    if (listaContainer) {
      const item = document.createElement("div");
      item.className = "locatie-item";
      const numeLower = numeText.toLowerCase();
      const esteOperator =
        numeLower.includes("nucu") || numeLower.includes("garaj");
      const esteVoice =
        numeLower.includes("matrix") ||
        numeLower.includes("turtles") ||
        numeLower.includes("argeș") ||
        numeLower.includes("arges") ||
        numeLower.includes("target") ||
        numeLower.includes("escape") ||
        numeLower.includes("laur");

      let simbolmIRC = "";
      let culoareSimbol = "";
      let culoareNume = "#ffffff";

      if (esteOperator) {
        simbolmIRC = "@";
        culoareSimbol = "#00ff00";
        culoareNume = "#00ff00";
      } else if (esteVoice) {
        simbolmIRC = "+";
        culoareSimbol = "#0000ff";
      }

      const htmlSimbol = simbolmIRC
        ? `<span style="color:${culoareSimbol}; font-weight:bold;">${simbolmIRC}</span>`
        : "";

      item.innerHTML = `
      <div class="locatie-row">
        <span>${htmlSimbol}<span class="locatie-name" style="color:${culoareNume};">${numeText}</span></span>
        ${
          deleteLocalActiv
            ? '<button class="btn-delete-locatie" type="button" title="Șterge locația">X</button>'
            : ""
        }
      </div>
      <div class="locatie-detalii" style="margin-top:2px; padding-left:12px;">📍 ${zonaText}</div>
    `;

      const btnDelete = item.querySelector(".btn-delete-locatie");
      if (btnDelete) {
        btnDelete.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          stergeLocatie(loc);
        });
      }

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        map.setZoom(14.5);
        map.panTo(pozitieValidata);

        const inaltimeHartaPixeli = mapElement.offsetHeight;
        const offsetPixeliVerticali =
          inaltimeHartaPixeli / 2 - inaltimeHartaPixeli / 3;

        setTimeout(() => {
          map.panBy(0, -offsetPixeliVerticali);
          deschideFereastraCustom();
        }, 100);
      });

      listaContainer.appendChild(item);
    }
  }

  // Citire Real-time Firestore Modular
  const locatiiRef = collection(db, "locatii");
  onSnapshot(locatiiRef, (snapshot) => {
    markereActive.forEach((m) => m.setMap(null));
    markereActive = [];
    if (listaContainer) listaContainer.innerHTML = "";

    let toateLocatiile = [];
    snapshot.forEach((doc) => {
      toateLocatiile.push({ id: doc.id, ...doc.data() });
    });

    toateLocatiile.sort((a, b) => {
      // Conversie sigură la String pentru a preveni erorile când nume este alt tip de date
      const numeAStr = String(a?.nume || "");
      const numeBStr = String(b?.nume || "");

      const aNumeLower = numeAStr.toLowerCase();
      const bNumeLower = numeBStr.toLowerCase();

      const aOp = aNumeLower.includes("nucu") || aNumeLower.includes("garaj");
      const bOp = bNumeLower.includes("nucu") || bNumeLower.includes("garaj");

      const aV =
        aNumeLower.includes("matrix") ||
        aNumeLower.includes("turtles") ||
        aNumeLower.includes("argeș") ||
        aNumeLower.includes("arges") ||
        aNumeLower.includes("target") ||
        aNumeLower.includes("escape") ||
        aNumeLower.includes("laur");
      const bV =
        bNumeLower.includes("matrix") ||
        bNumeLower.includes("turtles") ||
        bNumeLower.includes("argeș") ||
        bNumeLower.includes("arges") ||
        bNumeLower.includes("target") ||
        bNumeLower.includes("escape") ||
        bNumeLower.includes("laur");

      let rangA = aOp ? 2 : aV ? 1 : 0;
      let rangB = bOp ? 2 : bV ? 1 : 0;

      if (rangA !== rangB) {
        return rangB - rangA;
      }

      return numeAStr.localeCompare(numeBStr, "ro", { sensitivity: "base" });
    });

    toateLocatiile.forEach((loc) => {
      if (
        !locatiiInitiale.some(
          (l) => l.nume.toLowerCase() === loc.nume.toLowerCase()
        )
      ) {
        adaugaPunctPeEcran(loc);
      }
    });
  });

  // Deschidere formular prin click pe hartă
  map.addListener("click", (e) => {
    const sidebarElement = document.getElementById("sidebar");

    if (sidebarElement && sidebarElement.classList.contains("minimizat")) {
      return;
    }
    const coordonate = e.latLng.toJSON();
    document.getElementById("form-lat").value = coordonate.lat;
    document.getElementById("form-lng").value = coordonate.lng;
    document.getElementById("form-container").style.display = "block";
    document.getElementById("form-nume").focus();
  });

  // Trimitere Formular (Upload Storage + Salvare Firestore v10)
  const cafeForm = document.getElementById("cafe-form");

  if (cafeForm) {
    cafeForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // 1. Verificare Anti-Bot
      const raspunsAntiBot = document
        .getElementById("form-antibot")
        .value.trim()
        .toLowerCase();

      if (raspunsAntiBot !== "mirc") {
        alert("Răspuns greșit!");
        return;
      }

      // 2. Extragere & Validare Câmpuri Text / Coordonate
      const nume = document.getElementById("form-nume").value.trim();
      const zona = document.getElementById("form-zona").value.trim();
      const descriere = document.getElementById("form-descriere").value.trim();
      const lat = parseFloat(document.getElementById("form-lat").value);
      const lng = parseFloat(document.getElementById("form-lng").value);

      if (!nume || !zona || isNaN(lat) || isNaN(lng)) {
        alert(
          "Vă rugăm să completați toate câmpurile obligatorii cu date valide!"
        );
        return;
      }

      const inputImagine = document.getElementById("form-imagine");
      const fisierOriginal = inputImagine.files[0];
      let urlImagineFinal = "";

      // 3. Validare preliminară fișier imagine
      if (fisierOriginal && !fisierOriginal.type.startsWith("image/")) {
        alert("Fișierul selectat nu este o imagine validă!");
        return;
      }

      const btnSubmit = e.target.querySelector("button[type='submit']");
      const textOriginalBtn = btnSubmit ? btnSubmit.textContent : "Trimite";

      try {
        if (btnSubmit) {
          btnSubmit.textContent = "[Compresie/Upload...]";
          btnSubmit.disabled = true;
        }

        // 4. Procesare & Compresie Imagine
        if (fisierOriginal) {
          await tokenAppCheck;
          await verificaAppCheckPentruUpload();

          const pozaProcesata = await new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(fisierOriginal);
            img.src = objectUrl;

            img.onload = () => {
              URL.revokeObjectURL(objectUrl); // Curățăm din memorie

              const canvas = document.createElement("canvas");
              let width = img.width;
              let height = img.height;
              const MAX_WIDTH = 1920;
              const MAX_HEIGHT = 1080;

              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width *= MAX_HEIGHT / height;
                  height = MAX_HEIGHT;
                }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob(
                (blob) => {
                  if (blob) resolve(blob);
                  else
                    reject(
                      new Error(
                        "A apărut o eroare la generarea fișierului compresat."
                      )
                    );
                },
                "image/jpeg",
                0.75
              );
            };

            img.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              reject(new Error("Fișierul imagine este corupt sau invalid."));
            };
          });

          // Verificare dimensiune maximă 600KB
          if (pozaProcesata.size > 614400) {
            alert(
              "Imaginea este prea complexă și depășește limita de 600KB chiar și după optimizare!"
            );
            return; // Trece automat prin blocul 'finally' pentru a re-activa butonul
          }

          // Înlocuiește linia veche de uploadBytes cu:
          const numeFisierUnic = `imagini/${Date.now()}_locatie.jpg`;
          const storageRef = ref(storage, numeFisierUnic);

          // Transmitere explicită a tipului de fișier pentru regulile Storage
          const uploadResult = await uploadBytes(storageRef, pozaProcesata, {
            contentType: "image/jpeg",
          });

          urlImagineFinal = await getDownloadURL(uploadResult.ref);
        }

        // 5. Salvare în Firestore
        const nouDocument = {
          nume: nume,
          zona: zona,
          descriere: descriere,
          imagine: urlImagineFinal,
          Coordonate: { lat, lng },
          createdAt: new Date(), // Recomandat pentru ordonare ulterioară
        };

        await addDoc(collection(db, "locatii"), nouDocument);

        cafeForm.reset();
        const formContainer = document.getElementById("form-container");
        if (formContainer) formContainer.style.display = "none";
      } catch (err) {
        alert("Eroare la procesare/upload: " + err.message);
      } finally {
        // 6. Resetare garantată a butonului (se execută indiferent de succes sau eroare)
        if (btnSubmit) {
          btnSubmit.textContent = textOriginalBtn;
          btnSubmit.disabled = false;
        }
      }
    });
  }

  // Închidere formular
  function inchideFormularLocatie() {
    const form = document.getElementById("cafe-form");
    if (form) form.reset();
    const container = document.getElementById("form-container");
    if (container) container.style.display = "none";
  }

  const btnAnuleaza = document.getElementById("btn-anuleaza");
  if (btnAnuleaza) {
    btnAnuleaza.addEventListener("click", (e) => {
      e.preventDefault();
      inchideFormularLocatie();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.keyCode === 27) {
      inchideFormularLocatie();
      if (overlayActiv) {
        overlayActiv.setMap(null);
        overlayActiv = null;
      }
    }
  });
});

const toggleBtn = document.getElementById("sidebar-toggle-btn");
const sidebarElement = document.getElementById("sidebar");

if (toggleBtn && sidebarElement) {
  toggleBtn.addEventListener("click", () => {
    sidebarElement.classList.toggle("minimizat");
    toggleBtn.textContent = sidebarElement.classList.contains("minimizat")
      ? "#pitesti ◀"
      : "#pitesti ▶";
  });
}
