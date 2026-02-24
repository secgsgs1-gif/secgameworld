export const firebaseConfig = {
  apiKey: "AIzaSyAwGVCFews7nz277e7gZ9ZDEOypdU_vfBY",
  authDomain: "secgameworld2.firebaseapp.com",
  projectId: "secgameworld2",
  storageBucket: "secgameworld2.firebasestorage.app",
  messagingSenderId: "694157942896",
  appId: "1:694157942896:web:17329e91a5ebf95b9054b5",
  measurementId: "G-GBX71L8NTS"
};

export function isFirebaseConfigured() {
  return !Object.values(firebaseConfig).some((v) => String(v).includes("REPLACE_ME"));
}
