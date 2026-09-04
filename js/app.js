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
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
let userCurent = null;
let profilCurent = null;
let coordonateSelectatePentruFormular = false;
let rerenderLocatiiCurente = () => {};

const authLoggedOut = document.getElementById("auth-logged-out");
const authLoggedIn = document.getElementById("auth-logged-in");
const authDisplayName = document.getElementById("auth-display-name");
const btnGoogleLogin = document.getElementById("btn-google-login");
const btnGoogleLogout = document.getElementById("btn-google-logout");
const btnSaveProfile = document.getElementById("btn-save-profile");
const profileNickname = document.getElementById("profile-nickname");
const profileYears = document.getElementById("profile-years");
const profileGames = document.getElementById("profile-games");
const profileContact = document.getElementById("profile-contact");
const inboxPanel = document.getElementById("inbox-panel");
const conversationList = document.getElementById("conversation-list");
const conversationThread = document.getElementById("conversation-thread");
const conversationWith = document.getElementById("conversation-with");
const messageList = document.getElementById("message-list");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const btnCloseConversation = document.getElementById("btn-close-conversation");
let unsubscribeConversatii = null;
let unsubscribeMesaje = null;
let conversatieActivaId = null;

function valoareInput(element) {
  return element?.value.trim() || "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function numePublicUser(user, profil) {
  return profil?.nickname || user?.displayName || "vizitator";
}

function idConversatie(uidA, uidB) {
  return [uidA, uidB].sort().join("__");
}

function opresteInboxRealtime() {
  if (unsubscribeConversatii) unsubscribeConversatii();
  if (unsubscribeMesaje) unsubscribeMesaje();
  unsubscribeConversatii = null;
  unsubscribeMesaje = null;
  conversatieActivaId = null;
}

function numeCelalaltParticipant(conversatie) {
  if (!userCurent) return "necunoscut";
  const uidCelalalt = conversatie.participantUids?.find((uid) => uid !== userCurent.uid);
  return conversatie.participantNames?.[uidCelalalt] || "necunoscut";
}

function ascultaConversatii() {
  if (!userCurent || !conversationList) return;
  if (unsubscribeConversatii) unsubscribeConversatii();

  const conversatiiRef = query(
    collection(db, "conversations"),
    where("participantUids", "array-contains", userCurent.uid),
  );

  unsubscribeConversatii = onSnapshot(conversatiiRef, (snapshot) => {
    if (snapshot.empty) {
      conversationList.innerHTML = '<p class="empty-state">Nicio conversație încă.</p>';
      return;
    }

    conversationList.innerHTML = "";
    const conversatii = [];
    snapshot.forEach((conversatieDoc) => {
      conversatii.push({ id: conversatieDoc.id, ...conversatieDoc.data() });
    });

    conversatii
      .sort((a, b) => {
        const dataA = typeof a.updatedAt?.toDate === "function" ? a.updatedAt.toDate() : new Date(0);
        const dataB = typeof b.updatedAt?.toDate === "function" ? b.updatedAt.toDate() : new Date(0);
        return dataB - dataA;
      })
      .forEach((conversatie) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item";
      button.innerHTML = `
        <span class="nick">&lt;${escapeHtml(numeCelalaltParticipant(conversatie))}&gt;</span>
        <span>${escapeHtml(conversatie.lastMessage || "conversație nouă")}</span>
      `;
      button.addEventListener("click", () => deschideConversatie(conversatie));
      conversationList.appendChild(button);
    });
  }, (err) => {
    console.error("Inbox-ul nu a putut fi încărcat:", err);
    conversationList.innerHTML = '<p class="empty-state">Inbox indisponibil.</p>';
  });
}

function deschideConversatie(conversatie) {
  if (!userCurent || !messageList || !conversationThread) return;

  conversatieActivaId = conversatie.id;
  conversationThread.hidden = false;
  if (conversationWith) {
    conversationWith.textContent = `/query ${numeCelalaltParticipant(conversatie)}`;
  }

  if (unsubscribeMesaje) unsubscribeMesaje();

  const mesajeRef = query(
    collection(db, "conversations", conversatie.id, "messages"),
    orderBy("createdAt", "asc"),
    limit(80),
  );

  unsubscribeMesaje = onSnapshot(
    mesajeRef,
    (snapshot) => {
      messageList.innerHTML = "";
      snapshot.forEach((mesajDoc) => {
        const mesaj = mesajDoc.data();
        const rand = document.createElement("p");
        rand.className = "message-line";
        rand.innerHTML = `<span class="nick">&lt;${escapeHtml(mesaj.senderNickname)}&gt;</span> ${escapeHtml(mesaj.text)}`;
        messageList.appendChild(rand);
      });
      messageList.scrollTop = messageList.scrollHeight;
    },
    (err) => {
      console.error("Mesajele nu au putut fi încărcate:", err);
      messageList.innerHTML = '<p class="empty-state">Mesajele nu pot fi încărcate.</p>';
    },
  );
}

