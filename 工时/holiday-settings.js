/* A single controller for the editable holiday calendar. */
(() => {
    'use strict';
    const modal = document.getElementById('holiday-settings-modal');
    const editor = document.getElementById('holiday-json-editor');
    const preview = document.getElementById('holiday-calendar-preview');
    const trigger = document.getElementById('holiday-settings-trigger');
    const yearSelect = document.getElementById('holiday-year-select');
    const monthSelect = document.getElementById('holiday-month-select');
    const status = document.getElementById('holiday-settings-status');
    if (!modal || !editor || !preview || !trigger) return;

    const fields = ['holidays', 'extraWorkDays', 'makeUpWorkDays'];
    const types = [
        ['holidays', 'holiday', '法定节假日'],
        ['extraWorkDays', 'extra', '调休日'],
        ['makeUpWorkDays', 'makeup', '补班日']
    ];
    const storageKey = 'overtimeHolidayConfig';
    const clone = value => JSON.parse(JSON.stringify(value));
    const defaults = clone(holidayConfig);
    let draft = clone(holidayConfig);
    const today = new Date();
    let year = today.getFullYear();
    let month = today.getMonth();
    let contextMenu = null;
    let previousFocus = null;
    let clicks = 0;
    let clickTimer;

    function report(message, error = false) {
        status.textContent = message;
        status.classList.toggle('is-error', error);
        editor.setAttribute('aria-invalid', String(error));
    }

    function normalize(value, selectedYear) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请填写包含三个日期数组的 JSON 对象。');
        const normalized = {};
        const used = new Set();
        for (const key of fields) {
            if (!Array.isArray(value[key])) throw new Error(`${key} 必须是日期数组。`);
            normalized[key] = [];
            for (const date of value[key]) {
                if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期请使用 YYYY-MM-DD 格式。');
                const [y, m, d] = date.split('-').map(Number);
                const parsed = new Date(y, m - 1, d);
                if (y !== Number(selectedYear) || parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) throw new Error(`${date} 不是当前年份的有效日期。`);
                if (normalized[key].includes(date)) continue;
                if (used.has(date)) throw new Error(`${date} 同时出现在多个类别，请只保留一种类型。`);
                used.add(date);
                normalized[key].push(date);
            }
            normalized[key].sort();
        }
        return normalized;
    }

    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            const checked = {};
            for (const [key, value] of Object.entries(saved)) {
                if (!/^\d{4}$/.test(key)) throw new Error('年份无效');
                checked[key] = normalize(value, key);
            }
            draft = { ...draft, ...checked };
        }
        const view = JSON.parse(localStorage.getItem('overtimeHolidayView') || 'null');
        if (view && Number.isInteger(view.year) && view.year >= 1900 && view.year <= 2100 && Number.isInteger(view.month) && view.month >= 0 && view.month < 12) {
            year = view.year;
            month = view.month;
        }
    } catch (error) {
        report('本地节假日配置格式异常，已载入文件配置；原始保存内容未删除。', true);
        console.warn(error);
    }
    Object.assign(holidayConfig, clone(draft));

    function closeMenu() {
        contextMenu?.remove();
        contextMenu = null;
    }

    function refreshWorktime() {
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof updateExcelTable === 'function') updateExcelTable();
    }

    function save(message = '已自动保存在当前浏览器。导出配置可同步到网站。') {
        Object.assign(holidayConfig, clone(draft));
        try {
            localStorage.setItem(storageKey, JSON.stringify(draft));
            report(message);
        } catch {
            report('当前浏览器无法保存，请导出配置文件保留修改。', true);
        }
        refreshWorktime();
    }

    function commitEditor() {
        try {
            draft[year] = normalize(JSON.parse(editor.value), year);
            return true;
        } catch (error) {
            report(error.message || 'JSON 格式有误，请检查括号和引号。', true);
            return false;
        }
    }

    function ensureYearOption() {
        if (![...yearSelect.options].some(option => Number(option.value) === year)) {
            yearSelect.add(new Option(`${year} 年`, year));
        }
        yearSelect.value = String(year);
        monthSelect.value = String(month);
    }

    function showMenu(date, x, y) {
        closeMenu();
        contextMenu = document.createElement('div');
        contextMenu.className = 'holiday-context';
        contextMenu.setAttribute('role', 'menu');
        contextMenu.setAttribute('aria-label', `${date} 的日期类型`);
        const heading = document.createElement('small');
        heading.textContent = date;
        contextMenu.appendChild(heading);
        for (const [key, color, text] of [...types, ['', 'normal', '清除标记']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'menuitem');
            const dot = document.createElement('i');
            dot.className = `legend-dot ${color}`;
            button.append(dot, document.createTextNode(text));
            button.addEventListener('click', () => {
                if (!commitEditor()) { closeMenu(); return; }
                for (const field of fields) draft[year][field] = draft[year][field].filter(value => value !== date);
                if (key) draft[year][key].push(date);
                draft[year] = normalize(draft[year], year);
                editor.value = JSON.stringify(draft[year], null, 2);
                closeMenu();
                draw();
                save(`${date} 已设置为${key ? text : '普通日期'}。`);
            });
            contextMenu.appendChild(button);
        }
        document.body.appendChild(contextMenu);
        const rect = contextMenu.getBoundingClientRect();
        contextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
        contextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
        contextMenu.querySelector('button').focus();
    }

    function draw() {
        closeMenu();
        ensureYearOption();
        const config = draft[year] || { holidays: [], extraWorkDays: [], makeUpWorkDays: [] };
        preview.replaceChildren();
        const title = document.createElement('div');
        title.className = 'holiday-month-title';
        const heading = document.createElement('span');
        heading.textContent = `${year} 年 ${month + 1} 月`;
        const hint = document.createElement('small');
        hint.textContent = '点击或右键设置';
        title.append(heading, hint);
        const grid = document.createElement('div');
        grid.className = 'holiday-week';
        for (const day of ['日', '一', '二', '三', '四', '五', '六']) {
            const label = document.createElement('b'); label.textContent = day; grid.appendChild(label);
        }
        for (let i = 0; i < new Date(year, month, 1).getDay(); i++) {
            const empty = document.createElement('span'); empty.className = 'holiday-date empty'; grid.appendChild(empty);
        }
        for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
            const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const type = types.find(([key]) => config[key]?.includes(date));
            const button = document.createElement('button');
            button.type = 'button'; button.className = `holiday-date ${type?.[1] || ''}`;
            button.dataset.date = date; button.textContent = day;
            button.setAttribute('aria-label', `${date}，${type?.[2] || '普通日期'}，设置日期类型`);
            if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) button.classList.add('is-today');
            button.addEventListener('click', event => {
                const rect = button.getBoundingClientRect();
                showMenu(date, event.clientX || rect.left, event.clientY || rect.bottom);
            });
            button.addEventListener('contextmenu', event => { event.preventDefault(); showMenu(date, event.clientX, event.clientY); });
            grid.appendChild(button);
        }
        preview.append(title, grid);
        try { localStorage.setItem('overtimeHolidayView', JSON.stringify({ year, month })); } catch { /* Calendar remains usable. */ }
    }

    function loadYear() {
        editor.value = JSON.stringify(draft[year] || { holidays: [], extraWorkDays: [], makeUpWorkDays: [] }, null, 2);
        draw();
        report(`${year} 年配置，可直接点击日期编辑。`);
    }

    function changeView(nextYear, nextMonth) {
        if (!commitEditor()) { ensureYearOption(); return; }
        const next = new Date(nextYear, nextMonth, 1);
        if (next.getFullYear() < 1900 || next.getFullYear() > 2100) return;
        year = next.getFullYear(); month = next.getMonth(); loadYear();
    }

    function close() {
        closeMenu();
        modal.hidden = true;
        document.body.classList.remove('holiday-dialog-open');
        previousFocus?.focus();
    }
    function open() {
        previousFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('holiday-dialog-open');
        loadYear();
        document.getElementById('holiday-settings-close').focus();
    }

    for (let value = today.getFullYear() - 10; value <= today.getFullYear() + 10; value++) yearSelect.add(new Option(`${value} 年`, value));
    for (let value = 0; value < 12; value++) monthSelect.add(new Option(`${value + 1} 月`, value));
    yearSelect.addEventListener('change', () => changeView(Number(yearSelect.value), month));
    monthSelect.addEventListener('change', () => changeView(year, Number(monthSelect.value)));
    document.getElementById('holiday-prev-month').addEventListener('click', () => changeView(year, month - 1));
    document.getElementById('holiday-next-month').addEventListener('click', () => changeView(year, month + 1));
    document.getElementById('holiday-today-btn').addEventListener('click', () => { const now = new Date(); changeView(now.getFullYear(), now.getMonth()); });
    document.getElementById('holiday-settings-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    trigger.addEventListener('click', event => {
        if (event.detail === 0) { open(); return; }
        clearTimeout(clickTimer);
        clicks++;
        if (clicks >= 2) { clicks = 0; open(); }
        else clickTimer = setTimeout(() => { clicks = 0; }, 650);
    });
    editor.addEventListener('input', () => { if (commitEditor()) { draw(); save(); } });
    document.addEventListener('click', event => { if (contextMenu && !contextMenu.contains(event.target) && !event.target.closest('.holiday-date')) closeMenu(); });
    document.addEventListener('keydown', event => {
        if (modal.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); if (contextMenu) closeMenu(); else close(); }
        if (event.key === 'Tab' && !contextMenu) {
            const elements = [...modal.querySelectorAll('button, select, textarea, input')].filter(element => !element.hidden && element.offsetParent !== null);
            if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
            else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
        }
    });

    document.getElementById('holiday-reset-btn').addEventListener('click', () => {
        draft[year] = clone(defaults[year] || { holidays: [], extraWorkDays: [], makeUpWorkDays: [] });
        loadYear(); save(`已恢复文件中的 ${year} 年配置。`);
    });
    document.getElementById('holiday-clear-btn').addEventListener('click', async () => {
        const approved = typeof customConfirm === 'function' ? await customConfirm({ title: '清空节假日标记', message: `将清空 ${year} 年的全部标记，其他年份保持不变。`, type: 'warning', confirmText: '清空', cancelText: '取消' }) : window.confirm(`清空 ${year} 年的全部节假日标记？`);
        if (!approved) return;
        draft[year] = { holidays: [], extraWorkDays: [], makeUpWorkDays: [] };
        loadYear(); save(`已清空 ${year} 年全部标记，可通过“恢复当前年份”撤回。`);
    });

    document.getElementById('holiday-import-input').addEventListener('change', async event => {
        const file = event.target.files[0]; event.target.value = '';
        if (!file) return;
        try {
            const imported = JSON.parse(await file.text());
            const checked = {};
            if (fields.some(key => Object.hasOwn(imported, key))) checked[year] = normalize(imported, year);
            else {
                const entries = Object.entries(imported);
                if (!entries.length) throw new Error('导入文件没有年份配置。');
                for (const [key, value] of entries) {
                    if (!/^\d{4}$/.test(key)) throw new Error('JSON 根节点请使用年份，或三个日期数组。');
                    checked[key] = normalize(value, key);
                }
                if (!checked[year]) year = Number(Object.keys(checked).sort()[0]);
            }
            draft = { ...draft, ...checked };
            loadYear(); save('JSON 导入成功，全部年份配置已保留。');
        } catch (error) { report(`导入失败：${error.message}`, true); }
    });

    document.getElementById('holiday-export-btn').addEventListener('click', () => {
        if (!commitEditor()) return;
        const source = `// 节假日配置：包含全部年份及运行时函数，可直接替换原文件。\nconst holidayConfig = ${JSON.stringify(draft, null, 2)};\n\n${getDateType.toString()}\n\n${getOvertimeMultiplier.toString()}\n`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([source], { type: 'text/javascript;charset=utf-8' }));
        link.download = 'holiday-config.js'; link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        save('已导出完整 holiday-config.js，可直接上传替换。');
    });
    loadYear();
    refreshWorktime();
})();
