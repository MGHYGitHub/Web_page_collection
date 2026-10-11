// 配置和状态管理
const CONFIG = {
    maxCountdownTime: (525600 * 60 + 59) * 1000,
    // 声音由浏览器 Web Audio 本地合成，不依赖在线音频资源。
    sounds: {},
    themes: {
        light: {
            '--bg-color': '#e0f7fa',
            '--text-color': '#00796b',
            '--accent-color': '#42a5f5',
            '--card-bg': '#ffffff'
        },
        dark: {
            '--bg-color': '#1a1a1a',
            '--text-color': '#ffffff',
            '--accent-color': '#bb86fc',
            '--card-bg': '#2d2d2d'
        }
    }
};

const MODES = {
    STOPWATCH: 'stopwatch',
    COUNTDOWN: 'countdown',
    INTERVAL: 'interval'
};

// 全局状态
let state = {
    timerInterval: null,
    animationFrame: null,
    milliseconds: 0,
    countdownTime: 0,
    isRunning: false,
    recordCount: 0,
    showMilliseconds: false,
    lastRecordTime: 0,
    currentMode: MODES.STOPWATCH,
    soundEnabled: true,
    currentProject: 'work',
    stats: {
        totalTime: 0,
        sessionCount: 0,
        avgSessionTime: 0,
        longestSession: 0
    },
    sessions: []
};
let runStarted = 0, runElapsed = 0, activeSession = null;
let lastSavedAt = 0;
const storage = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { document.getElementById('timer-status').textContent = '浏览器未允许本地保存，请使用导出保留记录。'; } }
};

// 音频上下文
let audioContext = null;

// 初始化
function init() {
    loadSettings();
    setupEventListeners();
    updateCurrentTime();
    updateStats();
    setupAudio();
    restoreProgress();

    // 自动显示公告栏（首次使用）
    const firstTime = !storage.get('announcementShown', false);
    if (firstTime) {
        setTimeout(() => {
            toggleAnnouncement();
            storage.set('announcementShown', true);
        }, 1000);
    }

    // 设置快捷键
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // 检查快捷键是否绑定成功
    console.log('快捷键绑定状态:', {
        space: '开始/暂停',
        c: '计数',
        m: '毫秒切换',
        s: '声音开关',
        '1/2/3': '模式切换',
        'shift+r': '重置'
    });

    setInterval(updateCurrentTime, 1000);
    document.addEventListener('visibilitychange', () => {
        if (state.isRunning) syncTimer();
        saveProgress();
    });
    window.addEventListener('pagehide', () => { if (state.isRunning) syncTimer(); saveProgress(); });
    document.getElementById('records').addEventListener('input', saveProgress);
}

function setupAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('音频上下文不支持');
    }
}

function playSound(type) {
    if (!state.soundEnabled || !audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    let frequency = 440;
    switch (type) {
        case 'start': frequency = 523; break; // C5
        case 'pause': frequency = 392; break; // G4
        case 'count': frequency = 659; break; // E5
        case 'complete': frequency = 784; break; // G5
    }

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function handleKeyboardShortcuts(event) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        event.target?.closest?.('input, select, textarea, button, a, [contenteditable="true"]')) return;
    if (!['Space', 'KeyR', 'KeyC', 'KeyM', 'KeyS', 'Digit1', 'Digit2', 'Digit3'].includes(event.code)) return;
    event.preventDefault();

    switch (event.code) {
        case 'Space':
            console.log('空格键按下 - 切换计时器');
            toggleTimer();
            break;
        case 'KeyR':
            if (event.shiftKey) {
                resetTimer();
            } else {
                console.log('R键按下 - 添加记录');
                addRecord();
            }
            break;
        case 'KeyC':
            console.log('C键按下 - 添加记录');
            addRecord();
            break;
        case 'KeyM':
            console.log('M键按下 - 切换毫秒');
            toggleMilliseconds();
            break;
        case 'KeyS':
            console.log('S键按下 - 切换声音');
            toggleSound();
            break;
        case 'Digit1':
            console.log('1键按下 - 切换到秒表模式');
            switchMode(MODES.STOPWATCH);
            break;
        case 'Digit2':
            console.log('2键按下 - 切换到倒计时模式');
            switchMode(MODES.COUNTDOWN);
            break;
        case 'Digit3':
            console.log('3键按下 - 切换到间隔计时模式');
            switchMode(MODES.INTERVAL);
            break;
    }
}