async function pornesteConversatieCu(targetUid, targetName) {
  if (!userCurent) {
    alert("Intră cu Google ca să trimiți mesaje.");
    return;
  }

  if (!targetUid) {
    alert("Nu pot porni conversația: autorul nu are cont legat de postare.");
    return;
  }

  if (targetUid === userCurent.uid) {
    alert("Asta este postarea ta.");
    return;
  }

  const conversatieId = idConversatie(userCurent.uid, targetUid);
  const conversatieRef = doc(db, "conversations", conversatieId);
  const numeCurent = numePublicUser(userCurent, profilCurent);

  await setDoc(conversatieRef, {
    participantUids: [userCurent.uid, targetUid],
    participantNames: {
      [userCurent.uid]: numeCurent,
      [targetUid]: targetName || "necunoscut",
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const mesajInitial = prompt(`Mesaj către <${targetName || "necunoscut"}>`);
  if (mesajInitial?.trim()) {
    await trimiteMesaj(conversatieId, mesajInitial.trim());
  }

  deschideConversatie({
    id: conversatieId,
    participantUids: [userCurent.uid, targetUid],
    participantNames: {
      [userCurent.uid]: numeCurent,
      [targetUid]: targetName || "necunoscut",
    },
  });
}

async function trimiteMesaj(conversatieId, text) {
  if (!userCurent || !text.trim()) return;

  const mesaj = text.trim().slice(0, 1000);
  const nickname = numePublicUser(userCurent, profilCurent);

  await addDoc(collection(db, "conversations", conversatieId, "messages"), {
    senderUid: userCurent.uid,
    senderNickname: nickname,
    text: mesaj,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "conversations", conversatieId), {
    participantNames: {
      [userCurent.uid]: nickname,
    },
    lastMessage: mesaj,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function incarcaProfil(user) {
  const profilRef = doc(db, "users", user.uid);
  const profilSnap = await getDoc(profilRef);

  if (profilSnap.exists()) {
    return profilSnap.data();
  }

  const profilInitial = {
    nickname: user.displayName || "",
    yearsActive: "",
    games: "",
    privateContact: user.email || "",
    photoURL: user.photoURL || "",
    createdAt: new Date(),
  };

  await setDoc(profilRef, profilInitial);
  return profilInitial;
}

function afiseazaProfil(user, profil) {
  const esteLogat = Boolean(user);

  if (authLoggedOut) authLoggedOut.hidden = esteLogat;
  if (authLoggedIn) authLoggedIn.hidden = !esteLogat;
  if (inboxPanel) inboxPanel.hidden = !esteLogat;
  if (!esteLogat) return;

  if (authDisplayName) {
    authDisplayName.textContent = `<${numePublicUser(user, profil)}>`;
  }
  if (profileNickname) profileNickname.value = profil?.nickname || "";
  if (profileYears) profileYears.value = profil?.yearsActive || "";
  if (profileGames) profileGames.value = profil?.games || "";
  if (profileContact) profileContact.value = profil?.privateContact || "";
}

if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      alert("Login Google a eșuat: " + err.message);
    }
  });
}

if (btnGoogleLogout) {
  btnGoogleLogout.addEventListener("click", async () => {
    await signOut(auth);
  });
}

if (btnSaveProfile) {
  btnSaveProfile.addEventListener("click", async () => {
    if (!userCurent) return;

    const profilNou = {
      nickname: valoareInput(profileNickname),
      yearsActive: valoareInput(profileYears),
      games: valoareInput(profileGames),
      privateContact: valoareInput(profileContact),
      photoURL: userCurent.photoURL || "",
      updatedAt: new Date(),
    };

    await setDoc(doc(db, "users", userCurent.uid), profilNou, { merge: true });
    profilCurent = { ...profilCurent, ...profilNou };
    afiseazaProfil(userCurent, profilCurent);
    alert("Profil salvat.");
  });
}

if (btnCloseConversation) {
  btnCloseConversation.addEventListener("click", () => {
    if (unsubscribeMesaje) unsubscribeMesaje();
    unsubscribeMesaje = null;
    conversatieActivaId = null;
    if (conversationThread) conversationThread.hidden = true;
  });
}

if (messageForm) {
  messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!conversatieActivaId || !messageInput) return;

    const text = messageInput.value.trim();
    if (!text) return;

    try {
      await trimiteMesaj(conversatieActivaId, text);
      messageInput.value = "";
    } catch (err) {
      alert("Mesajul nu a putut fi trimis: " + err.message);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  userCurent = user;
  profilCurent = null;
  opresteInboxRealtime();

  if (!user) {
    afiseazaProfil(null, null);
    rerenderLocatiiCurente();
    return;
  }

  try {
    profilCurent = await incarcaProfil(user);
    afiseazaProfil(user, profilCurent);
    ascultaConversatii();
    rerenderLocatiiCurente();
  } catch (err) {
    console.error("Profilul nu a putut fi încărcat:", err);
    afiseazaProfil(user, null);
  }
});

const appShell = document.getElementById("app-shell");
const leftResizer = document.getElementById("left-resizer");
const rightResizer = document.getElementById("right-resizer");

if (appShell && leftResizer) {
  const savedLeftWidth = Number(window.localStorage.getItem("leftPanelWidth"));
  if (savedLeftWidth >= 280 && savedLeftWidth <= 720) {
    appShell.style.setProperty("--left-panel-width", `${savedLeftWidth}px`);
  }

  leftResizer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    leftResizer.setPointerCapture(e.pointerId);
    leftResizer.classList.add("is-dragging");
  });

  leftResizer.addEventListener("pointermove", (e) => {
    if (!leftResizer.classList.contains("is-dragging")) return;

    const shellRect = appShell.getBoundingClientRect();
    const nextWidth = Math.min(720, Math.max(280, e.clientX - shellRect.left));
    appShell.style.setProperty("--left-panel-width", `${nextWidth}px`);
    window.localStorage.setItem("leftPanelWidth", String(Math.round(nextWidth)));
  });

  function stopResize(e) {
    if (leftResizer.hasPointerCapture(e.pointerId)) {
      leftResizer.releasePointerCapture(e.pointerId);
    }
    leftResizer.classList.remove("is-dragging");
  }

  leftResizer.addEventListener("pointerup", stopResize);
  leftResizer.addEventListener("pointercancel", stopResize);
}

