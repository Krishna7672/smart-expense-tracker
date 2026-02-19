/* =========================================
   STATE MANAGEMENT
   ========================================= */
const state = {
    expenses: JSON.parse(localStorage.getItem('lumina_expenses')) || [],
    budget: parseFloat(localStorage.getItem('lumina_budget')) || 0,
    currency: '₹',
    mode: 'Personal'
};

const dom = {
    form: document.getElementById('expense-form'),
    desc: document.getElementById('desc-input'),
    amount: document.getElementById('amount-input'),
    date: document.getElementById('date-input'),
    recurring: document.getElementById('recurring-input'),
    total: document.getElementById('total-amount'),
    list: document.getElementById('expense-list'),
    calendar: document.getElementById('calendar-grid'),
    monthYear: document.getElementById('current-month-year'),
    budgetInput: document.getElementById('budget-input'),
    header: document.getElementById('main-header'),
    modeToggle: document.getElementById('mode-toggle'),
    fxContainer: document.getElementById('fx-container'),
    radios: document.querySelectorAll('input[name="category"]')
};

dom.date.valueAsDate = new Date();
dom.budgetInput.value = state.budget || '';

let lastAddedDate = null; // Tracks the date you JUST added to trigger the animation

function getFilteredExpenses() {
    return state.expenses.filter(e => e.mode === state.mode || (!e.mode && state.mode === 'Personal'));
}

function init() {
    processRecurring();
    updateUI();
    initCharts();
    updateCharts();
    initThreeJS();
    animateThreeJS();
    updateAllGauges();
}

/* =========================================
   MODE TOGGLE & BUDGET LOGIC
   ========================================= */
dom.modeToggle.addEventListener('change', (e) => {
    state.mode = e.target.checked ? 'Business' : 'Personal';
    document.getElementById('mode-label-personal').className = !e.target.checked ? 'active-mode' : '';
    document.getElementById('mode-label-business').className = e.target.checked ? 'active-mode' : '';
    document.body.style.setProperty('--bg-dark', state.mode === 'Business' ? '#0f0c1b' : '#0a0e17');
    updateUI();
    updateCharts();
    updateAllGauges();
});

dom.budgetInput.addEventListener('change', (e) => {
    state.budget = parseFloat(e.target.value) || 0;
    localStorage.setItem('lumina_budget', state.budget);
    checkBudget();
});

/* =========================================
   EXPORT / IMPORT CSV
   ========================================= */