function toggleTimer() {
    if (state.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milli = Math.floor((ms % 1000) / 10);

    if (state.showMilliseconds) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milli).padStart(2, '0')}`;
    } else {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

function formatInterval(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}min${seconds}s`;
}

function updateDisplay() {
    let displayTime = state.milliseconds;

    if (state.currentMode === MODES.COUNTDOWN) {
        displayTime = Math.max(0, state.countdownTime - state.milliseconds);
        if (displayTime === 0 && state.isRunning) {
            timerComplete();
        }
    }

    document.getElementById('timer').innerText = formatTime(displayTime);

    // 倒计时警告
    if (state.currentMode === MODES.COUNTDOWN && displayTime < 30000 && displayTime > 0) {
        document.getElementById('timer').style.color = '#ff4444';
    } else {
        document.getElementById('timer').style.color = '';
    }
}

function startTimer() {
    if (state.isRunning) return;
    if (state.currentMode === MODES.COUNTDOWN && state.countdownTime === 0) {
        alert('请先设置倒计时时间');
        return;
    }

    state.isRunning = true;
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('countBtn').style.display = 'inline-block';

    if (state.currentMode === MODES.COUNTDOWN && state.milliseconds >= state.countdownTime) {
        state.milliseconds = 0;
        state.lastRecordTime = 0;
    }
    runStarted = Date.now();
    runElapsed = state.milliseconds;
    document.getElementById('timer-status').textContent = '';

    function tick() {
        if (!state.isRunning) return;
        syncTimer();
        if (state.isRunning) state.animationFrame = requestAnimationFrame(tick);
    }

    state.animationFrame = requestAnimationFrame(tick);
    playSound('start');

    // 记录会话开始
    activeSession = {
        startTime: new Date(),
        project: state.currentProject,
        mode: state.currentMode,
        duration: 0
    };
    state.sessions.push(activeSession);
    // Animation frames stop in hidden tabs; a wall-clock check keeps countdown completion correct.
    state.timerInterval = setInterval(syncTimer, 250);
    saveProgress();
}

function syncTimer() {
    if (!state.isRunning) return;
    state.milliseconds = runElapsed + Math.max(0, Date.now() - runStarted);
    if (state.currentMode === MODES.COUNTDOWN) state.milliseconds = Math.min(state.milliseconds, state.countdownTime);
    if (activeSession) activeSession.duration = state.milliseconds - runElapsed;
    updateDisplay();
    if (Date.now() - lastSavedAt >= 5000) { updateStats(); saveProgress(); }
}

function pauseTimer() {
    if (!state.isRunning) return;
    syncTimer();
    if (!state.isRunning) return;
    state.isRunning = false;
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    clearInterval(state.timerInterval);
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('startBtn').innerText = '继续';
    document.getElementById('startBtn').style.display = 'inline-block';
    playSound('pause');

    // 更新会话统计
    if (activeSession) activeSession.endTime = new Date();
    activeSession = null;
    updateStats();
    saveProgress();
}

function resetTimer() {
    if (state.isRunning) pauseTimer();
    state.isRunning = false;
    clearInterval(state.timerInterval);
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    state.milliseconds = 0;
    state.recordCount = 0;
    state.lastRecordTime = 0;
    updateDisplay();
    state.isRunning = false;
    document.getElementById('countBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('startBtn').innerText = '开始';
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('records').innerHTML = '';
    document.getElementById('timer').style.color = '';
    document.getElementById('timer-status').textContent = '';
    saveProgress();
}

function addRecord() {
    if (state.isRunning) syncTimer();
    const recordsDiv = document.getElementById('records');
    const recordDiv = document.createElement('div');
    recordDiv.className = 'record';
    state.recordCount++;
    const timeText = formatTime(state.milliseconds);

    let intervalText = '';
    if (state.recordCount > 1) {
        const intervalMs = state.milliseconds - state.lastRecordTime;
        intervalText = formatInterval(intervalMs);
    } else {
        intervalText = '首次记录';
    }
    state.lastRecordTime = state.milliseconds;

    recordDiv.innerHTML = `
        <div class="index">${state.recordCount}</div>
        <div class="separator">|</div>
        <div class="time">${timeText}</div>
        <div class="interval">${intervalText}</div>
        <input class="remark" aria-label="记录 ${state.recordCount} 的备注" placeholder="输入备注..." onkeydown="if(event.key==='Enter') this.blur()">
    `;

    recordsDiv.appendChild(recordDiv);
    recordsDiv.scrollTop = recordsDiv.scrollHeight;
    playSound('count');
    saveProgress();
}

function toggleMilliseconds() {
    state.showMilliseconds = !state.showMilliseconds;
    const toggleBtn = document.getElementById('toggleMsBtn');
    const msStatus = document.getElementById('msStatus');
    if (state.showMilliseconds) {
        toggleBtn.classList.add('on');
        msStatus.innerText = 'ON';
    } else {
        toggleBtn.classList.remove('on');
        msStatus.innerText = 'OFF';
    }
    updateDisplay();
    saveSettings();
}

function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    const soundBtn = document.getElementById('soundToggle');
    soundBtn.innerHTML = state.soundEnabled ? '🔊 声音' : '🔇 静音';
    saveSettings();
}