if (appShell && rightResizer) {
  const savedRightWidth = Number(window.localStorage.getItem("rightPanelWidth"));
  if (savedRightWidth >= 280 && savedRightWidth <= 620) {
    appShell.style.setProperty("--right-panel-width", `${savedRightWidth}px`);
  }

  rightResizer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    rightResizer.setPointerCapture(e.pointerId);
    rightResizer.classList.add("is-dragging");
  });

  rightResizer.addEventListener("pointermove", (e) => {
    if (!rightResizer.classList.contains("is-dragging")) return;

    const shellRect = appShell.getBoundingClientRect();
    const nextWidth = Math.min(620, Math.max(280, shellRect.right - e.clientX));
    appShell.style.setProperty("--right-panel-width", `${nextWidth}px`);
    window.localStorage.setItem("rightPanelWidth", String(Math.round(nextWidth)));
  });

  function stopRightResize(e) {
    if (rightResizer.hasPointerCapture(e.pointerId)) {
      rightResizer.releasePointerCapture(e.pointerId);
    }
    rightResizer.classList.remove("is-dragging");
  }

  rightResizer.addEventListener("pointerup", stopRightResize);
  rightResizer.addEventListener("pointercancel", stopRightResize);
}

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
  const blogFeed = document.getElementById("blog-feed");
  const cafeForm = document.getElementById("cafe-form");
  let markereActive = [];
  const markereDupaId = new Map();
  let locatiiCurente = [];
  let locatieActivaId = null;

  function seteazaFormularActiv(activ) {
    coordonateSelectatePentruFormular = activ;
    if (!cafeForm) return;

    cafeForm.classList.toggle("is-disabled", !activ);
    cafeForm
      .querySelectorAll("input, textarea, button")
      .forEach((control) => {
        if (control.id === "btn-anuleaza") return;
        control.disabled = !activ;
      });
  }

  function deschideImagineMare(url, titlu) {
    const modal = document.createElement("div");
    modal.className = "image-modal";
    modal.innerHTML = `
      <div class="image-modal-window" role="dialog" aria-modal="true" aria-label="Imagine mărită">
        <div class="mirc-popup-title">
          <span>${escapeHtml(titlu)}</span>
          <button class="mirc-popup-close" type="button">X</button>
        </div>
        <img src="${escapeHtml(url)}" alt="${escapeHtml(titlu)}">
      </div>
    `;

    const inchideModal = () => {
      document.removeEventListener("keydown", inchideModalCuEscape);
      modal.remove();
    };
    const inchideModalCuEscape = (e) => {
      if (e.key === "Escape" || e.keyCode === 27) inchideModal();
    };
    modal.querySelector(".mirc-popup-close").addEventListener("click", inchideModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) inchideModal();
    });
    document.addEventListener("keydown", inchideModalCuEscape);
    document.body.appendChild(modal);
  }

  function focusLocatieInFeed(loc) {
    if (!blogFeed || !loc?.id) return;

    const post = blogFeed.querySelector(`[data-location-id="${CSS.escape(loc.id)}"]`);
    if (!post) return;

    post.scrollIntoView({ behavior: "smooth", block: "center" });
    seteazaLocatieActiva(loc.id);
  }

  function textCoordonate(loc) {
    const lat = parseFloat(loc?.Coordonate?.lat);
    const lng = parseFloat(loc?.Coordonate?.lng);
    if (isNaN(lat) || isNaN(lng)) return "";
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  function rolMirc(loc) {
    const rol = String(loc?.mircRole || loc?.rolMirc || "").trim().toLowerCase();
    if (["@","op","operator","admin"].includes(rol)) return "op";
    if (["+","voice","v","+v"].includes(rol)) return "voice";
    return "";
  }

  function rangMirc(loc) {
    const rol = rolMirc(loc);
    if (rol === "op") return 2;
    if (rol === "voice") return 1;
    return 0;
  }

  function focusLocatieInLista(loc) {
    if (!listaContainer || !loc?.id) return;

    const item = listaContainer.querySelector(`[data-location-id="${CSS.escape(loc.id)}"]`);
    if (!item) return;

    item.scrollIntoView({ behavior: "smooth", block: "center" });
    seteazaLocatieActiva(loc.id);
  }

  function seteazaLocatieActiva(id) {
    locatieActivaId = id;

    document
      .querySelectorAll(".blog-post.is-highlighted, .blog-post.is-expanded, .locatie-item.is-active")
      .forEach((element) =>
        element.classList.remove("is-highlighted", "is-expanded", "is-active"),
      );

    if (!id) return;

    const post = blogFeed?.querySelector(`[data-location-id="${CSS.escape(id)}"]`);
    post?.classList.add("is-highlighted", "is-expanded");
    listaContainer
      ?.querySelector(`[data-location-id="${CSS.escape(id)}"]`)
      ?.classList.add("is-active");
  }

  function restrangeLocatieActiva() {
    locatieActivaId = null;
    document
      .querySelectorAll(".blog-post.is-highlighted, .blog-post.is-expanded, .locatie-item.is-active")
      .forEach((element) =>
        element.classList.remove("is-highlighted", "is-expanded", "is-active"),
      );
  }

  function formateazaDataPostare(createdAt) {
    const data =
      typeof createdAt?.toDate === "function" ? createdAt.toDate() : new Date(createdAt);

    if (Number.isNaN(data.getTime())) return "data necunoscută";

    return new Intl.DateTimeFormat("ro-RO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(data);
  }

  function renderBlogFeed(locatii) {
    if (!blogFeed) return;

    if (locatii.length === 0) {
      blogFeed.innerHTML = `
        <article class="blog-post">
          <div class="blog-post-header">
            <span><span class="time">[00:00]</span> <span class="system">*system*</span></span>
            <span>#empty</span>
          </div>
          <div class="blog-post-body no-image">
            <div>
              <p class="blog-post-text">Nu există încă locații. Click pe hartă și adaugă prima sală.</p>
            </div>
          </div>
        </article>
      `;
      return;
    }

    blogFeed.innerHTML = locatii
      .map((loc, index) => {
        const nume = escapeHtml(loc.nume || "Sală necunoscută");
        const zona = escapeHtml(loc.zona || "-");
        const descriere = escapeHtml(loc.descriere || "-");
        const autor = escapeHtml(loc.authorNickname || loc.createdByName || "anonim");
        const authorUid = String(loc.createdByUid || "");
        const imagine = String(loc.imagine || "");
        const dataPostare = escapeHtml(formateazaDataPostare(loc.createdAt));
        const bodyClass = imagine ? "blog-post-body" : "blog-post-body no-image";
        const msgButton =
          authorUid && authorUid !== userCurent?.uid
            ? `<button class="btn-message-author" type="button" data-target-uid="${escapeHtml(authorUid)}" data-target-name="${autor}">[msg]</button>`
            : "";
        const imageHtml = imagine
          ? `<button class="blog-post-image" type="button" data-image-url="${escapeHtml(imagine)}" data-image-title="${nume}">
              <img src="${escapeHtml(imagine)}" alt="Foto ${nume}" loading="lazy">
            </button>`
          : "";

        return `
          <article class="blog-post" data-location-id="${escapeHtml(loc.id || "")}">
            <div class="blog-post-header">
              <span><span class="time">[${dataPostare}]</span> <span class="nick">&lt;${nume}&gt;</span></span>
              <span>#pitesti</span>
            </div>
            <div class="${bodyClass}">
              <div>
                <p class="blog-post-text">${descriere}</p>
                <p class="blog-post-meta">/whois ${nume} · ${zona} · adăugat de &lt;${autor}&gt; ${msgButton}</p>
              </div>
              ${imageHtml}
            </div>
          </article>
        `;
      })
      .join("");

    blogFeed.querySelectorAll(".blog-post-image").forEach((button) => {
      button.addEventListener("click", () => {
        deschideImagineMare(button.dataset.imageUrl, button.dataset.imageTitle);
      });
    });

    blogFeed.querySelectorAll(".btn-message-author").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        pornesteConversatieCu(button.dataset.targetUid, button.dataset.targetName).catch((err) => {
          console.error("Conversația nu a putut fi pornită:", err);
          alert("Conversația nu a putut fi pornită: " + err.message);
        });
      });
    });

    blogFeed.querySelectorAll(".blog-post").forEach((post) => {
      post.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;

        const loc = locatiiCurente.find(
          (locatie) => locatie.id === post.dataset.locationId,
        );
        if (!loc) return;

        if (locatieActivaId === loc.id && post.classList.contains("is-expanded")) {
          restrangeLocatieActiva();
          return;
        }

        const lat = parseFloat(loc.Coordonate?.lat);
        const lng = parseFloat(loc.Coordonate?.lng);
        seteazaLocatieActiva(loc.id);

        if (!isNaN(lat) && !isNaN(lng)) {
          map.panTo({ lat, lng });
          map.setZoom(Math.max(map.getZoom() || 14, 15));
        }
        focusLocatieInLista(loc);
        window.setTimeout(() => {
          const marker = markereDupaId.get(loc.id);
          if (marker) google.maps.event.trigger(marker, "click");
        }, 250);
      });
    });
  }

  rerenderLocatiiCurente = () => {
    renderBlogFeed(locatiiCurente);
    if (locatieActivaId) seteazaLocatieActiva(locatieActivaId);
  };

  async function stergeLocatie(loc) {
    if (!deleteLocalActiv) {
      alert("Ștergerea este disponibilă doar local, cu debug token configurat.");
      return;
    }

    if (!userCurent) {
      alert("Intră cu Google înainte să ștergi. Firestore permite delete doar pentru admin sau autor.");
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
      if (err.code === "permission-denied") {
        alert(
          `Firestore a refuzat ștergerea pentru UID-ul tău: ${userCurent.uid}\n\n` +
            "Verifică dacă ai publicat Firestore rules și dacă există documentul admins/{UID-ul tău}.",
        );
        return;
      }

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

    const marker = new google.maps.Marker({
      position: pozitieValidata,
      map: map,
      title: numeText,
    });
    markereActive.push(marker);
    if (loc.id) markereDupaId.set(loc.id, marker);

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
          <span>[Status: ${numeText}]</span>
          <button class="mirc-popup-close" id="popup-close-btn">X</button>
        </div>
        <div class="mirc-popup-body">
          <div class="mirc-popup-line"><span style="color:#00ff00;">[Zona]:</span> <span style="color:#00ffff;">${zonaText}</span></div>
          <div class="mirc-popup-line"><span style="color:#00ff00;">[Coord]:</span> <span style="color:#00ffff;">${textCoordonate(loc)}</span></div>
          <div class="mirc-popup-actions">
            <button type="button" id="popup-copiaza-coord">copiază coord</button>
          </div>
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

        div.querySelector("#popup-copiaza-coord").addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const coordonate = textCoordonate(loc);
          if (!coordonate) return;

          try {
            await navigator.clipboard.writeText(coordonate);
          } catch {
            prompt("Coordonate:", coordonate);
          }
        });

        div.addEventListener("click", (e) => {
          e.stopPropagation();
        });

        focusLocatieInFeed(loc);
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

    marker.addListener("click", () => {
      focusLocatieInFeed(loc);
      map.panTo(pozitieValidata);
      deschideFereastraCustom();
    });

    if (listaContainer) {
      const item = document.createElement("div");
      item.className = "locatie-item";
      item.dataset.locationId = loc.id || "";
      const rol = rolMirc(loc);
      const simbolmIRC = rol === "op" ? "@" : rol === "voice" ? "+" : "";
      const culoareSimbol = rol === "op" ? "#00ff00" : rol === "voice" ? "#0000ff" : "";
      const culoareNume = rol === "op" ? "#00ff00" : "#ffffff";

      const htmlSimbol = simbolmIRC
        ? `<span style="color:${culoareSimbol}; font-weight:bold;">${simbolmIRC}</span>`
        : "";
      const badgeFoto = loc.imagine ? '<span class="locatie-badge">foto</span>' : "";
      const badgeUser = loc.createdByUid ? '<span class="locatie-badge">user</span>' : "";
      const coordonateText = textCoordonate(loc);

      item.innerHTML = `
      <div class="locatie-row">
        <span>${htmlSimbol}<span class="locatie-name" style="color:${culoareNume};">${numeText}</span></span>
        ${
          deleteLocalActiv
            ? '<button class="btn-delete-locatie" type="button" title="Șterge locația">X</button>'
            : ""
        }
      </div>
      <div class="locatie-detalii">
        <span>${zonaText}</span>
        <span class="locatie-badges">${badgeFoto}${badgeUser}</span>
      </div>
      <div class="locatie-coord">${coordonateText}</div>
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
        seteazaLocatieActiva(loc.id);
        focusLocatieInFeed(loc);
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
    markereDupaId.clear();
    if (listaContainer) listaContainer.innerHTML = "";
    if (blogFeed) blogFeed.innerHTML = "";

    let toateLocatiile = [];
    snapshot.forEach((doc) => {
      toateLocatiile.push({ id: doc.id, ...doc.data() });
    });

    toateLocatiile.sort((a, b) => {
      // Conversie sigură la String pentru a preveni erorile când nume este alt tip de date
      const numeAStr = String(a?.nume || "");
      const numeBStr = String(b?.nume || "");

      let rangA = rangMirc(a);
      let rangB = rangMirc(b);

      if (rangA !== rangB) {
        return rangB - rangA;
      }

      return numeAStr.localeCompare(numeBStr, "ro", { sensitivity: "base" });
    });

    locatiiCurente = toateLocatiile;

    toateLocatiile.forEach((loc) => {
      if (
        !locatiiInitiale.some(
          (l) => l.nume.toLowerCase() === loc.nume.toLowerCase()
        )
      ) {
        adaugaPunctPeEcran(loc);
      }
    });

    renderBlogFeed(toateLocatiile);
    if (locatieActivaId) seteazaLocatieActiva(locatieActivaId);
  });

  // Deschidere formular prin click pe hartă
  map.addListener("click", (e) => {
    const coordonate = e.latLng.toJSON();
    document.getElementById("form-lat").value = coordonate.lat;
    document.getElementById("form-lng").value = coordonate.lng;
    seteazaFormularActiv(true);
    const formContainer = document.getElementById("form-container");
    if (formContainer) formContainer.open = true;
    document.getElementById("form-nume").focus();
  });

  // Trimitere Formular (Upload Storage + Salvare Firestore v10)
  if (cafeForm) {
    seteazaFormularActiv(false);

    cafeForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!coordonateSelectatePentruFormular) {
        alert("Alege mai întâi un punct liber pe hartă.");
        return;
      }

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
      const mircRole = document.getElementById("form-mirc-role").value;
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
          mircRole: mircRole,
          descriere: descriere,
          imagine: urlImagineFinal,
          Coordonate: { lat, lng },
          createdByUid: userCurent?.uid || "",
          createdByName: userCurent?.displayName || "",
          authorNickname: numePublicUser(userCurent, profilCurent),
          createdAt: new Date(), // Recomandat pentru ordonare ulterioară
        };

        await addDoc(collection(db, "locatii"), nouDocument);

        cafeForm.reset();
        seteazaFormularActiv(false);
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
    seteazaFormularActiv(false);
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