document.getElementById('export-btn').addEventListener('click', () => {
    let csv = 'ID,Description,Amount,Date,Category,Mode,Recurring\n';
    state.expenses.forEach(e => {
        csv += `${e.id},"${e.desc}",${e.amount},${e.date},${e.category},${e.mode || 'Personal'},${e.recurring || false}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Lumina_Expenses.csv'; a.click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const rows = event.target.result.split('\n').slice(1);
        rows.forEach(row => {
            if(!row.trim()) return;
            const cols = row.split(',');
            if(cols.length >= 6 && !state.expenses.find(x => x.id == cols[0])) {
                state.expenses.push({
                    id: parseInt(cols[0]), desc: cols[1].replace(/"/g,''), amount: parseFloat(cols[2]), 
                    date: cols[3], category: cols[4], mode: cols[5], recurring: cols[6] === 'true'
                });
            }
        });
        saveData(); updateUI(); updateCharts(); updateAllGauges();
    };
    reader.readAsText(file);
});

/* =========================================
   RECURRING LOGIC
   ========================================= */
function processRecurring() {
    const today = new Date();
    const currentMonth = today.getMonth();
    let addedNew = false;
    state.expenses.forEach(exp => {
        if (exp.recurring) {
            const expDate = new Date(exp.date);
            if (expDate.getMonth() !== currentMonth || expDate.getFullYear() !== today.getFullYear()) {
                const alreadyAddedThisMonth = state.expenses.find(e => 
                    e.desc === exp.desc && e.recurring === true && new Date(e.date).getMonth() === currentMonth
                );
                if(!alreadyAddedThisMonth) {
                    state.expenses.push({ ...exp, id: Date.now() + Math.random(), date: today.toISOString().split('T')[0] });
                    addedNew = true;
                }
            }
        }
    });
    if(addedNew) { saveData(); alert("Recurring bills for this month have been auto-added!"); }
}

/* =========================================
   VISUALIZER SWITCHING LOGIC
   ========================================= */
const categoryIcons = { 'Milk': 'fa-glass-water', 'Electricity': 'fa-bolt', 'Gas': 'fa-fire', 'Investments': 'fa-arrow-trend-up', 'Other': 'fa-piggy-bank' };

dom.radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const cat = e.target.value;
        document.querySelectorAll('.vis-container').forEach(el => el.classList.remove('active'));
        document.getElementById(`vis-${cat}`).classList.add('active');
        document.getElementById('vis-title').innerHTML = `<i class="fa-solid ${categoryIcons[cat]}"></i> ${cat} Gauge`;
        document.getElementById('vis-hint').innerText = `Visualizes "${cat}" spending volume`;
    });
});

/* =========================================
   CORE LOGIC & UI
   ========================================= */
dom.form.addEventListener('submit', (e) => {
    e.preventDefault();
    initAudio(); 

    const category = document.querySelector('input[name="category"]:checked').value;
    
    // Store the exact date that was added so the calendar can animate it
    lastAddedDate = dom.date.value;

    const expense = {
        id: Date.now(), desc: dom.desc.value, amount: parseFloat(dom.amount.value),
        date: dom.date.value, category: category, mode: state.mode, recurring: dom.recurring.checked
    };

    state.expenses.push(expense);
    saveData(); updateUI(); updateCharts(); updateAllGauges(); triggerCategoryEffect(category);
    
    dom.desc.value = ''; dom.amount.value = ''; dom.recurring.checked = false;
});

function saveData() { localStorage.setItem('lumina_expenses', JSON.stringify(state.expenses)); }
function deleteExpense(id) { state.expenses = state.expenses.filter(e => e.id !== id); saveData(); updateUI(); updateCharts(); updateAllGauges(); }

function updateUI() { renderList(); updateTotal(); renderCalendar(); }

function checkBudget() {
    const total = getFilteredExpenses().reduce((acc, curr) => acc + curr.amount, 0);
    if (state.budget > 0 && total >= state.budget * 0.8) {
        dom.header.classList.add('budget-warning');
        if(total > state.budget && audioCtx) playCoinSound(); 
    } else { dom.header.classList.remove('budget-warning'); }
}

function updateTotal() {
    const total = getFilteredExpenses().reduce((acc, curr) => acc + curr.amount, 0);
    let start = parseFloat(dom.total.innerText.replace(/[^0-9.-]+/g,"")) || 0;
    animateValue(dom.total, start, total, 1000);
    checkBudget();
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        let formatted = (progress * (end - start) + start).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        obj.innerHTML = state.currency + formatted;
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function renderList() {
    dom.list.innerHTML = '';
    const sorted = [...getFilteredExpenses()].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.slice(0, 10).forEach(exp => {
        const li = document.createElement('li'); li.className = `expense-item ${exp.category}`;
        li.innerHTML = `<div class="item-info"><h4>${exp.desc} ${exp.recurring ? '<i class="fa-solid fa-rotate" style="font-size:0.6rem;color:var(--text-muted)"></i>' : ''}</h4><span>${exp.date} • ${exp.category}</span></div>
                        <div class="item-actions"><span class="item-cost">-${state.currency}${exp.amount.toLocaleString('en-IN')}</span>
                        <button onclick="deleteExpense(${exp.id})" style="background:none;border:none;color:#ff5555;cursor:pointer;margin-left:10px;"><i class="fa-solid fa-trash"></i></button></div>`;
        dom.list.prepend(li);
    });
}

function renderCalendar() {
    dom.calendar.innerHTML = '';
    const now = new Date();
    dom.monthYear.innerText = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    const expenseDates = new Set(getFilteredExpenses().map(e => {
        const d = new Date(e.date);
        if(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return d.getDate();
        return -1;
    }));

    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'cal-day'; dayDiv.innerText = i;
        
        // Format current rendered day as YYYY-MM-DD to compare with the date input
        const yearStr = now.getFullYear();
        const monthStr = String(now.getMonth() + 1).padStart(2, '0');
        const dayStr = String(i).padStart(2, '0');
        const currentDayStr = `${yearStr}-${monthStr}-${dayStr}`;

        if (expenseDates.has(i)) {
            dayDiv.classList.add('active');
            
            // Check if THIS is the date we just added right now
            if (currentDayStr === lastAddedDate) {
                dayDiv.classList.add('pulse-mark');
                lastAddedDate = null; // Clear it so it only animates once!
            }
        }
        dom.calendar.appendChild(dayDiv);
    }
}

function updateAllGauges() {
    const list = getFilteredExpenses(); const total = list.reduce((sum, e) => sum + e.amount, 0);
    const getPct = (cat) => { if(total===0) return 0; return (list.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0) / total) * 100; };
    targetMilkHeight = total === 0 ? 0.001 : (getPct('Milk') / 100); if(targetMilkHeight <= 0) targetMilkHeight = 0.001;
    document.getElementById('elec-level').style.height = `${getPct('Electricity')}%`;
    document.getElementById('gas-level').style.transform = `scale(${0.2 + (getPct('Gas') / 100) * 0.8})`;
    document.getElementById('other-level').style.height = `${getPct('Other')}%`;
    document.getElementById('invest-level').style.height = `${getPct('Investments')}%`;
}

/* =========================================
   CHARTS (Chart.js)
   ========================================= */
let pieChart, lineChart;
function initCharts() {
    Chart.defaults.color = '#a0a8b8'; Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
    const ctxPie = document.getElementById('pieChart').getContext('2d');
    pieChart = new Chart(ctxPie, { 
        type: 'doughnut', 
        data: { labels: ['Milk', 'Electricity', 'Gas', 'Investments', 'Other'], datasets: [{ data: [0,0,0,0,0], backgroundColor: ['#ffffff', '#ffe600', '#ff5e00', '#00ff88', '#bc13fe'], borderWidth: 0 }] }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            animation: {
                animateScale: true,      // Makes pie chart expand from center
                animateRotate: true,     // Makes pie chart spin
                duration: 1500,          // 1.5 seconds long
                easing: 'easeOutQuart'   // Smooth snapping effect
            },
            plugins: { legend: { position: 'right' } } 
        } 
    });
    
    const ctxLine = document.getElementById('lineChart').getContext('2d');
    lineChart = new Chart(ctxLine, { type: 'line', data: { labels: [], datasets: [{ label: 'Spending', data: [], borderColor: '#00f2ff', backgroundColor: 'rgba(0, 242, 255, 0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false } });
}

function updateCharts() {
    const list = getFilteredExpenses(); const categories = ['Milk', 'Electricity', 'Gas', 'Investments', 'Other'];
    pieChart.data.datasets[0].data = categories.map(cat => list.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0)); pieChart.update();
    const grouped = {}; list.forEach(e => { grouped[e.date] = (grouped[e.date] || 0) + e.amount; });
    const sortedDates = Object.keys(grouped).sort(); lineChart.data.labels = sortedDates; lineChart.data.datasets[0].data = sortedDates.map(d => grouped[d]); lineChart.update();
}

/* =========================================
   AUDIO & FX (Three.js)
   ========================================= */
let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); }

function triggerCategoryEffect(category) {
    if (category === 'Milk') playLiquidSound();
    else if (category === 'Electricity') { const flash = document.createElement('div'); flash.className = 'lightning-flash'; dom.fxContainer.appendChild(flash); setTimeout(() => flash.remove(), 500); playThunderSound(); } 
    else if (category === 'Gas') { const flame = document.createElement('div'); flame.className = 'flame-fx'; dom.fxContainer.appendChild(flame); setTimeout(() => flame.remove(), 1200); playFireSound(); } 
    else if (category === 'Investments') { playCoinSound(); }
    else if (category === 'Other') { for(let i=0; i<8; i++) { setTimeout(() => { const coin = document.createElement('div'); coin.className = 'coin-fx'; coin.style.left = Math.random() * 90 + 5 + '%'; dom.fxContainer.appendChild(coin); setTimeout(() => coin.remove(), 1000); }, i * 100); } playCoinSound(); }
}

function playThunderSound() { if(!audioCtx) return; const bufferSize = audioCtx.sampleRate * 2; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); let lastOut = 0; for (let i = 0; i < bufferSize; i++) { let white = Math.random() * 2 - 1; data[i] = (lastOut + (0.02 * white)) / 1.02; lastOut = data[i]; } const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(400, audioCtx.currentTime); filter.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 1.5); const gainNode = audioCtx.createGain(); gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(1.5, audioCtx.currentTime + 0.1); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2); noise.connect(filter); filter.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start(); }
function playFireSound() { if(!audioCtx) return; const bufferSize = audioCtx.sampleRate * 1.5; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1; const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const filter = audioCtx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(100, audioCtx.currentTime); filter.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3); filter.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 1.5); const gainNode = audioCtx.createGain(); gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.2); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5); noise.connect(filter); filter.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start(); }
function playLiquidSound() { if(!audioCtx) return; const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.15); gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15); osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.2); }
function playCoinSound() { if(!audioCtx) return; const playChime = (time, freq) => { const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(freq, time); gainNode.gain.setValueAtTime(0.5, time); gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.5); osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(time); osc.stop(time + 0.6); }; playChime(audioCtx.currentTime, 1200); playChime(audioCtx.currentTime + 0.1, 1600); }

let scene, camera, renderer, glassMesh, milkMesh, targetMilkHeight = 0.001; 
function initThreeJS() {
    const container = document.getElementById('canvas-container'); scene = new THREE.Scene();
    const width = container.clientWidth || 300; const height = container.clientHeight || 250;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100); camera.position.set(0, 1.5, 4); camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); renderer.setSize(width, height); container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8)); const dirLight = new THREE.DirectionalLight(0xffffff, 1); dirLight.position.set(5, 5, 5); scene.add(dirLight);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 0.9, opacity: 0.5, transparent: true, side: THREE.DoubleSide });
    glassMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 1.5, 32, 1, true), glassMat); scene.add(glassMesh);
    const milkGeo = new THREE.CylinderGeometry(0.55, 0.45, 1.4, 32); milkGeo.translate(0, 0.7, 0); 
    milkMesh = new THREE.Mesh(milkGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })); milkMesh.scale.set(1, 0.001, 1); milkMesh.position.y = -0.75; scene.add(milkMesh);
    window.addEventListener('resize', () => { if (!container || container.clientWidth === 0) return; renderer.setSize(container.clientWidth, container.clientHeight); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); });
}
function animateThreeJS() { requestAnimationFrame(animateThreeJS); if(glassMesh) glassMesh.rotation.y += 0.005; if(milkMesh) { milkMesh.rotation.y += 0.005; milkMesh.scale.y += (targetMilkHeight - milkMesh.scale.y) * 0.05; } renderer.render(scene, camera); }

document.addEventListener('DOMContentLoaded', () => { init(); });