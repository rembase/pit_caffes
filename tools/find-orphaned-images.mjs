import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const shouldDelete = process.argv.includes("--delete");
const skipConfirmation = process.argv.includes("--yes");
const bucketName = "pitesti-netcafes.firebasestorage.app";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service-account JSON file before running this script.",
  );
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  storageBucket: bucketName,
});

const db = getFirestore();
const bucket = getStorage().bucket();

function decodeStoragePathFromUrl(url) {
  try {
    const parsed = new URL(url);
    const encodedPath = parsed.pathname.split("/o/")[1];
    if (!encodedPath) return null;
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

const usedImagePaths = new Set();
const locationsSnapshot = await db.collection("locatii").get();

locationsSnapshot.forEach((doc) => {
  const imageUrl = doc.data().imagine;
  if (!imageUrl) return;

  const storagePath = decodeStoragePathFromUrl(imageUrl);
  if (storagePath) usedImagePaths.add(storagePath);
});

const [files] = await bucket.getFiles({ prefix: "imagini/" });
const orphanFiles = files.filter((file) => !usedImagePaths.has(file.name));

console.log(`Documente locatii: ${locationsSnapshot.size}`);
console.log(`Poze referite in Firestore: ${usedImagePaths.size}`);
console.log(`Poze in Storage/imagini: ${files.length}`);
console.log(`Poze orfane: ${orphanFiles.length}`);

for (const file of orphanFiles) {
  console.log(file.name);
}

if (shouldDelete) {
  if (orphanFiles.length === 0) {
    console.log("Nu exista poze orfane de sters.");
    process.exit(0);
  }

  if (!skipConfirmation) {
    const rl = createInterface({ input, output });
    const answer = await rl.question(
      `Scrie DELETE ca sa stergi definitiv ${orphanFiles.length} poze orfane: `,
    );
    rl.close();

    if (answer !== "DELETE") {
      console.log("Anulat. Nu am sters nimic.");
      process.exit(0);
    }
  }

  for (const file of orphanFiles) {
    await file.delete();
  }

  console.log(`Sterse ${orphanFiles.length} poze orfane.`);
}