function switchMode(mode, event) {  // 添加 event 参数
    if (!Object.values(MODES).includes(mode)) return;
    resetTimer();
    state.currentMode = mode;
    updateDisplay();

    // 更新UI
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // 确保 event 存在再使用
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // 如果没有 event，通过 dataset 找到对应的按钮
        const targetBtn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }

    // 显示/隐藏相关控件
    const countdownInput = document.getElementById('countdown-input');
    countdownInput.style.display = mode === MODES.COUNTDOWN ? 'block' : 'none';
    document.getElementById('preset-timers').hidden = mode !== MODES.COUNTDOWN;
    saveProgress();
}

function setCountdown() {
    const minutes = Number(document.getElementById('minutes-input').value);
    const seconds = Number(document.getElementById('seconds-input').value);
    if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || seconds < 0 || seconds > 59 || minutes > 525600 || minutes * 60 + seconds <= 0) {
        document.getElementById('timer-status').textContent = '请输入有效时长：分钟 ≥ 0，秒为 0–59，总时长需大于 0。';
        return;
    }
    resetTimer();
    state.countdownTime = (minutes * 60 + seconds) * 1000;
    updateDisplay();
    saveProgress();
}

function setPresetTimer(time) {
    const duration = Number(time);
    if (!Number.isInteger(duration) || duration <= 0 || duration > CONFIG.maxCountdownTime) {
        document.getElementById('timer-status').textContent = '预设时长无效，请重新选择或手动设置。';
        return;
    }
    resetTimer();
    state.currentMode = MODES.COUNTDOWN;
    state.countdownTime = duration;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === MODES.COUNTDOWN));
    document.getElementById('countdown-input').style.display = 'block';
    document.getElementById('preset-timers').hidden = false;
    document.getElementById('minutes-input').value = Math.floor(state.countdownTime / 60000);
    document.getElementById('seconds-input').value = Math.floor((state.countdownTime % 60000) / 1000);
    updateDisplay();
    saveProgress();
}

function timerComplete() {
    state.isRunning = false;
    clearInterval(state.timerInterval);
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    if (activeSession) activeSession.endTime = new Date();
    activeSession = null;
    updateStats();
    playSound('complete');
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('startBtn').textContent = '再计时';
    document.getElementById('timer-status').textContent = '倒计时已结束，记录已保留。';
    saveProgress();

    // 显示浏览器通知
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('计时器', {
            body: '倒计时已结束！',
            icon: '../icons/jsq.ico'
        });
    }
}

function updateStats() {
    // 更新总时间
    state.stats.totalTime = state.sessions.reduce((total, session) => total + (session.duration || 0), 0);

    // 更新会话数
    state.stats.sessionCount = state.sessions.length;

    // 更新平均时长（避免除以零）
    state.stats.avgSessionTime = state.stats.sessionCount > 0 ?
        state.stats.totalTime / state.stats.sessionCount : 0;

    // 更新最长会话
    state.stats.longestSession = state.sessions.length > 0 ?
        Math.max(...state.sessions.map(s => s.duration || 0)) : 0;

    // 更新迷你统计面板显示
    document.getElementById('total-time-mini').textContent = formatTimeShort(state.stats.totalTime);
    document.getElementById('session-count-mini').textContent = state.stats.sessionCount;
    document.getElementById('avg-time-mini').textContent = formatTimeShort(state.stats.avgSessionTime);
    document.getElementById('longest-time-mini').textContent = formatTimeShort(state.stats.longestSession);

    console.log('统计更新:', state.stats);
}

