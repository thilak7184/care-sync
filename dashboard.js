import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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
const db = getFirestore(app);

let currentUser;

// Profile toggle function
window.toggleProfile = () => {
  const profileSection = document.getElementById('profileSection');
  profileSection.classList.toggle('active');
};

// Auth state observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    
    // Update user info in header
    document.getElementById('userName').textContent = user.displayName || 'User';
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userAvatar').src = user.photoURL || 'https://via.placeholder.com/60';

    // Fetch user profile from Firestore
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data();
      document.getElementById('fullName').value = data.fullName || "";
      document.getElementById('age').value = data.age || "";
      document.getElementById('gender').value = data.gender || "";
      document.getElementById('bloodGroup').value = data.bloodGroup || "";
    }

    // Load dashboard stats (placeholder - will be implemented with actual data)
    loadDashboardStats(user.uid);
  } else {
    window.location.href = "login.html";
  }
});

// Load dashboard statistics
async function loadDashboardStats(userId) {
  // These will be populated from actual Firestore data in future implementations
  // For now showing placeholders
  
  // This is where you'll fetch latest BP, sugar, tasks data
  // Example structure for future implementation:
  /*
  const bpRef = doc(db, "bloodPressure", userId);
  const bpSnap = await getDoc(bpRef);
  if (bpSnap.exists()) {
    const bpData = bpSnap.data();
    document.getElementById('bpValue').textContent = `${bpData.systolic}/${bpData.diastolic}`;
  }
  */
}

// Profile form submission
document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const status = document.getElementById('profileStatus');
  status.className = '';
  status.textContent = 'Saving...';
  status.style.display = 'block';

  const updatedData = {
    fullName: document.getElementById('fullName').value.trim(),
    age: document.getElementById('age').value,
    gender: document.getElementById('gender').value,
    bloodGroup: document.getElementById('bloodGroup').value,
    updatedAt: new Date()
  };

  try {
    await setDoc(doc(db, "users", currentUser.uid), updatedData, { merge: true });
    status.className = 'success';
    status.textContent = '✓ Profile updated successfully!';
    
    // Update display name in header
    document.getElementById('userName').textContent = updatedData.fullName;
  } catch (error) {
    status.className = 'error';
    status.textContent = '✗ Error: ' + error.message;
  }
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    alert('Error signing out: ' + error.message);
  }
});
