import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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
    let selectedTestType = 'Fasting';

    // Test type selector
    document.querySelectorAll('.test-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.test-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTestType = btn.dataset.type;
      });
    });

    // Determine Sugar Category based on ADA guidelines
    function getSugarCategory(glucose, testType) {
      if (testType === 'Fasting') {
        if (glucose < 70) return { name: 'Low (Hypoglycemia)', class: 'low', badge: 'badge-low' };
        if (glucose <= 100) return { name: 'Normal', class: 'normal', badge: 'badge-normal' };
        if (glucose <= 125) return { name: 'Prediabetes', class: 'prediabetes', badge: 'badge-prediabetes' };
        if (glucose > 300) return { name: 'Critical High', class: 'critical', badge: 'badge-critical' };
        return { name: 'Diabetes', class: 'diabetes', badge: 'badge-diabetes' };
      } else if (testType === 'PostMeal') {
        if (glucose < 70) return { name: 'Low', class: 'low', badge: 'badge-low' };
        if (glucose < 140) return { name: 'Normal', class: 'normal', badge: 'badge-normal' };
        if (glucose <= 199) return { name: 'Prediabetes', class: 'prediabetes', badge: 'badge-prediabetes' };
        if (glucose > 350) return { name: 'Critical High', class: 'critical', badge: 'badge-critical' };
        return { name: 'Diabetes', class: 'diabetes', badge: 'badge-diabetes' };
      } else { // Random
        if (glucose < 70) return { name: 'Low', class: 'low', badge: 'badge-low' };
        if (glucose <= 140) return { name: 'Normal', class: 'normal', badge: 'badge-normal' };
        if (glucose <= 199) return { name: 'Elevated', class: 'prediabetes', badge: 'badge-prediabetes' };
        if (glucose > 300) return { name: 'Critical', class: 'critical', badge: 'badge-critical' };
        return { name: 'High (Diabetes)', class: 'diabetes', badge: 'badge-diabetes' };
      }
    }

    // Format date and time
    function formatDateTime(date) {
      return new Date(date).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // Show status message
    function showStatus(message, type) {
      const statusEl = document.getElementById('statusMessage');
      statusEl.textContent = message;
      statusEl.className = `status-message ${type}`;
      setTimeout(() => {
        statusEl.className = 'status-message';
      }, 3000);
    }

    // Guide tab switching
    window.showGuide = (type) => {
      document.querySelectorAll('.guide-tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.guide-content').forEach(content => content.classList.remove('active'));
      
      event.target.classList.add('active');
      document.getElementById(`${type}-guide`).classList.add('active');
    };

    // Auth state observer
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        loadSugarHistory();
      } else {
        window.location.href = "login.html";
      }
    });

    // Form submission
    document.getElementById('sugarForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const glucoseLevel = parseInt(document.getElementById('glucoseLevel').value);
      const measurementTime = document.getElementById('measurementTime').value;
      const insulinTaken = document.getElementById('insulinTaken').value;
      const notes = document.getElementById('notes').value.trim();

      const category = getSugarCategory(glucoseLevel, selectedTestType);

      try {
        await addDoc(collection(db, `users/${currentUser.uid}/bloodSugar`), {
          glucoseLevel: glucoseLevel,
          testType: selectedTestType,
          measurementTime: measurementTime,
          insulinTaken: insulinTaken,
          notes: notes,
          category: category.name,
          timestamp: new Date(),
          createdAt: new Date()
        });

        showStatus('✓ Blood sugar reading saved successfully!', 'success');
        document.getElementById('sugarForm').reset();
        document.querySelectorAll('.test-type-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.test-type-btn[data-type="Fasting"]').classList.add('active');
        selectedTestType = 'Fasting';
      } catch (error) {
        showStatus('Error saving reading: ' + error.message, 'error');
      }
    });

    // Load Sugar history
    function loadSugarHistory() {
      const q = query(
        collection(db, `users/${currentUser.uid}/bloodSugar`),
        orderBy('timestamp', 'desc')
      );

      onSnapshot(q, (snapshot) => {
        const historyBody = document.getElementById('historyBody');
        
        if (snapshot.empty) {
          historyBody.innerHTML = `
            <tr>
              <td colspan="8" class="empty-state">
                <div class="empty-state-icon">📊</div>
                <div>No readings recorded yet. Start tracking your blood sugar!</div>
              </td>
            </tr>
          `;
          return;
        }

        historyBody.innerHTML = '';
        
        // Update latest reading display
        const latestDoc = snapshot.docs[0];
        const latestData = latestDoc.data();
        updateCurrentReading(latestData);

        // Populate table
        snapshot.forEach((doc) => {
          const data = doc.data();
          const category = getSugarCategory(data.glucoseLevel, data.testType);
          
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${formatDateTime(data.timestamp.toDate())}</td>
            <td><strong>${data.glucoseLevel}</strong></td>
            <td>${data.testType}</td>
            <td>${data.measurementTime}</td>
            <td>${data.insulinTaken}</td>
            <td><span class="status-badge ${category.badge}">${category.name}</span></td>
            <td>${data.notes || '--'}</td>
            <td>
              <button class="delete-btn" onclick="deleteReading('${doc.id}')" title="Delete reading">
                🗑️
              </button>
            </td>
          `;
          historyBody.appendChild(row);
        });
      });
    }

    // Update current reading display
    function updateCurrentReading(data) {
      const category = getSugarCategory(data.glucoseLevel, data.testType);
      
      document.getElementById('currentSugarDisplay').textContent = data.glucoseLevel;
      document.getElementById('currentStatus').textContent = category.name;
      document.getElementById('currentTestType').textContent = data.testType;
      document.getElementById('currentTime').textContent = data.measurementTime;
      document.getElementById('currentDate').textContent = new Date(data.timestamp.toDate()).toLocaleDateString('en-IN');
      document.getElementById('currentInsulin').textContent = data.insulinTaken;
    }

    // Delete reading
    window.deleteReading = async (docId) => {
      if (confirm('Are you sure you want to delete this reading?')) {
        try {
          await deleteDoc(doc(db, `users/${currentUser.uid}/bloodSugar`, docId));
          showStatus('Reading deleted successfully', 'success');
        } catch (error) {
          showStatus('Error deleting reading: ' + error.message, 'error');
        }
      }
    };

    // Export data function
    window.exportData = async () => {
      const q = query(
        collection(db, `users/${currentUser.uid}/bloodSugar`),
        orderBy('timestamp', 'desc')
      );

      const snapshot = await getDocs(q);
      let csvContent = "Date,Time,Glucose (mg/dL),Test Type,Period,Insulin,Category,Notes\n";

      snapshot.forEach((doc) => {
        const data = doc.data();
        const date = new Date(data.timestamp.toDate());
        const category = getSugarCategory(data.glucoseLevel, data.testType);
        
        csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${data.glucoseLevel},${data.testType},${data.measurementTime},${data.insulinTaken},${category.name},"${data.notes || ''}"\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blood-sugar-readings-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    };