function exportData() {
    if (state.isRunning) syncTimer();
    updateStats();
    const recordsDiv = document.getElementById('records');
    let content = `计时记录 (${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}):\n\n`;
    content += `模式: ${state.currentMode}\n`;
    content += `项目: ${document.getElementById('project-select').options[document.getElementById('project-select').selectedIndex].text}\n\n`;

    const records = recordsDiv.getElementsByClassName('record');
    for (let i = 0; i < records.length; i++) {
        const time = records[i].getElementsByClassName('time')[0].innerText;
        const interval = records[i].getElementsByClassName('interval')[0].innerText;
        const remark = records[i].getElementsByClassName('remark')[0].value || '无备注';
        content += `记录 ${i + 1}: ${time} (间隔: ${interval}) - ${remark}\n`;
    }

    content += `\n统计信息:\n`;
    content += `总计时: ${formatTime(state.stats.totalTime)}\n`;
    content += `会话次数: ${state.stats.sessionCount}\n`;
    content += `平均时长: ${formatTime(state.stats.avgSessionTime)}\n`;
    content += `最长会话: ${formatTime(state.stats.longestSession)}\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `计时记录_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
// 短时间格式显示（去掉小时）
function formatTimeShort(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateCurrentTime() {
    const now = new Date();
    const beijingTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    document.getElementById('currentTime').innerText = `${beijingTime}`;
}

function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    document.documentElement.style.colorScheme = newTheme;

    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.textContent = newTheme === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';

    saveSettings();
}

function setupEventListeners() {
    document.getElementById('startBtn').addEventListener('click', startTimer);
    document.getElementById('pauseBtn').addEventListener('click', pauseTimer);
    document.getElementById('resetBtn').addEventListener('click', resetTimer);
    document.getElementById('countBtn').addEventListener('click', addRecord);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('toggleMsBtn').addEventListener('click', toggleMilliseconds);
    document.getElementById('soundToggle').addEventListener('click', toggleSound);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // 模式切换
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchMode(e.currentTarget.dataset.mode, e));
    });

    // 预设计时器
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => setPresetTimer(e.currentTarget.dataset.time));
    });

    // 项目选择
    document.getElementById('project-select').addEventListener('change', (e) => {
        state.currentProject = e.target.value;
        saveSettings();
    });
}

function saveSettings() {
    const settings = {
        theme: document.body.getAttribute('data-theme') || 'light',
        soundEnabled: state.soundEnabled,
        showMilliseconds: state.showMilliseconds,
        currentProject: state.currentProject
    };
    storage.set('timerSettings', settings);
}

function loadSettings() {
    const value = storage.get('timerSettings', {});
    const settings = value && typeof value === 'object' ? value : {};

    if (['dark', 'light'].includes(settings.theme)) {
        document.body.setAttribute('data-theme', settings.theme);
        const themeBtn = document.getElementById('theme-toggle');
        themeBtn.textContent = settings.theme === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
    }

    document.documentElement.style.colorScheme = document.body.getAttribute('data-theme');
    if (typeof settings.soundEnabled === 'boolean') {
        state.soundEnabled = settings.soundEnabled;
        const soundBtn = document.getElementById('soundToggle');
        soundBtn.innerHTML = state.soundEnabled ? '🔊 声音' : '🔇 静音';
    }

    if (typeof settings.showMilliseconds === 'boolean') {
        state.showMilliseconds = settings.showMilliseconds;
        const msStatus = document.getElementById('msStatus');
        msStatus.innerText = state.showMilliseconds ? 'ON' : 'OFF';
        if (state.showMilliseconds) {
            document.getElementById('toggleMsBtn').classList.add('on');
        }
    }

    if (['work', 'study', 'sports', 'other'].includes(settings.currentProject)) {
        state.currentProject = settings.currentProject;
        document.getElementById('project-select').value = state.currentProject;
    }
}

function saveProgress() {
    lastSavedAt = Date.now();
    storage.set('timerProgress', {
        mode: state.currentMode, elapsed: state.milliseconds, countdown: state.countdownTime,
        lastRecordTime: state.lastRecordTime, sessions: state.sessions.slice(-1000),
        records: Array.from(document.querySelectorAll('#records .record'), row => ({
            time: row.querySelector('.time').textContent,
            interval: row.querySelector('.interval').textContent,
            remark: row.querySelector('.remark').value
        }))
    });
}

