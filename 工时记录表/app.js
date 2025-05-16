(function () {
    // 常量定义
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    // 加班费率（使用let以便动态更新）
    let OVERTIME_RATES = {
        A: 39.65517, // 工作日加班 1.5倍
        B: 52.87356, // 周末/调休工作日加班 2倍
        C: 79.31035  // 节假日加班 3倍
    };

    // 状态管理
    const state = {
        currentDate: new Date(),
        holidays: [],
        workdays: [],
        specialWorkdays: [],
        hoursData: {},
        selectedDate: null,
        darkMode: false,
        baseSalary: 4600,
        recordsViewMode: 'current',
        recordsViewYear: new Date().getFullYear(),
        recordsViewMonth: new Date().getMonth() + 1,
        domCache: {},
        deductions: [], // 存储补贴/扣款记录
        chart: null,
        dataGroup: 'day', // 'day' 或 'week'
        visibleDatasets: [true, true, true], // 控制显示哪些数据集
        chartType: 'bar', // 明确设置默认图表类型
    };

    // DOM元素缓存
    function cacheDOM() {
        const elements = {
            'calendarDays': 'calendar-days',
            'yearSelector': 'year-selector',
            'monthSelector': 'month-selector',
            'yearSelect': 'year-select',
            'monthSelect': 'month-select',
            'dayDetails': 'day-details',
            'detailDate': 'detail-date',
            'hoursInput': 'hours-input',
            'hoursType': 'hours-type',
            'hoursBody': 'hours-body',
            'themeToggle': 'theme-toggle',
            'monthlyOvertime': 'monthly-overtime',
            'monthlyLeave': 'monthly-leave',
            'monthlyOvertimePay': 'monthly-overtime-pay',
            'estimatedSalary': 'estimated-salary',
            'hoursMessage': 'hours-message',
            'baseSalaryInput': 'base-salary',
            'dailySalary': 'daily-salary',
            'hourlySalary': 'hourly-salary',
            'saveHours': 'save-hours',
            'clearHours': 'clear-hours',
            'clearAllData': 'clear-all-data',
            'prevMonthRecords': 'prev-month-records',
            'nextMonthRecords': 'next-month-records',
            'currentMonthRecords': 'current-month-records',
            'allRecords': 'all-records',
            'goToDate': 'go-to-date',
            'saveSalary': 'save-salary'
        };

        Object.keys(elements).forEach(key => {
            state.domCache[key] = document.getElementById(elements[key]);
        });

        state.domCache.batchControls = document.querySelector('.batch-controls');
        state.domCache.toggleBatchBtn = document.getElementById('toggle-batch-mode');
        state.domCache.batchApplyBtn = document.getElementById('batch-apply');
        state.domCache.batchCancelBtn = document.getElementById('batch-cancel');
        state.domCache.batchHoursInput = document.getElementById('batch-overtime-hours');
        state.domCache.batchTypeSelect = document.getElementById('batch-overtime-type');
        state.domCache.batchSelectedCount = document.getElementById('batch-selected-count');
    }


    // 确保初始化时渲染日历
    function init() {
        state.chartType = 'bar'; // 确保默认类型
        cacheDOM();
        loadFromLocalStorage();
        fetchHolidays();
        initDateSelectors();
        initRecordsSelectors();
        setupEventListeners();
        renderCalendar(); // 确保日历渲染
        updateRecordsView();
        updateStatistics();
        // 更新今天标记
        updateTodayMarker();
        initAdvancedChart();
        applyTheme(); // 应用保存的主题
        setupChartControls(); // 新增这行
        // 使用setTimeout确保DOM完全加载
        setTimeout(() => {
            setupChartControls();
        }, 100);
    }


    // 增强版初始化检查
    function initApp() {
        console.log('initApp() 执行中...');

        const REQUIRED_ELEMENTS = {
            calendarContainer: '#calendar-days',
            salaryConfigPanel: '.salary-config',
            dataChart: '#dataChart'
        };

        // 调试：打印所有元素状态
        Object.entries(REQUIRED_ELEMENTS).forEach(([name, selector]) => {
            console.log(`检查元素 ${name}:`, document.querySelector(selector));
        });

        const missingElements = Object.entries(REQUIRED_ELEMENTS).filter(
            ([id, selector]) => {
                const exists = !!document.querySelector(selector);
                if (!exists) console.error(`未找到元素: ${selector} (${id})`);
                return !exists;
            }
        );

        if (missingElements.length > 0) {
            console.error('缺少必要元素:', missingElements);
            setTimeout(initApp, 500);
            return;
        }

        console.log('所有元素存在，开始初始化');
        init();
    }


    // 三种启动方式确保执行
    document.addEventListener('DOMContentLoaded', initApp);
    window.addEventListener('load', initApp);
    setTimeout(initApp, 1000); // 最终后备方案
    // 添加批量操作面板
    const batchControlsHTML = `
<div class="batch-controls mb-3 d-none">
    <div class="card">
        <div class="card-body">
            <h5 class="card-title">批量设置加班</h5>
            <div class="row g-3 align-items-center">
                <div class="col-md-4">
                    <label class="form-label">加班类型</label>
                    <select class="form-select" id="batch-overtime-type">
                        <option value="A">工作日加班 (1.5倍)</option>
                        <option value="B">周末/调休日加班 (2倍)</option>
                        <option value="C">节假日加班 (3倍)</option>
                    </select>
                </div>
                <div class="col-md-4">
                    <label class="form-label">加班时长(小时)</label>
                    <input type="number" class="form-control" id="batch-overtime-hours" min="0" step="0.5" value="1">
                </div>
                <div class="col-md-4 d-flex align-items-end">
                    <button class="btn btn-primary me-2" id="batch-apply">应用</button>
                    <button class="btn btn-outline-secondary" id="batch-cancel">取消</button>
                </div>
            </div>
        </div>
    </div>
    <div class="alert alert-info mt-2">
        已选择 <span id="batch-selected-count">0</span> 个日期
    </div>
</div>
`;

    function updateTodayMarker() {
        const todayMarker = document.querySelector('.today-marker');
        if (todayMarker) {
            const today = new Date();
            todayMarker.textContent = today.getDate();
        }
    }

    function loadFromLocalStorage() {
        try {
            // 加载工作数据
            const hoursData = localStorage.getItem('hoursData');
            if (hoursData) {
                state.hoursData = JSON.parse(hoursData) || {};
            }

            // 加载补贴/扣款记录
            const deductions = localStorage.getItem('deductions');
            if (deductions) {
                state.deductions = JSON.parse(deductions) || [];
            }

            // 加载主题设置
            const theme = localStorage.getItem('theme');
            state.darkMode = theme === 'dark';
            applyTheme();

            // 加载工资配置
            const savedSalary = localStorage.getItem('baseSalary');
            if (savedSalary) {
                state.baseSalary = parseFloat(savedSalary) || 4600;
                state.domCache.baseSalaryInput.value = state.baseSalary;
            }
        } catch (e) {
            console.error('加载本地存储数据失败:', e);
            // 初始化默认值
            state.hoursData = {};
            state.deductions = [];
            state.baseSalary = 4600;
        }
        updateSalaryConfig();
    }

    // 获取节假日信息
    function fetchHolidays() {
        // 2025年法定节假日
        state.holidays = [
            '2025-01-01', // 元旦
            '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',  // 春节
            '2025-04-04',  // 清明节
            '2025-05-01', '2025-05-02', '2025-05-31',  // 劳动节
            '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06' // 国庆节
        ];

        // 2025年调休工作日
        state.workdays = [
            '2025-01-26', '2025-02-08',
            '2025-04-27',
            '2025-09-28', '2025-10-11'
        ];

        // 2025年放假调休日(双倍加班费)
        state.specialWorkdays = [
            '2025-02-03', '2025-02-04', '2025-05-05', '2025-06-02', '2025-09-28', '2025-10-11'
        ];
    }

    // 设置事件监听器
    function setupEventListeners() {
        // 先移除旧监听器
        const importBtn = document.getElementById('import-data');
        importBtn.replaceWith(importBtn.cloneNode(true));
        // 清理旧事件监听器
        cleanEventListeners();

        // 新增事件清理函数
        function cleanEventListeners() {
            // 通过克隆节点移除所有旧监听
            const elementsToClean = ['prev-month', 'next-month'];
            elementsToClean.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.replaceWith(el.cloneNode(true));
            });
        }
        // 记录视图导航 - 替换这部分
        const prevRecordsBtn = document.getElementById('prev-month-records');
        const nextRecordsBtn = document.getElementById('next-month-records');

        // 先移除旧监听器
        prevRecordsBtn.replaceWith(prevRecordsBtn.cloneNode(true));
        nextRecordsBtn.replaceWith(nextRecordsBtn.cloneNode(true));

        // 重新绑定带防抖的新监听器
        document.getElementById('prev-month-records').addEventListener('click', createRecordsMonthHandler(-1));
        document.getElementById('next-month-records').addEventListener('click', createRecordsMonthHandler(1))

        // 新增带防抖的记录月份处理器
        function createRecordsMonthHandler(offset) {
            let isProcessing = false;
            return function (e) {
                e.stopPropagation();
                if (!isProcessing) {
                    isProcessing = true;
                    const newDate = new Date(state.recordsViewYear, state.recordsViewMonth - 1 + offset, 1);
                    state.recordsViewYear = newDate.getFullYear();
                    state.recordsViewMonth = newDate.getMonth() + 1;

                    // 更新选择器值
                    state.domCache.yearSelect.value = state.recordsViewYear;
                    state.domCache.monthSelect.value = state.recordsViewMonth;

                    state.recordsViewMode = 'specific';
                    updateRecordsView();

                    setTimeout(() => {
                        isProcessing = false;
                    }, 100);
                }
            };
        }

        // 批量模式切换
        document.getElementById('toggle-batch-mode').addEventListener('click', toggleBatchMode);

        // 批量应用
        document.getElementById('batch-apply').addEventListener('click', applyBatchOvertime);

        // 批量取消
        document.getElementById('batch-cancel').addEventListener('click', toggleBatchMode);
        // 补贴/扣款按钮点击事件
        document.getElementById('extra-deduction-btn').addEventListener('click', showDeductionModal);

        // 保存补贴/扣款记录
        document.getElementById('save-deduction').addEventListener('click', saveDeduction);

        // 删除记录
        // 修改删除按钮的事件监听
        document.addEventListener('click', function (e) {
            if (e.target.classList.contains('delete-deduction')) {
                e.stopPropagation(); // 阻止事件冒泡
                e.preventDefault();  // 阻止默认行为

                const id = e.target.dataset.id;
                deleteDeduction(id);
            }
        });

        // 月份导航
        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

        // 记录视图导航
        document.getElementById('current-month-records').addEventListener('click', showCurrentMonthRecords);
        document.getElementById('all-records').addEventListener('click', showAllRecords);
        document.getElementById('go-to-date').addEventListener('click', goToSelectedDate);

        // 日期选择器
        state.domCache.yearSelector.addEventListener('change', handleDateSelection);
        state.domCache.monthSelector.addEventListener('change', handleDateSelection);

        // 批量操作事件
        state.domCache.toggleBatchBtn.addEventListener('click', toggleBatchMode);
        state.domCache.batchApplyBtn.addEventListener('click', applyBatchOvertime);
        state.domCache.batchCancelBtn.addEventListener('click', toggleBatchMode);

        // 工作记录操作
        state.domCache.saveHours.addEventListener('click', saveHours);
        state.domCache.clearHours.addEventListener('click', clearHours);

        // 数据导入导出
        document.getElementById('export-excel').addEventListener('click', exportToExcel);
        document.getElementById('import-data').addEventListener('click', function () {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.xlsx,.xls,.json';
            fileInput.onchange = (e) => {
                if (e.target.files.length) {
                    handleFileImport(e.target.files[0]);
                }
            };
            fileInput.click();
        });



        // 修改后的拖放处理
        function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('dragover');

            if (e.dataTransfer.files.length) {
                handleFileImport(e.dataTransfer.files[0]);
            }
        }

        // 添加拖放支持
        document.addEventListener('dragover', handleDragOver);
        document.addEventListener('dragleave', handleDragLeave);
        document.addEventListener('drop', handleDrop);

        // 拖放相关函数
        function handleDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.add('dragover');
        }

        function handleDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('dragover');
        }

        // 修改后 - 统一使用handleFileImport处理
        function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('dragover');

            if (e.dataTransfer.files.length) {
                handleFileImport(e.dataTransfer.files[0]);
            }
        }


        // 新增辅助函数 - 日期解析
        function parseDateFromRow(row) {
            if (!row['日期']) return null;

            const dateStr = row['日期'].toString();
            const dateMatch = dateStr.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
            if (!dateMatch) return null;

            return new Date(
                parseInt(dateMatch[1]),
                parseInt(dateMatch[2]) - 1,
                parseInt(dateMatch[3])
            );
        }

        // 新增辅助函数 - 确定加班类型
        function determineOvertimeType(row, dateStr) {
            if (!row['类型']) return 'A';

            const typeStr = row['类型'].toString();
            if (typeStr.includes('3倍') || typeStr.includes('节假日')) {
                return 'C';
            }
            if (typeStr.includes('2倍') || typeStr.includes('周末') || typeStr.includes('调休')) {
                return 'B';
            }
            return 'A';
        }

        // 主题切换
        state.domCache.themeToggle.addEventListener('click', toggleTheme);

        // 工资配置
        state.domCache.baseSalaryInput.addEventListener('change', updateSalaryConfig);

        // 其他操作
        document.getElementById('clear-all-data').addEventListener('click', clearAllData);

        // 自动保存
        // state.domCache.hoursInput.addEventListener('blur', autoSaveHours);

        state.domCache.saveSalary.addEventListener('click', updateSalaryConfig);

        // 使用事件委托处理日历点击
        state.domCache.calendarDays.addEventListener('click', handleCalendarDayClick);
    }

    // 渲染整个应用
    function render() {
        renderCalendar();
        updateRecordsView();
        updateStatistics();
        updateChart();
    }

    // 渲染日历
    function renderCalendar() {
        updateDateSelectors();

        const firstDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const lastDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
        const firstDayOfWeek = firstDay.getDay();
        const prevMonthLastDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 0).getDate();
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === state.currentDate.getFullYear() &&
            today.getMonth() === state.currentDate.getMonth();

        let calendarHTML = '';

        // 填充上个月的几天
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const date = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, day);
            calendarHTML += createDayHTML(date, true);
        }

        // 填充当月的所有天
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), day);
            const isToday = isCurrentMonth && day === today.getDate();
            calendarHTML += createDayHTML(date, false, isToday);
        }

        // 填充下个月的前几天
        const daysRemaining = 42 - (firstDayOfWeek + lastDay.getDate());
        for (let day = 1; day <= daysRemaining; day++) {
            const date = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, day);
            calendarHTML += createDayHTML(date, true);
        }

        state.domCache.calendarDays.innerHTML = calendarHTML;

        // 如果有选中的日期，保持选中状态
        if (state.selectedDate) {
            highlightSelectedDay();
        }
    }

    // 创建日期元素的HTML
    function createDayHTML(date, isOtherMonth, isToday = false) {
        const dateStr = formatDate(date);
        const day = date.getDate();
        const dayOfWeek = date.getDay();

        let className = 'calendar-day';
        if (isOtherMonth) className += ' other-month';
        if (isToday) className += ' today';

        // 确定日期类型
        const isHoliday = state.holidays.includes(dateStr);
        const isWorkday = state.workdays.includes(dateStr);
        const isSpecialWorkday = state.specialWorkdays.includes(dateStr);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isHoliday) {
            className += ' holiday';
        } else if (isWeekend && !isWorkday && !isSpecialWorkday) {
            className += ' weekend';
        } else if (isWorkday || isSpecialWorkday) {
            className += ' workday';
        }

        // 添加工作信息
        let hoursDisplay = '';
        // 确保这部分逻辑正确执行
        if (state.hoursData[dateStr]) {
            const hours = state.hoursData[dateStr].hours;
            if (hours < 0) {
                className += ' leave-day';
                hoursDisplay = `<div class="leave-display">${hours}h</div>`;
            } else if (hours > 0) {
                const type = state.hoursData[dateStr].type || 'A';
                hoursDisplay = `<div class="overtime-display">${type}-${hours}h</div>`;
            }
        }

        // 如果是选中的日期，添加选中类
        if (state.selectedDate && formatDate(state.selectedDate) === dateStr) {
            className += ' selected-day';
        }

        return `
            <div class="${className}" data-date="${dateStr}">
                <div class="day-number">${day}</div>
                ${hoursDisplay}
            </div>
        `;
    }

    // 处理日历日期点击
    function handleCalendarDayClick(event) {
        const dayElement = event.target.closest('.calendar-day');
        if (!dayElement) return;

        const dateStr = dayElement.dataset.date;
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        showDayDetails(date);
    }

    // 显示日期详情
    function showDayDetails(date) {
        state.selectedDate = date;
        const dateStr = formatDate(date);
        const dayOfWeek = date.getDay();

        // 更新日期标题
        state.domCache.detailDate.textContent =
            `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[dayOfWeek]}`;

        // 确定工作类型
        const isHoliday = state.holidays.includes(dateStr);
        const isWorkday = state.workdays.includes(dateStr);
        const isSpecialWorkday = state.specialWorkdays.includes(dateStr);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        let typeText = '工作日加班 (1.5倍)';

        if (isHoliday) {
            typeText = '节假日加班 (3倍)';
        } else if ((isWeekend && !isWorkday) || isSpecialWorkday) {
            typeText = isSpecialWorkday ? '放假调休日加班 (2倍)' : '周末加班 (2倍)';
        } else if (isWorkday) {
            typeText = '调休工作日加班 (1.5倍)';
        }

        state.domCache.hoursType.textContent = typeText;

        // 设置工作时数
        state.domCache.hoursInput.value = state.hoursData[dateStr] ? state.hoursData[dateStr].hours : '';

        // 清除消息
        showMessage('', '');

        // 显示详情面板
        state.domCache.dayDetails.classList.remove('hidden');

        // 高亮选中的日期
        highlightSelectedDay();
    }

    // 高亮选中的日期
    function highlightSelectedDay() {
        if (!state.selectedDate) return;

        // 移除之前的高亮
        document.querySelectorAll('.calendar-day.selected-day').forEach(el => {
            el.classList.remove('selected-day');
        });

        // 添加新的高亮
        const dateStr = formatDate(state.selectedDate);
        const dayElement = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if (dayElement) {
            dayElement.classList.add('selected-day');
        }
    }

    // 保存工作信息
    function saveHours() {

        if (!state.selectedDate) return;

        const dateStr = formatDate(state.selectedDate);
        const hoursInput = state.domCache.hoursInput.value.trim();

        if (!hoursInput) {
            showMessage('请输入工作时数', 'text-danger');
            return;
        }

        const hours = parseFloat(hoursInput);
        if (isNaN(hours)) {
            showMessage('请输入有效的工作时数', 'text-danger');
            return;
        }

        // 确定工作类型
        const isHoliday = state.holidays.includes(dateStr);
        const isWorkday = state.workdays.includes(dateStr);
        const isSpecialWorkday = state.specialWorkdays.includes(dateStr);
        const isWeekend = state.selectedDate.getDay() === 0 || state.selectedDate.getDay() === 6;

        let type = 'A';

        if (isHoliday) {
            type = 'C';
        } else if ((isWeekend && !isWorkday) || isSpecialWorkday) {
            type = 'B';
        }

        state.hoursData[dateStr] = {
            date: dateStr,
            hours: hours,
            type: hours >= 0 ? type : null,
            timestamp: new Date().toISOString()
        };

        render();

        // 保存后必须执行：
        saveToLocalStorage();  // 确保数据持久化
        renderCalendar();      // 重新渲染日历
        updateStatistics();    // 更新统计
        updateRecordsView();   // 更新记录视图
        showMessage('工作信息已保存', 'text-success');
    }

    // 自动保存工作信息
    function autoSaveHours() {
        if (!state.selectedDate || !state.domCache.hoursInput.value.trim()) return;
        saveHours();
    }

    // 清除工作信息
    function clearHours() {
        if (!state.selectedDate) return;

        const dateStr = formatDate(state.selectedDate);
        if (state.hoursData[dateStr]) {
            delete state.hoursData[dateStr];
            saveToLocalStorage();
            render();
            state.domCache.hoursInput.value = '';
            showMessage('工作信息已清除', 'text-success');
        }
    }

    // 更新工作记录视图
    function updateRecordsView() {
        const sortedDates = Object.keys(state.hoursData).sort((a, b) => new Date(a) - new Date(b));
        let tableHTML = '';

        // 添加表头
        tableHTML += `
        <tr class="table-header">
            <th>日期</th>
            <th>星期</th>
            <th>类型</th>
            <th>工作时数</th>
            <th>费率</th>
            <th>金额</th>
        </tr>
    `;

        if (sortedDates.length === 0 && state.deductions.length === 0) {
            tableHTML += '<tr><td colspan="6" class="text-center">暂无工作记录</td></tr>';
        } else {
            // 处理工作记录
            let hasWorkRecords = false;
            sortedDates.forEach(dateStr => {
                const date = new Date(dateStr);

                // 根据视图模式过滤
                if (state.recordsViewMode === 'current') {
                    if (date.getFullYear() !== state.currentDate.getFullYear() ||
                        date.getMonth() !== state.currentDate.getMonth()) {
                        return;
                    }
                } else if (state.recordsViewMode === 'specific') {
                    if (date.getFullYear() !== state.recordsViewYear ||
                        date.getMonth() + 1 !== state.recordsViewMonth) {
                        return;
                    }
                }

                const dayOfWeek = date.getDay();
                const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                const type = state.hoursData[dateStr].type || 'A';

                // 计算金额和类型
                let amount = 0;
                let rateText = '';
                let typeText = '';
                if (hours > 0) {
                    const rate = OVERTIME_RATES[type];
                    amount = hours * rate;
                    rateText = `${rate.toFixed(2)}元/时`;

                    switch (type) {
                        case 'A':
                            typeText = '工作日加班';
                            break;
                        case 'B':
                            typeText = state.specialWorkdays.includes(dateStr) ? '调休日加班' : '周末加班';
                            break;
                        case 'C':
                            typeText = '节假日加班';
                            break;
                    }
                } else if (hours < 0) {
                    const hourlyRate = OVERTIME_RATES['A'];
                    amount = hours * hourlyRate;
                    rateText = `${hourlyRate.toFixed(2)}元/时 (1.5倍)`;
                    typeText = '请假/调休';
                }

                tableHTML += `
                <tr>
                    <td>${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日</td>
                    <td>${WEEKDAYS[dayOfWeek]}</td>
                    <td>${typeText}</td>
                    <td>${hours}小时</td>
                    <td>${rateText}</td>
                    <td>${amount.toFixed(2)}元</td>
                </tr>
            `;
                hasWorkRecords = true;
            });

            // 添加补贴/扣款记录 - 现在会根据视图模式过滤
            let showDeductions = false;
            const deductionsToShow = state.deductions.filter(record => {
                const recordDate = new Date(record.date);

                if (state.recordsViewMode === 'current') {
                    return recordDate.getFullYear() === state.currentDate.getFullYear() &&
                        recordDate.getMonth() === state.currentDate.getMonth();
                } else if (state.recordsViewMode === 'specific') {
                    return recordDate.getFullYear() === state.recordsViewYear &&
                        recordDate.getMonth() + 1 === state.recordsViewMonth;
                }
                return true; // 'all' 模式显示所有
            });

            if (deductionsToShow.length > 0) {
                showDeductions = true;
                tableHTML += `
                <tr class="deduction-header">
                    <td colspan="6" class="text-center"><strong>补贴/扣款记录</strong></td>
                </tr>
                <tr class="deduction-subheader">
                    <th>日期</th>
                    <th>星期</th>
                    <th>类型</th>
                    <th>分类</th>
                    <th>金额</th>
                    <th>备注</th>
                </tr>
            `;
                hasDeductions = true;

                deductionsToShow.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(record => {
                    const date = new Date(record.date);
                    const amountClass = record.amount >= 0 ? 'deduction-positive' : 'deduction-negative';
                    const amountText = record.amount >= 0 ? `+${record.amount.toFixed(2)}` : record.amount.toFixed(2);

                    tableHTML += `
                    <tr class="deduction-row">
                        <td>${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日</td>
                        <td>${WEEKDAYS[date.getDay()]}</td>
                        <td>${record.type === 'subsidy' ? '补贴' : '扣款'}</td>
                        <td>${record.category}</td>
                        <td class="${amountClass}">${amountText}元</td>
                        <td>${record.notes || '-'}</td>
                    </tr>
                `;
                });
            }

            // 最终判断 - 如果没有记录才显示"无记录"
            if (!hasWorkRecords && !hasDeductions) {
                tableHTML = '<tr><td colspan="6" class="text-center">暂无工作记录</td></tr>';
            }
        }

        state.domCache.hoursBody.innerHTML = tableHTML;
    }

    // 更新统计信息
    function updateStatistics() {
        const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);

        // 初始化统计变量
        let monthlyOvertime = 0;      // 总加班时长（所有类型）
        let monthlyLeave = 0;         // 总请假时长
        let monthlyLeaveDeduction = 0;// 请假扣款总额

        // 三类加班的时长和费用
        let overtimeTypeA = { hours: 0, pay: 0 }; // 工作日加班（1.5倍）
        let overtimeTypeB = { hours: 0, pay: 0 }; // 周末/调休日加班（2倍）
        let overtimeTypeC = { hours: 0, pay: 0 }; // 节假日加班（3倍）

        // 计算补贴和扣款总额
        const currentYear = state.currentDate.getFullYear();
        const currentMonth = state.currentDate.getMonth() + 1;

        const monthlyDeductions = state.deductions.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate.getFullYear() === currentYear &&
                recordDate.getMonth() + 1 === currentMonth;
        });

        const totalDeductions = monthlyDeductions.reduce((sum, record) => sum + record.amount, 0);

        // 遍历当月每一天
        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(d);
            if (state.hoursData[dateStr]) {
                const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                const type = state.hoursData[dateStr].type || 'A';

                if (hours > 0) {
                    // 统计加班
                    monthlyOvertime += hours;
                    const pay = hours * OVERTIME_RATES[type];

                    switch (type) {
                        case 'A':
                            overtimeTypeA.hours += hours;
                            overtimeTypeA.pay += pay;
                            break;
                        case 'B':
                            overtimeTypeB.hours += hours;
                            overtimeTypeB.pay += pay;
                            break;
                        case 'C':
                            overtimeTypeC.hours += hours;
                            overtimeTypeC.pay += pay;
                            break;
                    }
                } else if (hours < 0) {
                    // 统计请假
                    monthlyLeave += Math.abs(hours);
                    monthlyLeaveDeduction += Math.abs(hours) * OVERTIME_RATES['A'];
                }
            }
        }

        // 计算实际加班（总加班 - 请假，最小为0）
        const actualOvertime = Math.max(0, monthlyOvertime - monthlyLeave);

        // 计算请假天数 (8小时为1天)
        const leaveDays = monthlyLeave / 8;

        // 更新UI显示
        // 1. 本月总加班（显示实际加班，小字显示总加班和分类详情）
        state.domCache.monthlyOvertime.innerHTML = `
        ${actualOvertime.toFixed(1)}H
        <div class="small-text">
            总加班: ${monthlyOvertime.toFixed(1)}H
        </div>
    `;

        // 2. 本月总请假（显示请假小时和天数，小字显示扣款金额）
        state.domCache.monthlyLeave.innerHTML = `
        ${monthlyLeave.toFixed(1)}H (${leaveDays.toFixed(1)}天)
        <div class="small-text">扣款: ${monthlyLeaveDeduction.toFixed(2)}¥</div>
    `;

        // 3. 本月加班费（显示总加班费，小字显示分类详情）
        state.domCache.monthlyOvertimePay.innerHTML = `
        ${(overtimeTypeA.pay + overtimeTypeB.pay + overtimeTypeC.pay).toFixed(2)}¥
        <div class="small-text">
            A(${overtimeTypeA.pay.toFixed(2)}¥) |
            B(${overtimeTypeB.pay.toFixed(2)}¥) |
            C(${overtimeTypeC.pay.toFixed(2)}¥)
        </div>
    `;

        // 计算预计实发工资
        // 更新预计实发工资计算
        const estimatedSalary = state.baseSalary +
            overtimeTypeA.pay +
            overtimeTypeB.pay +
            overtimeTypeC.pay -
            monthlyLeaveDeduction +
            totalDeductions;
        state.domCache.estimatedSalary.innerHTML = `
        ${Math.max(0, estimatedSalary).toFixed(2)}¥
        <div class="small-text">
            补贴/扣款: ${totalDeductions >= 0 ? '+' : ''}${totalDeductions.toFixed(2)}¥
        </div>
    `;

        // 检查加班限制（基于总加班时长）
        if (monthlyOvertime > 160) {
            state.domCache.monthlyOvertime.classList.add('stats-warning');
            state.domCache.monthlyOvertime.classList.remove('stats-ok');
        } else {
            state.domCache.monthlyOvertime.classList.add('stats-ok');
            state.domCache.monthlyOvertime.classList.remove('stats-warning');
        }
    }

    // 更新工资配置
    function updateSalaryConfig() {
        const newSalary = parseFloat(state.domCache.baseSalaryInput.value);
        if (isNaN(newSalary)) {
            showMessage('请输入有效的标准工资', 'text-danger');
            return;
        }

        // 动态更新图例中的费率显示
        document.querySelectorAll('.rate-value').forEach(el => {
            const rateType = el.dataset.rate;
            if (rateType && OVERTIME_RATES[rateType]) {
                el.textContent = OVERTIME_RATES[rateType].toFixed(2);
            }
        });

        state.baseSalary = newSalary;

        // 计算基础时薪（1.5倍）
        const dailySalary = state.baseSalary / 21.75;
        const baseHourlySalary = dailySalary / 8;

        // 更新加班费率
        OVERTIME_RATES.A = baseHourlySalary * 1.5;  // 工作日加班1.5倍
        OVERTIME_RATES.B = baseHourlySalary * 2;    // 周末加班2倍
        OVERTIME_RATES.C = baseHourlySalary * 3;    // 节假日加班3倍

        // 更新UI显示
        state.domCache.dailySalary.textContent = dailySalary.toFixed(2);
        state.domCache.hourlySalary.textContent = baseHourlySalary.toFixed(2);

        // 保存到本地存储
        localStorage.setItem('baseSalary', state.baseSalary.toString());

        // 更新统计信息
        updateStatistics();
        updateRecordsView();

        showMessage('工资设置已保存', 'text-success');
    }

    // 修改exportToExcel函数，支持指定文件名
    function exportToExcel() {
        // 工作记录表头修改
        data.push(['日期', '星期', '加班类型', '工作时数', '费率', '金额', '备注']);

        // 补贴/扣款记录表头修改
        data.push(['日期', '记录类型', '分类', '金额', '备注', '']);


        return new Promise((resolve) => {
            // 准备数据
            const data = [
                ['工资与加班记录', '', '', '', '', '']
            ];

            // 添加工作记录
            if (Object.keys(state.hoursData).length > 0) {
                data.push([], ['工作记录', '', '', '', '', '']);
                data.push(['日期', '星期', '类型', '工作时数', '费率', '金额', '备注']);

                const sortedDates = Object.keys(state.hoursData).sort((a, b) => new Date(a) - new Date(b));

                sortedDates.forEach(dateStr => {
                    const date = new Date(dateStr);
                    const dayOfWeek = date.getDay();

                    const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                    const type = state.hoursData[dateStr].type || 'A';

                    // 计算金额
                    let amount = 0;
                    let rateText = '';
                    let typeText = '';
                    let note = '';

                    if (hours > 0) {
                        const rate = OVERTIME_RATES[type];
                        amount = hours * rate;
                        rateText = `${rate.toFixed(2)}元/时`;

                        switch (type) {
                            case 'A':
                                typeText = '工作日加班';
                                break;
                            case 'B':
                                typeText = state.specialWorkdays.includes(dateStr) ? '放假调休日加班' : '周末加班';
                                note = state.specialWorkdays.includes(dateStr) ? '放假调休日' : '';
                                break;
                            case 'C':
                                typeText = '节假日加班';
                                break;
                        }
                    } else if (hours < 0) {
                        const hourlyRate = OVERTIME_RATES['A'];
                        amount = hours * hourlyRate;
                        rateText = `${hourlyRate.toFixed(2)}元/时 (1.5倍)`;
                        typeText = '请假/调休';
                    }

                    data.push([
                        `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
                        WEEKDAYS[dayOfWeek],
                        typeText,
                        hours,
                        rateText,
                        amount.toFixed(2),
                        note
                    ]);
                });
            }

            // 添加补贴/扣款记录
            if (state.deductions.length > 0) {
                data.push([], ['补贴/扣款记录', '', '', '', '', '']);
                data.push(['日期', '星期', '类型', '工作时数', '费率', '金额', '备注']);

                // 按日期排序
                const sortedDeductions = [...state.deductions].sort((a, b) => new Date(a.date) - new Date(b.date));

                sortedDeductions.forEach(record => {
                    const date = new Date(record.date);
                    data.push([
                        `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
                        record.type === 'subsidy' ? '补贴' : '扣款',
                        record.category,
                        record.amount >= 0 ? `+${record.amount.toFixed(2)}` : record.amount.toFixed(2),
                        record.notes || '-',
                        ''
                    ]);
                });
            }

            // 添加统计数据
            data.push([], ['统计项', '数值', '', '', '', '']);
            data.push(['标准工资', `${state.baseSalary.toFixed(2)}元`, '', '', '', '']);

            // 创建工作簿
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, '工作记录');

            // 导出文件
            const fileName = `工资记录_${formatDate(new Date())}.xlsx`;
            XLSX.writeFile(wb, fileName);

            // 确保文件名是字符串
            if (typeof fileName !== 'string') {
                throw new Error('文件名必须是字符串');
            }
            console.log("正在导出文件:", fileName);

            // 使用XLSX.writeFile导出
            XLSX.writeFile(wb, fileName);
            showMessage('Excel导出成功', 'text-success');

            showMessage('Excel导出成功', 'text-success');
            resolve();
        });
    }

    // 新增辅助函数 - 确定加班类型
    function determineOvertimeType(row, dateStr) {
        if (!row['类型']) return 'A'; // 默认1.5倍

        const typeStr = row['类型'].toString().toLowerCase();

        if (typeStr.includes('3倍') || typeStr.includes('节假日')) {
            return 'C'; // 3倍
        }
        if (typeStr.includes('2倍') || typeStr.includes('周末') || typeStr.includes('调休')) {
            return 'B'; // 2倍
        }
        return 'A'; // 默认1.5倍
    }

    // 新增辅助函数 - 日期解析
    function parseDateFromRow(row) {
        if (!row['日期']) return null;

        // 处理多种可能的日期格式
        const dateStr = row['日期'].toString();

        // 尝试匹配 YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日 等格式
        const dateMatch = dateStr.match(/(\d{4})[-\/年]?(\d{1,2})[-\/月]?(\d{1,2})/);
        if (!dateMatch) return null;

        // 注意：月份需要减1（JavaScript月份是0-11）
        return new Date(
            parseInt(dateMatch[1]),
            parseInt(dateMatch[2]) - 1,
            parseInt(dateMatch[3])
        );
    }

    /**
     * 导出数据到Excel文件（优化版）
     */
    async function exportToExcel() {
        try {
            showMessage('正在准备导出数据...', 'text-info');

            // 创建工作簿
            const wb = XLSX.utils.book_new();

            // 1. 创建工作记录表
            const workRecordsData = prepareWorkRecordsData();
            const workRecordsSheet = XLSX.utils.aoa_to_sheet(workRecordsData);
            setExcelColumnWidth(workRecordsSheet, workRecordsData);
            setExcelWrapText(workRecordsSheet, workRecordsData);
            XLSX.utils.book_append_sheet(wb, workRecordsSheet, "工作记录");

            // 2. 创建补贴/扣款记录表（如果有数据）
            if (state.deductions.length > 0) {
                const deductionData = prepareDeductionData();
                const deductionSheet = XLSX.utils.aoa_to_sheet(deductionData);
                setExcelColumnWidth(deductionSheet, deductionData);
                setExcelWrapText(deductionSheet, deductionData);
                XLSX.utils.book_append_sheet(wb, deductionSheet, "补贴扣款");
            }

            // 3. 创建统计信息表
            const statsData = prepareStatsData();
            const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
            setExcelColumnWidth(statsSheet, statsData);
            setExcelWrapText(statsSheet, statsData);
            XLSX.utils.book_append_sheet(wb, statsSheet, "统计信息");

            // 导出文件（使用setTimeout避免UI阻塞）
            setTimeout(() => {
                try {
                    const fileName = `工资记录_${formatDate(new Date(), 'YYYY年MM月DD日')}.xlsx`;
                    XLSX.writeFile(wb, fileName);
                    showMessage('Excel导出成功', 'text-success');
                } catch (e) {
                    console.error('导出错误:', e);
                    showMessage(`导出失败: ${e.message}`, 'text-danger');
                }
            }, 100);

        } catch (error) {
            console.error('导出失败:', error);
            showMessage(`导出失败: ${error.message}`, 'text-danger');
        }
    }

    /**
     * 准备工作记录数据
     */
    function prepareWorkRecordsData() {
        const headers = [
            ['工作记录'],
            [],
            ['日期', '星期', '类型', '工作时数', '费率', '金额', '备注']
        ];

        const sortedDates = Object.keys(state.hoursData).sort((a, b) => new Date(a) - new Date(b));
        const data = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            const record = state.hoursData[dateStr];
            const hours = parseFloat(record.hours) || 0;
            const type = record.type || 'A';

            // 计算金额和类型说明
            let amount = 0, rateText = '', typeText = '', note = '';

            if (hours > 0) {
                const rate = OVERTIME_RATES[type];
                amount = hours * rate;
                rateText = `${rate.toFixed(2)}元/时`;

                switch (type) {
                    case 'A': typeText = '工作日加班'; break;
                    case 'B':
                        typeText = state.specialWorkdays.includes(dateStr) ? '调休日加班' : '周末加班';
                        note = state.specialWorkdays.includes(dateStr) ? '放假调休日' : '';
                        break;
                    case 'C': typeText = '节假日加班'; break;
                }
            } else if (hours < 0) {
                const hourlyRate = OVERTIME_RATES['A'];
                amount = hours * hourlyRate;
                rateText = `${hourlyRate.toFixed(2)}元/时 (1.5倍)`;
                typeText = '请假/调休';
            }

            return [
                formatDate(date, 'YYYY年MM月DD日'),
                WEEKDAYS[date.getDay()],
                typeText,
                hours,
                rateText,
                amount.toFixed(2),
                note
            ];
        });

        return [...headers, ...data];
    }

    /**
     * 准备补贴/扣款数据
     */
    function prepareDeductionData() {
        const headers = [
            ['补贴/扣款记录'],
            [],
            ['日期', '类型', '分类', '金额', '备注']
        ];

        const sortedDeductions = [...state.deductions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const data = sortedDeductions.map(record => {
            const date = new Date(record.date);
            return [
                formatDate(date, 'YYYY年MM月DD日'),
                record.type === 'subsidy' ? '补贴' : '扣款',
                record.category,
                record.amount >= 0 ? `+${record.amount.toFixed(2)}` : record.amount.toFixed(2),
                record.notes || '-'
            ];
        });

        return [...headers, ...data];
    }

    /**
     * 准备统计数据
     */
    function prepareStatsData() {
        const stats = calculateMonthlyStats();
        return [
            ['统计信息'],
            [],
            ['项目', '数值'],
            ['标准工资', `${state.baseSalary.toFixed(2)}元`],
            ['工作日加班费(1.5倍)', `${stats.typeAPay.toFixed(2)}元`],
            ['周末加班费(2倍)', `${stats.typeBPay.toFixed(2)}元`],
            ['节假日加班费(3倍)', `${stats.typeCPay.toFixed(2)}元`],
            ['总加班费', `${stats.totalOvertimePay.toFixed(2)}元`],
            ['请假扣款', `${stats.leaveDeduction.toFixed(2)}元`],
            ['补贴/扣款总额', `${stats.totalDeductions.toFixed(2)}元`],
            ['预计实发工资', `${stats.estimatedSalary.toFixed(2)}元`],
            ['总加班时长', `${stats.totalOvertime.toFixed(1)}小时`]
        ];
    }

    /**
     * 设置Excel列宽自适应
     */
    function setExcelColumnWidth(worksheet, data) {
        if (!data || data.length === 0) return;

        // 计算每列最大字符长度
        const colWidths = data[0].map((_, colIndex) => {
            return data.reduce((max, row) => {
                const cellValue = row[colIndex] || '';
                const length = cellValue.toString().length;
                return Math.max(max, length);
            }, 10); // 最小宽度为10
        });

        // 设置列宽 (Excel中1个单位≈1个字符宽度)
        worksheet['!cols'] = colWidths.map(width => ({
            width: Math.min(width + 2, 50) // 最大宽度限制为50
        }));
    }

    /**
     * 设置Excel单元格自动换行
     */
    function setExcelWrapText(worksheet) {
        if (!worksheet['!ref']) return;

        const range = XLSX.utils.decode_range(worksheet['!ref']);

        // 为所有单元格设置自动换行
        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                if (!worksheet[cellAddress]) continue;

                worksheet[cellAddress].s = worksheet[cellAddress].s || {};
                worksheet[cellAddress].s.alignment = worksheet[cellAddress].s.alignment || {};
                worksheet[cellAddress].s.alignment.wrapText = true;
            }
        }
    }

    /**
     * 创建工作记录表数据
     */
    function getWorkRecordsData() {
        const headers = [
            ['工作记录'],
            [],
            ['日期', '星期', '类型', '工作时数', '费率', '金额', '备注']
        ];

        const sortedDates = Object.keys(state.hoursData).sort((a, b) => new Date(a) - new Date(b));
        const data = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            const record = state.hoursData[dateStr];
            const hours = parseFloat(record.hours) || 0;
            const type = record.type || 'A';

            // 计算金额和类型说明
            let amount = 0, rateText = '', typeText = '', note = '';

            if (hours > 0) {
                const rate = OVERTIME_RATES[type];
                amount = hours * rate;
                rateText = `${rate.toFixed(2)}元/时`;

                switch (type) {
                    case 'A': typeText = '工作日加班'; break;
                    case 'B':
                        typeText = '周末加班';
                        if (state.specialWorkdays.includes(dateStr)) {
                            typeText = '调休日加班';
                            note = '放假调休日';
                        }
                        break;
                    case 'C': typeText = '节假日加班'; break;
                }
            } else if (hours < 0) {
                const hourlyRate = OVERTIME_RATES['A'];
                amount = hours * hourlyRate;
                rateText = `${hourlyRate.toFixed(2)}元/时 (1.5倍)`;
                typeText = '请假/调休';
            }

            return [
                formatDate(date, 'YYYY年MM月DD日'),
                WEEKDAYS[date.getDay()],
                typeText,
                hours,
                rateText,
                amount.toFixed(2),
                note
            ];
        });

        // 合并表头和实际数据
        const sheetData = [...headers, ...data];
        return [...headers, ...data];
        return XLSX.utils.aoa_to_sheet(sheetData);
    }

    /**
     * 创建补贴/扣款记录表数据
     */
    function getDeductionData() {
        const headers = [
            ['补贴/扣款记录'],
            [],
            ['日期', '类型', '分类', '金额', '备注']
        ];

        const sortedDeductions = [...state.deductions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const data = sortedDeductions.map(record => {
            const date = new Date(record.date);
            return [
                formatDate(date, 'YYYY年MM月DD日'),
                record.type === 'subsidy' ? '补贴' : '扣款',
                record.category,
                record.amount >= 0 ? `+${record.amount.toFixed(2)}` : record.amount.toFixed(2),
                record.notes || '-'
            ];
        });

        return XLSX.utils.aoa_to_sheet([...headers, ...data]);
        return [...headers, ...data];
    }

    /**
     * 计算月度统计数据
     */
    function calculateMonthlyStats() {
        const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);

        let typeAPay = 0;  // 工作日加班费
        let typeBPay = 0;  // 周末加班费
        let typeCPay = 0;  // 节假日加班费
        let leaveDeduction = 0;  // 请假扣款
        let totalOvertime = 0;  // 总加班时长

        // 计算加班和请假数据
        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(d);
            if (state.hoursData[dateStr]) {
                const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                const type = state.hoursData[dateStr].type || 'A';

                if (hours > 0) {
                    totalOvertime += hours;
                    const pay = hours * OVERTIME_RATES[type];

                    switch (type) {
                        case 'A': typeAPay += pay; break;
                        case 'B': typeBPay += pay; break;
                        case 'C': typeCPay += pay; break;
                    }
                } else if (hours < 0) {
                    leaveDeduction += Math.abs(hours) * OVERTIME_RATES['A'];
                }
            }
        }

        // 计算补贴/扣款总额
        const currentYear = state.currentDate.getFullYear();
        const currentMonth = state.currentDate.getMonth() + 1;
        const totalDeductions = state.deductions
            .filter(record => {
                const recordDate = new Date(record.date);
                return recordDate.getFullYear() === currentYear &&
                    recordDate.getMonth() + 1 === currentMonth;
            })
            .reduce((sum, record) => sum + record.amount, 0);

        // 计算预计实发工资
        const totalOvertimePay = typeAPay + typeBPay + typeCPay;
        const estimatedSalary = state.baseSalary + totalOvertimePay - leaveDeduction + totalDeductions;

        return {
            typeAPay,
            typeBPay,
            typeCPay,
            totalOvertimePay,
            leaveDeduction,
            totalDeductions,
            estimatedSalary,
            totalOvertime
        };
    }

    /**
     * 创建统计信息表数据
     */
    function createStatsSheet() {
        const stats = calculateMonthlyStats(); // 现在这个函数已定义

        return XLSX.utils.aoa_to_sheet([
            ['统计信息'],
            [],
            ['项目', '数值'],
            ['标准工资', `${state.baseSalary.toFixed(2)}元`],
            ['工作日加班费(1.5倍)', `${stats.typeAPay.toFixed(2)}元`],
            ['周末加班费(2倍)', `${stats.typeBPay.toFixed(2)}元`],
            ['节假日加班费(3倍)', `${stats.typeCPay.toFixed(2)}元`],
            ['总加班费', `${stats.totalOvertimePay.toFixed(2)}元`],
            ['请假扣款', `${stats.leaveDeduction.toFixed(2)}元`],
            ['补贴/扣款总额', `${stats.totalDeductions.toFixed(2)}元`],
            ['预计实发工资', `${stats.estimatedSalary.toFixed(2)}元`],
            ['总加班时长', `${stats.totalOvertime.toFixed(1)}小时`]
        ]);
    }

    /**
     * 处理文件导入
     */
    async function handleFileImport(file) {
        try {
            // 验证文件
            if (!file) {
                showMessage('未选择文件', 'text-danger');
                return;
            }

            // 检查文件类型
            const validExtensions = ['.xlsx', '.xls', '.json'];
            const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

            if (!validExtensions.includes(fileExt)) {
                showMessage('请上传Excel(.xlsx/.xls)或JSON文件', 'text-danger');
                return;
            }

            showMessage('正在导入数据...', 'text-info');

            // 读取文件内容
            const data = await file.arrayBuffer();
            let wb;

            try {
                if (fileExt === '.json') {
                    // 处理JSON文件
                    const jsonText = new TextDecoder().decode(data);
                    const jsonData = JSON.parse(jsonText);
                    wb = XLSX.utils.book_new();

                    // 假设JSON数据包含工作记录和补贴扣款
                    if (jsonData.hoursData) {
                        const ws = XLSX.utils.json_to_sheet(jsonData.hoursData);
                        XLSX.utils.book_append_sheet(wb, ws, "工作记录");
                    }

                    if (jsonData.deductions) {
                        const ws = XLSX.utils.json_to_sheet(jsonData.deductions);
                        XLSX.utils.book_append_sheet(wb, ws, "补贴扣款");
                    }
                } else {
                    // 处理Excel文件
                    wb = XLSX.read(data);
                }
            } catch (e) {
                console.error('解析文件失败:', e);
                showMessage('文件解析失败，请检查文件格式', 'text-danger');
                return;
            }

            // 解析数据
            const importResult = {
                workRecords: 0,
                deductions: 0,
                errors: []
            };

            // 解析工作记录表
            if (wb.SheetNames.includes("工作记录")) {
                const ws = wb.Sheets["工作记录"];
                const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
                importResult.workRecords = parseWorkRecords(jsonData, importResult.errors);
            } else {
                importResult.errors.push('工作记录表不存在');
            }

            // 解析补贴扣款表
            if (wb.SheetNames.includes("补贴扣款")) {
                const ws = wb.Sheets["补贴扣款"];
                const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
                importResult.deductions = parseDeductionRecords(jsonData, importResult.errors);
            }

            // 显示导入结果
            showImportResult(importResult);

        } catch (error) {
            console.error('导入失败:', error);
            showMessage(`导入失败: ${error.message}`, 'text-danger');
        }
    }

    /**
     * 解析工作记录数据
     */
    function parseWorkRecords(data, errors) {
        let importedCount = 0;
        const tempHoursData = {};

        // 跳过表头行 (前3行)
        for (let i = 3; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 6) continue;

            try {
                const dateStr = row[0]; // 日期列
                const hours = parseFloat(row[3]); // 工作时数列

                if (!dateStr || isNaN(hours)) {
                    errors.push(`第${i + 1}行: 缺少日期或无效的工作时数`);
                    continue;
                }

                // 解析日期
                const dateMatch = dateStr.match(/(\d{4})[^\d]?(\d{1,2})[^\d]?(\d{1,2})/);
                if (!dateMatch) {
                    errors.push(`第${i + 1}行: 无法解析日期格式`);
                    continue;
                }

                const date = new Date(
                    parseInt(dateMatch[1]),
                    parseInt(dateMatch[2]) - 1,
                    parseInt(dateMatch[3])
                );

                if (isNaN(date.getTime())) {
                    errors.push(`第${i + 1}行: 无效的日期`);
                    continue;
                }

                const formattedDate = formatDate(date);

                // 确定加班类型
                let type = 'A';
                const typeText = row[2]; // 类型列

                if (typeText && (typeText.includes('3倍') || typeText.includes('节假日'))) {
                    type = 'C';
                } else if (typeText && (typeText.includes('2倍') || typeText.includes('周末') || typeText.includes('调休'))) {
                    type = 'B';
                }

                tempHoursData[formattedDate] = {
                    date: formattedDate,
                    hours: hours,
                    type: hours > 0 ? type : null,
                    timestamp: new Date().toISOString()
                };

                importedCount++;

            } catch (e) {
                errors.push(`第${i + 1}行: ${e.message}`);
            }
        }

        // 合并数据
        Object.assign(state.hoursData, tempHoursData);
        return importedCount;
    }

    /**
     * 解析补贴/扣款记录
     */
    function parseDeductionRecords(data, errors) {
        let importedCount = 0;
        const tempDeductions = [];

        // 跳过表头行 (前3行)
        for (let i = 3; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 5) continue;

            try {
                const dateStr = row[0]; // 日期列
                const typeText = row[1]; // 类型列
                const category = row[2]; // 分类列
                const amountText = row[3]; // 金额列
                const notes = row[4] || ''; // 备注列

                if (!dateStr || !typeText || !amountText) {
                    errors.push(`第${i + 1}行: 缺少必要字段`);
                    continue;
                }

                // 解析日期
                const dateMatch = dateStr.match(/(\d{4})[^\d]?(\d{1,2})[^\d]?(\d{1,2})/);
                if (!dateMatch) {
                    errors.push(`第${i + 1}行: 无法解析日期格式`);
                    continue;
                }

                const date = new Date(
                    parseInt(dateMatch[1]),
                    parseInt(dateMatch[2]) - 1,
                    parseInt(dateMatch[3])
                );

                if (isNaN(date.getTime())) {
                    errors.push(`第${i + 1}行: 无效的日期`);
                    continue;
                }

                // 解析金额
                const amount = parseFloat(amountText.replace(/[^\d.-]/g, ''));
                if (isNaN(amount)) {
                    errors.push(`第${i + 1}行: 无效的金额`);
                    continue;
                }

                // 确定类型
                const type = typeText.includes('补贴') ? 'subsidy' : 'deduction';
                const finalAmount = type === 'subsidy' ? Math.abs(amount) : -Math.abs(amount);

                tempDeductions.push({
                    id: Date.now().toString() + i,
                    date: formatDate(date),
                    type: type,
                    category: category || '其他',
                    amount: finalAmount,
                    notes: notes,
                    timestamp: new Date().toISOString()
                });

                importedCount++;

            } catch (e) {
                errors.push(`第${i + 1}行: ${e.message}`);
            }
        }

        // 合并数据
        state.deductions.push(...tempDeductions);
        return importedCount;
    }

    /**
     * 显示导入结果
     */
    function showImportResult(result) {
        let message = `成功导入 ${result.workRecords} 条工作记录, ${result.deductions} 条补贴/扣款记录`;

        if (result.errors.length > 0) {
            message += ` (有 ${result.errors.length} 条记录导入失败)`;

            // 显示详细错误 (开发环境)
            if (process.env.NODE_ENV === 'development') {
                console.error('导入错误详情:', result.errors);
            }
        }

        // 保存并刷新界面
        saveToLocalStorage();
        render();
        updateStatistics();

        showMessage(message, result.errors.length > 0 ? 'text-warning' : 'text-success');

        // 显示结果弹窗
        const modalHtml = `
        <div class="modal fade" id="importResultModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">导入结果</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                        ${result.errors.length > 0 ? `
                            <div class="alert alert-warning mt-3">
                                <h6>错误详情:</h6>
                                <ul class="mb-0">
                                    ${result.errors.slice(0, 5).map(err => `<li>${err}</li>`).join('')}
                                    ${result.errors.length > 5 ? `<li>...还有 ${result.errors.length - 5} 条错误未显示</li>` : ''}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">确定</button>
                    </div>
                </div>
            </div>
        </div>
    `;

        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        document.body.appendChild(div);

        const modal = new bootstrap.Modal(div.querySelector('.modal'));
        modal.show();

        // 移除弹窗
        div.querySelector('.modal').addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(div);
        });
    }

    // 修复清除所有数据功能
    function clearAllData() {
        if (confirm('确定要清除所有记录吗？此操作不可恢复！')) {
            localStorage.removeItem('hoursData');
            localStorage.removeItem('baseSalary');
            localStorage.removeItem('deductions');
            state.deductions = [];

            state.hoursData = {};
            state.baseSalary = 4600;
            state.domCache.baseSalaryInput.value = state.baseSalary;

            render();
            updateSalaryConfig();
            showMessage('所有记录已清除', 'text-success');
        }
    }

    // 切换主题
    function toggleTheme() {
        state.darkMode = !state.darkMode;
        applyTheme();
        saveToLocalStorage();
    }

    // 应用主题
    function applyTheme() {
        if (state.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            state.domCache.themeToggle.innerHTML = '<i class="bi bi-sun-fill"></i> 浅色模式';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            state.domCache.themeToggle.innerHTML = '<i class="bi bi-moon-fill"></i> 深色模式';
        }
    }

    // 显示消息
    function showMessage(message, className) {
        state.domCache.hoursMessage.textContent = message;
        state.domCache.hoursMessage.className = className;
    }

    // 保存数据到本地存储
    function saveToLocalStorage() {
        try {
            localStorage.setItem('baseSalary', state.baseSalary.toString());
            localStorage.setItem('theme', state.darkMode ? 'dark' : 'light');
            localStorage.setItem('hoursData', JSON.stringify(state.hoursData));
            localStorage.setItem('deductions', JSON.stringify(state.deductions));
        } catch (e) {
            console.error('保存到本地存储失败:', e);
            showMessage('保存数据失败，请检查浏览器存储空间', 'text-danger');
        }
    }

    // 初始化日期选择器
    function initDateSelectors() {
        const currentYear = new Date().getFullYear();

        // 填充年份选择器（前后5年）
        state.domCache.yearSelector.innerHTML = '';
        for (let year = currentYear - 5; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            state.domCache.yearSelector.appendChild(option);
        }

        // 填充月份选择器
        state.domCache.monthSelector.innerHTML = '';
        MONTH_NAMES.forEach((month, index) => {
            const option = document.createElement('option');
            option.value = index + 1;
            option.textContent = month;
            state.domCache.monthSelector.appendChild(option);
        });

        updateDateSelectors();
    }

    // 更新日期选择器选中状态
    function updateDateSelectors() {
        state.domCache.yearSelector.value = state.currentDate.getFullYear();
        state.domCache.monthSelector.value = state.currentDate.getMonth() + 1;
    }

    // 处理日期选择变化
    function handleDateSelection() {
        const year = parseInt(state.domCache.yearSelector.value);
        const month = parseInt(state.domCache.monthSelector.value) - 1;

        state.currentDate = new Date(year, month, 1);
        render();
    }

    // 改变月份
    function changeMonth(offset) {
        const newMonth = state.currentDate.getMonth() + offset;
        state.currentDate = new Date(state.currentDate.getFullYear(), newMonth, 1);
        render();
    }

    // 初始化记录选择器
    function initRecordsSelectors() {
        const currentYear = new Date().getFullYear();

        // 填充年份选择器
        state.domCache.yearSelect.innerHTML = '';
        for (let year = currentYear - 5; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            if (year === state.recordsViewYear) {
                option.selected = true;
            }
            state.domCache.yearSelect.appendChild(option);
        }

        // 设置当前选中月份
        state.domCache.monthSelect.value = state.recordsViewMonth;
    }

    // 修复记录视图月份切换
    function changeRecordsMonth(offset) {
        // 添加防抖检查
        if (this._isChangingMonth) return;
        this._isChangingMonth = true;

        console.log("changeRecordsMonth called with offset:", offset); // 调试用

        // 创建新的日期对象避免直接修改状态
        const newDate = new Date(state.recordsViewYear, state.recordsViewMonth - 1 + offset, 1);

        state.recordsViewYear = newDate.getFullYear();
        state.recordsViewMonth = newDate.getMonth() + 1;

        // 更新选择器值
        state.domCache.yearSelect.value = state.recordsViewYear;
        state.domCache.monthSelect.value = state.recordsViewMonth;

        state.recordsViewMode = 'specific';
        updateRecordsView();

        // 防抖解锁
        setTimeout(() => {
            this._isChangingMonth = false;
        }, 100);
    }


    // 显示当前月记录
    function showCurrentMonthRecords() {
        state.recordsViewYear = state.currentDate.getFullYear();
        state.recordsViewMonth = state.currentDate.getMonth() + 1;
        state.recordsViewMode = 'current';
        updateRecordsView();
    }

    // 显示所有记录
    function showAllRecords() {
        state.recordsViewMode = 'all';
        updateRecordsView();
    }

    // 跳转到选定日期
    function goToSelectedDate() {
        state.recordsViewYear = parseInt(state.domCache.yearSelect.value);
        state.recordsViewMonth = parseInt(state.domCache.monthSelect.value);
        state.recordsViewMode = 'specific';
        updateRecordsView();
    }

    // 格式化日期为YYYY-MM-DD
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 显示补贴/扣款弹窗
    function showDeductionModal() {
        // 初始化表单
        document.getElementById('deduction-type').value = '';
        document.getElementById('deduction-amount').value = '';
        document.getElementById('deduction-category').value = '';
        document.getElementById('custom-category').value = '';
        document.getElementById('deduction-notes').value = '';
        document.getElementById('deduction-date').valueAsDate = new Date();

        // 填充当前月份记录
        renderDeductionRecords();

        // 显示弹窗
        const modal = new bootstrap.Modal(document.getElementById('extraDeductionModal'));
        modal.show();
    }

    // 保存补贴/扣款记录
    function saveDeduction() {
        const type = document.getElementById('deduction-type').value;
        const amount = parseFloat(document.getElementById('deduction-amount').value);
        const categorySelect = document.getElementById('deduction-category');
        const customCategory = document.getElementById('custom-category').value.trim();
        const notes = document.getElementById('deduction-notes').value.trim();
        const date = document.getElementById('deduction-date').value;

        // 验证必填字段
        if (!type || isNaN(amount) || !date) {
            alert('请填写完整信息：类型、金额和日期为必填项');
            return;
        }

        // 确定分类 - 优先使用选择的分类，如果没有选择则使用自定义分类
        let finalCategory = categorySelect.value;
        if (!finalCategory && customCategory) {
            finalCategory = customCategory;
        } else if (!finalCategory && !customCategory) {
            finalCategory = '其他'; // 默认分类
        }

        // 创建记录
        const record = {
            id: Date.now().toString(),
            date: date,
            type: type,
            category: finalCategory, // 使用确定的分类
            amount: type === 'subsidy' ? Math.abs(amount) : -Math.abs(amount),
            notes: notes || '无',
            timestamp: new Date().toISOString()
        };

        // 添加到数组并保存
        state.deductions.push(record);
        saveToLocalStorage();

        // 重新渲染记录和统计
        renderDeductionRecords();
        updateStatistics();

        // 新增：刷新主表格显示
        updateRecordsView();

        // 重置表单
        document.getElementById('extra-deduction-form').reset();
        document.getElementById('deduction-date').valueAsDate = new Date();

        // 显示成功消息
        showMessage('记录已保存', 'text-success');
    }

    // 渲染补贴/扣款记录
    function renderDeductionRecords() {
        const currentYear = state.currentDate.getFullYear();
        const currentMonth = state.currentDate.getMonth() + 1;
        const tbody = document.getElementById('deduction-records-body');

        // 先清空表格
        tbody.innerHTML = '';

        // 筛选当前年月记录
        const currentRecords = state.deductions
            .filter(record => {
                const recordDate = new Date(record.date);
                return recordDate.getFullYear() === currentYear &&
                    recordDate.getMonth() + 1 === currentMonth;
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (currentRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">暂无记录</td></tr>';
            return;
        }

        // 确保事件委托只绑定一次
        if (!tbody._hasEventDelegate) {
            tbody.addEventListener('click', handleDeleteClick);
            tbody._hasEventDelegate = true;
        }

        // 使用DOM API创建行和按钮
        currentRecords.forEach(record => {
            const row = document.createElement('tr');
            const date = new Date(record.date);
            const amountClass = record.amount >= 0 ? 'deduction-positive' : 'deduction-negative';
            const amountText = record.amount >= 0 ? `+${record.amount.toFixed(2)}` : record.amount.toFixed(2);

            // 创建单元格
            const cells = [
                document.createElement('td'), // 日期
                document.createElement('td'), // 类型
                document.createElement('td'), // 分类
                document.createElement('td'), // 金额
                document.createElement('td'), // 备注
                document.createElement('td')  // 操作
            ];

            // 设置单元格内容
            cells[0].textContent = formatDate(date, 'YYYY-MM-DD');
            cells[1].textContent = record.type === 'subsidy' ? '补贴' : '扣款';
            cells[2].textContent = record.category;
            cells[3].className = amountClass;
            cells[3].textContent = `${amountText}元`;
            cells[4].textContent = record.notes || '-';

            // 创建删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger delete-deduction';
            deleteBtn.textContent = '删除';
            deleteBtn.dataset.id = record.id;

            // 将按钮添加到操作单元格
            cells[5].appendChild(deleteBtn);

            // 将所有单元格添加到行
            cells.forEach(cell => row.appendChild(cell));

            // 将行添加到表格
            tbody.appendChild(row);
        });
    }

    function handleDeleteClick(e) {
        const deleteBtn = e.target.closest('.delete-deduction');
        if (!deleteBtn) return;

        e.preventDefault();
        e.stopPropagation();

        const id = deleteBtn.dataset.id;
        deleteDeduction(id);
    }



    // 删除补贴/扣款记录
    function deleteDeduction(id) {
        if (confirm('确定要删除这条记录吗？')) {
            state.deductions = state.deductions.filter(record => record.id !== id);
            saveToLocalStorage();
            renderDeductionRecords();  // 重新渲染表格
            updateStatistics();        // 更新统计信息
            updateRecordsView();      // 更新记录视图
        }
    }



    /**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @param {string} [format='YYYY-MM-DD'] - 格式模板
 * @returns {string} 格式化后的日期字符串
 */
    function formatDate(date, format = 'YYYY-MM-DD') {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day);
    }

    /**
     * 显示消息
     */
    function showMessage(message, className) {
        const el = document.getElementById('hours-message');
        el.textContent = message;
        el.className = className;
        el.style.display = 'block';

        // 3秒后自动消失
        if (className.includes('text-success') || className.includes('text-danger')) {
            setTimeout(() => {
                el.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * 设置Excel列宽自适应
     * @param {Worksheet} worksheet - 工作表对象
     * @param {Array} data - 工作表数据
     */
    function setExcelColumnWidth(worksheet, data) {
        // 计算每列最大字符长度
        const colWidths = data[0].map((_, colIndex) => {
            return data.reduce((max, row) => {
                const cellValue = row[colIndex] || '';
                const length = cellValue.toString().length;
                return Math.max(max, length);
            }, 10); // 最小宽度为10
        });

        // 设置列宽 (Excel中1个单位≈1个字符宽度)
        worksheet['!cols'] = colWidths.map(width => ({
            width: Math.min(width + 2, 50) // 最大宽度限制为50
        }));
    }

    /**
     * 设置Excel单元格自动换行
     * @param {Worksheet} worksheet - 工作表对象
     * @param {Array} data - 工作表数据
     */
    function setExcelWrapText(worksheet, data) {
        // 获取工作表的单元格范围
        const range = XLSX.utils.decode_range(worksheet['!ref']);

        // 为所有单元格设置自动换行
        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                if (!worksheet[cellAddress]) continue;

                // 设置单元格样式
                worksheet[cellAddress].s = worksheet[cellAddress].s || {};
                worksheet[cellAddress].s.alignment = worksheet[cellAddress].s.alignment || {};
                worksheet[cellAddress].s.alignment.wrapText = true;
            }
        }
    }

    // 批量操作状态
    const batchState = {
        active: false,
        selectedDates: []
    };

    // 切换批量模式
    function toggleBatchMode() {
        batchState.active = !batchState.active;
        batchState.selectedDates = [];

        const batchControls = document.querySelector('.batch-controls');
        const toggleBtn = document.getElementById('toggle-batch-mode');
        const calendar = document.getElementById('calendar-days');

        if (batchState.active) {
            batchControls.classList.remove('d-none');
            toggleBtn.classList.add('btn-primary');
            toggleBtn.classList.remove('btn-outline-primary');
            calendar.classList.add('batch-mode');
        } else {
            batchControls.classList.add('d-none');
            toggleBtn.classList.remove('btn-primary');
            toggleBtn.classList.add('btn-outline-primary');
            calendar.classList.remove('batch-mode');

            // 清除所有批量选择标记
            document.querySelectorAll('.selected-for-batch').forEach(el => {
                el.classList.remove('selected-for-batch');
            });
        }

        updateBatchSelectionCount();
    }

    // 处理批量选择日期
    function handleBatchDateSelection(dateStr) {
        const index = batchState.selectedDates.indexOf(dateStr);
        const dayElement = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);

        if (index === -1) {
            // 添加选择
            batchState.selectedDates.push(dateStr);
            dayElement.classList.add('selected-for-batch');
        } else {
            // 移除选择
            batchState.selectedDates.splice(index, 1);
            dayElement.classList.remove('selected-for-batch');
        }

        updateBatchSelectionCount();
    }

    // 更新已选择日期计数
    function updateBatchSelectionCount() {
        document.getElementById('batch-selected-count').textContent = batchState.selectedDates.length;
    }

    // 应用批量加班设置
    function applyBatchOvertime() {
        const hours = parseFloat(document.getElementById('batch-overtime-hours').value);
        const type = document.getElementById('batch-overtime-type').value;

        if (isNaN(hours)) {  // 修正这里的语法错误
            showMessage('请输入有效的加班时长', 'text-danger');
            return;
        }

        batchState.selectedDates.forEach(dateStr => {
            state.hoursData[dateStr] = {
                date: dateStr,
                hours: hours,
                type: type,
                timestamp: new Date().toISOString()
            };
        });

        saveToLocalStorage();
        renderCalendar();
        updateStatistics();
        updateRecordsView();

        showMessage(`已为 ${batchState.selectedDates.length} 个日期设置加班`, 'text-success');
        toggleBatchMode();
    }

    // 修改日历点击处理函数，支持批量选择
    function handleCalendarDayClick(event) {
        const dayElement = event.target.closest('.calendar-day');
        if (!dayElement) return;

        const dateStr = dayElement.dataset.date;

        if (batchState.active) {
            handleBatchDateSelection(dateStr);
            return;
        }

        // 原有的单个日期处理逻辑
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        showDayDetails(date);
    }

    // 优先使用现有元素
    const calendarContainer = document.getElementById('calendar-container') ||
        document.getElementById('calendar-days');
    if (calendarContainer) {
        calendarContainer.insertAdjacentHTML('beforebegin', batchControlsHTML);
    } else {
        console.error('无法找到日历容器元素');
    }

    // 在您的app.js中添加以下代码

    // 批量清除按钮点击事件
    document.getElementById('batch-clear').addEventListener('click', function () {
        batchState.selectedDates.forEach(dateStr => {
            if (state.hoursData[dateStr]) {
                delete state.hoursData[dateStr];
            }
        });
        saveToLocalStorage();
        renderCalendar();
        updateStatistics();
        updateRecordsView();
        showMessage(`已清除 ${batchState.selectedDates.length} 个日期的记录`, 'text-success');
        toggleBatchMode();
    });

    // 修改批量应用逻辑，处理时数为0的情况
    document.getElementById('batch-apply').addEventListener('click', function () {
        const hours = parseFloat(document.getElementById('batch-overtime-hours').value);
        const type = document.getElementById('batch-overtime-type').value;

        batchState.selectedDates.forEach(dateStr => {
            if (hours === 0) {
                // 时数为0时删除记录
                delete state.hoursData[dateStr];
            } else {
                // 否则设置记录
                state.hoursData[dateStr] = {
                    date: dateStr,
                    hours: hours,
                    type: type,
                    timestamp: new Date().toISOString()
                };
            }
        });

        saveToLocalStorage();
        renderCalendar();
        updateStatistics();
        updateRecordsView();

        const action = hours === 0 ? '清除' : '设置';
        showMessage(`已${action} ${batchState.selectedDates.length} 个日期的记录`, 'text-success');
        toggleBatchMode();
    });

    // 初始化高级图表
    function initAdvancedChart() {
        const ctx = document.getElementById('dataChart');
        if (!ctx) return;

        // 销毁旧图表
        if (state.chart) {
            state.chart.destroy();
        }

        // 获取数据
        const { labels, datasets } = getChartData();

        // 创建新图表
        state.chart = new Chart(ctx, {
            type: state.chartType, // 使用state中的类型
            data: { labels, datasets },
            options: getChartOptions()
        });

        // 确保按钮状态同步
        updateControlButtonStates();
    }



    // 新增函数 - 获取图表数据
    function getChartData() {
        const isDark = state.darkMode;
        const baseColors = isDark ?
            ['#5B8FF9', '#5AD8A6', '#F6BD16'] :
            ['#3366CC', '#4CAF50', '#FFC107'];

        const dataMethod = state.dataGroup === 'day' ? getDailyData : getWeeklyData;
        const { labels, overtime, leave, subsidy } = dataMethod();

        // 统一数据集类型，根据chartType决定
        const datasets = [
            {
                label: '加班时长',
                data: overtime,
                backgroundColor: `${baseColors[0]}80`,
                borderColor: baseColors[0],
                borderWidth: 2,
                hidden: !state.visibleDatasets[0],
                yAxisID: 'y',
                type: state.chartType === 'bar' ? 'bar' : 'line' // 统一类型
            },
            {
                label: '请假时长',
                data: leave,
                backgroundColor: `${baseColors[1]}80`,
                borderColor: baseColors[1],
                borderWidth: 2,
                hidden: !state.visibleDatasets[1],
                yAxisID: 'y',
                type: state.chartType === 'bar' ? 'bar' : 'line' // 统一类型
            },
            {
                label: '补贴金额',
                data: subsidy,
                backgroundColor: `${baseColors[2]}80`,
                borderColor: baseColors[2],
                borderWidth: 2,
                hidden: !state.visibleDatasets[2],
                yAxisID: 'y1',
                type: state.chartType === 'bar' ? 'bar' : 'line' // 统一类型
            }
        ];

        return { labels, datasets };
    }


    function getDailyData() {
        const daysInMonth = new Date(
            state.currentDate.getFullYear(),
            state.currentDate.getMonth() + 1,
            0
        ).getDate();

        const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}日`);
        const overtime = Array(daysInMonth).fill(0);
        const leave = Array(daysInMonth).fill(0);
        const subsidy = Array(daysInMonth).fill(0);

        // 填充每日数据
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(state.currentDate);
            date.setDate(day);
            const dateKey = formatDate(date);

            // 加班数据
            if (state.hoursData[dateKey]?.hours > 0) {
                overtime[day - 1] = state.hoursData[dateKey].hours;
            }

            // 请假数据
            if (state.hoursData[dateKey]?.hours < 0) {
                leave[day - 1] = Math.abs(state.hoursData[dateKey].hours);
            }

            // 补贴数据
            subsidy[day - 1] = state.deductions
                .filter(d => d.date === dateKey)
                .reduce((sum, d) => sum + (d.type === 'subsidy' ? d.amount : 0), 0);
        }

        return { labels, overtime, leave, subsidy };
    }

    function getWeeklyData() {
        const weeks = 5; // 最多5周
        const labels = Array.from({ length: weeks }, (_, i) => `第${i + 1}周`);
        const overtime = Array(weeks).fill(0);
        const leave = Array(weeks).fill(0);
        const subsidy = Array(weeks).fill(0);

        // 1. 处理加班和请假数据
        Object.entries(state.hoursData).forEach(([dateStr, record]) => {
            const date = new Date(dateStr);
            // 确保数据在当前月份
            if (date.getFullYear() === state.currentDate.getFullYear() &&
                date.getMonth() === state.currentDate.getMonth()) {

                const day = date.getDate();
                const weekIndex = Math.min(Math.floor((day - 1) / 7), weeks - 1);

                if (record.hours > 0) {
                    overtime[weekIndex] += record.hours;
                } else {
                    leave[weekIndex] += Math.abs(record.hours);
                }
            }
        });

        // 2. 处理补贴数据（完整实现）
        state.deductions.forEach(d => {
            if (d.type === 'subsidy') {
                const date = new Date(d.date);
                if (date.getFullYear() === state.currentDate.getFullYear() &&
                    date.getMonth() === state.currentDate.getMonth()) {

                    const day = date.getDate();
                    const weekIndex = Math.min(Math.floor((day - 1) / 7), weeks - 1);
                    subsidy[weekIndex] += d.amount;
                }
            }
        });

        // 3. 格式化返回数据
        return {
            labels,
            overtime: overtime.map(h => parseFloat(h.toFixed(1))),
            leave: leave.map(h => parseFloat(h.toFixed(1))),
            subsidy: subsidy.map(amount => parseFloat(amount.toFixed(2)))
        };
    }



    // 高级图表配置
    function getAdvancedChartConfig() {
        const isDarkMode = state.darkMode;
        const { labels, datasets } = prepareAdvancedChartData();

        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: state.chartType !== 'pie',
                    position: 'top',
                    labels: {
                        color: isDarkMode ? '#fff' : '#666',
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            if (state.chartType === 'pie') {
                                return `${label}: ${context.raw.toFixed(1)}%`;
                            }
                            return `${label}: ${context.raw} ${label.includes('补贴') ? '元' : '小时'}`;
                        }
                    }
                },
                // 在getAdvancedChartConfig()的plugins中调整：
                datalabels: {
                    display: state.chartType === 'pie',
                    formatter: (value, context) => {
                        if (state.chartType === 'pie') {
                            const dataset = context.chart.data.datasets[0];
                            const label = dataset.label || '';
                            return `${label}\n${value.toFixed(1)}%`; // 显示百分比
                        }
                        return '';
                    }
                }
            },
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            }
        };

        // 根据图表类型返回不同配置
        switch (state.chartType) {
            case 'line':
                return {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        ...commonOptions,
                        elements: {
                            line: {
                                tension: 0.3,
                                fill: false,
                                borderWidth: 3
                            },
                            point: {
                                radius: 5,
                                hoverRadius: 7
                            }
                        },
                        scales: getAdvancedScales()
                    }
                };

            case 'pie':
                return {
                    type: 'pie',
                    data: { labels, datasets },
                    options: {
                        layout: {
                            padding: {
                                left: 20,
                                right: 20,
                                top: 20,
                                bottom: 20
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'right', // 将图例放在右侧
                                align: 'center'    // 图例内容居中
                            }
                        }
                    }
                };

            default: // bar
                return {
                    type: 'bar',
                    data: { labels, datasets },
                    options: {
                        ...commonOptions,
                        elements: {
                            bar: {
                                borderRadius: 6
                            }
                        },
                        scales: getAdvancedScales()
                    }
                };
        }
    }

    // 修改 prepareAdvancedChartData 函数
    function prepareAdvancedChartData() {
        const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);

        // 按日/周聚合数据
        const aggregation = state.dataGroup === 'week' ? aggregateByWeek() : aggregateByDay();

        const datasets = [
            { // 加班数据
                label: '加班时长 (小时)',
                data: aggregation.overtime,
                backgroundColor: 'rgba(54, 162, 235, 0.8)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                hidden: !state.visibleDatasets[0],
                yAxisID: 'y'
            },
            { // 请假数据
                label: '请假时长 (小时)',
                data: aggregation.leave,
                backgroundColor: 'rgba(255, 99, 132, 0.8)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
                hidden: !state.visibleDatasets[1],
                yAxisID: 'y'
            },
            { // 补贴数据
                label: '补贴/扣款 (元)',
                data: aggregation.deduction,
                backgroundColor: 'rgba(75, 192, 192, 0.8)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                hidden: !state.visibleDatasets[2],
                yAxisID: 'y1'
            }
        ];

        return {
            labels: state.chartType === 'pie'
                ? ['加班时长', '请假时长'] // 饼图只显示两类标签
                : aggregation.labels,
            datasets: state.chartType === 'pie'
                ? convertToPieData(datasets)
                : datasets
        };
    }

    // 按周聚合数据
    function aggregateByWeek() {
        const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);

        const result = { labels: [], overtime: [], leave: [], deduction: [] };
        let currentWeek = 1;
        let weekTotal = { overtime: 0, leave: 0, deduction: 0 };

        // 遍历整个月
        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(d);

            // 汇总每日数据
            if (state.hoursData[dateStr]) {
                const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                if (hours > 0) weekTotal.overtime += hours;
                else weekTotal.leave += Math.abs(hours);
            }

            // 汇总补贴
            const dayDeductions = state.deductions.filter(r => formatDate(new Date(r.date)) === dateStr);
            weekTotal.deduction += dayDeductions.reduce((sum, r) => sum + r.amount, 0);

            // 每周结束或月末
            if (d.getDay() === 0 || d.getDate() === monthEnd.getDate()) {
                result.labels.push(`第${currentWeek}周`);
                result.overtime.push(parseFloat(weekTotal.overtime.toFixed(1)));
                result.leave.push(parseFloat(weekTotal.leave.toFixed(1)));
                result.deduction.push(parseFloat(weekTotal.deduction.toFixed(2)));

                // 重置周统计
                weekTotal = { overtime: 0, leave: 0, deduction: 0 };
                currentWeek++;
            }
        }

        return result;
    }

    // 转换为饼图数据
    // 修正后的饼图数据转换
    function convertToPieData(datasets) {
        const hourlyDatasets = datasets.filter(d => !d.label.includes('补贴')); // 排除金额数据
        const totals = hourlyDatasets.map(d => d.data.reduce((a, b) => a + b, 0));
        const total = totals.reduce((a, b) => a + b, 0);

        return [{
            label: '时间分布',
            data: totals.map(v => total > 0 ? (v / total * 100) : 0),
            backgroundColor: hourlyDatasets.map(d => d.backgroundColor),
            borderColor: hourlyDatasets.map(d => d.borderColor),
            borderWidth: 1
        }];
    }



    // 修改初始化代码，确保DOM加载完成
    document.addEventListener('DOMContentLoaded', function () {
        const requiredElements = {
            calendarContainer: '日历容器',
            salaryConfigPanel: '薪资配置面板',
            dataChart: '数据图表'
        };

        let missingElements = [];
        Object.keys(requiredElements).forEach(id => {
            if (!document.getElementById(id)) {
                missingElements.push(id);
                console.error(`未找到元素: #${id} (${requiredElements[id]})`);
            }
        });

        if (missingElements.length === 0) {
            init(); // 只有所有元素都存在时才初始化
        } else {
            const errorMsg = `无法初始化，缺少以下元素: ${missingElements.join(', ')}`;
            console.error(errorMsg);

            // 显示用户可见的错误提示（可选）
            alert(`页面加载不完整，请刷新\n缺失元素: ${missingElements.map(id => requiredElements[id]).join(', ')}`);
        }
    });




    function setupExportControl() {
        let exportBtn = document.querySelector('[data-action="export-chart"]');
        if (!exportBtn) {
            // 尝试在dropdown-menu中添加导出按钮
            const dropdownMenu = document.querySelector('.dropdown-menu');
            if (dropdownMenu) {
                exportBtn = document.createElement('button');
                exportBtn.className = 'dropdown-item';
                exportBtn.innerHTML = '<i class="bi bi-download me-2"></i>导出图表';
                exportBtn.dataset.action = 'export-chart';
                dropdownMenu.appendChild(exportBtn);
            }
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportChartImage);
        } else {
            console.warn('未能创建或找到导出图表按钮');
        }
    }

    function exportChartImage() {
        if (!state.chart) {
            console.error('图表实例未初始化');
            showMessage('图表未准备好，请稍后再试', 'text-danger');
            return;
        }

        try {
            const link = document.createElement('a');
            link.download = `加班统计_${formatDate(new Date())}.png`;
            link.href = state.chart.toBase64Image('image/png', 1);
            link.click();
            showMessage('图表导出成功', 'text-success');
        } catch (error) {
            console.error('导出图表失败:', error);
            showMessage(`导出图表失败: ${error.message}`, 'text-danger');
        }
    }


    function exportChartImage() {
        if (!state.chart) {
            console.error('图表实例未初始化');
            return;
        }
        try {
            const link = document.createElement('a');
            link.download = `加班统计_${formatDate(new Date())}.png`;
            link.href = state.chart.toBase64Image('image/png', 1);
            link.click();
        } catch (e) {
            console.error('导出图表失败:', e);
            showMessage('导出图表失败，请重试', 'text-danger');
        }
    }

    function updateControlButtonStates() {
        // 更新图表类型按钮状态
        document.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === state.chartType);
        });

        // 更新数据分组按钮状态
        document.querySelectorAll('.data-group-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.group === state.dataGroup);
        });

        // 更新数据集切换按钮状态
        document.querySelectorAll('.legend-toggle button').forEach((btn, index) => {
            if (index < state.visibleDatasets.length) {
                btn.classList.toggle('active', state.visibleDatasets[index]);
            }
        });
    }

    // 5. 确保在DOM加载完成后初始化
    document.addEventListener('DOMContentLoaded', () => {
        // 确保其他依赖元素已存在
        if (document.getElementById('dataChart') &&
            document.querySelector('[data-chart-type]')) {
            init();
        } else {
            console.error('必要的DOM元素未找到，初始化失败');
            // 可以设置重试机制
            setTimeout(() => {
                if (document.getElementById('dataChart')) {
                    init();
                }
            }, 500);
        }
    });



    // 新增窗口大小调整监听
    window.addEventListener('resize', () => {
        if (state.chart) {
            state.chart.resize();
        }
    });


    // 绘制专业背景
    function drawChartBackground(chart) {
        const { ctx, chartArea: { left, top, width, height } } = chart;
        const isDarkMode = state.darkMode;

        // 渐变背景
        const gradient = ctx.createLinearGradient(0, top, 0, top + height);
        gradient.addColorStop(0, isDarkMode ? 'rgba(30, 30, 40, 0.8)' : 'rgba(240, 240, 245, 0.8)');
        gradient.addColorStop(1, isDarkMode ? 'rgba(20, 20, 30, 0.6)' : 'rgba(230, 230, 235, 0.6)');

        ctx.save();
        ctx.fillStyle = gradient;
        ctx.strokeStyle = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(left - 10, top - 10, width + 20, height + 20, 12);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    function getAdvancedScales() {
        const isDarkMode = state.darkMode;
        return {
            x: {
                grid: {
                    color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    drawBorder: false
                },
                ticks: {
                    color: isDarkMode ? '#fff' : '#666'
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    drawBorder: false
                },
                ticks: {
                    color: isDarkMode ? '#fff' : '#666'
                }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                grid: {
                    drawOnChartArea: false,
                    color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                },
                ticks: {
                    color: isDarkMode ? '#fff' : '#666'
                }
            }
        };
    }

    // 在图表初始化代码前添加此函数
    function drawDataLabels(chart) {
        const ctx = chart.ctx;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#333';

        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.data.forEach((element, index) => {
                const value = dataset.data[index];
                if (value && value > 0) { // 只显示正值
                    const position = element.tooltipPosition();
                    ctx.fillText(
                        value.toFixed(1), // 保留1位小数
                        position.x,
                        position.y - 5
                    );
                }
            });
        });
    }

    function getChartOptions() {
        const isDark = state.theme === 'dark';
        const textColor = isDark ? '#fff' : '#666';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false,
                axis: 'x'
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const value = context.raw;
                            const unit = context.datasetIndex === 2 ? '元' : '小时';
                            return `${label}: ${value} ${unit}`;
                        },
                        footer: (items) => {
                            if (state.chartType === 'bar') {
                                const date = items[0].label;
                                const total = items.reduce((sum, item) => {
                                    return item.datasetIndex !== 2 ? sum + item.raw : sum;
                                }, 0);
                                return `总时长: ${total.toFixed(1)}小时`;
                            }
                        }
                    }
                },
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            size: 12
                        },
                        generateLabels: (chart) => {
                            return chart.data.datasets.map((dataset, i) => ({
                                text: dataset.label,
                                fillStyle: dataset.backgroundColor,
                                strokeStyle: dataset.borderColor,
                                lineWidth: 2,
                                hidden: !chart.isDatasetVisible(i),
                                index: i
                            }));
                        }
                    },
                    onClick: (e, legendItem, legend) => {
                        const index = legendItem.index;
                        state.visibleDatasets[index] = !legend.chart.isDatasetVisible(index);
                        updateChart();
                    }
                },
                annotation: {
                    annotations: {
                        overtimeLimit: {
                            type: 'line',
                            yMin: 36,
                            yMax: 36,
                            borderColor: '#ff6b6b',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: '法定上限: 36小时',
                                enabled: true,
                                position: 'right'
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '小时',
                        color: textColor
                    },
                    grid: {
                        color: gridColor,
                        drawBorder: false
                    },
                    ticks: {
                        color: textColor,
                        stepSize: 2
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '金额',
                        color: textColor
                    },
                    grid: {
                        drawOnChartArea: false,
                        color: gridColor
                    },
                    ticks: {
                        color: textColor,
                        callback: (value) => `${value}元`
                    }
                },
                x: {
                    grid: {
                        color: gridColor,
                        drawBorder: false
                    },
                    ticks: {
                        color: textColor
                    }
                }
            },
            animation: {
                duration: 800,
                easing: 'easeOutQuart',
                onComplete: () => {
                    if (state.chartType === 'bar') {
                        drawDataLabels(state.chart);
                    }
                }
            }
        };
    }



    // 新增函数 - 按周聚合数据
    function aggregateWeeklyData(type) {
        const currentYear = state.currentDate.getFullYear();
        const currentMonth = state.currentDate.getMonth() + 1;
        const weeks = [[], [], [], [], []]; // 5周

        // 填充每周数据
        for (let day = 1; day <= 31; day++) {
            const date = new Date(currentYear, currentMonth - 1, day);
            if (date.getMonth() !== currentMonth - 1) break;

            const weekIndex = Math.floor((day - 1) / 7);
            const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

            switch (type) {
                case 'overtime':
                    const hours = state.hoursData[dateStr]?.hours > 0 ? state.hoursData[dateStr].hours : 0;
                    weeks[weekIndex].push(hours);
                    break;
                case 'leave':
                    const leave = state.hoursData[dateStr]?.hours < 0 ? Math.abs(state.hoursData[dateStr].hours) : 0;
                    weeks[weekIndex].push(leave);
                    break;
                case 'subsidy':
                    const subsidy = state.deductions
                        .filter(d => d.date === dateStr)
                        .reduce((sum, d) => sum + d.amount, 0);
                    weeks[weekIndex].push(subsidy);
                    break;
            }
        }

        // 计算每周总和
        return weeks.map(week => week.reduce((sum, val) => sum + val, 0));
    }

    // 完整 updateChart 函数实现
    function updateChart() {
        if (!state.chart) {
            return initAdvancedChart();
        }

        const { labels, datasets } = getChartData();

        // 更新数据
        state.chart.data.labels = labels;
        state.chart.data.datasets = datasets;
        state.chart.config.type = state.chartType;

        // 更新选项
        state.chart.options = getChartOptions();

        // 平滑更新
        state.chart.update();
    }



    // 在您的app.js中找到setupChartControls函数，替换为以下内容：

    function setupChartControls() {
        // 1. 图表类型切换
        const chartTypeContainer = document.querySelector('.chart-type-toggle');
        if (chartTypeContainer) {
            const chartTypeBtns = chartTypeContainer.querySelectorAll('.btn');
            chartTypeBtns.forEach(btn => {
                btn.addEventListener('click', function () {
                    chartTypeBtns.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    state.chartType = this.dataset.type || 'bar';
                    updateChart();
                });

                // 初始化选中状态
                if (btn.dataset.type === state.chartType) {
                    btn.classList.add('active');
                }
            });
        } else {
            console.warn('图表类型切换容器未找到');
        }

        // 2. 数据分组切换
        const groupTypeContainer = document.querySelector('.data-group-toggle');
        if (groupTypeContainer) {
            const groupTypeBtns = groupTypeContainer.querySelectorAll('.btn');
            groupTypeBtns.forEach(btn => {
                btn.addEventListener('click', function () {
                    groupTypeBtns.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    state.dataGroup = this.dataset.group || 'day';
                    updateChart();
                });

                // 初始化选中状态
                if (btn.dataset.group === state.dataGroup) {
                    btn.classList.add('active');
                }
            });
        } else {
            console.warn('数据分组切换容器未找到');
        }

        // 3. 数据集可见性切换
        const legendToggleContainer = document.querySelector('.legend-toggle');
        if (legendToggleContainer) {
            const datasetToggles = legendToggleContainer.querySelectorAll('.btn');
            datasetToggles.forEach((btn, index) => {
                if (index < state.visibleDatasets.length) {
                    btn.addEventListener('click', function () {
                        this.classList.toggle('active');
                        state.visibleDatasets[index] = this.classList.contains('active');
                        updateChart();
                    });

                    // 初始化选中状态
                    if (state.visibleDatasets[index]) {
                        btn.classList.add('active');
                    }
                }
            });
        } else {
            console.warn('图例切换容器未找到');
        }

        // 4. 导出图表功能
        setupExportControl();
    }

    /**
     * 按日聚合数据
     */
    function aggregateByDay() {
        const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);

        const result = {
            labels: [],
            overtime: [],
            leave: [],
            deduction: []
        };

        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(d);
            const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;

            result.labels.push(dayLabel);

            let dayOvertime = 0;
            let dayLeave = 0;
            let dayDeduction = 0;

            if (state.hoursData[dateStr]) {
                const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                if (hours > 0) dayOvertime = hours;
                else dayLeave = Math.abs(hours);
            }

            const dayDeductions = state.deductions.filter(r => formatDate(new Date(r.date)) === dateStr);
            dayDeduction = dayDeductions.reduce((sum, r) => sum + r.amount, 0);

            result.overtime.push(parseFloat(dayOvertime.toFixed(1)));
            result.leave.push(parseFloat(dayLeave.toFixed(1)));
            result.deduction.push(parseFloat(dayDeduction.toFixed(2)));
        }

        return result;
    }

    function aggregateByWeek() {
        const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);

        const result = {
            labels: [],
            overtime: [],
            leave: [],
            deduction: []
        };

        let currentWeek = 1;
        let weekTotal = { overtime: 0, leave: 0, deduction: 0 };

        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(d);

            if (state.hoursData[dateStr]) {
                const hours = parseFloat(state.hoursData[dateStr].hours) || 0;
                if (hours > 0) weekTotal.overtime += hours;
                else weekTotal.leave += Math.abs(hours);
            }

            const dayDeductions = state.deductions.filter(r => formatDate(new Date(r.date)) === dateStr);
            weekTotal.deduction += dayDeductions.reduce((sum, r) => sum + r.amount, 0);

            if (d.getDay() === 0 || d.getDate() === monthEnd.getDate()) {
                result.labels.push(`第${currentWeek}周`);
                result.overtime.push(parseFloat(weekTotal.overtime.toFixed(1)));
                result.leave.push(parseFloat(weekTotal.leave.toFixed(1)));
                result.deduction.push(parseFloat(weekTotal.deduction.toFixed(2)));

                weekTotal = { overtime: 0, leave: 0, deduction: 0 };
                currentWeek++;
            }
        }

        return result;
    }

    /**
     * 更新高级图表
     */
    function updateAdvancedChart() {
        if (!state.chart) return initAdvancedChart();

        // 获取新数据
        const { labels, datasets } = prepareAdvancedChartData();

        // 完全销毁并重新创建图表
        state.chart.destroy();
        state.chart = new Chart(
            document.getElementById('dataChart'),
            getAdvancedChartConfig()
        );
    }

    window.addEventListener('resize', function () {
        if (state.chart) {
            state.chart.resize();
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        init(); // 您的初始化函数
    });

    // 启动应用
    init();
})();