    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
    import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
    import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, getDoc, where, getDocs, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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
    let todaySteps = 0;
    let targetSteps = 10000;
    let todayData = {};
    let medicineSchedule = [];
    let notificationInterval = null;
    let offlineQueue = [];
    let currentChart = null;
    const today = new Date().toISOString().split('T')[0];

    // Theme management
    const themeToggle = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';

    themeToggle.addEventListener('click', () => {
      const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    });

    // Offline detection
    window.addEventListener('online', () => {
      document.getElementById('offlineIndicator').classList.remove('show');
      syncOfflineData();
    });

    window.addEventListener('offline', () => {
      document.getElementById('offlineIndicator').classList.add('show');
    });

    // Display current date
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-IN', dateOptions);

    // Show status message
    function showStatus(message, type) {
      const statusEl = document.getElementById('statusMessage');
      statusEl.textContent = message;
      statusEl.className = `status-message ${type}`;
      setTimeout(() => {
        statusEl.className = 'status-message';
      }, 3000);
    }

    // Modal functions
    window.openTargetModal = () => {
      document.getElementById('targetStepsInput').value = targetSteps;
      document.getElementById('targetModal').classList.add('show');
    };

    window.closeModal = (modalId) => {
      document.getElementById(modalId).classList.remove('show');
    };

    // Target form submission
    document.getElementById('targetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newTarget = parseInt(document.getElementById('targetStepsInput').value);
      
      if (newTarget < 1000 || newTarget > 100000) {
        showStatus('Please enter a target between 1,000 and 100,000 steps', 'error');
        return;
      }

      targetSteps = newTarget;
      document.getElementById('targetSteps').textContent = targetSteps.toLocaleString();
      
      try {
        await setDoc(doc(db, `users/${currentUser.uid}/settings`, 'walkingTarget'), {
          target: targetSteps,
          updatedAt: new Date()
        });
        
        updateProgress();
        closeModal('targetModal');
        showStatus('Target updated successfully!', 'success');
      } catch (error) {
        showStatus('Error updating target: ' + error.message, 'error');
      }
    });

    // Auth state observer
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        await loadUserSettings();
        await loadTodayData();
        await loadMedicineSchedule();
        loadHistory(7);
        checkNotificationPermission();
        setupMedicineReminders();
        calculateStreak();
        initChart();
      } else {
        window.location.href = "login.html";
      }
    });

    // Load user settings
    async function loadUserSettings() {
      try {
        const settingsRef = doc(db, `users/${currentUser.uid}/settings`, 'walkingTarget');
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
          targetSteps = settingsSnap.data().target || 10000;
          document.getElementById('targetSteps').textContent = targetSteps.toLocaleString();
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }

    // Load today's data
    async function loadTodayData() {
      try {
        const todayRef = doc(db, `users/${currentUser.uid}/dailyTasks`, today);
        const todaySnap = await getDoc(todayRef);

        if (todaySnap.exists()) {
          todayData = todaySnap.data();
          todaySteps = todayData.steps || 0;
          
          // Update UI
          document.getElementById('currentSteps').textContent = todaySteps.toLocaleString();
          updateProgress();
          updateDistance();

          // Update walking button
          if (todayData.walkingComplete) {
            document.getElementById('completeWalkingBtn').disabled = true;
            document.getElementById('completeWalkingBtn').textContent = '✓ Walking Completed';
          }
        }
      } catch (error) {
        console.error('Error loading today data:', error);
        showStatus('Error loading data', 'error');
      }
    }

    // Update steps
    window.updateSteps = async () => {
      const stepsInput = document.getElementById('stepsInput');
      const steps = parseInt(stepsInput.value);

      if (!steps || steps <= 0) {
        showStatus('Please enter a valid number of steps', 'error');
        return;
      }

      if (steps > 50000) {
        if (!confirm('That seems like a lot of steps! Are you sure?')) {
          return;
        }
      }

      const previousSteps = todaySteps;
      todaySteps += steps;
      
      try {
        await setDoc(doc(db, `users/${currentUser.uid}/dailyTasks`, today), {
          steps: todaySteps,
          date: today,
          updatedAt: new Date()
        }, { merge: true });

        document.getElementById('currentSteps').textContent = todaySteps.toLocaleString();
        updateProgress();
        updateDistance();
        stepsInput.value = '';
        showStatus(`Added ${steps.toLocaleString()} steps successfully! 🎉`, 'success');

        // Check for achievements
        checkAchievements(previousSteps, todaySteps);
      } catch (error) {
        if (!navigator.onLine) {
          offlineQueue.push({ type: 'steps', data: { steps: todaySteps } });
          showStatus('Saved offline. Will sync when online.', 'info');
        } else {
          showStatus('Error updating steps: ' + error.message, 'error');
        }
      }
    };

    // Update progress bar
    function updateProgress() {
      const percent = Math.min((todaySteps / targetSteps) * 100, 100);
      document.getElementById('progressPercent').textContent = Math.round(percent) + '%';
      const progressBar = document.getElementById('progressBar');
      progressBar.style.width = percent + '%';
      progressBar.textContent = Math.round(percent) + '%';
      progressBar.setAttribute('aria-valuenow', Math.round(percent));

      if (percent === 100 && !progressBar.classList.contains('celebrating')) {
        progressBar.classList.add('celebrating');
        setTimeout(() => progressBar.classList.remove('celebrating'), 1000);
      }
    }

    // Update distance
    function updateDistance() {
      // Average: 1 km = 1300 steps
      const km = (todaySteps / 1300).toFixed(1);
      document.getElementById('distanceKm').textContent = km;
    }

    // Voice input
    const voiceBtn = document.getElementById('voiceBtn');
    let recognition;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const numbers = transcript.match(/\d+/);
        if (numbers) {
          document.getElementById('stepsInput').value = numbers[0];
          showStatus(`Heard: ${numbers[0]} steps`, 'info');
        }
        voiceBtn.classList.remove('listening');
      };

      recognition.onerror = () => {
        voiceBtn.classList.remove('listening');
        showStatus('Voice recognition error', 'error');
      };

      recognition.onend = () => {
        voiceBtn.classList.remove('listening');
      };

      voiceBtn.addEventListener('click', () => {
        if (voiceBtn.classList.contains('listening')) {
          recognition.stop();
        } else {
          recognition.start();
          voiceBtn.classList.add('listening');
          showStatus('Listening... Say the number of steps', 'info');
        }
      });
    } else {
      voiceBtn.style.display = 'none';
    }

    // Mark walking complete
    window.markWalkingComplete = async () => {
      if (todaySteps < targetSteps) {
        if (!confirm(`You've only walked ${todaySteps.toLocaleString()} steps out of ${targetSteps.toLocaleString()}. Mark as complete anyway?`)) {
          return;
        }
      }

      try {
        await setDoc(doc(db, `users/${currentUser.uid}/dailyTasks`, today), {
          walkingComplete: true,
          walkingCompletedAt: new Date(),
          steps: todaySteps
        }, { merge: true });

        document.getElementById('completeWalkingBtn').disabled = true;
        document.getElementById('completeWalkingBtn').textContent = '✓ Walking Completed';
        showStatus('Walking task marked complete! 🎉', 'success');
        
        if (todaySteps >= targetSteps) {
          showAchievement('Target Reached!', `You walked ${todaySteps.toLocaleString()} steps today!`);
        }
      } catch (error) {
        showStatus('Error: ' + error.message, 'error');
      }
    };

    // Load medicine schedule
    async function loadMedicineSchedule() {
      try {
        const q = query(collection(db, `users/${currentUser.uid}/medicines`), orderBy('time', 'asc'));
        const snapshot = await getDocs(q);
        
        medicineSchedule = [];
        snapshot.forEach((doc) => {
          medicineSchedule.push({ id: doc.id, ...doc.data() });
        });

        renderMedicineSchedule();
      } catch (error) {
        console.error('Error loading medicine schedule:', error);
      }
    }

    // Render medicine schedule
    function renderMedicineSchedule() {
      const container = document.getElementById('medicineSchedule');
      container.innerHTML = '';

      if (medicineSchedule.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No medicines added yet. Click "Add Medicine" to get started.</p>';
        return;
      }

      medicineSchedule.forEach((medicine) => {
        const isCompleted = todayData[`medicine_${medicine.id}`];
        const item = document.createElement('div');
        item.className = `medicine-item ${isCompleted ? 'completed' : ''}`;
        item.id = `medicine_${medicine.id}`;

        item.innerHTML = `
          <div class="medicine-details">
            <h4>
              <input 
                type="text" 
                class="medicine-name-input" 
                value="${medicine.name}" 
                onblur="updateMedicineName('${medicine.id}', this.value)"
                aria-label="Medicine name"
              >
            </h4>
            <div class="medicine-time">
              <span>⏰</span>
              <span>Time:</span>
              <input 
                type="time" 
                class="time-input" 
                value="${medicine.time}" 
                onchange="updateMedicineTime('${medicine.id}', this.value)"
                aria-label="Medicine time"
              >
            </div>
            <div class="medicine-time">
              <span>💊</span>
              <span>${medicine.dosage || 'As prescribed'}</span>
            </div>
          </div>
          <div class="medicine-status">
            <span class="status-badge ${isCompleted ? 'status-completed' : 'status-pending'}" id="status_${medicine.id}">
              ${isCompleted ? 'Completed' : 'Pending'}
            </span>
            <div class="medicine-actions">
              <button 
                class="mark-complete-btn" 
                id="btn_${medicine.id}" 
                onclick="markMedicineComplete('${medicine.id}')"
                ${isCompleted ? 'disabled' : ''}
                aria-label="Mark medicine complete"
              >
                ${isCompleted ? '✓ Done' : '✓ Mark'}
              </button>
              <button 
                class="delete-medicine-btn" 
                onclick="deleteMedicine('${medicine.id}')"
                aria-label="Delete medicine"
              >
                🗑️
              </button>
            </div>
          </div>
        `;

        container.appendChild(item);
      });
    }

    // Add medicine slot
    window.addMedicineSlot = async () => {
      const name = prompt('Enter medicine name:');
      if (!name) return;

      const time = prompt('Enter time (HH:MM format, e.g., 08:00):', '08:00');
      if (!time || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        showStatus('Invalid time format', 'error');
        return;
      }

      const dosage = prompt('Enter dosage (optional):', '1 tablet');

      try {
        await addDoc(collection(db, `users/${currentUser.uid}/medicines`), {
          name,
          time,
          dosage,
          createdAt: new Date()
        });

        await loadMedicineSchedule();
        setupMedicineReminders();
        showStatus('Medicine added successfully!', 'success');
      } catch (error) {
        showStatus('Error adding medicine: ' + error.message, 'error');
      }
    };

    // Update medicine name
    window.updateMedicineName = async (id, name) => {
      if (!name.trim()) return;

      try {
        await setDoc(doc(db, `users/${currentUser.uid}/medicines`, id), {
          name: name.trim()
        }, { merge: true });

        const medicine = medicineSchedule.find(m => m.id === id);
        if (medicine) medicine.name = name.trim();
        
        showStatus('Medicine name updated', 'success');
      } catch (error) {
        showStatus('Error updating name: ' + error.message, 'error');
      }
    };

    // Update medicine time
    window.updateMedicineTime = async (id, time) => {
      try {
        await setDoc(doc(db, `users/${currentUser.uid}/medicines`, id), {
          time
        }, { merge: true });

        const medicine = medicineSchedule.find(m => m.id === id);
        if (medicine) medicine.time = time;

        setupMedicineReminders();
        showStatus('Medicine time updated', 'success');
      } catch (error) {
        showStatus('Error updating time: ' + error.message, 'error');
      }
    };

    // Delete medicine
    window.deleteMedicine = async (id) => {
      if (!confirm('Are you sure you want to delete this medicine?')) return;

      try {
        await deleteDoc(doc(db, `users/${currentUser.uid}/medicines`, id));
        await loadMedicineSchedule();
        setupMedicineReminders();
        showStatus('Medicine deleted', 'success');
      } catch (error) {
        showStatus('Error deleting medicine: ' + error.message, 'error');
      }
    };

    // Mark medicine complete
    window.markMedicineComplete = async (id) => {
      try {
        const field = `medicine_${id}`;
        await setDoc(doc(db, `users/${currentUser.uid}/dailyTasks`, today), {
          [field]: true,
          [`${field}_completedAt`]: new Date(),
          date: today
        }, { merge: true });

        todayData[field] = true;

        // Update UI
        const item = document.getElementById(`medicine_${id}`);
        const status = document.getElementById(`status_${id}`);
        const btn = document.getElementById(`btn_${id}`);

        item.classList.add('completed');
        status.textContent = 'Completed';
        status.className = 'status-badge status-completed';
        btn.disabled = true;
        btn.textContent = '✓ Done';

        const medicine = medicineSchedule.find(m => m.id === id);
        showStatus(`${medicine?.name || 'Medicine'} marked complete! 💊`, 'success');
      } catch (error) {
        showStatus('Error: ' + error.message, 'error');
      }
    };

    // Load history
    window.loadHistory = async (days = 7) => {
      const historyList = document.getElementById('historyList');
      historyList.innerHTML = '<div class="spinner"></div>';

      try {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - days);
        const daysAgoStr = daysAgo.toISOString().split('T')[0];

        const q = query(
          collection(db, `users/${currentUser.uid}/dailyTasks`),
          where('date', '>=', daysAgoStr),
          orderBy('date', 'desc'),
          limit(days)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          historyList.innerHTML = '<div class="history-item" style="justify-content: center; color: #6c757d;">No history available yet</div>';
          return;
        }

        historyList.innerHTML = '';
        snapshot.forEach((doc) => {
          const data = doc.data();
          const item = document.createElement('div');
          item.className = 'history-item';
          
          const dateStr = new Date(data.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
          
          // Count completed medicines
          let medicinesCompleted = 0;
          Object.keys(data).forEach(key => {
            if (key.startsWith('medicine_') && !key.includes('completedAt')) {
              medicinesCompleted++;
            }
          });

          item.innerHTML = `
            <div class="history-date">${dateStr}</div>
            <div class="history-details">
              <span>🚶 ${(data.steps || 0).toLocaleString()} steps ${data.walkingComplete ? '✓' : ''}</span>
              <span>💊 ${medicinesCompleted} medicine${medicinesCompleted !== 1 ? 's' : ''} taken</span>
            </div>
          `;
          historyList.appendChild(item);
        });
      } catch (error) {
        historyList.innerHTML = '<div class="history-item" style="justify-content: center; color: var(--danger);">Error loading history</div>';
        console.error('Error loading history:', error);
      }
    };

    // Calculate streak
    async function calculateStreak() {
      try {
        const q = query(
          collection(db, `users/${currentUser.uid}/dailyTasks`),
          orderBy('date', 'desc'),
          limit(100)
        );

        const snapshot = await getDocs(q);
        let streak = 0;
        let lastDate = new Date();
        lastDate.setDate(lastDate.getDate() + 1); // Start from tomorrow

        snapshot.forEach((doc) => {
          const data = doc.data();
          const docDate = new Date(data.date);
          
          lastDate.setDate(lastDate.getDate() - 1);
          
          if (docDate.toISOString().split('T')[0] === lastDate.toISOString().split('T')[0]) {
            if (data.walkingComplete || data.steps >= targetSteps) {
              streak++;
            } else {
              return; // Break the streak
            }
          } else {
            return; // Gap in dates
          }
        });

        document.getElementById('streakCount').textContent = streak;
        
        if (streak >= 7) {
          document.getElementById('streakBadge').style.display = 'flex';
        }
      } catch (error) {
        console.error('Error calculating streak:', error);
      }
    }

    // Notification permission
    function checkNotificationPermission() {
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          document.getElementById('notificationToggle').checked = true;
          document.getElementById('enableNotificationsBtn').style.display = 'none';
        }
      }
    }

    // Enable notifications
    document.getElementById('enableNotificationsBtn').addEventListener('click', async () => {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          showStatus('Notifications enabled successfully!', 'success');
          document.getElementById('notificationToggle').checked = true;
          document.getElementById('enableNotificationsBtn').style.display = 'none';
          setupMedicineReminders();
        } else {
          showStatus('Notification permission denied', 'error');
        }
      } else {
        showStatus('Notifications not supported in this browser', 'error');
      }
    });

    // Setup medicine reminders (FIXED - prevents multiple intervals)
    function setupMedicineReminders() {
      // Clear existing interval to prevent memory leaks
      if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
      }

      if (Notification.permission !== 'granted' || medicineSchedule.length === 0) return;

      // Check every minute
      notificationInterval = setInterval(() => {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        medicineSchedule.forEach((medicine) => {
          if (medicine.time === currentTime && !todayData[`medicine_${medicine.id}`]) {
            new Notification('💊 Medicine Reminder', {
              body: `Time to take: ${medicine.name}`,
              icon: '💊',
              tag: `medicine-${medicine.id}`,
              requireInteraction: true
            });
          }
        });
      }, 60000); // Check every minute
    }

    // Notification toggle
    document.getElementById('notificationToggle').addEventListener('change', (e) => {
      if (!e.target.checked) {
        showStatus('Notifications disabled', 'info');
        if (notificationInterval) {
          clearInterval(notificationInterval);
          notificationInterval = null;
        }
      } else if (Notification.permission !== 'granted') {
        e.target.checked = false;
        document.getElementById('enableNotificationsBtn').click();
      } else {
        setupMedicineReminders();
      }
    });

    // Sync offline data
    async function syncOfflineData() {
      if (offlineQueue.length === 0) return;

      showStatus('Syncing offline data...', 'info');

      for (const item of offlineQueue) {
        try {
          if (item.type === 'steps') {
            await setDoc(doc(db, `users/${currentUser.uid}/dailyTasks`, today), {
              steps: item.data.steps,
              date: today,
              updatedAt: new Date()
            }, { merge: true });
          }
        } catch (error) {
          console.error('Sync error:', error);
        }
      }

      offlineQueue = [];
      showStatus('Data synced successfully!', 'success');
    }

    // Check achievements
    function checkAchievements(previousSteps, newSteps) {
      const milestones = [5000, 10000, 15000, 20000, 25000];
      
      for (const milestone of milestones) {
        if (previousSteps < milestone && newSteps >= milestone) {
          showAchievement('Milestone Reached!', `You've walked ${milestone.toLocaleString()} steps today! 🎉`);
          break;
        }
      }
    }

    // Show achievement
    function showAchievement(title, text) {
      const badge = document.getElementById('achievementBadge');
      document.getElementById('achievementTitle').textContent = title;
      document.getElementById('achievementText').textContent = text;
      badge.classList.add('show');

      setTimeout(() => {
        badge.classList.remove('show');
      }, 5000);
    }

    // Initialize chart
    function initChart() {
      const ctx = document.getElementById('progressChart').getContext('2d');
      
      // Simple canvas-based chart (you can integrate Chart.js library for better charts)
      drawWeeklyChart(ctx);

      // Chart tab switching
      document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.chart-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          
          const chartType = tab.dataset.chart;
          if (chartType === 'weekly') {
            drawWeeklyChart(ctx);
          } else {
            drawMonthlyChart(ctx);
          }
        });
      });
    }

    async function drawWeeklyChart(ctx) {
      const canvas = ctx.canvas;
      const width = canvas.width = canvas.offsetWidth;
      const height = canvas.height = canvas.offsetHeight;
      
      ctx.clearRect(0, 0, width, height);

      // Get last 7 days data
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

        const q = query(
          collection(db, `users/${currentUser.uid}/dailyTasks`),
          where('date', '>=', sevenDaysAgoStr),
          orderBy('date', 'asc')
        );

        const snapshot = await getDocs(q);
        const data = [];
        
        // Fill in all 7 days
        for (let i = 0; i < 7; i++) {
          const date = new Date();
          date.setDate(date.getDate() - (6 - i));
          const dateStr = date.toISOString().split('T')[0];
          
          const doc = snapshot.docs.find(d => d.data().date === dateStr);
          data.push({
            date: date.toLocaleDateString('en-IN', { weekday: 'short' }),
            steps: doc ? doc.data().steps || 0 : 0
          });
        }

        // Draw chart
        const padding = 40;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        const maxSteps = Math.max(...data.map(d => d.steps), targetSteps);
        const barWidth = chartWidth / data.length;

        // Draw bars
        data.forEach((item, index) => {
          const barHeight = (item.steps / maxSteps) * chartHeight;
          const x = padding + index * barWidth + barWidth * 0.2;
          const y = height - padding - barHeight;
          
          ctx.fillStyle = item.steps >= targetSteps ? '#28a745' : '#667eea';
          ctx.fillRect(x, y, barWidth * 0.6, barHeight);
          
          // Draw labels
          ctx.fillStyle = '#333';
          ctx.font = '12px Segoe UI';
          ctx.textAlign = 'center';
          ctx.fillText(item.date, x + barWidth * 0.3, height - padding + 20);
          
          if (item.steps > 0) {
            ctx.fillText(item.steps.toLocaleString(), x + barWidth * 0.3, y - 5);
          }
        });

        // Draw target line
        const targetY = height - padding - (targetSteps / maxSteps) * chartHeight;
        ctx.strokeStyle = '#dc3545';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, targetY);
        ctx.lineTo(width - padding, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#dc3545';
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'left';
        ctx.fillText(`Target: ${targetSteps.toLocaleString()}`, padding, targetY - 5);

      } catch (error) {
        console.error('Error drawing chart:', error);
      }
    }

    async function drawMonthlyChart(ctx) {
      const canvas = ctx.canvas;
      const width = canvas.width = canvas.offsetWidth;
      const height = canvas.height = canvas.offsetHeight;
      
      ctx.clearRect(0, 0, width, height);
      
      // Similar implementation for monthly view
      ctx.fillStyle = '#333';
      ctx.font = '16px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText('Monthly chart coming soon...', width / 2, height / 2);
    }

    // Export to PDF
    window.exportToPDF = async () => {
      showStatus('Generating PDF...', 'info');
      
      // You can integrate jsPDF library here
      // For now, showing a simple implementation
      try {
        const content = `
Daily Tasks Report
Date: ${new Date().toLocaleDateString('en-IN')}

Walking Progress:
- Current Steps: ${todaySteps.toLocaleString()}
- Target: ${targetSteps.toLocaleString()}
- Progress: ${Math.round((todaySteps / targetSteps) * 100)}%

Medicine Schedule:
${medicineSchedule.map(m => `- ${m.name} at ${m.time}`).join('\n')}
        `;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `health-tasks-${today}.txt`;
        a.click();
        
        showStatus('Report exported successfully!', 'success');
      } catch (error) {
        showStatus('Error exporting report: ' + error.message, 'error');
      }
    };

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + S to save steps
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const stepsInput = document.getElementById('stepsInput');
        if (stepsInput.value) {
          updateSteps();
        }
      }
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      if (notificationInterval) {
        clearInterval(notificationInterval);
      }
    });
 