function restoreProgress() {
    const saved = storage.get('timerProgress', {});
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    state.recordCount = 0;
    state.milliseconds = 0;
    state.countdownTime = 0;
    state.lastRecordTime = 0;
    state.currentMode = MODES.STOPWATCH;
    document.getElementById('records').innerHTML = '';
    if (Object.values(MODES).includes(saved.mode)) state.currentMode = saved.mode;
    for (const [key, value] of [['milliseconds', saved.elapsed], ['countdownTime', saved.countdown], ['lastRecordTime', saved.lastRecordTime]]) {
        if (Number.isSafeInteger(value) && value >= 0) state[key] = value;
    }
    if (state.countdownTime > CONFIG.maxCountdownTime) state.countdownTime = 0;
    if (state.currentMode === MODES.COUNTDOWN) state.milliseconds = Math.min(state.milliseconds, state.countdownTime);
    state.lastRecordTime = Math.min(state.lastRecordTime, state.milliseconds);
    state.sessions = Array.isArray(saved.sessions) ? saved.sessions.filter(s => s && Number.isSafeInteger(s.duration) && s.duration >= 0).slice(-1000) : [];
    for (const item of Array.isArray(saved.records) ? saved.records.slice(-1000) : []) {
        if (!item || typeof item.time !== 'string') continue;
        const row = document.createElement('div'); row.className = 'record';
        for (const [cls, content] of [['index', ++state.recordCount], ['separator', '|'], ['time', item.time], ['interval', item.interval || '']]) {
            const part = document.createElement('div'); part.className = cls; part.textContent = content; row.appendChild(part);
        }
        const input = document.createElement('input'); input.className = 'remark'; input.placeholder = '输入备注…';
        input.setAttribute('aria-label', `记录 ${state.recordCount} 的备注`); input.value = typeof item.remark === 'string' ? item.remark : '';
        row.appendChild(input); document.getElementById('records').appendChild(row);
    }
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.currentMode));
    document.getElementById('countdown-input').style.display = state.currentMode === MODES.COUNTDOWN ? 'block' : 'none';
    document.getElementById('preset-timers').hidden = state.currentMode !== MODES.COUNTDOWN;
    document.getElementById('minutes-input').value = Math.floor(state.countdownTime / 60000);
    document.getElementById('seconds-input').value = Math.floor((state.countdownTime % 60000) / 1000);
    document.getElementById('countBtn').style.display = state.milliseconds ? 'inline-block' : 'none';
    document.getElementById('startBtn').textContent = '开始';
    document.getElementById('timer-status').textContent = '';
    if (state.milliseconds || state.recordCount) {
        document.getElementById('startBtn').textContent = '继续';
        document.getElementById('timer-status').textContent = '已恢复上次记录，计时处于暂停状态。';
    }
    if (state.currentMode === MODES.COUNTDOWN && state.countdownTime > 0 && state.milliseconds >= state.countdownTime) {
        document.getElementById('startBtn').textContent = '再计时';
        document.getElementById('timer-status').textContent = '倒计时已结束，记录已恢复。';
    }
    updateDisplay(); updateStats();
}

// 控制台防伪信息
window.addEventListener('load', () => {
    console.log("%c====================================", "color: #888; font-size: 12px;");
    console.log("%c高级计时器控制台", "color: white; background: #333; font-size: 18px; font-weight: bold; padding: 5px 15px; border-radius: 4px;");
    console.log("%c版本 v4.0 - 专业版", "color: white; background: #4CAF50; font-size: 16px; font-weight: bold; padding: 3px 10px; border-radius: 3px;");
    console.log("%c快捷键: 空格=开始/暂停, C=计数, M=毫秒切换", "color: #2196F3; font-size: 14px;");
    console.log("%c====================================", "color: #888; font-size: 12px;");

    init();
});

// 公告栏功能
function toggleAnnouncement() {
    const panel = document.getElementById('announcement-panel');
    panel.classList.toggle('show');

    // 更新按钮文本
    const toggleBtn = document.getElementById('announcement-toggle-btn');
    const footerBtn = document.querySelector('.announcement-toggle');

    if (panel.classList.contains('show')) {
        toggleBtn.innerHTML = '📢 隐藏';
        footerBtn.textContent = '📋 隐藏说明';
    } else {
        toggleBtn.innerHTML = '📢 说明';
        footerBtn.textContent = '📋 显示说明';
    }
}

// 点击外部关闭公告栏
document.addEventListener('click', function (event) {
    const panel = document.getElementById('announcement-panel');
    const toggleBtn = document.getElementById('announcement-toggle-btn');

    if (panel.classList.contains('show') &&
        !panel.contains(event.target) &&
        !event.target.closest('.announcement-toggle') &&
        !toggleBtn.contains(event.target)) {
        toggleAnnouncement();
    }
});

// ESC键关闭公告栏
document.addEventListener('keydown', function (event) {
    if (event.code === 'Escape') {
        const panel = document.getElementById('announcement-panel');
        if (panel.classList.contains('show')) {
            toggleAnnouncement();
        }
    }
});
