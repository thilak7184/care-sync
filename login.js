import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyArghTx-mBhVMlwwiqwqfdd_v5Iv8ichmY",
  authDomain: "health-monitoring-d1c48.firebaseapp.com",
  projectId: "health-monitoring-d1c48",
  storageBucket: "health-monitoring-d1c48.appspot.com",
  messagingSenderId: "653902741322",
  appId: "1:653902741322:web:6cd591327f96c70e908bb3",
  measurementId: "G-VSG709Z5NT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const notificationBox = document.getElementById("notification-box");
const loginBtn = document.getElementById("loginBtn");

function showNotification(message, isSuccess = false) {
  notificationBox.textContent = message;
  notificationBox.className = isSuccess ? 'success show' : 'error show';
  setTimeout(() => {
    notificationBox.className = '';
  }, 3000);
}

loginBtn.addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
alert("attempting to login");
  if (!email || !password) {
    showNotification("Please enter both email and password.", false);
    return;
  }

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      alert("Login successful");
      showNotification(`Welcome back, ${user.email}!`, true);
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1500);
    })
    .catch((error) => {
      let message = "Login failed. Please check your credentials.";
      alert("Login failed check password and email");
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        message = "Invalid email or password.";
      } else if (error.code === "auth/invalid-email") {
        message = "The email address is not valid.";
      } else if (error.code === "auth/network-request-failed") {
        message = "Network error. Please check your connection.";
      }
      console.error(error);
      showNotification(`Error: ${message}`, false);
    });
});
