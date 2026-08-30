const GOOGLE_MAPS_API_KEY = "AIzaSyDBiXqRM3nZFu702ejO1M1qHv0HN4sTpo4";
const firebaseConfig = {
  apiKey: "AIzaSyBaBMM59IHHEFGcTmcOcTAsmgonScH0F_8",
  authDomain: "://firebaseapp.com",
  projectId: "pitesti-netcafes",
  storageBucket: "pitesti-netcafes.firebasestorage.app",
  messagingSenderId: "247244935409",
  appId: "1:247244935409:web:3780639bb9f9c5cc1b1950",
  measurementId: "G-ZK82WVM033",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const locatiiInitiale = [];

function initMapCallback() {
  window.dispatchEvent(new Event("GoogleMapsGata"));
}

(function () {
  const script = document.createElement("script");
  script.src =
    "https://maps.googleapis.com/maps/api/js?key=" +
    GOOGLE_MAPS_API_KEY +
    "&callback=initMapCallback&loading=async";
  script.defer = true;
  document.head.appendChild(script);
})();

// global pop-up refference
let overlayActiv = null;

window.addEventListener("GoogleMapsGata", () => {
  const map = new google.maps.Map(document.getElementById("map"), {
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

  function adaugaPunctPeEcran(loc) {
    loc.Coordonate.lat = parseFloat(loc.Coordonate.lat);
    loc.Coordonate.lng = parseFloat(loc.Coordonate.lng);

    const marker = new google.maps.Marker({
      position: loc.Coordonate,
      map: map,
      title: loc.nume,
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

        div.innerHTML = `
                    <div class="mirc-popup-title">
                        <span>[Status: ${loc.nume}]</span>
                        <button class="mirc-popup-close" id="popup-close-btn">X</button>
                    </div>
                    <div class="mirc-popup-body">
                        <div class="mirc-popup-line"><span style="color:#00ff00;">[Zona]:</span> <span style="color:#00ffff;">${loc.zona}</span></div>
                        <div class="mirc-popup-line" style="margin-top:6px;"><span style="color:#ffff00;">[Info]:</span> ${loc.descriere}</div>
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
          new google.maps.LatLng(loc.Coordonate),
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

    const item = document.createElement("div");
    item.className = "locatie-item";
    const numeLower = loc.nume.toLowerCase();
    const esteOperator =
      numeLower.includes("nucu") || numeLower.includes("garaj");
    const esteVoice =
      numeLower.includes("matrix") ||
      numeLower.includes("turtles") ||
      numeLower.includes("argeș") ||
      numeLower.includes("arges") ||
      numeLower.includes("target") ||
      numeLower.includes("escape");

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
            <div>${htmlSimbol}<span class="locatie-name" style="color:${culoareNume};">${loc.nume}</span></div>
            <div class="locatie-detalii" style="margin-top:2px; padding-left:12px;">📍 ${loc.zona}</div>
        `;

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      map.setZoom(14.5);

      // panTo instead of setCenter to remove flash/refresh
      map.panTo(loc.Coordonate);

      const inaltimeHartaPixeli = document.getElementById("map").offsetHeight;
      const offsetPixeliVerticali =
        inaltimeHartaPixeli / 2 - inaltimeHartaPixeli / 3;

      setTimeout(() => {
        map.panBy(0, -offsetPixeliVerticali);
        deschideFereastraCustom();
      }, 100);
    });

    listaContainer.appendChild(item);
  }

  // real time Firebase updates
  db.collection("locatii").onSnapshot((snapshot) => {
    markereActive.forEach((m) => m.setMap(null));
    markereActive = [];
    listaContainer.innerHTML = "";

    let toateLocatiile = [];
    snapshot.forEach((doc) => {
      toateLocatiile.push(doc.data());
    });

    // hierarchical sort @ (Nucu/Garaj) -> + (Matrix/etc.) -> other, then alphabetically
    toateLocatiile.sort((a, b) => {
      const aNumeLower = a.nume.toLowerCase();
      const bNumeLower = b.nume.toLowerCase();

      const aOp = aNumeLower.includes("nucu") || aNumeLower.includes("garaj");
      const bOp = bNumeLower.includes("nucu") || bNumeLower.includes("garaj");

      const aV =
        aNumeLower.includes("matrix") ||
        aNumeLower.includes("turtles") ||
        aNumeLower.includes("argeș") ||
        aNumeLower.includes("arges") ||
        aNumeLower.includes("target") ||
        aNumeLower.includes("escape");
      const bV =
        bNumeLower.includes("matrix") ||
        bNumeLower.includes("turtles") ||
        bNumeLower.includes("argeș") ||
        bNumeLower.includes("arges") ||
        bNumeLower.includes("target") ||
        bNumeLower.includes("escape");

      let rangA = aOp ? 2 : aV ? 1 : 0;
      let rangB = bOp ? 2 : bV ? 1 : 0;

      if (rangA !== rangB) {
        return rangB - rangA;
      }

      return a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" });
    });

    toateLocatiile.forEach((loc) => {
      if (
        !locatiiInitiale.some(
          (l) => l.nume.toLowerCase() === loc.nume.toLowerCase(),
        )
      ) {
        adaugaPunctPeEcran(loc);
      }
    });
  });

  // 3. add map locations form logic
  map.addListener("click", (e) => {
    const sidebarElement = document.getElementById("sidebar");

    // don't activate form if sidebar is hidden
    if (sidebarElement && sidebarElement.classList.contains("minimizat")) {
      return;
    }
    const coordonate = e.latLng.toJSON();
    document.getElementById("form-lat").value = coordonate.lat;
    document.getElementById("form-lng").value = coordonate.lng;
    document.getElementById("form-container").style.display = "block";
    document.getElementById("form-nume").focus();
  });

  document.getElementById("cafe-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raspunsAntiBot = document
      .getElementById("form-antibot")
      .value.trim()
      .toLowerCase();
    if (raspunsAntiBot !== "mirc") {
      alert("Răspuns greșit!");
      return;
    }

    const nouDocument = {
      nume: document.getElementById("form-nume").value,
      zona: document.getElementById("form-zona").value,
      descriere: document.getElementById("form-descriere").value,
      Coordonate: {
        lat: parseFloat(document.getElementById("form-lat").value),
        lng: parseFloat(document.getElementById("form-lng").value),
      },
    };

    db.collection("locatii")
      .add(nouDocument)
      .then(() => {
        document.getElementById("cafe-form").reset();
        document.getElementById("form-container").style.display = "none";
      })
      .catch((err) => {
        alert("Eroare: " + err.message);
      });
  });

  // close form logic using ESC key or cancel button
  function inchideFormularLocatie() {
    document.getElementById("cafe-form").reset();
    document.getElementById("form-container").style.display = "none";
  }

  document.getElementById("btn-anuleaza").addEventListener("click", (e) => {
    e.preventDefault();
    inchideFormularLocatie();
  });

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
// hide/show sidebar logic
const baraVerticala = document.querySelector(
  ".mirc-popup-title:not(#custom-mirc-popup .mirc-popup-title)",
);
const sidebarElement = document.getElementById("sidebar");

if (baraVerticala && sidebarElement) {
  baraVerticala.addEventListener("click", () => {
    sidebarElement.classList.toggle("minimizat");

    const textBara = document.getElementById("popup-title-text");
    if (sidebarElement.classList.contains("minimizat")) {
      textBara.textContent = "#pitesti ◀";
    } else {
      textBara.textContent = "#pitesti ▶";
    }
  });
}
